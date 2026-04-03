import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import archiver from 'archiver';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { processPage, compositeSignature, applyBackBleed } from './scanner.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir, platform } from 'node:os';
import sharp from 'sharp';
import Stripe from 'stripe';

const execFileAsync = promisify(execFile);

// ── Stripe ────────────────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

const APP_URL         = process.env.APP_URL ?? 'http://localhost:3000';
const FREE_PAGE_LIMIT = 3;
const TOKEN_EXPIRY_MS = 10 * 60 * 60 * 1000;

const TOKEN_SECRET = process.env.TOKEN_SECRET
  ?? (() => {
    const s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    console.warn('⚠  TOKEN_SECRET not set — tokens reset on restart');
    return s;
  })();

function b64url(str) { return Buffer.from(str).toString('base64url'); }

function issueToken(ip) {
  const payload = b64url(JSON.stringify({ expires: Date.now() + TOKEN_EXPIRY_MS, ip }));
  const sig = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token, ip) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const expected = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig, 'base64url'), b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch { return false; }
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return false; }
  if (Date.now() > data.expires) return false;
  const norm = a => a?.replace(/^::ffff:/, '') ?? '';
  return norm(data.ip) === norm(ip);
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
console.log('─── Config ──────────────────────────────────────────');
console.log('  STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? `✓ set` : '✗ NOT SET');
console.log('  TOKEN_SECRET:', process.env.TOKEN_SECRET ? '✓ set' : '⚠  not set');
console.log('  APP_URL:', APP_URL);
console.log('─────────────────────────────────────────────────────');

// ── Silence pdfjs noise ───────────────────────────────────────────────────────
const _origWarn = console.warn.bind(console);
console.warn = (...args) => {
  const msg = String(args[0] ?? '');
  if (['getPathGenerator','Unable to load font','TT: undefined','TT: invalid',
       'ignoring character','Requesting object','standardFontDataUrl','_path_',
       'undefined function']
      .some(s => msg.includes(s))) return;
  _origWarn(...args);
};
const _origErr = console.error.bind(console);
console.error = (...args) => {
  const msg = String(args[0] ?? '');
  if (['getPathGenerator','Unable to load font','standardFontDataUrl','_path_']
      .some(s => msg.includes(s))) return;
  _origErr(...args);
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const _fontsDir = resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts');

class NodeFontDataFactory {
  async fetch({ filename }) {
    try {
      const data = readFileSync(join(_fontsDir, filename));
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch (e) { throw new Error(`Font not found: ${filename}`); }
  }
}
console.log(`✓  Font factory ready — ${_fontsDir}`);

function toSafeUint8Array(buf) {
  if (buf instanceof Uint8Array && !(buf instanceof Buffer)) return buf;
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// Decode multer filenames (latin1-encoded UTF-8) and produce safe Content-Disposition
function safeFilename(raw) {
  try {
    return Buffer.from(raw ?? 'document', 'latin1').toString('utf8');
  } catch {
    return raw ?? 'document';
  }
}

function contentDisposition(filename) {
  // ASCII-safe fallback (strip non-ASCII for the plain filename= param)
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  // Full UTF-8 name via RFC 5987 filename*= param
  const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// GHOSTSCRIPT
// ══════════════════════════════════════════════════════════════════════════════

// Use correct GS binary per OS: Windows = gswin64c, Linux/Mac = gs
function getGsBin() {
  return platform() === 'win32' ? 'gswin64c' : 'gs';
}

// GS args per preset — properly differentiated
const GS_ARGS = {
  high: [
    '-dPDFSETTINGS=/ebook',
    '-dColorImageResolution=150',
    '-dGrayImageResolution=150',
    '-dMonoImageResolution=300',
    '-dCompressFonts=true',
    '-dDetectDuplicateImages=true',
  ],
  medium: [
    '-dPDFSETTINGS=/screen',
    '-dColorImageResolution=100',
    '-dGrayImageResolution=100',
    '-dMonoImageResolution=200',
    '-dCompressFonts=true',
    '-dDetectDuplicateImages=true',
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
  ],
  low: [
    '-dPDFSETTINGS=/screen',
    '-dColorImageResolution=72',
    '-dGrayImageResolution=72',
    '-dMonoImageResolution=150',
    '-dCompressFonts=true',
    '-dDetectDuplicateImages=true',
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dEmbedAllFonts=false',
    '-dSubsetFonts=true',
    '-dCompatibilityLevel=1.4',
  ],
  // aggressive: rasterizes entire PDF to JPEG at 120 DPI
  // text becomes pixels — not selectable/searchable — but maximum size reduction
  // handled separately via pdfToImages + sharp pipeline (not GS)
};

async function compressWithGhostscript(inputBuffer, preset = 'high') {
  const id      = randomUUID();
  const inPath  = join(tmpdir(), `sd_${id}_in.pdf`);
  const outPath = join(tmpdir(), `sd_${id}_out.pdf`);
  try {
    await writeFile(inPath, inputBuffer);
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dNOPAUSE', '-dQUIET', '-dBATCH',
      ...(GS_ARGS[preset] ?? GS_ARGS.high),
      `-sOutputFile=${outPath}`,
      inPath,
    ];
    await execFileAsync(getGsBin(), args, { timeout: 120_000 });
    return await readFile(outPath);
  } finally {
    await Promise.allSettled([unlink(inPath).catch(()=>{}), unlink(outPath).catch(()=>{})]);
  }
}

/**
 * Aggressive compression: rasterizes entire PDF at low DPI then re-encodes
 * as JPEG. Text becomes pixels — not selectable — but achieves 80-95% size
 * reduction. Best for scanned documents or when size is the only priority.
 */
async function aggressiveCompress(inputBuffer, dpi = 120, quality = 45) {
  // 1. Render all pages at target DPI
  const pages = await pdfToImages(inputBuffer, dpi);

  // 2. Re-encode each page as JPEG at target quality
  const jpegPages = await Promise.all(pages.map(buf =>
    sharp(buf)
      .jpeg({ quality, mozjpeg: false, chromaSubsampling: '4:2:0' })
      .toBuffer()
  ));

  // 3. Assemble into PDF using original page dimensions
  const pdfDoc = await PDFDocument.create();
  const srcPdf = await getDocument({
    data: toSafeUint8Array(inputBuffer),
    StandardFontDataFactory: NodeFontDataFactory,
    useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false,
  }).promise;

  for (let i = 0; i < jpegPages.length; i++) {
    const jpg  = await pdfDoc.embedJpg(toSafeUint8Array(jpegPages[i]));
    // Get original page size in points
    const page = await srcPdf.getPage(i + 1);
    const vp   = page.getViewport({ scale: 1 });
    const pdfPage = pdfDoc.addPage([vp.width, vp.height]);
    pdfPage.drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
    page.cleanup();
  }
  srcPdf.destroy();

  return Buffer.from(await pdfDoc.save());
}
import AdmZip from 'adm-zip';

// ══════════════════════════════════════════════════════════════════════════════
// DOCX / ZIP COMPRESSION
// ══════════════════════════════════════════════════════════════════════════════

const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.gif','.tiff','.tif','.bmp','.webp','.emf','.wmf']);

/**
 * Compress a DOCX (or any Office Open XML) file by:
 * 1. Recompressing embedded images with sharp
 * 2. Repacking the ZIP at max compression
 */
async function compressDocx(inputBuffer, quality = 82) {
  const zip = new AdmZip(inputBuffer);
  const entries = zip.getEntries();
  const outZip = new AdmZip();

  for (const entry of entries) {
    const name = entry.entryName;
    const data = entry.getData();
    const ext  = name.slice(name.lastIndexOf('.')).toLowerCase();

    if (!entry.isDirectory && IMAGE_EXTS.has(ext) && data.length > 10_000) {
      try {
        let compressed;
        if (ext === '.png') {
          // Keep PNG but crush it
          compressed = await sharp(data).png({ compressionLevel: 9, palette: false }).toBuffer();
        } else {
          // Convert everything else to JPEG
          compressed = await sharp(data).jpeg({ quality, mozjpeg: false }).toBuffer();
          // Only use if actually smaller
          if (compressed.length >= data.length) compressed = data;
        }
        // Rename .png → .jpeg inside the docx if we converted
        const newName = (ext === '.png' && compressed !== data)
          ? name.replace(/\.png$/i, '.jpeg')
          : name;
        outZip.addFile(newName, compressed, '', 8); // 8 = DEFLATE
        continue;
      } catch { /* if sharp fails, keep original */ }
    }

    // Non-image entries: just repack with max compression
    outZip.addFile(name, data, '', entry.isDirectory ? 0 : 8);
  }

  return Buffer.from(outZip.toBuffer());
}

/**
 * Recompress a ZIP at maximum deflate level.
 * Also recompresses any images found inside.
 */
async function compressZip(inputBuffer, quality = 80) {
  const zip    = new AdmZip(inputBuffer);
  const outZip = new AdmZip();

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      outZip.addFile(entry.entryName, Buffer.alloc(0), '', 0);
      continue;
    }
    const data = entry.getData();
    const ext  = entry.entryName.slice(entry.entryName.lastIndexOf('.')).toLowerCase();

    if (IMAGE_EXTS.has(ext) && data.length > 10_000) {
      try {
        const compressed = await sharp(data).jpeg({ quality }).toBuffer();
        if (compressed.length < data.length) {
          outZip.addFile(entry.entryName, compressed, '', 8);
          continue;
        }
      } catch { /* keep original */ }
    }

    outZip.addFile(entry.entryName, data, '', 8); // max deflate
  }

  return Buffer.from(outZip.toBuffer());
}
/**
 * Assemble processed page PNG buffers into a PDF with pdf-lib,
 * then compress the assembled PDF with Ghostscript.
 * Falls back to plain pdf-lib output if GS is unavailable.
 */
async function assembleAndCompressPdf(processedBuffers) {
  const rawPdfBytes = await buffersToPdf(processedBuffers);
  try {
    const compressed = await compressWithGhostscript(Buffer.from(rawPdfBytes), 'high');
    const pct = ((1 - compressed.length / rawPdfBytes.length) * 100).toFixed(1);
    console.log(`   🗜  GS: ${(rawPdfBytes.length/1024).toFixed(0)}KB → ${(compressed.length/1024).toFixed(0)}KB (${pct}%)`);
    return Buffer.from(compressed);
  } catch (err) {
    console.warn(`   ⚠  GS failed (${err.message}), using pdf-lib output`);
    return Buffer.from(rawPdfBytes);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPRESS + MULTER
// ══════════════════════════════════════════════════════════════════════════════

const app = express();

const ACCEPTED_TYPES = new Set([
  'application/pdf','image/jpeg','image/jpg',
  'image/png','image/webp','image/tiff','image/bmp',
]);
const IMAGE_TYPES = new Set([
  'image/jpeg','image/jpg','image/png','image/webp','image/tiff','image/bmp',
]);

// DOCX / Office Open XML mime types
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/msword',       // .doc (legacy — we still try)
]);
const ZIP_TYPES = new Set([
  'application/zip','application/x-zip','application/x-zip-compressed',
  'application/octet-stream', // some browsers send this for .zip
]);

const uploadDocOrZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = DOCX_TYPES.has(file.mimetype) || ZIP_TYPES.has(file.mimetype)
      || file.originalname.match(/\.(docx|xlsx|pptx|zip)$/i);
    ok ? cb(null, true) : cb(new Error('Only DOCX, XLSX, PPTX, and ZIP files supported.'));
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    ACCEPTED_TYPES.has(file.mimetype) ? cb(null, true) : cb(new Error('Unsupported file type.')),
});

const uploadPdfOnly = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDF files supported.')),
});

app.use(express.static(join(__dirname, 'public')));
app.use(express.json({ limit: '200mb' }));

app.use((req, res, next) => {
  req.setTimeout(600_000, () => {
    if (!res.headersSent) res.status(503).json({ error: 'Request timed out' });
  });
  next();
});

app.get('/health', (_, res) => res.json({ status: 'ok', node: process.version }));
// ── GET /dev-token ─── REMOVE BEFORE PRODUCTION ──────────────────────────────
app.get('/dev-token', (req, res) => {
  const ip    = req.headers['x-forwarded-for']?.split(',')[0].trim()
             ?? req.socket.remoteAddress ?? '127.0.0.1';
  const token = issueToken(ip);
  res.json({ token, ip });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeDpi(requestedDpi, pageCount) {
  if (pageCount <= 5)  return Math.min(requestedDpi, 300);
  if (pageCount <= 15) return Math.min(requestedDpi, 200);
  if (pageCount <= 30) return Math.min(requestedDpi, 150);
  return Math.min(requestedDpi, 120);
}

function safeConcurrency(pageCount, heavyEffects) {
  if (heavyEffects) return 1;
  if (pageCount <= 4)  return 3;
  if (pageCount <= 15) return 2;
  return 1;
}

async function pdfToImages(pdfBuffer, dpi = 300) {
  const scale = dpi / 96;
  const pdf = await getDocument({
    data: toSafeUint8Array(pdfBuffer),
    StandardFontDataFactory: NodeFontDataFactory,
    useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false,
  }).promise;
  const buffers = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page     = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas   = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      buffers.push(toSafeUint8Array(canvas.toBuffer('image/png')));
      page.cleanup();
    }
  } finally { pdf.destroy(); }
  return buffers;
}

async function countPdfPages(pdfBuffer) {
  const pdf = await getDocument({
    data: toSafeUint8Array(pdfBuffer),
    StandardFontDataFactory: NodeFontDataFactory,
    useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false,
  }).promise;
  const n = pdf.numPages;
  pdf.destroy();
  return n;
}

async function buffersToPdf(processedBuffers) {
  const pdfDoc = await PDFDocument.create();
  const A4_W = 595.28, A4_H = 841.89;
  for (const imgBuf of processedBuffers) {
    const png       = await pdfDoc.embedPng(imgBuf);
    const imgAspect = png.width / png.height;
    const pgAspect  = A4_W / A4_H;
    let drawW, drawH;
    if (imgAspect > pgAspect) { drawW = A4_W; drawH = A4_W / imgAspect; }
    else                      { drawH = A4_H; drawW = A4_H * imgAspect; }
    const page = pdfDoc.addPage([A4_W, A4_H]);
    page.drawImage(png, { x:(A4_W-drawW)/2, y:(A4_H-drawH)/2, width:drawW, height:drawH });
  }
  return new Uint8Array(await pdfDoc.save());
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /preview ─────────────────────────────────────────────────────────────
app.post('/preview', upload.fields([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    let pageBuffer = IMAGE_TYPES.has(file.mimetype)
      ? file.buffer
      : (await pdfToImages(file.buffer, 72))[0];
    if (!pageBuffer) return res.status(500).json({ error: 'Could not render PDF' });
    const thumb = await sharp(pageBuffer)
      .resize(600, null, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(thumb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /page-count ──────────────────────────────────────────────────────────
app.post('/page-count', upload.fields([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    if (IMAGE_TYPES.has(file.mimetype)) return res.json({ pages: 1 });
    res.json({ pages: await countPdfPages(file.buffer) });
  } catch { res.json({ pages: 99 }); }
});

// ── POST /compress-pdf ────────────────────────────────────────────────────────
// Uses Ghostscript — preserves vector text, fonts, document structure.
// Only recompresses embedded images. Much better than rasterizing.
app.post('/compress-pdf', uploadPdfOnly.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const origSize = req.file.buffer.length;
  const preset   = req.body.preset ?? 'high';
  const origName    = safeFilename(req.file.originalname).replace(/\.pdf$/i, '');
  const outName     = `${origName}_compressed.pdf`;
  console.log(`🗜  compress | ${origName} | ${(origSize/1024).toFixed(0)}KB | preset:${preset}`);
  try {
    let compressed;
    if (preset === 'low') {
      const rasterized = await aggressiveCompress(req.file.buffer, 100, 35);
      const gsResult   = await compressWithGhostscript(req.file.buffer, 'low').catch(() => null);
      if (gsResult && gsResult.length < rasterized.length) {
        compressed = gsResult;
        console.log(`   📄 low: GS won (${(gsResult.length/1024).toFixed(0)}KB vs raster ${(rasterized.length/1024).toFixed(0)}KB)`);
      } else {
        compressed = rasterized;
        console.log(`   🖼  low: raster won (${(rasterized.length/1024).toFixed(0)}KB vs GS ${gsResult ? (gsResult.length/1024).toFixed(0) : '?'}KB)`);
      }
    } else {
      compressed = await compressWithGhostscript(req.file.buffer, preset);
    }
    const newSize  = compressed.length;
    const savedPct = Math.max(0, Math.round((1 - newSize / origSize) * 100));
    console.log(`✓  compress | ${(origSize/1024).toFixed(0)}KB → ${(newSize/1024).toFixed(0)}KB | saved ${savedPct}%`);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(outName),
      'X-Original-Size':     origSize,
      'X-Compressed-Size':   newSize,
      'X-Saved-Percent':     savedPct,
    });
    res.send(Buffer.from(compressed));
  } catch (err) {
    console.error('✗ compress:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── POST /compress-doc ────────────────────────────────────────────────────────
// Compresses DOCX / XLSX / PPTX / ZIP by recompressing embedded images
// and repacking with max deflate. No content changes — purely size reduction.
app.post('/compress-doc', uploadDocOrZip.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const origSize = req.file.buffer.length;
  const origName = safeFilename(req.file.originalname);
  const ext      = origName.slice(origName.lastIndexOf('.')).toLowerCase();
  const baseName = origName.replace(/\.[^.]+$/, '');
  const outName  = `${baseName}_compressed${ext}`;
  const quality  = parseInt(req.body.quality ?? 80);
  const isZip    = ext === '.zip';

  console.log(`🗜  compress-doc | ${origName} | ${(origSize/1024).toFixed(0)}KB | ${isZip ? 'zip' : 'office'}`);

  try {
    const compressed = isZip
      ? await compressZip(req.file.buffer, quality)
      : await compressDocx(req.file.buffer, quality);

    const newSize  = compressed.length;
    const savedPct = Math.max(0, Math.round((1 - newSize / origSize) * 100));
    console.log(`✓  compress-doc | ${(origSize/1024).toFixed(0)}KB → ${(newSize/1024).toFixed(0)}KB | saved ${savedPct}%`);

    const mimeMap = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.zip':  'application/zip',
    };

    res.set({
      'Content-Type':        mimeMap[ext] ?? 'application/octet-stream',
      'Content-Disposition': contentDisposition(outName),
      'X-Original-Size':     origSize,
      'X-Compressed-Size':   newSize,
      'X-Saved-Percent':     savedPct,
    });
    res.send(compressed);
  } catch (err) {
    console.error('✗ compress-doc:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── POST /compress-image ──────────────────────────────────────────────────────
// Compresses JPG, PNG, WEBP images using sharp.
// Supports quality control, format conversion, and max-dimension resize.
// Nothing stored — processed entirely in memory.
const uploadImageOnly = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = ['image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype)
      || file.originalname.match(/\.(jpg|jpeg|png|webp)$/i);
    ok ? cb(null, true) : cb(new Error('Only JPG, PNG, and WEBP supported.'));
  },
});

app.post('/compress-image', uploadImageOnly.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const origSize  = req.file.buffer.length;
  const origName  = safeFilename(req.file.originalname);
  const baseName  = origName.replace(/\.[^.]+$/, '');
  const quality   = Math.max(10, Math.min(100, parseInt(req.body.quality  ?? 82)));
  const maxWidth  = req.body.maxWidth  ? parseInt(req.body.maxWidth)  : null;
  const maxHeight = req.body.maxHeight ? parseInt(req.body.maxHeight) : null;
  const format    = req.body.format ?? 'auto'; // auto | jpeg | png | webp

  console.log(`🖼  compress-image | ${origName} | ${(origSize/1024).toFixed(0)}KB | q:${quality} fmt:${format}`);

  try {
    const meta = await sharp(req.file.buffer).metadata();
    let pipeline = sharp(req.file.buffer);

    // Resize if maxWidth/maxHeight requested
    if (maxWidth || maxHeight) {
      pipeline = pipeline.resize(maxWidth ?? null, maxHeight ?? null, {
        fit: 'inside', withoutEnlargement: true,
      });
    }

    // Determine output format
    let outExt, outMime;
    const inputFormat = meta.format; // jpeg, png, webp, etc.
    const targetFormat = format === 'auto' ? inputFormat : format;

    if (targetFormat === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality });
      outExt = 'png'; outMime = 'image/png';
    } else if (targetFormat === 'webp') {
      pipeline = pipeline.webp({ quality, effort: 6 });
      outExt = 'webp'; outMime = 'image/webp';
    } else {
      // Default to JPEG (best compression for photos)
      pipeline = pipeline.jpeg({ quality, mozjpeg: false, chromaSubsampling: '4:2:0' });
      outExt = 'jpg'; outMime = 'image/jpeg';
    }

    const compressed = await pipeline.toBuffer();
    const compMeta   = await sharp(compressed).metadata();

    // Only use compressed version if it's actually smaller
    const final    = compressed.length < origSize ? compressed : req.file.buffer;
    const newSize  = final.length;
    const savedPct = Math.max(0, Math.round((1 - newSize / origSize) * 100));

    console.log(`✓  compress-image | ${(origSize/1024).toFixed(0)}KB → ${(newSize/1024).toFixed(0)}KB | saved ${savedPct}% | ${compMeta.width}×${compMeta.height}`);

    const outName = `${baseName}_compressed.${outExt}`;
    res.set({
      'Content-Type':        outMime,
      'Content-Disposition': contentDisposition(outName),
      'X-Original-Size':     origSize,
      'X-Compressed-Size':   newSize,
      'X-Saved-Percent':     savedPct,
      'X-Width':             compMeta.width,
      'X-Height':            compMeta.height,
    });
    res.send(final);
  } catch (err) {
    console.error('✗ compress-image:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});
// Returns: { pages: string[], count: number }  (base64 JPEG per page)
app.post('/editor/pages', upload.fields([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    let rawPages, pageDims;

    if (IMAGE_TYPES.has(file.mimetype)) {
      rawPages  = [toSafeUint8Array(file.buffer)];
      // Get image dimensions for correct export sizing
      const meta = await sharp(file.buffer).metadata();
      pageDims  = [{ w: meta.width ?? 595, h: meta.height ?? 842 }];
    } else {
      rawPages = await pdfToImages(file.buffer, 300);
      // Get original PDF page dimensions in points (for correct export sizing)
      const pdf  = await getDocument({
        data: toSafeUint8Array(file.buffer),
        StandardFontDataFactory: NodeFontDataFactory,
        useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false,
      }).promise;
      pageDims = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page     = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pageDims.push({ w: viewport.width, h: viewport.height }); // in PDF points
        page.cleanup();
      }
      pdf.destroy();
    }

    const pages = await Promise.all(rawPages.map(async (buf) => {
      const jpeg = await sharp(buf).jpeg({ quality: 95 }).toBuffer();
      return jpeg.toString('base64');
    }));

    console.log(`✓  editor/pages | ${pages.length} page(s) rendered`);
    res.json({ pages, count: pages.length, pageDims });
  } catch (err) {
    console.error('✗ editor/pages:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /editor/export ───────────────────────────────────────────────────────
// Receives flattened canvas PNGs (base64 data URLs), assembles into PDF,
// then compresses with Ghostscript.
// Body: { pages: string[], filename?: string }
app.post('/editor/export', async (req, res) => {
    const { pages, filename, pageDims } = req.body;
    if (!Array.isArray(pages) || !pages.length) {
      return res.status(400).json({ error: 'No pages provided' });
    }
    try {
      const pdfDoc = await PDFDocument.create();
      for (let idx = 0; idx < pages.length; idx++) {
        const dataUrl = pages[idx];
        const base64  = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buf     = Buffer.from(base64, 'base64');
        const png     = await pdfDoc.embedPng(toSafeUint8Array(buf));

        // Use original page dimensions if available, otherwise calculate from DPI
        let ptW, ptH;
        if (pageDims && pageDims[idx]) {
          // pageDims are already in PDF points (from getViewport scale=1)
          ptW = pageDims[idx].w;
          ptH = pageDims[idx].h;
        } else {
          // Fallback: image was rendered at 300 DPI, convert px → pt
          ptW = png.width  * 72 / 300;
          ptH = png.height * 72 / 300;
        }

        const page = pdfDoc.addPage([ptW, ptH]);
        page.drawImage(png, { x: 0, y: 0, width: ptW, height: ptH });
      }
      const rawPdf = Buffer.from(await pdfDoc.save());

      // 2. Compress with GS
      let finalPdf;
      try {
        finalPdf = Buffer.from(await compressWithGhostscript(rawPdf, 'high'));
        console.log(`✓  editor/export | ${pages.length}p | GS compressed`);
      } catch {
        finalPdf = rawPdf;
        console.log(`✓  editor/export | ${pages.length}p | pdf-lib fallback`);
      }

      const outName = safeFilename(filename ?? 'document').replace(/\.pdf$/i, '') + '_edited.pdf';
      res.set({
        'Content-Type':        'application/pdf',
        'Content-Disposition': contentDisposition(outName),
      });
      res.send(finalPdf);
    } catch (err) {
      console.error('✗ editor/export:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// ── POST /create-checkout-session ─────────────────────────────────────────────
app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'STRIPE_SECRET_KEY not set' });
  try {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
                  ?? req.socket.remoteAddress ?? '0.0.0.0';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: {
        currency: 'usd', unit_amount: 500,
        product_data: { name: 'ScanDrift — Unlimited Pages', description: 'One-time unlock — valid 10 hours.' },
      }}],
      success_url: `${APP_URL}/?verify_session={CHECKOUT_SESSION_ID}&cip=${encodeURIComponent(clientIp)}`,
      cancel_url:  `${APP_URL}/?cancelled=1`,
    });
    res.json({ sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: `Stripe: ${err.message}` });
  }
});

// ── GET /verify-payment ───────────────────────────────────────────────────────
app.get('/verify-payment', async (req, res) => {
  const { verify_session, cip } = req.query;
  if (!verify_session) return res.status(400).json({ error: 'Missing session ID' });
  if (!stripe)         return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const session = await stripe.checkout.sessions.retrieve(verify_session);
    if (session.payment_status !== 'paid') return res.status(402).json({ error: 'Payment not completed' });
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
                  ?? req.socket.remoteAddress ?? cip ?? '0.0.0.0';
    const token = issueToken(clientIp);
    console.log(`✓  Token issued → IP: ${clientIp}`);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /process ─────────────────────────────────────────────────────────────
app.post('/process', upload.fields([
  { name: 'file',  maxCount: 1   },
  { name: 'files', maxCount: 100 },
]), async (req, res) => {
  const allFiles = req.files?.files ?? (req.files?.file ? req.files.file : []);
  if (!allFiles.length) return res.status(400).json({ error: 'No file uploaded' });

  const requestedDpi = parseInt(req.body.dpi ?? 300);

  let totalPageCount = 0;
  for (const file of allFiles) {
    if (IMAGE_TYPES.has(file.mimetype)) totalPageCount++;
    else { try { totalPageCount += await countPdfPages(file.buffer); } catch { totalPageCount++; } }
  }

  const unlockToken = req.body.unlockToken ?? null;
  const clientIp    = req.headers['x-forwarded-for']?.split(',')[0].trim()
                   ?? req.socket.remoteAddress ?? '0.0.0.0';
  const isUnlocked  = verifyToken(unlockToken, clientIp);

  const capPages = (!isUnlocked && req.body.capPages)
    ? parseInt(req.body.capPages)
    : (!isUnlocked && totalPageCount > FREE_PAGE_LIMIT) ? FREE_PAGE_LIMIT : null;

  if (capPages !== null && totalPageCount > capPages) {
    console.log(`   ✂  Capping to ${capPages} pages`);
    totalPageCount = capPages;
  }

  const dpi = safeDpi(requestedDpi, totalPageCount);
  req.socket.setTimeout(180_000 + totalPageCount * 8_000);

  const opts = {
    noise:                  parseFloat(req.body.noise            ?? 5),
    blur:                   parseFloat(req.body.blur              ?? 0),
    brightness:             parseFloat(req.body.brightness        ?? 1.0),
    contrast:               parseFloat(req.body.contrast          ?? 1.05),
    yellowTint:             parseFloat(req.body.yellowTint        ?? 0),
    grain:                  req.body.grain    !== 'false',
    deskew:                 req.body.deskew   !== 'false',
    manualSkew:             parseFloat(req.body.manualSkew        ?? 0),
    dpi,
    format:                 req.body.format   ?? 'pdf',
    sharpness:              parseInt(req.body.sharpness           ?? 1),
    bindingShadow:          req.body.bindingShadow    === 'true',
    rotation:               parseFloat(req.body.rotation          ?? 0.4),
    crumple:                req.body.crumple          === 'true',
    crumpleIntensity:       parseFloat(req.body.crumpleIntensity  ?? 1.0),
    streaks:                req.body.streaks          === 'true',
    dust:                   req.body.dust             === 'true',
    unevenAging:            req.body.unevenAging      === 'true',
    pageWarp:               req.body.pageWarp         === 'true',
    warpIntensity:          parseFloat(req.body.warpIntensity     ?? 1.0),
    spineCurve:             req.body.spineCurve       === 'true',
    lampBanding:            req.body.lampBanding      === 'true',
    paperTexture:           req.body.paperTexture     === 'true',
    edgeVignette:           req.body.edgeVignette     === 'true',
    channelMisreg:          req.body.channelMisreg         === 'true',
    jpegInternalize:        req.body.jpegInternalize        === 'true',
    scanDropout:            req.body.scanDropout            === 'true',
    moire:                  req.body.moire                  === 'true',
    ambientLeak:            req.body.ambientLeak            === 'true',
    motionSmear:            req.body.motionSmear            === 'true',
    focusGradient:          req.body.focusGradient          === 'true',
    focusEdge:              req.body.focusEdge              ?? 'left',
    focusGradientIntensity: parseFloat(req.body.focusGradientIntensity ?? 1.0),
    backBleed:              req.body.backBleed              === 'true',
    backBleedOpacity:       parseFloat(req.body.backBleedOpacity   ?? 0.07),
  };

  const isMultiUpload = allFiles.length > 1;
  const baseName = isMultiUpload
    ? 'scanned_images'
    : safeFilename(allFiles[0].originalname).replace(/\.[^.]+$/, '');
  const heavyEffects = opts.pageWarp || opts.crumple || opts.unevenAging || opts.paperTexture || opts.focusGradient;
  const CONCURRENCY  = safeConcurrency(totalPageCount, heavyEffects);

  console.log(`⚙  ${allFiles[0].originalname} | pages:${totalPageCount} dpi:${dpi} fmt:${opts.format}`);

  try {
    let pageBuffers = [];
    for (const file of allFiles) {
      if (IMAGE_TYPES.has(file.mimetype)) {
        pageBuffers.push(toSafeUint8Array(file.buffer));
      } else {
        const pages = await pdfToImages(file.buffer, dpi);
        if (!pages.length) return res.status(500).json({ error: `Could not extract pages from ${file.originalname}` });
        pageBuffers.push(...pages);
      }
      if (capPages !== null && pageBuffers.length >= capPages) break;
    }
    if (capPages !== null && pageBuffers.length > capPages) pageBuffers = pageBuffers.slice(0, capPages);

    const processedBuffers = new Array(pageBuffers.length);
    for (let i = 0; i < pageBuffers.length; i += CONCURRENCY) {
      const chunk   = pageBuffers.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(buf => processPage(buf, opts)));
      results.forEach((buf, j) => { processedBuffers[i + j] = buf; pageBuffers[i + j] = null; });
      if (i + CONCURRENCY < pageBuffers.length) await new Promise(r => setImmediate(r));
    }
    pageBuffers = null;

    if (opts.backBleed && processedBuffers.length > 1) {
      for (let i = 0; i < processedBuffers.length; i++) {
        const ri = i % 2 === 0 ? i + 1 : i - 1;
        if (ri < 0 || ri >= processedBuffers.length) continue;
        processedBuffers[i] = await applyBackBleed(processedBuffers[i], processedBuffers[ri], opts.backBleedOpacity);
      }
    }

    if (req.body.sigData) {
      const sigBuf    = toSafeUint8Array(Buffer.from(req.body.sigData, 'base64'));
      const xPct      = parseFloat(req.body.sigX ?? 0.6);
      const yPct      = parseFloat(req.body.sigY ?? 0.85);
      const wPct      = parseFloat(req.body.sigW ?? 0.2);
      const hPct      = parseFloat(req.body.sigH ?? 0.05);
      const sigRotDeg = parseFloat(req.body.sigRotation ?? 0);
      const sigPage   = req.body.sigPage ?? 'last';
      const shouldApply = (i) => {
        if (sigPage === 'all')  return true;
        if (sigPage === 'last') return i === processedBuffers.length - 1;
        const n = parseInt(sigPage);
        return !isNaN(n) && i === n - 1;
      };
      for (let i = 0; i < processedBuffers.length; i++) {
        if (shouldApply(i)) {
          processedBuffers[i] = await compositeSignature(processedBuffers[i], sigBuf, xPct, yPct, wPct, hPct, sigRotDeg);
        }
      }
    }

    if (opts.format === 'zip') {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', contentDisposition(`${baseName}_scanned.zip`));
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(res);
      processedBuffers.forEach((buf, i) =>
        archive.append(buf, { name: `page_${String(i+1).padStart(3,'0')}.png` }));
      await archive.finalize();
    } else if (opts.format === 'image' && !isMultiUpload && IMAGE_TYPES.has(allFiles[0].mimetype)) {
      const ext = allFiles[0].mimetype === 'image/png' ? 'png' : 'jpg';
      res.setHeader('Content-Type', `image/${ext}`);
      res.setHeader('Content-Disposition', contentDisposition(`${baseName}_scanned.${ext}`));
      res.send(processedBuffers[0]);
    } else {
      // Assemble with pdf-lib → compress with Ghostscript
      const pdfBytes = await assembleAndCompressPdf(processedBuffers);
      console.log(`✓  ${(pdfBytes.length/1024).toFixed(1)}KB | ${processedBuffers.length}p`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', contentDisposition(`${baseName}_scanned.pdf`));
      res.send(pdfBytes);
    }
  } catch (err) {
    console.error('✗ process:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  if (!res.headersSent) res.status(500).json({ error: err.message ?? 'Internal server error' });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`\n🖨  ScanDrift  ➜  http://localhost:${PORT}\n`));