import sharp from 'sharp';

// Limit sharp's libvips operation cache
sharp.cache({ memory: 50, files: 20, items: 200 });
sharp.concurrency(1);

function bufToU8(buf) {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ─── Scanner Profiles ─────────────────────────────────────────────────────────
export const PROFILES = {
  'canon-office-2020': {
    noise: 4, blur: 0, brightness: 1.02, contrast: 1.08,
    yellowTint: 0.5, grain: true, bindingShadow: false,
    sharpness: 2, rotation: 0.2, pageVariation: 0.3,
    channelMisreg: false, jpegInternalize: false, scanDropout: false,
    moire: false, ambientLeak: false, motionSmear: false, focusGradient: false,
    label: 'Canon Office 2020',
    description: 'Modern office flatbed. Clean, sharp, minimal warmth.',
  },
  'hp-home-budget': {
    noise: 9, blur: 0.4, brightness: 0.97, contrast: 1.04,
    yellowTint: 2, grain: true, bindingShadow: false,
    sharpness: 1, rotation: 0.5, pageVariation: 0.8,
    channelMisreg: true, jpegInternalize: true, scanDropout: false,
    moire: false, ambientLeak: false, motionSmear: true, focusGradient: false,
    label: 'HP Home Budget',
    description: 'Budget home scanner. Warm tone, channel fringing, JPEG artifacts, motion smear.',
  },
  'library-xerox-worn': {
    noise: 18, blur: 0.3, brightness: 0.93, contrast: 1.18,
    yellowTint: 3, grain: true, bindingShadow: true,
    sharpness: 0, rotation: 0.8, pageVariation: 1.5,
    channelMisreg: true, jpegInternalize: true, scanDropout: true,
    moire: false, ambientLeak: false, motionSmear: true, focusGradient: false,
    label: 'Library Xerox (Worn)',
    description: 'Overused public copier. Fringing, dropouts, motion smear, JPEG compression.',
  },
  'archive-flatbed-2005': {
    noise: 12, blur: 0.2, brightness: 0.98, contrast: 1.1,
    yellowTint: 2.5, grain: true, bindingShadow: true,
    sharpness: 1, rotation: 0.6, pageVariation: 1.0,
    channelMisreg: false, jpegInternalize: false, scanDropout: false,
    moire: false, ambientLeak: true, motionSmear: false, focusGradient: true,
    label: 'Archive Flatbed 2005',
    description: 'Early 2000s archive scanner. Focus falloff, ambient light leak at lid edge.',
  },
  'fujitsu-production': {
    noise: 2, blur: 0, brightness: 1.0, contrast: 1.05,
    yellowTint: 0, grain: true, bindingShadow: false,
    sharpness: 2, rotation: 0.1, pageVariation: 0.1,
    channelMisreg: false, jpegInternalize: false, scanDropout: false,
    moire: false, ambientLeak: false, motionSmear: false, focusGradient: false,
    label: 'Fujitsu Production',
    description: 'High-end production scanner. Near-crisp with subtle physical feel.',
  },
  'magazine-print': {
    noise: 6, blur: 0, brightness: 1.0, contrast: 1.06,
    yellowTint: 1, grain: true, bindingShadow: false,
    sharpness: 1, rotation: 0.3, pageVariation: 0.4,
    channelMisreg: false, jpegInternalize: true, scanDropout: false,
    moire: true, ambientLeak: false, motionSmear: false, focusGradient: false,
    label: 'Magazine / Print Scan',
    description: 'Scanning halftone-printed material. Moiré interference pattern, JPEG internalization.',
  },
};

// ─── Per-Page Variation ───────────────────────────────────────────────────────
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
    .resize(800, null, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const angle = detectSkewAngle(data, info.width, info.height);
  if (Math.abs(angle) < 0.15) return imgBuffer;

  return bufToU8(await sharp(imgBuffer)
    .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer());
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
    crease        = false,
    inkBleed      = false,
    streaks       = false,
    dust          = false,
    unevenAging   = false,
    lampBanding   = false,
    paperTexture  = false,
    edgeVignette  = false,
    // ── NEW ──────────────────────────────────────────────────────────────────
    channelMisreg   = false, // CCD bar R/G/B channel vertical misregistration
    jpegInternalize = false, // scanner-internal JPEG compression round-trip
    scanDropout     = false, // occasional fully-white/black scan line failures
    moire           = false, // halftone beat-frequency interference pattern
    ambientLeak     = false, // ambient light bleed at lid edge (book scanning)
    motionSmear     = false, // vertical motion smear on text edges (page shift)
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

  // ── 5. Paper fiber texture
  if (paperTexture) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i   = (y * width + x) * channels;
        const luma = channels >= 3
          ? pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114
          : pixels[i];
        if (luma < 160) continue;
        const tex = fbm(x * 0.0022, y * 0.0022, 222, 3) * 6;
        for (let c = 0; c < Math.min(channels, 3); c++) {
          pixels[i + c] = Math.max(0, Math.min(255, pixels[i + c] + tex));
        }
      }
    }
  }

  // ── 6. Binding / spine shadow
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

  // ── 7. Crease / fold simulation
  if (crease) {
    const creaseX  = width * (0.25 + Math.random() * 0.5);
    const tilt     = (Math.random() - 0.5) * 0.12;
    const strength = 0.055 + Math.random() * 0.04;
    const halfW    = 1.8 + Math.random() * 1.2;

    for (let y = 0; y < height; y++) {
      const cx = creaseX + y * tilt;
      for (let x = Math.floor(cx - halfW - 1); x <= Math.ceil(cx + halfW + 1); x++) {
        if (x < 0 || x >= width) continue;
        const dist   = Math.abs(x - cx);
        const weight = Math.max(0, 1 - dist / halfW);
        const factor = 1 - strength * weight;
        const idx    = (y * width + x) * channels;
        for (let c = 0; c < Math.min(channels, 3); c++) {
          pixels[idx + c] = Math.max(0, Math.round(pixels[idx + c] * factor));
        }
      }
    }
  }

  // ── 8. Row-by-row scanner sensor jitter
  for (let y = 0; y < height; y++) {
    const lineShift = (Math.random() - 0.5) * 1.6;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        pixels[idx + c] = Math.min(255, Math.max(0, pixels[idx + c] + lineShift));
      }
    }
  }

  // ── 9. Grain ONLY on paper/background pixels
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

  // ── 10. Ink bleed
  if (inkBleed && channels >= 3) {
    const bleedStrength = 10;
    const bleedMap = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i    = (y * width + x) * channels;
        const luma = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        if (luma >= 110) continue;
        const neighbors = [
          (y - 1) * width + x, (y + 1) * width + x,
          y * width + (x - 1), y * width + (x + 1),
        ];
        for (const ni of neighbors) {
          const nLuma = pixels[ni * channels] * 0.299 + pixels[ni * channels + 1] * 0.587 + pixels[ni * channels + 2] * 0.114;
          if (nLuma > 155) bleedMap[ni] = Math.min(1, bleedMap[ni] + bleedStrength / 255);
        }
      }
    }
    for (let idx = 0; idx < width * height; idx++) {
      if (bleedMap[idx] === 0) continue;
      const i = idx * channels;
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.max(0, Math.round(pixels[i + c] * (1 - bleedMap[idx])));
      }
    }
  }

  // ── 11. Warm colour-temperature shift
  if (yellowTint > 0 && channels >= 3) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        const agingBias = unevenAging
          ? yellowTint + fbm(x * 0.004, y * 0.004, 77, 4) * (yellowTint * 0.65)
          : yellowTint;
        const t = Math.max(0, agingBias);
        pixels[i]     = Math.min(255, pixels[i]     * (1.02 + t * 0.02));
        pixels[i + 1] = Math.min(255, pixels[i + 1] * 1.01);
        pixels[i + 2] = Math.max(0,   pixels[i + 2] * (0.98 - t * 0.01));
      }
    }
  }

  // ── 12. Vertical sensor streaks
  if (streaks) {
    const numStreaks = 1 + Math.floor(Math.random() * 3);
    for (let s = 0; s < numStreaks; s++) {
      const sx       = Math.floor(Math.random() * width);
      const strength = 0.03 + Math.random() * 0.055;
      const w        = Math.random() < 0.5 ? 1 : 2;
      for (let y = 0; y < height; y++) {
        for (let dx = 0; dx < w; dx++) {
          const px = sx + dx;
          if (px >= width) continue;
          const i = (y * width + px) * channels;
          const luma = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
          if (luma < 140) continue;
          for (let c = 0; c < Math.min(channels, 3); c++) {
            pixels[i + c] = Math.max(0, Math.round(pixels[i + c] * (1 - strength)));
          }
        }
      }
    }
  }

  // ── 13. Dust particles
  if (dust) {
    const numDust = 4 + Math.floor(Math.random() * 10);
    for (let d = 0; d < numDust; d++) {
      const cx      = Math.floor(Math.random() * width);
      const cy      = Math.floor(Math.random() * height);
      const radius  = 1 + Math.random() * 2.5;
      const opacity = 0.25 + Math.random() * 0.55;
      const r       = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const px = cx + dx, py = cy + dy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > radius) continue;
          const falloff  = 1 - dist / radius;
          const strength = opacity * falloff * falloff;
          const i = (py * width + px) * channels;
          for (let c = 0; c < Math.min(channels, 3); c++) {
            pixels[i + c] = Math.max(0, Math.round(pixels[i + c] * (1 - strength)));
          }
        }
      }
    }
  }

  // ── 14. Lamp banding
  if (lampBanding) {
    const freq     = 0.0018 + Math.random() * 0.0022;
    const strength = 0.012  + Math.random() * 0.018;
    const phase    = Math.random() * Math.PI * 2;
    for (let y = 0; y < height; y++) {
      const band = 1 + Math.sin(y * freq + phase) * strength;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        for (let c = 0; c < Math.min(channels, 3); c++) {
          pixels[i + c] = Math.min(255, Math.max(0, pixels[i + c] * band));
        }
      }
    }
  }

  // ── 15. Edge vignette
  if (edgeVignette) {
    const cx = width  / 2;
    const cy = height / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx     = (x - cx) / cx;
        const dy     = (y - cy) / cy;
        const dist   = Math.sqrt(dx * dx + dy * dy);
        const factor = Math.max(0.82, 1 - dist * 0.09);
        const i = (y * width + x) * channels;
        for (let c = 0; c < Math.min(channels, 3); c++) {
          pixels[i + c] = Math.max(0, Math.round(pixels[i + c] * factor));
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NEW EFFECTS
  // ══════════════════════════════════════════════════════════════════════════

  // ── 16. Channel misregistration ─────────────────────────────────────────
  // Real CCD-bar scanners read each colour channel in a separate physical pass.
  // Even a fraction of a millimetre of vibration shifts channels relative to
  // each other, producing colour fringing on high-contrast edges (especially
  // visible on dark text against white paper).
  if (channelMisreg && channels >= 3) {
    const orig   = new Uint8ClampedArray(pixels);
    // R shifts up, B shifts down (or vice-versa — random per page)
    const shiftR = 1 + Math.floor(Math.random() * 2);  // 1-2 px
    const shiftB = 1 + Math.floor(Math.random() * 2);
    const dirR   = Math.random() < 0.5 ? 1 : -1;
    const dirB   = -dirR; // always opposite

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i  = (y * width + x) * channels;

        const ryR = Math.max(0, Math.min(height - 1, y + shiftR * dirR));
        pixels[i] = orig[(ryR * width + x) * channels]; // R shifted

        const ryB = Math.max(0, Math.min(height - 1, y + shiftB * dirB));
        pixels[i + 2] = orig[(ryB * width + x) * channels + 2]; // B shifted

        // G unchanged — serves as the "reference" channel
      }
    }
  }

  // ── 17. Moiré interference pattern ──────────────────────────────────────
  // When scanning pre-printed halftone material (magazines, newspapers, offset
  // prints) the scanner's sampling grid beats against the halftone screen,
  // producing a low-frequency sinusoidal ripple across the image.
  // Two overlapping waves at slightly different frequencies and a slight angular
  // offset produce the characteristic basket-weave pattern.
  if (moire && channels >= 3) {
    const freq1     = 0.0025 + Math.random() * 0.0030;   // primary screen freq
    const freq2     = freq1   * (1.04 + Math.random() * 0.04); // secondary at ~4-8% offset
    const angle     = (Math.random() * 18 + 5) * (Math.PI / 180); // 5-23° tilt
    const strength  = 0.028 + Math.random() * 0.032;     // 2.8-6% amplitude

    const cosA = Math.cos(angle), sinA = Math.sin(angle);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        const luma = pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114;
        // Only modulate background — text stays crisp
        if (luma < 155) continue;

        // Rotate coords for angled screen
        const rx = x * cosA + y * sinA;
        const ry = -x * sinA + y * cosA;

        // Multiply two sinusoids to create beat frequency
        const wave = Math.sin(rx * freq1 * Math.PI * 2)
                   * Math.sin(ry * freq2 * Math.PI * 2);
        const delta = wave * strength * 255;

        for (let c = 0; c < 3; c++) {
          pixels[i + c] = Math.min(255, Math.max(0, pixels[i + c] + delta));
        }
      }
    }
  }

  // ── 18. Ambient light leak at lid edge ──────────────────────────────────
  // When scanning thick books or documents whose corners won't lie flat, the
  // scanner lid doesn't fully seal. Room light bleeds in from one edge,
  // washing out a gradient strip to near-white with a warm hue cast.
  if (ambientLeak && channels >= 3) {
    // Pick the edge the light leaks from — usually the top or the left (spine side)
    const side       = Math.random() < 0.6 ? 'top' : 'left';
    const leakDepth  = 0.04 + Math.random() * 0.07;   // 4–11% of page
    const leakPower  = 0.35 + Math.random() * 0.45;   // how strongly it bleaches

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const edgeFrac = side === 'top'  ? y / (height * leakDepth)
                                         : x / (width  * leakDepth);
        if (edgeFrac >= 1) continue;

        // Quadratic falloff — strongest right at the edge
        const t = Math.pow(1 - edgeFrac, 2) * leakPower;

        const i = (y * width + x) * channels;
        // Warm bleach: R pushed hard, G moderately, B barely
        pixels[i]     = Math.min(255, Math.round(pixels[i]     + t * (255 - pixels[i])    ));
        pixels[i + 1] = Math.min(255, Math.round(pixels[i + 1] + t * 0.80 * (255 - pixels[i + 1])));
        pixels[i + 2] = Math.min(255, Math.round(pixels[i + 2] + t * 0.45 * (255 - pixels[i + 2])));
      }
    }
  }

  // ── 19. Scan-direction motion smear ─────────────────────────────────────
  // If a page shifts slightly during the scan pass, text edges trail in the
  // scan axis (vertical in a flatbed). Dark trailing halos appear below the
  // top edge of each letter — the ink "drags" into the paper below.
  if (motionSmear && channels >= 3) {
    const smearLen = 2 + Math.floor(Math.random() * 3);   // 2–4 px trail
    const smearStr = 0.28 + Math.random() * 0.28;          // blend strength
    const orig     = new Uint8ClampedArray(pixels);

    for (let y = 1; y < height - smearLen; y++) {
      for (let x = 0; x < width; x++) {
        const i      = (y * width + x) * channels;
        const iPrev  = ((y - 1) * width + x) * channels;

        const lumaCur  = orig[i]     * 0.299 + orig[i+1]     * 0.587 + orig[i+2]     * 0.114;
        const lumaPrev = orig[iPrev] * 0.299 + orig[iPrev+1] * 0.587 + orig[iPrev+2] * 0.114;

        // Detect light-to-dark transition (top edge of a letter)
        const diff = lumaCur - lumaPrev;
        if (diff < 38) continue; // only process genuine edges

        const edgeStr = Math.min(1, diff / 110);

        // Trail the dark value downward with exponential decay
        for (let s = 1; s <= smearLen; s++) {
          const sy = y + s;
          if (sy >= height) break;
          const si    = (sy * width + x) * channels;
          const syLum = orig[si] * 0.299 + orig[si+1] * 0.587 + orig[si+2] * 0.114;
          if (syLum < 130) continue; // don't smear onto existing ink

          const decay = Math.pow(1 - s / (smearLen + 1), 1.1);
          const blend = smearStr * edgeStr * decay;

          for (let c = 0; c < 3; c++) {
            pixels[si + c] = Math.max(0, Math.round(
              orig[si + c] * (1 - blend) + orig[i + c] * blend
            ));
          }
        }
      }
    }
  }

  // ── 20. Scan line dropout ────────────────────────────────────────────────
  // Failing or temporarily obstructed CCD elements produce a full-width line
  // of either white (sensor saturated / stuck high) or black (stuck low).
  // Rate is ~0.15% of lines — rare enough that most pages are clean, but
  // distinctive when it appears.
  if (scanDropout) {
    for (let y = 0; y < height; y++) {
      if (Math.random() > 0.0015) continue;
      const isWhite = Math.random() < 0.72; // ~72% white, 28% black
      const val     = isWhite ? 255 : 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        for (let c = 0; c < Math.min(channels, 3); c++) {
          pixels[i + c] = val;
        }
      }
    }
  }

  // ── 21. PNG encode (base output)
  let result = bufToU8(await sharp(
    new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
    { raw: { width, height, channels } }
  ).png({ compressionLevel: 6 }).toBuffer());

  // ── 22. JPEG internalization ─────────────────────────────────────────────
  // Consumer scanners (especially ADF units) compress internally to JPEG even
  // when the output format appears lossless. The tell-tale sign is 8×8 DCT
  // block artifacts in smooth gradient regions (sky, paper gradients). We
  // simulate this by performing a JPEG round-trip at quality 84–91 before
  // the final lossless encode.
  if (jpegInternalize) {
    const quality = 84 + Math.floor(Math.random() * 8);
    const jBuf = await sharp(result).jpeg({ quality, chromaSubsampling: '4:2:0' }).toBuffer();
    result = bufToU8(await sharp(jBuf).png({ compressionLevel: 6 }).toBuffer());
  }

  return result;
}

// ─── Focus Gradient (depth-of-field falloff) ──────────────────────────────────
// Flatbed scanners have a finite depth of field. Documents that are not perfectly
// flat (curled corners, bound books) have one region in sharp focus while the
// rest blurs progressively. We simulate this by blending a sharp and a blurred
// version of the page with a spatially-varying linear gradient mask.
//
// focusEdge: 'left' | 'right' | 'top' | 'bottom' — which edge is IN FOCUS.
// blurAmount: sigma of blur applied to the out-of-focus side (default 1.8).
export async function applyFocusGradient(imgBuffer, opts = {}) {
  const {
    focusEdge  = 'left',
    blurAmount = 1.8,
    intensity  = 1.0,
  } = opts;

  const effectiveBlur = Math.max(0.3, blurAmount * intensity);

  // Render both versions in parallel
  const [sharpRes, blurRes] = await Promise.all([
    sharp(imgBuffer).raw().toBuffer({ resolveWithObject: true }),
    sharp(imgBuffer).blur(effectiveBlur).raw().toBuffer({ resolveWithObject: true }),
  ]);

  const { width: W, height: H, channels } = sharpRes.info;
  const sharp_ = new Uint8ClampedArray(sharpRes.data);
  const blurred = new Uint8ClampedArray(blurRes.data);
  const output  = new Uint8ClampedArray(sharp_.length);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // t = 0 at the focused edge (stays sharp), 1 at opposite (fully blurred)
      let t;
      switch (focusEdge) {
        case 'left':   t = x / W;       break;
        case 'right':  t = 1 - x / W;   break;
        case 'top':    t = y / H;       break;
        case 'bottom': t = 1 - y / H;   break;
        default:       t = x / W;
      }
      // Non-linear: stays sharp for ~40% of the page then drops off steeply
      t = Math.pow(Math.max(0, (t - 0.3) / 0.7), 1.4);
      t = Math.min(1, t);

      const i = (y * W + x) * channels;
      for (let c = 0; c < channels; c++) {
        output[i + c] = Math.round(sharp_[i + c] * (1 - t) + blurred[i + c] * t);
      }
    }
  }

  return bufToU8(await sharp(
    new Uint8Array(output.buffer, output.byteOffset, output.byteLength),
    { raw: { width: W, height: H, channels } }
  ).png({ compressionLevel: 6 }).toBuffer());
}

// ─── Back-bleed / Show-through ────────────────────────────────────────────────
// Real paper is semi-translucent. When scanning a double-sided document,
// faint ghosts of the reverse page's text are visible through the paper —
// mirrored horizontally, washed out, and shifted by paper thickness.
//
// reverseBuffer: raw image of the reverse page (or null to skip).
// opacity: 0.04–0.12 is realistic; higher values = thinner paper.
export async function applyBackBleed(pageBuffer, reverseBuffer, opacity = 0.07) {
  if (!reverseBuffer || opacity <= 0) return pageBuffer;

  const { data: pageData, info } = await sharp(pageBuffer)
    .raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;

  // Prepare ghost: resize to match, mirror horizontally, wash out colour
  const { data: ghostData } = await sharp(reverseBuffer)
    .resize(W, H, { fit: 'fill' })
    .flop()           // mirror: text on the back reads reversed
    .modulate({ brightness: 1.6, saturation: 0.25 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const page  = new Uint8ClampedArray(pageData);
  const ghost = new Uint8ClampedArray(ghostData);

  for (let i = 0; i < page.length; i += channels) {
    // Only bleed onto paper/background pixels — ink areas are already dark
    const luma = page[i] * 0.299 + page[i+1] * 0.587 + page[i+2] * 0.114;
    if (luma < 155) continue;

    for (let c = 0; c < Math.min(channels, 3); c++) {
      // The ghost's dark regions (text) subtract brightness from this side
      const ghostVal  = ghost[i + c] ?? 255;
      const bleedDark = 255 - ghostVal; // how dark the ghost text is
      page[i + c] = Math.max(0, Math.round(page[i + c] - bleedDark * opacity));
    }
  }

  return bufToU8(await sharp(
    new Uint8Array(page.buffer, page.byteOffset, page.byteLength),
    { raw: { width: W, height: H, channels } }
  ).png({ compressionLevel: 6 }).toBuffer());
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────
export async function processPage(imgBuffer, opts = {}) {
  let buf = imgBuffer;

  if (opts.deskew) buf = await deskewImage(buf);

  if (opts.manualSkew && Math.abs(opts.manualSkew) > 0) {
    buf = bufToU8(await sharp(buf)
      .rotate(-opts.manualSkew, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer());
  }

  buf = await applyScanEffect(buf, opts);

  // Focus gradient runs after scan — blur is a physical property of the optics,
  // not a sensor property, so it sits on top of sensor noise/grain.
  if (opts.focusGradient) {
    buf = await applyFocusGradient(buf, {
      focusEdge:  opts.focusEdge  ?? 'left',
      blurAmount: opts.blurAmount ?? 1.8,
      intensity:  opts.focusGradientIntensity ?? 1.0,
    });
  }

  if (opts.pageWarp) {
    buf = await applyDisplacementWarp(buf, {
      warpIntensity: opts.warpIntensity ?? 1.0,
      spineCurve:    opts.spineCurve    ?? false,
    });
  }

  if (opts.crumple) {
    buf = await applyCrumpleEffect(buf, {
      crumpleIntensity: opts.crumpleIntensity ?? 1.0,
    });
  }

  return buf;
}

// ─── Displacement Map Page Warping ───────────────────────────────────────────
export async function applyDisplacementWarp(imgBuffer, opts = {}) {
  const intensity  = Math.max(0, Math.min(3, opts.warpIntensity ?? 1.0));
  const spineCurve = opts.spineCurve ?? false;
  if (intensity === 0) return imgBuffer;

  const { data, info } = await sharp(imgBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: W, height: H, channels } = info;
  const src    = new Uint8ClampedArray(data);
  const output = new Uint8ClampedArray(src.length);

  const seed = Math.random() * 500 | 0;

  for (let y = 0; y < H; y++) {
    const ny = y / H;
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const dx1 = fbm(nx * 2,  ny * 2,  seed,       3) * 3   * intensity;
      const dy1 = fbm(nx * 2,  ny * 2,  seed + 100, 3) * 3   * intensity;
      const dx2 = fbm(nx * 8,  ny * 8,  seed + 200, 2) * 1.5 * intensity;
      const dy2 = fbm(nx * 8,  ny * 8,  seed + 300, 2) * 1.5 * intensity;
      const dx3 = fbm(nx * 25, ny * 25, seed + 400, 1) * 0.5 * intensity;
      const dy3 = fbm(nx * 25, ny * 25, seed + 500, 1) * 0.5 * intensity;

      let totalDx = dx1 + dx2 + dx3;
      let totalDy = dy1 + dy2 + dy3;

      if (spineCurve) {
        const spineFade = Math.max(0, 1 - nx * 3.5);
        totalDx += Math.sin(ny * Math.PI) * 5 * intensity * spineFade;
        totalDy += Math.cos(ny * Math.PI - Math.PI / 2) * 2 * intensity * spineFade;
      }

      let sx = x + totalDx, sy = y + totalDy;
      sx = Math.max(0, Math.min(W - 1.001, sx));
      sy = Math.max(0, Math.min(H - 1.001, sy));

      const x0 = sx | 0, y0 = sy | 0;
      const x1 = Math.min(x0 + 1, W - 1);
      const y1 = Math.min(y0 + 1, H - 1);
      const fx = sx - x0, fy = sy - y0;

      const oi = (y * W + x) * channels;
      for (let c = 0; c < channels; c++) {
        const i00 = (y0 * W + x0) * channels + c;
        const i10 = (y0 * W + x1) * channels + c;
        const i01 = (y1 * W + x0) * channels + c;
        const i11 = (y1 * W + x1) * channels + c;
        output[oi + c] = lerp(lerp(src[i00], src[i10], fx), lerp(src[i01], src[i11], fx), fy);
      }
    }
  }

  return bufToU8(await sharp(
    new Uint8Array(output.buffer, output.byteOffset, output.byteLength),
    { raw: { width: W, height: H, channels } }
  ).png({ compressionLevel: 6 }).toBuffer());
}

// ─── Composite Signature onto Page ───────────────────────────────────────────
export async function compositeSignature(pageBuffer, sigBuffer, xPct, yPct, wPct, hPct, rotationDeg = 0) {
  const { width: pw, height: ph } = await sharp(pageBuffer).metadata();
  const width  = Math.max(10, Math.round(wPct * pw));
  const height = Math.max(10, Math.round(hPct * ph));
  const left   = Math.round(xPct * pw);
  const top    = Math.round(yPct * ph);
  const safeLeft = Math.max(0, Math.min(left, pw - width));
  const safeTop  = Math.max(0, Math.min(top,  ph - height));

  let sigPipeline = sharp(sigBuffer)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

  if (Math.abs(rotationDeg) > 0.1) {
    sigPipeline = sigPipeline.rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  const resized = await sigPipeline.png().toBuffer();
  const { width: rw, height: rh } = await sharp(resized).metadata();
  const cx = Math.max(0, Math.min(safeLeft + Math.round((width - rw) / 2), pw - rw));
  const cy = Math.max(0, Math.min(safeTop  + Math.round((height - rh) / 2), ph - rh));

  return bufToU8(await sharp(pageBuffer)
    .composite([{ input: resized, left: cx, top: cy, blend: 'over' }])
    .png({ compressionLevel: 6 })
    .toBuffer());
}

// ══════════════════════════════════════════════════════════════════════════════
// CRUMPLE EFFECT
// ══════════════════════════════════════════════════════════════════════════════

function fade(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

function hash(x, y, seed) {
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

function fbm(x, y, seed, octaves = 5) {
  let val = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq, seed + i * 31.7) * amp;
    max  += amp;
    amp  *= 0.5;
    freq *= 2.1;
  }
  return val / max;
}

export async function applyCrumpleEffect(imgBuffer, opts = {}) {
  const intensity = Math.max(0, Math.min(2, opts.crumpleIntensity ?? 1.0));
  if (intensity === 0) return imgBuffer;

  const seed = opts.crumpleSeed ?? (Math.random() * 1000 | 0);

  const { data, info } = await sharp(imgBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const out = new Uint8ClampedArray(data);
  const W = width, H = height;

  const numCreases = 3 + Math.round(intensity * 4);
  const creases = [];

  for (let i = 0; i < numCreases; i++) {
    const baseAngle = (i % 2 === 0 ? 0 : Math.PI / 2) + (hash(i, 1, seed) * 0.95);
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
        const falloff  = Math.exp(-t * t * 0.5);
        const lenFade  = Math.max(0, 1 - Math.abs(along) * 2.5);
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

  return bufToU8(await sharp(
    new Uint8Array(out.buffer, out.byteOffset, out.byteLength),
    { raw: { width: W, height: H, channels } }
  ).png({ compressionLevel: 6 }).toBuffer());
}