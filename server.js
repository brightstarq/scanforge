import express from 'express';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import archiver from 'archiver';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { processPage, compositeSignature } from './scanner.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const app = express();

const ACCEPTED_TYPES = new Set([
  'application/pdf','image/jpeg','image/jpg',
  'image/png','image/webp','image/tiff','image/bmp',
]);
const IMAGE_TYPES = new Set([
  'image/jpeg','image/jpg','image/png',
  'image/webp','image/tiff','image/bmp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    ACCEPTED_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Unsupported file type.'), false),
});

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok', node: process.version }));

async function pdfToImages(pdfBuffer, dpi = 300) {
  const scale = dpi / 96;
  const pdf = await getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true,
  }).promise;
  const buffers = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page     = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas   = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    buffers.push(canvas.toBuffer('image/png'));
  }
  return buffers;
}

async function buffersToPdf(processedBuffers) {
  const pdfDoc = await PDFDocument.create();
  const A4_W = 595.28, A4_H = 841.89;
  for (const imgBuf of processedBuffers) {
    const png      = await pdfDoc.embedPng(imgBuf);
    const imgAspect  = png.width / png.height;
    const pageAspect = A4_W / A4_H;
    let drawW, drawH;
    if (imgAspect > pageAspect) { drawW = A4_W; drawH = A4_W / imgAspect; }
    else                        { drawH = A4_H; drawW = A4_H * imgAspect; }
    const page = pdfDoc.addPage([A4_W, A4_H]);
    page.drawImage(png, { x:(A4_W-drawW)/2, y:(A4_H-drawH)/2, width:drawW, height:drawH });
  }
  return Buffer.from(await pdfDoc.save());
}

// ── POST /preview ─────────────────────────────────────────────────────────────
app.post('/preview', upload.fields([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    let pageBuffer;
    if (IMAGE_TYPES.has(file.mimetype)) {
      pageBuffer = file.buffer;
    } else {
      const pages = await pdfToImages(file.buffer, 72);
      if (!pages.length) return res.status(500).json({ error: 'Could not render PDF' });
      pageBuffer = pages[0];
    }
    const thumb = await sharp(pageBuffer)
      .resize(600, null, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(thumb);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /process ─────────────────────────────────────────────────────────────
app.post('/process', upload.fields([
  { name: 'file',  maxCount: 1   },
  { name: 'files', maxCount: 100 },
]), async (req, res) => {
  // Normalise: single file or array of files
  const allFiles = req.files?.files ?? (req.files?.file ? req.files.file : []);
  if (!allFiles.length) return res.status(400).json({ error: 'No file uploaded' });

  const opts = {
    noise:             parseFloat(req.body.noise             ?? 5),
    blur:              parseFloat(req.body.blur               ?? 0),
    brightness:        parseFloat(req.body.brightness         ?? 1.0),
    contrast:          parseFloat(req.body.contrast           ?? 1.05),
    yellowTint:        parseFloat(req.body.yellowTint         ?? 0),
    grain:             req.body.grain             !== 'false',
    deskew:            req.body.deskew            !== 'false',
    manualSkew:        parseFloat(req.body.manualSkew         ?? 0),
    dpi:               parseInt(req.body.dpi                  ?? 300),
    format:            req.body.format                        ?? 'pdf',
    sharpness:         parseInt(req.body.sharpness            ?? 1),
    bindingShadow:     req.body.bindingShadow     === 'true',
    rotation:          parseFloat(req.body.rotation           ?? 0.4),
    crumple:           req.body.crumple           === 'true',
    crumpleIntensity:  parseFloat(req.body.crumpleIntensity   ?? 1.0),
  };

  const isMultiUpload = allFiles.length > 1;
  // For single file, preserve original name; for multi use generic
  const baseName = isMultiUpload
    ? 'scanned_images'
    : allFiles[0].originalname.replace(/\.[^.]+$/, '');

  console.log(`⚙  ${isMultiUpload ? `${allFiles.length} images` : allFiles[0].originalname} | dpi:${opts.dpi} fmt:${opts.format}`);

  try {
    // 1. Render all files to PNG buffer arrays
    let pageBuffers = [];

    for (const file of allFiles) {
      const isImg = IMAGE_TYPES.has(file.mimetype);
      if (isImg) {
        pageBuffers.push(file.buffer);
      } else {
        // PDF — render each page
        const pages = await pdfToImages(file.buffer, opts.dpi);
        if (!pages.length) return res.status(500).json({ error: `Could not extract pages from ${file.originalname}` });
        pageBuffers.push(...pages);
      }
    }

    console.log(`   ${pageBuffers.length} page(s) total`);

    // Apply scan effect (concurrency 4)
    const CONCURRENCY = 4;
    const processedBuffers = new Array(pageBuffers.length);
    for (let i = 0; i < pageBuffers.length; i += CONCURRENCY) {
      const chunk   = pageBuffers.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(buf => processPage(buf, opts)));
      results.forEach((buf, j) => (processedBuffers[i + j] = buf));
    }

    // Composite signature
    if (req.body.sigData) {
      const sigBuf     = Buffer.from(req.body.sigData, 'base64');
      const xPct       = parseFloat(req.body.sigX ?? 0.6);
      const yPct       = parseFloat(req.body.sigY ?? 0.85);
      const wPct       = parseFloat(req.body.sigW ?? 0.2);
      const hPct       = parseFloat(req.body.sigH ?? 0.05);
      const sigRotDeg  = parseFloat(req.body.sigRotation ?? 0);
      const sigPage    = req.body.sigPage ?? 'last';

      const shouldApply = (i) => {
        if (sigPage === 'all')  return true;
        if (sigPage === 'last') return i === processedBuffers.length - 1;
        const n = parseInt(sigPage);
        return !isNaN(n) && i === n - 1;
      };

      for (let i = 0; i < processedBuffers.length; i++) {
        if (shouldApply(i)) {
          processedBuffers[i] = await compositeSignature(
            processedBuffers[i], sigBuf, xPct, yPct, wPct, hPct, sigRotDeg
          );
        }
      }
      console.log(`   ✍  signature → page: ${sigPage}`);
    }

    // Output
    if (opts.format === 'zip') {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_scanned.zip"`);
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(res);
      processedBuffers.forEach((buf, i) =>
        archive.append(buf, { name: `page_${String(i+1).padStart(3,'0')}.png` }));
      await archive.finalize();

    } else if (opts.format === 'image' && !isMultiUpload && IMAGE_TYPES.has(allFiles[0].mimetype)) {
      const ext = allFiles[0].mimetype === 'image/png' ? 'png' : 'jpg';
      res.setHeader('Content-Type', `image/${ext}`);
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_scanned.${ext}"`);
      res.send(processedBuffers[0]);

    } else {
      const pdfBytes = await buffersToPdf(processedBuffers);
      console.log(`✓  ${(pdfBytes.length/1024).toFixed(1)} KB`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_scanned.pdf"`);
      res.send(pdfBytes);
    }

  } catch (err) {
    console.error('✗ ', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, _req, res, _next) => res.status(500).json({ error: err.message ?? 'Internal server error' }));

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`\n🖨  ScanDrift  ➜  http://localhost:${PORT}\n`);
});