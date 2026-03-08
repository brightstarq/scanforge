import sharp from 'sharp';

// ─── Scanner Profiles ─────────────────────────────────────────────────────────
export const PROFILES = {
  'canon-office-2020': {
    noise: 4, blur: 0, brightness: 1.02, contrast: 1.08,
    yellowTint: 0.5, grain: true, bindingShadow: false,
    sharpness: 2, rotation: 0.2, pageVariation: 0.3,
    label: 'Canon Office 2020',
    description: 'Modern office flatbed. Clean, sharp, minimal warmth.',
  },
  'hp-home-budget': {
    noise: 9, blur: 0.4, brightness: 0.97, contrast: 1.04,
    yellowTint: 2, grain: true, bindingShadow: false,
    sharpness: 1, rotation: 0.5, pageVariation: 0.8,
    label: 'HP Home Budget',
    description: 'Budget home scanner. Warm tone, soft edges, noticeable grain.',
  },
  'library-xerox-worn': {
    noise: 18, blur: 0.3, brightness: 0.93, contrast: 1.18,
    yellowTint: 3, grain: true, bindingShadow: true,
    sharpness: 0, rotation: 0.8, pageVariation: 1.5,
    label: 'Library Xerox (Worn)',
    description: 'Overused public copier. Heavy grain, grey cast, binding shadow.',
  },
  'archive-flatbed-2005': {
    noise: 12, blur: 0.2, brightness: 0.98, contrast: 1.1,
    yellowTint: 2.5, grain: true, bindingShadow: true,
    sharpness: 1, rotation: 0.6, pageVariation: 1.0,
    label: 'Archive Flatbed 2005',
    description: 'Early 2000s archive scanner. Aged warmth, subtle binding shadow.',
  },
  'fujitsu-production': {
    noise: 2, blur: 0, brightness: 1.0, contrast: 1.05,
    yellowTint: 0, grain: true, bindingShadow: false,
    sharpness: 2, rotation: 0.1, pageVariation: 0.1,
    label: 'Fujitsu Production',
    description: 'High-end production scanner. Near-crisp with subtle physical feel.',
  },
};

// ─── Per-Page Variation ───────────────────────────────────────────────────────
// Real scanners drift slightly between pages — brightness, noise, tilt all vary.
export function varyOptsForPage(opts, pageIndex) {
  const v = opts.pageVariation ?? 0.5;
  if (v === 0) return opts;
  const rand = (scale) => (Math.random() - 0.5) * 2 * scale * v;
  return {
    ...opts,
    noise:      Math.max(0, opts.noise      + rand(1.5)),
    brightness: Math.max(0.8, Math.min(1.2, opts.brightness + rand(0.015))),
    contrast:   Math.max(0.9, Math.min(1.4, opts.contrast   + rand(0.02))),
    yellowTint: Math.max(0,   opts.yellowTint + rand(0.3)),
    rotation:   Math.max(0,   opts.rotation   + rand(0.15)),
  };
}

// ─── Skew Detection via Horizontal Projection Profile ────────────────────────
function detectSkewAngle(grayBuffer, width, height) {
  const candidates = [];
  for (let a = -10; a <= 10; a += 0.5) candidates.push(a);

  let bestAngle = 0;
  let bestVariance = -Infinity;
  const cx = width / 2;
  const cy = height / 2;

  for (const angle of candidates) {
    const rad = (-angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const projection = new Float32Array(height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = Math.round(cos * (x - cx) - sin * (y - cy) + cx);
        const ny = Math.round(sin * (x - cx) + cos * (y - cy) + cy);
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (grayBuffer[y * width + x] < 128) projection[ny]++;
        }
      }
    }

    const mean = projection.reduce((s, v) => s + v, 0) / height;
    const variance = projection.reduce((s, v) => s + (v - mean) ** 2, 0);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

// ─── Deskew ───────────────────────────────────────────────────────────────────
export async function deskewImage(imgBuffer) {
  const { data, info } = await sharp(imgBuffer)
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const angle = detectSkewAngle(data, info.width, info.height);
  if (Math.abs(angle) < 0.15) return imgBuffer;

  return sharp(imgBuffer)
    .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

// ─── Core Scan Effect ─────────────────────────────────────────────────────────
export async function applyScanEffect(imgBuffer, opts = {}) {
  const {
    noise         = 5,
    blur          = 0,
    brightness    = 1.0,
    contrast      = 1.05,
    yellowTint    = 0,
    grain         = true,
    bindingShadow = false,
    sharpness     = 1,
    rotation      = 0.4,
    crease        = false,  // NEW: diagonal fold/crease line
    inkBleed      = false,  // NEW: subtle dark halo around text edges
  } = opts;

  // ── 1. Base colour adjustments
  let pipeline = sharp(imgBuffer)
    .modulate({ brightness, saturation: 1.0 })
    .linear(contrast, -(128 * (contrast - 1)));

  // ── 2. Sharpness or blur
  if (sharpness > 0) {
    const m2 = sharpness === 1 ? 0.5 : sharpness === 2 ? 1.0 : 1.8;
    pipeline = pipeline.sharpen({ sigma: 0.5, m1: 0.1, m2 });
  } else if (blur > 0) {
    pipeline = pipeline.blur(blur);
  }

  // ── 3. Slight random rotation (scanner misalignment)
  if (Math.abs(rotation) > 0) {
    const angle = (Math.random() * 2 - 1) * rotation;
    pipeline = pipeline.rotate(angle, {
      background: { r: 252, g: 248, b: 240, alpha: 1 },
    });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixels = new Uint8ClampedArray(data);

  // ── 4. Lamp illumination falloff
  for (let y = 0; y < height; y++) {
    const vFalloff = 1 - 0.04 * Math.abs(y / height - 0.5);
    for (let x = 0; x < width; x++) {
      const hFalloff = 1 - 0.025 * Math.abs(x / width - 0.5);
      const idx = (y * width + x) * channels;
      const factor = vFalloff * hFalloff;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        pixels[idx + c] = Math.min(255, Math.max(0, pixels[idx + c] * factor));
      }
    }
  }

  // ── 5. Binding / spine shadow
  if (bindingShadow) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width * 0.05; x++) {
        const idx = (y * width + x) * channels;
        const fade = 0.92 + (x / (width * 0.05)) * 0.08;
        for (let c = 0; c < Math.min(channels, 3); c++) {
          pixels[idx + c] = Math.min(255, Math.max(0, pixels[idx + c] * fade));
        }
      }
    }
  }

  // ── 6. NEW: Crease / fold simulation
  // Simulates a document that was folded before scanning — a faint diagonal
  // darkening line runs across the page at a slight angle.
  if (crease) {
    const creaseX  = width * (0.25 + Math.random() * 0.5); // horizontal position
    const tilt     = (Math.random() - 0.5) * 0.12;         // slight diagonal tilt
    const strength = 0.055 + Math.random() * 0.04;          // crease darkness
    const halfW    = 1.8 + Math.random() * 1.2;             // crease width in px

    for (let y = 0; y < height; y++) {
      const cx = creaseX + y * tilt;
      for (let x = Math.floor(cx - halfW - 1); x <= Math.ceil(cx + halfW + 1); x++) {
        if (x < 0 || x >= width) continue;
        const dist   = Math.abs(x - cx);
        const weight = Math.max(0, 1 - dist / halfW); // linear falloff
        const factor = 1 - strength * weight;
        const idx    = (y * width + x) * channels;
        for (let c = 0; c < Math.min(channels, 3); c++) {
          pixels[idx + c] = Math.max(0, Math.round(pixels[idx + c] * factor));
        }
      }
    }
  }

  // ── 7. Row-by-row scanner sensor jitter
  for (let y = 0; y < height; y++) {
    const lineShift = (Math.random() - 0.5) * 1.6;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        pixels[idx + c] = Math.min(255, Math.max(0, pixels[idx + c] + lineShift));
      }
    }
  }

  // ── 8. Grain ONLY on paper/background pixels — NEVER on text/ink
  if (noise > 0 || grain) {
    for (let i = 0; i < pixels.length; i += channels) {
      const luma = channels >= 3
        ? pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
        : pixels[i];

      if (luma < 180) continue;

      const fineGrain  = grain ? (Math.random() - 0.5) * noise * 0.3 : 0;
      const fiberNoise = grain ? Math.sin(i * 0.0001) * noise * 0.08  : 0;
      const noiseVal   = !grain && noise > 0 ? (Math.random() - 0.5) * noise * 0.6 : 0;
      const total = fineGrain + fiberNoise + noiseVal;

      for (let c = 0; c < Math.min(channels, 3); c++) {
        pixels[i + c] = Math.min(255, Math.max(0, pixels[i + c] + total));
      }
    }
  }

  // ── 9. NEW: Ink bleed — subtle dark halo around text/ink edges
  // Simulates cheap scanner glass slightly spreading ink into adjacent paper.
  if (inkBleed && channels >= 3) {
    const bleedPixels = new Uint8ClampedArray(pixels);
    const bleedStrength = 10;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i    = (y * width + x) * channels;
        const luma = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        if (luma < 110) {
          // This is an ink pixel — bleed darkness into its 4 neighbours
          const neighbors = [
            ((y - 1) * width + x) * channels,
            ((y + 1) * width + x) * channels,
            (y * width + (x - 1)) * channels,
            (y * width + (x + 1)) * channels,
          ];
          for (const ni of neighbors) {
            const nLuma = pixels[ni] * 0.299 + pixels[ni + 1] * 0.587 + pixels[ni + 2] * 0.114;
            if (nLuma > 155) {
              for (let c = 0; c < 3; c++) {
                bleedPixels[ni + c] = Math.max(0, bleedPixels[ni + c] - bleedStrength);
              }
            }
          }
        }
      }
    }
    pixels.set(bleedPixels);
  }

  // ── 10. Warm colour-temperature shift
  if (yellowTint > 0 && channels >= 3) {
    for (let i = 0; i < pixels.length; i += channels) {
      pixels[i]     = Math.min(255, pixels[i]     * (1.02 + yellowTint * 0.02));
      pixels[i + 1] = Math.min(255, pixels[i + 1] * 1.01);
      pixels[i + 2] = Math.max(0,   pixels[i + 2] * (0.98 - yellowTint * 0.01));
    }
  }

  // ── 11. PNG encode — lossless, zero block artifacts on text edges
  return sharp(Buffer.from(pixels), { raw: { width, height, channels } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

// ─── Full Pipeline: deskew → manual skew → scan effect → crumple ─────────────
export async function processPage(imgBuffer, opts = {}) {
  let buf = imgBuffer;

  if (opts.deskew) buf = await deskewImage(buf);

  if (opts.manualSkew && Math.abs(opts.manualSkew) > 0) {
    buf = await sharp(buf)
      .rotate(-opts.manualSkew, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
  }

  buf = await applyScanEffect(buf, opts);

  // Crumple runs after scan effect so grain/tint bake into the warped surface
  if (opts.crumple) {
    buf = await applyCrumpleEffect(buf, {
      crumpleIntensity: opts.crumpleIntensity ?? 1.0,
    });
  }

  return buf;
}

// ─── Composite Signature onto Page ───────────────────────────────────────────
export async function compositeSignature(pageBuffer, sigBuffer, xPct, yPct, wPct, hPct, rotationDeg = 0) {
  const { width: pw, height: ph } = await sharp(pageBuffer).metadata();

  const width  = Math.max(10, Math.round(wPct * pw));
  const height = Math.max(10, Math.round(hPct * ph));
  const left   = Math.round(xPct * pw);
  const top    = Math.round(yPct * ph);

  // Clamp to page bounds
  const safeLeft = Math.max(0, Math.min(left, pw - width));
  const safeTop  = Math.max(0, Math.min(top,  ph - height));

  let sigPipeline = sharp(sigBuffer)
    .resize(width, height, {
      fit:        'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

  // Apply rotation with transparent background so it floats cleanly
  if (Math.abs(rotationDeg) > 0.1) {
    sigPipeline = sigPipeline.rotate(rotationDeg, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  const resized = await sigPipeline.png().toBuffer();

  // Re-read dimensions after rotation (bounding box may have grown)
  const { width: rw, height: rh } = await sharp(resized).metadata();
  const cx = Math.max(0, Math.min(safeLeft + Math.round((width - rw) / 2), pw - rw));
  const cy = Math.max(0, Math.min(safeTop  + Math.round((height - rh) / 2), ph - rh));

  return sharp(pageBuffer)
    .composite([{ input: resized, left: cx, top: cy, blend: 'over' }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

// ══════════════════════════════════════════════════════════════════════════════
// CRUMPLE EFFECT
// ══════════════════════════════════════════════════════════════════════════════

// ── Smooth value noise (2D) ───────────────────────────────────────────────────
function fade(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

function hash(x, y, seed) {
  // Deterministic float in [-1, 1] from integer coords
  let n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.3) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fade(fx), uy = fade(fy);
  const a = hash(ix,   iy,   seed);
  const b = hash(ix+1, iy,   seed);
  const c = hash(ix,   iy+1, seed);
  const d = hash(ix+1, iy+1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

// Fractal Brownian Motion — layered octaves of noise
function fbm(x, y, seed, octaves = 5) {
  let val = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq, seed + i * 31.7) * amp;
    max  += amp;
    amp  *= 0.5;
    freq *= 2.1;
  }
  return val / max; // normalised to [-1, 1]
}

// ── Main crumple function ─────────────────────────────────────────────────────
export async function applyCrumpleEffect(imgBuffer, opts = {}) {
  const intensity = Math.max(0, Math.min(2, opts.crumpleIntensity ?? 1.0));
  if (intensity === 0) return imgBuffer;

  const seed = opts.crumpleSeed ?? (Math.random() * 1000 | 0);

  const { data, info } = await sharp(imgBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const out = new Uint8ClampedArray(data); // work in-place, no warp copy needed

  const W = width, H = height;

  // ── 1. Crease lines (fold shadows + highlights) ────────────────────────────
  const numCreases = 3 + Math.round(intensity * 4);
  const creases = [];

  for (let i = 0; i < numCreases; i++) {
    const baseAngle = (i % 2 === 0 ? 0 : Math.PI / 2)
      + (hash(i, 1, seed) * 0.95);
    creases.push({
      x0:        hash(i, 2, seed) * 0.5 + 0.25,
      y0:        hash(i, 3, seed) * 0.5 + 0.25,
      angle:     baseAngle,
      width:     2 + intensity * 4 + Math.abs(hash(i, 4, seed)) * 4,
      shadowStr: 0.12 + intensity * 0.14 + Math.abs(hash(i, 5, seed)) * 0.08,
      hiStr:     0.08 + intensity * 0.06,
    });
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x / W, py = y / H;
      let darkFactor = 0, lightFactor = 0;

      for (const c of creases) {
        const dx = px - c.x0, dy = py - c.y0;
        const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
        const dist  = dx * sin - dy * cos;
        const along = dx * cos + dy * sin;
        const halfW = c.width / Math.min(W, H);
        const t     = dist / halfW;
        const falloff = Math.exp(-t * t * 0.5);
        const lenFade = Math.max(0, 1 - Math.abs(along) * 2.5);
        const strength = falloff * lenFade;

        if (dist > 0) darkFactor  = Math.max(darkFactor,  c.shadowStr * strength);
        else          lightFactor = Math.max(lightFactor, c.hiStr    * strength);
      }

      const oi = (y * W + x) * channels;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        let v = out[oi + c];
        v = v * (1 - darkFactor);
        v = v + (255 - v) * lightFactor;
        out[oi + c] = Math.min(255, Math.max(0, v));
      }
    }
  }

  // ── 2. Rough / torn edges ─────────────────────────────────────────────────
  const edgeDepth     = 0.018 + intensity * 0.022;
  const edgeNoiseFreq = 8 + intensity * 6;
  const paperR = 242, paperG = 236, paperB = 220;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = x / W, r2 = 1 - x / W;
      const t2 = y / H, b2 = 1 - y / H;
      const edgeDist = Math.min(l, r2, t2, b2);

      if (edgeDist > edgeDepth * 2) continue;

      const edgeNoise = (fbm(x * edgeNoiseFreq / W, y * edgeNoiseFreq / H, seed + 200, 4) * 0.5 + 0.5);
      const boundary  = edgeDepth * (0.3 + edgeNoise * 0.85);
      const fade2     = Math.max(0, Math.min(1, edgeDist / boundary));
      const rough     = Math.pow(fade2, 0.55);

      const oi = (y * W + x) * channels;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        const paper = c === 0 ? paperR : c === 1 ? paperG : paperB;
        out[oi + c] = Math.round(lerp(paper, out[oi + c], rough));
      }
      if (channels === 4) out[oi + 3] = 255;
    }
  }

  return sharp(Buffer.from(out), { raw: { width: W, height: H, channels } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}