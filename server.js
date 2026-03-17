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
import { readdirSync, readFileSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import Stripe from 'stripe';

// ── Stripe config ─────────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

const APP_URL         = process.env.APP_URL ?? 'http://localhost:3000';
const FREE_PAGE_LIMIT = 3;
const TOKEN_EXPIRY_MS = 10 * 60 * 60 * 1000; // 10 hours in milliseconds

// ── Token secret ──────────────────────────────────────────────────────────────
// Used to sign and verify unlock tokens. Set TOKEN_SECRET in your .env to a
// long random string. If not set, a random one is generated at startup
// (tokens won't survive a server restart — fine for testing, not production).
const TOKEN_SECRET = process.env.TOKEN_SECRET
  ?? (() => {
    const s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    console.warn('⚠  TOKEN_SECRET not set in .env — tokens reset on every restart');
    return s;
  })();

// ── Token helpers ─────────────────────────────────────────────────────────────
// Token format (base64url): payload.signature
// Payload (JSON): { expires: unixMs, ip: "x.x.x.x" }
// Signature: HMAC-SHA256(payload_base64, TOKEN_SECRET)
//
// IP binding means a token stolen from localStorage is useless from a
// different IP address — closes the token-sharing attack vector.

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

function issueToken(ip) {
  const payload  = b64url(JSON.stringify({
    expires: Date.now() + TOKEN_EXPIRY_MS,
    ip,
  }));
  const sig = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token, ip) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;

  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);

  // Verify signature using timing-safe comparison
  const expected = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig,      'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch { return false; }

  // Decode and check expiry + IP
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); }
  catch { return false; }

  if (Date.now() > data.expires) return false;

  // IP check — normalise IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4)
  const normalise = (addr) => addr?.replace(/^::ffff:/, '') ?? '';
  if (normalise(data.ip) !== normalise(ip)) return false;

  return true;
}

// ── Startup diagnostics ───────────────────────────────────────────────────────
console.log('─── Stripe config ───────────────────────────────────');
console.log('  STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY
  ? `✓ set (${process.env.STRIPE_SECRET_KEY.slice(0, 14)}...)`
  : '✗ NOT SET — payment will fail');
console.log('  TOKEN_SECRET:', process.env.TOKEN_SECRET
  ? '✓ set'
  : '⚠  not set — tokens reset on every restart (add to .env for production)');
console.log('  APP_URL:', APP_URL);
console.log('─────────────────────────────────────────────────────');

// ── Silence pdfjs console noise ───────────────────────────────────────────────
const _origWarn = console.warn.bind(console);
console.warn = (...args) => {
  const msg = String(args[0] ?? '');
  if (
    msg.includes('getPathGenerator') ||
    msg.includes('Unable to load font data') ||
    msg.includes('TT: undefined function') ||
    msg.includes('TT: invalid function') ||
    msg.includes('ignoring character') ||
    msg.includes('Requesting object that isn') ||
    msg.includes('standardFontDataUrl') ||
    msg.includes('_path_')
  ) return;
  _origWarn(...args);
};
const _origErr = console.error.bind(console);
console.error = (...args) => {
  const msg = String(args[0] ?? '');
  if (
    msg.includes('getPathGenerator') ||
    msg.includes('Unable to load font data') ||
    msg.includes('standardFontDataUrl') ||
    msg.includes('_path_')
  ) return;
  _origErr(...args);
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const _fontsDir = resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts');

// ── Custom font data factory — reads fonts directly via fs, no URL fetching ──
// All file:// URL approaches fail on Windows regardless of path cleanliness
// because pdfjs-dist legacy's Node.js fetch shim doesn't handle file:// URLs
// reliably. The correct fix is a custom StandardFontDataFactory that bypasses
// URL fetching entirely and reads font files synchronously from disk.
class NodeFontDataFactory {
  async fetch({ filename }) {
    try {
      const data = readFileSync(join(_fontsDir, filename));
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch (e) {
      throw new Error(`Font not found: ${filename} (${e.message})`);
    }
  }
}
const fontFactory = new NodeFontDataFactory();
console.log(`✓  Font factory ready — reading from: ${_fontsDir}`);


// ── Safe buffer copy ──────────────────────────────────────────────────────────
function toSafeUint8Array(buf) {
  if (buf instanceof Uint8Array && !(buf instanceof Buffer)) return buf;
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

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

app.use((req, res, next) => {
  req.setTimeout(600_000, () => {
    if (!res.headersSent) res.status(503).json({ error: 'Request timed out' });
  });
  next();
});

app.get('/health', (_, res) => res.json({ status: 'ok', node: process.version }));

// ── DPI safety cap ────────────────────────────────────────────────────────────
function safeDpi(requestedDpi, pageCount) {
  if (pageCount <= 5)  return Math.min(requestedDpi, 300);
  if (pageCount <= 15) return Math.min(requestedDpi, 200);
  if (pageCount <= 30) return Math.min(requestedDpi, 150);
  return Math.min(requestedDpi, 120);
}

// ── Concurrency ───────────────────────────────────────────────────────────────
function safeConcurrency(pageCount, heavyEffects) {
  if (heavyEffects) return 1;
  if (pageCount <= 4)  return 3;
  if (pageCount <= 15) return 2;
  return 1;
}

async function pdfToImages(pdfBuffer, dpi = 300) {
  const scale = dpi / 96;
  const pdf = await getDocument({
    data:                    toSafeUint8Array(pdfBuffer),
    StandardFontDataFactory: NodeFontDataFactory,
    useWorkerFetch:          false,
    isEvalSupported:         false,
    useSystemFonts:          false,
  }).promise;

  const numPages = pdf.numPages;
  const buffers  = [];
  try {
    for (let i = 1; i <= numPages; i++) {
      const page     = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas   = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const raw = canvas.toBuffer('image/png');
      buffers.push(toSafeUint8Array(raw));
      page.cleanup();
    }
  } finally {
    pdf.destroy();
  }
  return buffers;
}

async function countPdfPages(pdfBuffer) {
  const pdf = await getDocument({
    data:                    toSafeUint8Array(pdfBuffer),
    StandardFontDataFactory: NodeFontDataFactory,
    useWorkerFetch:          false,
    isEvalSupported:         false,
    useSystemFonts:          false,
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

// ── POST /page-count ──────────────────────────────────────────────────────────
// Lightweight endpoint — counts PDF pages without rendering any of them.
// Used by the frontend payment gate to decide whether to show the paywall.
app.post('/page-count', upload.fields([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) return res.status(400).json({ error: 'No file' });
  try {
    if (IMAGE_TYPES.has(file.mimetype)) return res.json({ pages: 1 });
    const pages = await countPdfPages(file.buffer);
    res.json({ pages });
  } catch (err) {
    res.json({ pages: 99 }); // fallback — triggers paywall on unknown PDFs
  }
});

// ── POST /create-checkout-session ─────────────────────────────────────────────
// Creates a Stripe Checkout session for the $5 page unlock.
// On success Stripe redirects to APP_URL/?unlocked=1
// On cancel  Stripe redirects to APP_URL/?cancelled=1
app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: 'STRIPE_SECRET_KEY not set in .env — payment not configured.',
    });
  }
  try {
    // Embed the client IP in the success URL so /verify-payment can bind the
    // token to the correct IP on return — even if the redirect changes network.
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
                  ?? req.socket.remoteAddress
                  ?? '0.0.0.0';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency:     'usd',
          unit_amount:  500,
          product_data: {
            name:        'ScanDrift — Unlimited Pages',
            description: 'One-time unlock — valid 10 hours, tied to your IP.',
          },
        },
      }],
      // Pass session ID and client IP back so /verify-payment can confirm
      // payment and issue a signed token in one round-trip.
      success_url: `${APP_URL}/?verify_session={CHECKOUT_SESSION_ID}&cip=${encodeURIComponent(clientIp)}`,
      cancel_url:  `${APP_URL}/?cancelled=1`,
    });
    res.json({ sessionId: session.id });
  } catch (err) {
    console.error('─── Stripe checkout error ───────────────────────────');
    console.error('  type   :', err.type);
    console.error('  code   :', err.code);
    console.error('  message:', err.message);
    console.error('─────────────────────────────────────────────────────');
    res.status(500).json({ error: `Stripe: ${err.message}` });
  }
});

// ── GET /verify-payment ───────────────────────────────────────────────────────
// Called by the frontend after Stripe redirects back with ?verify_session=...
// Confirms the session was actually paid, then issues a signed 10-hour token
// bound to the client's IP. The token is stored in localStorage by the client.
app.get('/verify-payment', async (req, res) => {
  const { verify_session, cip } = req.query;
  if (!verify_session) return res.status(400).json({ error: 'Missing session ID' });
  if (!stripe)         return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const session = await stripe.checkout.sessions.retrieve(verify_session);
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    // Bind token to the IP that paid. If behind a proxy use x-forwarded-for,
    // otherwise fall back to the embedded cip param from the success URL.
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
                  ?? req.socket.remoteAddress
                  ?? cip
                  ?? '0.0.0.0';

    const token = issueToken(clientIp);
    console.log(`✓  Unlock token issued → IP: ${clientIp} | expires: ${new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString()}`);
    res.json({ token });
  } catch (err) {
    console.error('Verify payment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


app.post('/process', upload.fields([
  { name: 'file',  maxCount: 1   },
  { name: 'files', maxCount: 100 },
]), async (req, res) => {
  const allFiles = req.files?.files ?? (req.files?.file ? req.files.file : []);
  if (!allFiles.length) return res.status(400).json({ error: 'No file uploaded' });

  const requestedDpi = parseInt(req.body.dpi ?? 300);

  // ── Count pages before committing to DPI / timeout ──────────────────────────
  let totalPageCount = 0;
  for (const file of allFiles) {
    if (IMAGE_TYPES.has(file.mimetype)) {
      totalPageCount += 1;
    } else {
      try { totalPageCount += await countPdfPages(file.buffer); }
      catch { totalPageCount += 1; }
    }
  }

  // ── Verify unlock token (server-side) ─────────────────────────────────────
  // Client sends the token from localStorage in every /process request.
  // Server verifies signature, expiry, and IP binding. If invalid/missing,
  // the server enforces the free page cap regardless of what the client says.
  const unlockToken = req.body.unlockToken ?? null;
  const clientIp    = req.headers['x-forwarded-for']?.split(',')[0].trim()
                   ?? req.socket.remoteAddress
                   ?? '0.0.0.0';
  const isUnlocked  = verifyToken(unlockToken, clientIp);

  // ── Enforce free page cap (client signals capPages when user chose free tier) ─
  const capPages = (!isUnlocked && req.body.capPages)
    ? parseInt(req.body.capPages)
    : (!isUnlocked && totalPageCount > FREE_PAGE_LIMIT)
      ? FREE_PAGE_LIMIT  // server-side enforcement even if client didn't send capPages
      : null;

  if (capPages !== null && totalPageCount > capPages) {
    console.log(`   ✂  Capping to ${capPages} pages (${isUnlocked ? 'unlocked' : 'free tier'})`);
    totalPageCount = capPages;
  }

  const dpi = safeDpi(requestedDpi, totalPageCount);
  if (dpi < requestedDpi) {
    console.log(`   ⚠  DPI auto-capped ${requestedDpi}→${dpi} for ${totalPageCount} pages`);
  }

  const dynamicTimeout = 180_000 + totalPageCount * 8_000;
  req.socket.setTimeout(dynamicTimeout);

  const opts = {
    // ── Original params ──────────────────────────────────────────────────────
    noise:             parseFloat(req.body.noise             ?? 5),
    blur:              parseFloat(req.body.blur               ?? 0),
    brightness:        parseFloat(req.body.brightness         ?? 1.0),
    contrast:          parseFloat(req.body.contrast           ?? 1.05),
    yellowTint:        parseFloat(req.body.yellowTint         ?? 0),
    grain:             req.body.grain             !== 'false',
    deskew:            req.body.deskew            !== 'false',
    manualSkew:        parseFloat(req.body.manualSkew         ?? 0),
    dpi,
    format:            req.body.format            ?? 'pdf',
    sharpness:         parseInt(req.body.sharpness            ?? 1),
    bindingShadow:     req.body.bindingShadow     === 'true',
    rotation:          parseFloat(req.body.rotation           ?? 0.4),
    crumple:           req.body.crumple           === 'true',
    crumpleIntensity:  parseFloat(req.body.crumpleIntensity   ?? 1.0),
    streaks:           req.body.streaks           === 'true',
    dust:              req.body.dust              === 'true',
    unevenAging:       req.body.unevenAging       === 'true',
    pageWarp:          req.body.pageWarp          === 'true',
    warpIntensity:     parseFloat(req.body.warpIntensity      ?? 1.0),
    spineCurve:        req.body.spineCurve        === 'true',
    lampBanding:       req.body.lampBanding       === 'true',
    paperTexture:      req.body.paperTexture      === 'true',
    edgeVignette:      req.body.edgeVignette      === 'true',
    // ── New params ───────────────────────────────────────────────────────────
    channelMisreg:           req.body.channelMisreg          === 'true',
    jpegInternalize:         req.body.jpegInternalize         === 'true',
    scanDropout:             req.body.scanDropout             === 'true',
    moire:                   req.body.moire                   === 'true',
    ambientLeak:             req.body.ambientLeak             === 'true',
    motionSmear:             req.body.motionSmear             === 'true',
    focusGradient:           req.body.focusGradient           === 'true',
    focusEdge:               req.body.focusEdge               ?? 'left',
    focusGradientIntensity:  parseFloat(req.body.focusGradientIntensity  ?? 1.0),
    // Back-bleed is handled post-process (needs adjacent pages), see below
    backBleed:               req.body.backBleed               === 'true',
    backBleedOpacity:        parseFloat(req.body.backBleedOpacity         ?? 0.07),
  };

  const isMultiUpload = allFiles.length > 1;
  const baseName = isMultiUpload
    ? 'scanned_images'
    : allFiles[0].originalname.replace(/\.[^.]+$/, '');

  const heavyEffects = opts.pageWarp || opts.crumple || opts.unevenAging
                    || opts.paperTexture || opts.focusGradient;
  const CONCURRENCY  = safeConcurrency(totalPageCount, heavyEffects);

  console.log(
    `⚙  ${isMultiUpload ? `${allFiles.length} files` : allFiles[0].originalname}` +
    ` | pages:${totalPageCount} dpi:${dpi} concur:${CONCURRENCY}` +
    ` fmt:${opts.format} timeout:${(dynamicTimeout/1000).toFixed(0)}s`
  );

  try {
    // ── Render all files → page buffers ──────────────────────────────────────
    let pageBuffers = [];
    for (const file of allFiles) {
      if (IMAGE_TYPES.has(file.mimetype)) {
        pageBuffers.push(toSafeUint8Array(file.buffer));
      } else {
        const pages = await pdfToImages(file.buffer, dpi);
        if (!pages.length) return res.status(500).json({ error: `Could not extract pages from ${file.originalname}` });
        pageBuffers.push(...pages);
      }
      // Stop rendering once we hit the cap
      if (capPages !== null && pageBuffers.length >= capPages) break;
    }
    // Slice to cap (handles multi-page PDFs where push added more than needed)
    if (capPages !== null && pageBuffers.length > capPages) {
      pageBuffers = pageBuffers.slice(0, capPages);
    }

    console.log(`   ${pageBuffers.length} page(s) to process`);

    // ── Process pages (scan effects) with controlled concurrency ─────────────
    const processedBuffers = new Array(pageBuffers.length);
    for (let i = 0; i < pageBuffers.length; i += CONCURRENCY) {
      const chunk   = pageBuffers.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(buf => processPage(buf, opts)));
      results.forEach((buf, j) => {
        processedBuffers[i + j] = buf;
        pageBuffers[i + j] = null;
      });
      if (i + CONCURRENCY < pageBuffers.length) {
        await new Promise(r => setImmediate(r));
      }
    }
    pageBuffers = null;

    // ── Back-bleed / show-through ────────────────────────────────────────────
    // Applied after all pages are processed so each page can reference its
    // physical neighbour (the reverse side of the same sheet of paper).
    // For a single-sided document: odd pages show even pages through, vice versa.
    // The reverse buffer is the processed (scanned) version of the neighbour so
    // grain/tint artefacts are baked in — which is physically correct.
    if (opts.backBleed && processedBuffers.length > 1) {
      console.log(`   📄 applying back-bleed (opacity ${opts.backBleedOpacity})`);
      for (let i = 0; i < processedBuffers.length; i++) {
        // For a duplexed document, the reverse of page i is page i±1
        // (depending on binding: recto/verso alternate)
        const reverseIdx = i % 2 === 0 ? i + 1 : i - 1;
        if (reverseIdx < 0 || reverseIdx >= processedBuffers.length) continue;
        processedBuffers[i] = await applyBackBleed(
          processedBuffers[i],
          processedBuffers[reverseIdx],
          opts.backBleedOpacity,
        );
      }
    }

    // ── Composite signature ───────────────────────────────────────────────────
    if (req.body.sigData) {
      const decoded   = Buffer.from(req.body.sigData, 'base64');
      const sigBuf    = toSafeUint8Array(decoded);
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
          processedBuffers[i] = await compositeSignature(
            processedBuffers[i], sigBuf, xPct, yPct, wPct, hPct, sigRotDeg
          );
        }
      }
      console.log(`   ✍  signature → page: ${sigPage}`);
    }

    // ── Send response ─────────────────────────────────────────────────────────
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
      console.log(`✓  ${(pdfBytes.length/1024).toFixed(1)} KB | ${processedBuffers.length} pages`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_scanned.pdf"`);
      res.send(pdfBytes);
    }

  } catch (err) {
    console.error('✗ ', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  if (!res.headersSent) res.status(500).json({ error: err.message ?? 'Internal server error' });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`\n🖨  ScanDrift  ➜  http://localhost:${PORT}\n`);
});