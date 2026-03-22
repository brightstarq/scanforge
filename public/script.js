'use strict';

// ── Scanner Model Profiles ────────────────────────────────────────────────────
const SCANNER_PROFILES = {
  'canon-office-2020': {
    noise: 4, yellowTint: 0.5, brightness: 1.02, contrast: 1.08, rotation: 0.2,
    channelMisreg: false, jpegInternalize: false, scanDropout: false,
    moire: false, ambientLeak: false, motionSmear: false,
    focusGradient: false, backBleed: false,
    desc: 'Modern office flatbed. Clean, sharp, minimal warmth.',
  },
  'hp-home-budget': {
    noise: 9, yellowTint: 2, brightness: 0.97, contrast: 1.04, rotation: 0.5,
    channelMisreg: true, jpegInternalize: true, scanDropout: false,
    moire: false, ambientLeak: false, motionSmear: true,
    focusGradient: false, backBleed: false,
    desc: 'Budget home scanner. Warm tone, channel fringing, JPEG compression, motion smear.',
  },
  'library-xerox-worn': {
    noise: 18, yellowTint: 3, brightness: 0.93, contrast: 1.18, rotation: 0.8,
    channelMisreg: true, jpegInternalize: true, scanDropout: true,
    moire: false, ambientLeak: false, motionSmear: true,
    focusGradient: false, backBleed: false,
    desc: 'Overused public copier. Heavy grain, fringing, dropouts, JPEG artefacts, motion smear.',
  },
  'archive-flatbed-2005': {
    noise: 12, yellowTint: 2.5, brightness: 0.98, contrast: 1.1, rotation: 0.6,
    channelMisreg: false, jpegInternalize: false, scanDropout: false,
    moire: false, ambientLeak: true, motionSmear: false,
    focusGradient: true, backBleed: false,
    desc: 'Early 2000s archive scanner. Aged warmth, focus falloff, ambient lid light leak.',
  },
  'fujitsu-production': {
    noise: 2, yellowTint: 0, brightness: 1.0, contrast: 1.05, rotation: 0.1,
    channelMisreg: false, jpegInternalize: false, scanDropout: false,
    moire: false, ambientLeak: false, motionSmear: false,
    focusGradient: false, backBleed: false,
    desc: 'High-end production scanner. Near-crisp with subtle physical feel.',
  },
  'magazine-print': {
    noise: 6, yellowTint: 1, brightness: 1.0, contrast: 1.06, rotation: 0.3,
    channelMisreg: false, jpegInternalize: true, scanDropout: false,
    moire: true, ambientLeak: false, motionSmear: false,
    focusGradient: false, backBleed: false,
    desc: 'Scanning halftone-printed material. Moiré interference, JPEG internalization.',
  },
};

// ── Payment Config ────────────────────────────────────────────────────────────
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51SyHTg6Tx87w00alu2CDYVurUofMLWjqgJ1q9fN2n1PYmUrH7tHQ47mjAMvOjUEFxcVcr4xrCsCdgM99ICu9PxSq00VGfA61q4';
const FREE_PAGE_LIMIT = 3;
const TOKEN_KEY = 'scandrift_unlock_token'; // localStorage key

// ── Check for valid stored token ──────────────────────────────────────────────
function getStoredToken() {
  try { return localStorage.getItem(TOKEN_KEY) ?? null; }
  catch { return null; }
}
function storeToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

// ── Success splash ────────────────────────────────────────────────────────────
function showSuccessSplash() {
  const splash = document.getElementById('successSplash');
  if (!splash) return;

  // Build confetti
  const container = document.getElementById('successConfetti');
  if (container) {
    container.innerHTML = '';
    const colors = ['#c8a96e','#e8c97e','#fff','#f0e6d0','#a08040','#ffe099'];
    for (let i = 0; i < 54; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.cssText = `
        left: ${Math.random() * 100}%;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${4 + Math.random() * 6}px;
        height: ${8 + Math.random() * 10}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-delay: ${Math.random() * 0.8}s;
        animation-duration: ${1.2 + Math.random() * 1.4}s;
        transform: rotate(${Math.random() * 360}deg);
      `;
      container.appendChild(p);
    }
  }

  splash.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Trigger CSS animations
  requestAnimationFrame(() => splash.classList.add('visible'));
}

function hideSuccessSplash() {
  const splash = document.getElementById('successSplash');
  if (!splash) return;
  splash.classList.remove('visible');
  splash.classList.add('hiding');
  setTimeout(() => {
    splash.style.display = 'none';
    splash.classList.remove('hiding');
    document.body.style.overflow = '';
    // Scroll to the app card
    document.querySelector('.app-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 400);
}

document.getElementById('successCta')?.addEventListener('click', hideSuccessSplash);
document.getElementById('successSplash')?.addEventListener('click', e => {
  if (e.target === document.getElementById('successSplash')) hideSuccessSplash();
});

// ── Handle return from Stripe ─────────────────────────────────────────────────
(async function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const verifySession = params.get('verify_session');

  if (verifySession) {
    window.history.replaceState({}, '', window.location.pathname);
    try {
      const res = await fetch(`/verify-payment?verify_session=${encodeURIComponent(verifySession)}`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Verification failed');
      const { token } = await res.json();
      storeToken(token);
      // Show the success splash instead of just a status message
      showSuccessSplash();
    } catch (err) {
      const msg = document.getElementById('statusMsg');
      if (msg) {
        msg.textContent = `Payment verification failed: ${err.message}`;
        msg.className = 'status error';
      }
    }
  }

  if (params.get('cancelled') === '1') {
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

// ── Before/After Slider ───────────────────────────────────────────────────────
const baContainer = document.getElementById('baContainer');
const baDivider   = document.getElementById('baDivider');
const baAfter     = document.getElementById('baAfter');
let baDragging = false;

function setBAPos(x) {
  const rect = baContainer.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  baDivider.style.left = `${pct * 100}%`;
  baAfter.style.clipPath = `inset(0 ${(1 - pct) * 100}% 0 0)`;
}

if (baContainer) {
  setBAPos(baContainer.getBoundingClientRect().left + baContainer.offsetWidth * 0.5);
  baDivider.addEventListener('mousedown', e => { baDragging = true; e.preventDefault(); });
  baContainer.addEventListener('click', e => setBAPos(e.clientX));
  document.addEventListener('mousemove', e => { if (baDragging) setBAPos(e.clientX); });
  document.addEventListener('mouseup', () => { baDragging = false; });
  baContainer.addEventListener('touchstart', e => { baDragging = true; setBAPos(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchmove', e => { if (baDragging) { setBAPos(e.touches[0].clientX); e.preventDefault(); } }, { passive: false });
  document.addEventListener('touchend', () => { baDragging = false; });
}

// ── File Drop ─────────────────────────────────────────────────────────────────
const dropzone      = document.getElementById('dropzone');
const pdfInput      = document.getElementById('pdfInput');
const fileBar       = document.getElementById('fileBar');
const fileNameEl    = document.getElementById('fileName');
const fileSizeEl    = document.getElementById('fileSize');
const fileTypeBadge = document.getElementById('fileTypeBadge');
const clearBtn      = document.getElementById('clearBtn');
const submitBtn     = document.getElementById('submitBtn');
const fmtImageWrap  = document.getElementById('fmt-image-wrap');

let currentFiles = [];

const FMT_MAP = {
  'application/pdf':'PDF','image/jpeg':'JPG','image/jpg':'JPG',
  'image/png':'PNG','image/webp':'WEBP','image/tiff':'TIFF','image/bmp':'BMP',
};
const fmtBytes = b => b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

function setFiles(files) {
  currentFiles = Array.from(files);
  const isPdf   = currentFiles.length === 1 && currentFiles[0].type === 'application/pdf';
  const isMulti = currentFiles.length > 1;

  if (currentFiles.length === 1) {
    fileNameEl.textContent    = currentFiles[0].name;
    fileSizeEl.textContent    = fmtBytes(currentFiles[0].size);
    fileTypeBadge.textContent = FMT_MAP[currentFiles[0].type] ?? 'FILE';
  } else {
    const totalSize = currentFiles.reduce((s, f) => s + f.size, 0);
    fileNameEl.textContent    = `${currentFiles.length} files selected`;
    fileSizeEl.textContent    = fmtBytes(totalSize);
    fileTypeBadge.textContent = 'MULTI';
  }

  fileBar.classList.add('visible');
  dropzone.classList.add('has-file');
  submitBtn.disabled = false;

  fmtImageWrap.style.display = (!isMulti && !isPdf) ? '' : 'none';
  if (isMulti || isPdf) document.getElementById('f-pdf').checked = true;

  loadPreview(currentFiles[0]);
}

function clearFile() {
  currentFiles = [];
  fileBar.classList.remove('visible');
  dropzone.classList.remove('has-file');
  submitBtn.disabled = true;
  const thumb = document.getElementById('sigPageThumb');
  const ph    = document.getElementById('sigPreviewPlaceholder');
  if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }
  if (ph)    ph.style.display = '';
}

dropzone.addEventListener('click', (e) => {
  if (e.target === pdfInput) return;
  pdfInput.click();
});
dropzone.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') pdfInput.click(); });
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) setFiles(e.dataTransfer.files);
});
pdfInput.addEventListener('change', () => { if (pdfInput.files.length) setFiles(pdfInput.files); });
clearBtn.addEventListener('click', clearFile);

// ── Preview loader ────────────────────────────────────────────────────────────
async function loadPreview(file) {
  const thumb = document.getElementById('sigPageThumb');
  const ph    = document.getElementById('sigPreviewPlaceholder');
  if (!thumb) return;
  try {
    const fd  = new FormData();
    fd.append('file', file);
    const res = await fetch('/preview', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('preview failed');
    const url = URL.createObjectURL(await res.blob());
    thumb.src = url;
    thumb.style.display = 'block';
    if (ph) ph.style.display = 'none';
  } catch (e) {
    console.warn('Preview load failed:', e.message);
  }
}

// ── Presets ───────────────────────────────────────────────────────────────────
const PRESETS = {
  light:  { noise:4,  yellowTint:0.5, brightness:1.02, contrast:1.02, rotation:0.2 },
  medium: { noise:8,  yellowTint:1.0, brightness:1.0,  contrast:1.05, rotation:0.4 },
  heavy:  { noise:18, yellowTint:2.5, brightness:0.95, contrast:1.12, rotation:0.8 },
};
document.querySelectorAll('input[name="preset"]').forEach(r => {
  r.addEventListener('change', () => {
    const p = PRESETS[r.value]; if (!p) return;
    Object.entries(p).forEach(([k, v]) => setSlider(k, v));
    const modelSel = document.getElementById('scannerModel');
    if (modelSel) { modelSel.value = ''; updateModelDesc(''); }
  });
});

function setSlider(id, val) {
  const el = document.getElementById(id);
  if (el) { el.value = val; el.dispatchEvent(new Event('input')); }
}

function setCheckbox(id, val) {
  const el = document.getElementById(id);
  if (el) {
    el.checked = !!val;
    el.dispatchEvent(new Event('change'));
  }
}

// ── Scanner Model selector ────────────────────────────────────────────────────
function updateModelDesc(key) {
  const el = document.getElementById('modelDesc');
  if (!el) return;
  el.textContent = key && SCANNER_PROFILES[key] ? SCANNER_PROFILES[key].desc : '';
}

document.getElementById('scannerModel')?.addEventListener('change', function () {
  const key = this.value;
  updateModelDesc(key);
  if (!key || !SCANNER_PROFILES[key]) return;
  const p = SCANNER_PROFILES[key];
  setSlider('noise',      p.noise);
  setSlider('yellowTint', p.yellowTint);
  setSlider('brightness', p.brightness);
  setSlider('contrast',   p.contrast);
  setSlider('rotation',   p.rotation);
  setCheckbox('channelMisreg',   p.channelMisreg);
  setCheckbox('jpegInternalize', p.jpegInternalize);
  setCheckbox('scanDropout',     p.scanDropout);
  setCheckbox('moire',           p.moire);
  setCheckbox('ambientLeak',     p.ambientLeak);
  setCheckbox('motionSmear',     p.motionSmear);
  setCheckbox('focusGradient',   p.focusGradient);
  setCheckbox('backBleed',       p.backBleed);
  setCheckbox('bindingShadow',   false);
  setCheckbox('crumple',         false);
});

// ── Slider value display ──────────────────────────────────────────────────────
[
  ['noise','noiseVal'],
  ['yellowTint','tintVal'],
  ['brightness','brightVal'],
  ['contrast','contrastVal'],
  ['rotation','rotVal'],
  ['manualSkew','skewVal'],
  ['focusGradientIntensity','focusIntensityVal'],
  ['backBleedOpacity','backBleedOpacityVal'],
].forEach(([inputId, spanId]) => {
  const input = document.getElementById(inputId);
  const span  = document.getElementById(spanId);
  if (!input || !span) return;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    span.textContent = Number.isInteger(v) ? v : v.toFixed(2);
  });
});

// ── Crumple toggle ────────────────────────────────────────────────────────────
const crumpleToggle = document.getElementById('crumple');
const crumpleOpts   = document.getElementById('crumpleOpts');
crumpleToggle?.addEventListener('change', () => {
  crumpleOpts.style.display = crumpleToggle.checked ? 'block' : 'none';
});
const crumpleInput = document.getElementById('crumpleIntensity');
const crumpleSpan  = document.getElementById('crumpleVal');
crumpleInput?.addEventListener('input', () => {
  crumpleSpan.textContent = parseFloat(crumpleInput.value).toFixed(1);
});

// ── Focus Gradient sub-options ────────────────────────────────────────────────
const focusToggle = document.getElementById('focusGradient');
const focusOpts   = document.getElementById('focusOpts');
focusToggle?.addEventListener('change', () => {
  if (focusOpts) focusOpts.style.display = focusToggle.checked ? 'block' : 'none';
});

// ── Back Bleed sub-options ────────────────────────────────────────────────────
const backBleedToggle = document.getElementById('backBleed');
const backBleedOpts   = document.getElementById('backBleedOpts');
backBleedToggle?.addEventListener('change', () => {
  if (backBleedOpts) backBleedOpts.style.display = backBleedToggle.checked ? 'block' : 'none';
});

// ── Advanced panel ────────────────────────────────────────────────────────────
const advToggle = document.getElementById('advToggle');
const advBody   = document.getElementById('advBody');
const advCaret  = document.getElementById('advCaret');

function toggleAdv() {
  const open = advBody.classList.toggle('open');
  advBody.style.display = open ? 'block' : 'none';
  advToggle.setAttribute('aria-expanded', String(open));
  advCaret.textContent = open ? '▴' : '▾';
}
advToggle?.addEventListener('click', toggleAdv);
advToggle?.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') toggleAdv(); });

// ── FAQ ───────────────────────────────────────────────────────────────────────
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const open = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.querySelector('.faq-icon').textContent = open ? '×' : '+';
  });
});

// ── Form fields refs ──────────────────────────────────────────────────────────
const form          = document.getElementById('form');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressPct   = document.getElementById('progressPct');
const progressLabel = document.getElementById('progressLabel');
const progressTrack = document.getElementById('progressTrack');
const statusMsg     = document.getElementById('statusMsg');

// ── Payment Gate ──────────────────────────────────────────────────────────────
const payModalBackdrop = document.getElementById('payModalBackdrop');
const payBtn           = document.getElementById('payBtn');
const payBtnLabel      = document.getElementById('payBtnLabel');
const payFreeBtn       = document.getElementById('payFreeBtn');
const payClose         = document.getElementById('payClose');
const payPageCount     = document.getElementById('payPageCount');
const payPageCountB    = document.getElementById('payPageCountB');

async function estimatePageCount(files) {
  if (!files.length) return 0;
  if (files.length > 1) return files.length;
  const file = files[0];
  if (file.type !== 'application/pdf') return 1;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/page-count', { method: 'POST', body: fd });
    if (res.ok) {
      const { pages } = await res.json();
      return pages ?? 99;
    }
  } catch (_) { /* fall through */ }
  return 99;
}

function openPayModal(pageCount) {
  if (payPageCount)  payPageCount.textContent  = pageCount;
  if (payPageCountB) payPageCountB.textContent = pageCount;
  if (payModalBackdrop) {
    payModalBackdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}
function closePayModal() {
  if (payModalBackdrop) {
    payModalBackdrop.style.display = 'none';
    document.body.style.overflow = '';
  }
}

payClose?.addEventListener('click', closePayModal);
payModalBackdrop?.addEventListener('click', e => {
  if (e.target === payModalBackdrop) closePayModal();
});

// "Process first 3 pages only" free option
payFreeBtn?.addEventListener('click', () => {
  closePayModal();
  doSubmit({ capPages: FREE_PAGE_LIMIT });
});

// Stripe Checkout redirect
payBtn?.addEventListener('click', async () => {
  if (payBtnLabel) payBtnLabel.textContent = 'Redirecting to payment…';
  if (payBtn) payBtn.disabled = true;
  try {
    const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    const res = await fetch('/create-checkout-session', { method: 'POST' });
    if (!res.ok) throw new Error('Could not create payment session');
    const { sessionId } = await res.json();
    await stripe.redirectToCheckout({ sessionId });
  } catch (err) {
    if (payBtnLabel) payBtnLabel.textContent = 'Pay $5 and process';
    if (payBtn) payBtn.disabled = false;
    if (statusMsg) {
      statusMsg.textContent = `Payment error: ${err.message}`;
      statusMsg.className = 'status error';
    }
    closePayModal();
  }
});

// ── Form submit ───────────────────────────────────────────────────────────────
form?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentFiles.length) return;

  const sigEnabledEl = document.getElementById('sigEnabled');
  const sigDataVal   = document.getElementById('sigData')?.value;
  if (sigEnabledEl?.checked && !sigDataVal) {
    statusMsg.textContent = 'Please configure your signature first (click Configure).';
    statusMsg.className = 'status error'; return;
  }

  // Check for a stored unlock token — if present, skip the payment gate.
  // The server will independently verify the token; the client check is just
  // to avoid showing the paywall to someone who already paid.
  const storedToken = getStoredToken();

  if (!storedToken) {
    const pageCount = await estimatePageCount(currentFiles);
    if (pageCount > FREE_PAGE_LIMIT) {
      openPayModal(pageCount);
      return;
    }
  }

  doSubmit({ token: storedToken });
});

// ── Core submit (called directly or after payment gate decision) ──────────────
async function doSubmit({ capPages = null, token = null } = {}) {
  const sigEnabledEl = document.getElementById('sigEnabled');
  const sigDataVal   = document.getElementById('sigData')?.value;

  const fd = new FormData();

  if (currentFiles.length === 1) {
    fd.append('file', currentFiles[0]);
  } else {
    currentFiles.forEach(f => fd.append('files', f));
  }

  if (capPages !== null) fd.append('capPages', capPages);

  // Send unlock token to server for verification
  if (token) fd.append('unlockToken', token);

  ['noise','yellowTint','brightness','contrast','rotation','manualSkew','sharpness','dpi'].forEach(id => {
    fd.append(id, document.getElementById(id).value);
  });

  fd.append('grain',            document.getElementById('grain').checked);
  fd.append('deskew',           document.getElementById('deskew').checked);
  fd.append('bindingShadow',    document.getElementById('bindingShadow').checked);
  fd.append('crumple',          document.getElementById('crumple').checked);
  fd.append('crumpleIntensity', document.getElementById('crumpleIntensity')?.value ?? '1.0');

  fd.append('channelMisreg',   document.getElementById('channelMisreg').checked);
  fd.append('jpegInternalize', document.getElementById('jpegInternalize').checked);
  fd.append('scanDropout',     document.getElementById('scanDropout').checked);
  fd.append('moire',           document.getElementById('moire').checked);
  fd.append('ambientLeak',     document.getElementById('ambientLeak').checked);
  fd.append('motionSmear',     document.getElementById('motionSmear').checked);

  fd.append('focusGradient',          document.getElementById('focusGradient').checked);
  fd.append('focusEdge',              document.getElementById('focusEdge')?.value ?? 'left');
  fd.append('focusGradientIntensity', document.getElementById('focusGradientIntensity')?.value ?? '1.0');

  fd.append('backBleed',        document.getElementById('backBleed').checked);
  fd.append('backBleedOpacity', document.getElementById('backBleedOpacity')?.value ?? '0.07');

  fd.append('format', document.querySelector('input[name="format"]:checked')?.value ?? 'pdf');

  if (sigEnabledEl?.checked && sigDataVal) {
    ['sigData','sigX','sigY','sigW','sigH','sigPage','sigRotation'].forEach(id => {
      fd.append(id, document.getElementById(id).value);
    });
  }

 submitBtn.disabled = true;
progressWrap.style.display = 'block';
statusMsg.textContent = '';
progressFill.style.width = '0%';
progressPct.textContent = '0%';
progressLabel.textContent = 'Uploading…';

// Immediate visual response before server replies
await new Promise(r => setTimeout(r, 30));
progressFill.style.width = '8%';
progressPct.textContent = '8%';
progressLabel.textContent = 'Processing…';

let fake = 8;
  const timer = setInterval(() => {
    fake = Math.min(fake + Math.random() * 8, 85);
    progressFill.style.width = `${fake}%`;
    progressPct.textContent  = `${Math.round(fake)}%`;
    progressTrack.setAttribute('aria-valuenow', Math.round(fake));
  }, 300);

  try {
    const res = await fetch('/process', { method: 'POST', body: fd });
    clearInterval(timer);
    progressFill.style.width = '100%';
    progressPct.textContent  = '100%';
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      // Token expired or invalid — clear it and ask them to pay again
      if (res.status === 401) {
        clearToken();
        throw new Error('Your unlock has expired (10 hours). Please pay again to continue.');
      }
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const blob  = await res.blob();
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const disp  = res.headers.get('content-disposition') ?? '';
    const match = disp.match(/filename="(.+?)"/);
    a.href = url; a.download = match?.[1] ?? 'scanned.pdf'; a.click();
    URL.revokeObjectURL(url);
    progressLabel.textContent = 'Done ✓';
    statusMsg.textContent = `Downloaded: ${a.download}`;
    statusMsg.className = 'status success';
  } catch (err) {
    clearInterval(timer);
    progressFill.style.width = '0%';
    progressLabel.textContent = 'Error';
    statusMsg.textContent = err.message;
    statusMsg.className = 'status error';
  } finally {
    submitBtn.disabled = false;
    setTimeout(() => { progressWrap.style.display = 'none'; }, 3500);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SIGNATURE MODAL
// ══════════════════════════════════════════════════════════════════════════════
const sigModalBackdrop = document.getElementById('sigModalBackdrop');
const sigEnabled       = document.getElementById('sigEnabled');
const sigPreviewRow    = document.getElementById('sigPreviewRow');
const sigConfigureBtn  = document.getElementById('sigConfigureBtn');
const sigModalClose    = document.getElementById('sigModalClose');
const sigCancelBtn     = document.getElementById('sigCancelBtn');
const sigConfirmBtn    = document.getElementById('sigConfirmBtn');
const sigEmptyLbl      = document.querySelector('.sig-empty-lbl');

function openSigModal()  { sigModalBackdrop.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeSigModal() { sigModalBackdrop.style.display = 'none'; document.body.style.overflow = ''; }

sigEnabled?.addEventListener('change', () => {
  if (sigPreviewRow) sigPreviewRow.style.display = sigEnabled.checked ? 'flex' : 'none';
});
sigConfigureBtn?.addEventListener('click', openSigModal);
sigModalClose?.addEventListener('click', closeSigModal);
sigCancelBtn?.addEventListener('click', closeSigModal);
sigModalBackdrop?.addEventListener('click', e => { if (e.target === sigModalBackdrop) closeSigModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sigModalBackdrop?.style.display !== 'none') closeSigModal();
});

// ── Tab switching ─────────────────────────────────────────────────────────────
const tabDraw     = document.getElementById('tabDraw');
const tabUpload   = document.getElementById('tabUpload');
const panelDraw   = document.getElementById('panelDraw');
const panelUpload = document.getElementById('panelUpload');

tabDraw?.addEventListener('click', () => {
  tabDraw.classList.add('active');   tabUpload.classList.remove('active');
  panelDraw.style.display = '';      panelUpload.style.display = 'none';
});
tabUpload?.addEventListener('click', () => {
  tabUpload.classList.add('active'); tabDraw.classList.remove('active');
  panelUpload.style.display = '';    panelDraw.style.display = 'none';
});

// ── Draw canvas ───────────────────────────────────────────────────────────────
const sigCanvas   = document.getElementById('sigCanvas');
const sigCtx      = sigCanvas?.getContext('2d');
const clearSigBtn = document.getElementById('clearSigBtn');
const canvasHint  = document.querySelector('.sig-canvas-hint');
let sigDrawing = false, sigLastX = 0, sigLastY = 0, sigHasDrawn = false;

function getSigColor() {
  return document.querySelector('input[name="sigColor"]:checked')?.value ?? '#0a0a0a';
}
function getCanvasXY(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const s = e.touches ? e.touches[0] : e;
  return [(s.clientX - r.left) * (canvas.width / r.width),
          (s.clientY - r.top)  * (canvas.height / r.height)];
}
function resetCanvas() {
  if (!sigCtx) return;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigHasDrawn = false;
  if (canvasHint) canvasHint.style.display = '';
}
resetCanvas();

sigCanvas?.addEventListener('pointerdown', e => {
  sigDrawing = true;
  const [x, y] = getCanvasXY(e, sigCanvas);
  sigLastX = x; sigLastY = y;
  sigCtx.beginPath(); sigCtx.arc(x, y, 1.2, 0, Math.PI*2);
  sigCtx.fillStyle = getSigColor(); sigCtx.fill();
  sigCanvas.setPointerCapture(e.pointerId);
  if (!sigHasDrawn) { sigHasDrawn = true; if (canvasHint) canvasHint.style.display = 'none'; }
  e.preventDefault();
}, { passive: false });

sigCanvas?.addEventListener('pointermove', e => {
  if (!sigDrawing) return;
  const [x, y] = getCanvasXY(e, sigCanvas);
  const speed  = Math.hypot(x - sigLastX, y - sigLastY);
  const lw     = Math.max(1.0, 3.2 - speed * 0.045);
  sigCtx.beginPath();
  sigCtx.moveTo(sigLastX, sigLastY);
  const mx = (sigLastX + x) / 2, my = (sigLastY + y) / 2;
  sigCtx.quadraticCurveTo(sigLastX, sigLastY, mx, my);
  sigCtx.strokeStyle = getSigColor();
  sigCtx.lineWidth   = lw;
  sigCtx.lineJoin    = 'round';
  sigCtx.lineCap     = 'round';
  sigCtx.stroke();
  sigLastX = x; sigLastY = y;
  e.preventDefault();
}, { passive: false });

sigCanvas?.addEventListener('pointerup',    () => { sigDrawing = false; refreshOverlay(); });
sigCanvas?.addEventListener('pointerleave', () => { sigDrawing = false; });

clearSigBtn?.addEventListener('click', () => {
  resetCanvas();
  sigCurrentAngle = 0;
  document.getElementById('sigData').value = '';
  document.getElementById('sigRotation').value = '0';
  const oi = document.getElementById('sigOverlayImg');
  if (oi) oi.src = '';
  const ov = document.getElementById('sigOverlay');
  if (ov) { ov.style.display = 'none'; ov.style.transform = ''; }
});

// ── Upload tab ────────────────────────────────────────────────────────────────
const sigFileInput     = document.getElementById('sigFileInput');
const sigUploadZone    = document.getElementById('sigUploadZone');
const sigUploadPreview = document.getElementById('sigUploadPreview');
let uploadedSigDataURL = '';

sigUploadZone?.addEventListener('click', () => sigFileInput?.click());
sigUploadZone?.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') sigFileInput?.click(); });
sigFileInput?.addEventListener('change', () => {
  const f = sigFileInput.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    uploadedSigDataURL = ev.target.result;
    if (sigUploadPreview) { sigUploadPreview.src = uploadedSigDataURL; sigUploadPreview.style.display = 'block'; }
    updateOverlayImg(uploadedSigDataURL);
  };
  reader.readAsDataURL(f);
});

// ── Overlay drag, resize & rotate ─────────────────────────────────────────────
const sigPreviewContainer = document.getElementById('sigPreviewContainer');
const sigOverlay          = document.getElementById('sigOverlay');
const sigOverlayImg       = document.getElementById('sigOverlayImg');
const sigResizeHandle     = document.getElementById('sigResizeHandle');
const sigRotateHandle     = document.getElementById('sigRotateHandle');
const sigAngleBadge       = document.getElementById('sigAngleBadge');

let sigDrag    = false, sigResize = false, sigRotate = false;
let sigDragOX  = 0, sigDragOY = 0;
let sigResX    = 0, sigResW   = 0;
let sigCurrentAngle = 0;
let sigRotStartAngle = 0, sigRotStartMouse = 0;

function getOverlayCenter() {
  const r = sigOverlay.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function getMouseAngle(cx, cy, mx, my) {
  return Math.atan2(my - cy, mx - cx) * (180 / Math.PI);
}
function applyRotation(angle) {
  sigCurrentAngle = angle;
  sigOverlay.style.transform = `rotate(${angle}deg)`;
  if (sigAngleBadge) sigAngleBadge.textContent = `${Math.round(angle)}°`;
}

function refreshOverlay() {
  const onDraw = panelUpload?.style.display === 'none';
  if (onDraw && sigHasDrawn) updateOverlayImg(sigCanvas.toDataURL('image/png'));
  else if (!onDraw && uploadedSigDataURL) updateOverlayImg(uploadedSigDataURL);
}

function updateOverlayImg(src) {
  if (!sigOverlay || !sigOverlayImg) return;
  if (!src) { sigOverlay.style.display = 'none'; return; }
  sigOverlayImg.src = src;
  sigOverlay.style.display = 'block';
  if (!sigOverlay.dataset.placed) {
    sigOverlay.style.left  = '55%';
    sigOverlay.style.top   = '78%';
    sigOverlay.style.width = '28%';
    sigOverlay.dataset.placed = '1';
  }
}

sigOverlay?.addEventListener('mousedown', e => {
  if (e.target === sigResizeHandle || e.target === sigRotateHandle) return;
  sigDrag = true;
  const r = sigOverlay.getBoundingClientRect();
  sigDragOX = e.clientX - r.left;
  sigDragOY = e.clientY - r.top;
  e.preventDefault();
});
sigOverlay?.addEventListener('touchstart', e => {
  if (e.target === sigResizeHandle || e.target === sigRotateHandle) return;
  sigDrag = true;
  const r = sigOverlay.getBoundingClientRect();
  sigDragOX = e.touches[0].clientX - r.left;
  sigDragOY = e.touches[0].clientY - r.top;
  e.preventDefault();
}, { passive: false });

sigResizeHandle?.addEventListener('mousedown', e => {
  sigResize = true; sigResX = e.clientX;
  sigResW = sigOverlay.getBoundingClientRect().width;
  e.preventDefault(); e.stopPropagation();
});
sigResizeHandle?.addEventListener('touchstart', e => {
  sigResize = true; sigResX = e.touches[0].clientX;
  sigResW = sigOverlay.getBoundingClientRect().width;
  e.preventDefault(); e.stopPropagation();
}, { passive: false });

sigRotateHandle?.addEventListener('mousedown', e => {
  sigRotate = true;
  const c = getOverlayCenter();
  sigRotStartMouse = getMouseAngle(c.x, c.y, e.clientX, e.clientY);
  sigRotStartAngle = sigCurrentAngle;
  if (sigAngleBadge) sigAngleBadge.style.display = 'block';
  e.preventDefault(); e.stopPropagation();
});
sigRotateHandle?.addEventListener('touchstart', e => {
  sigRotate = true;
  const c = getOverlayCenter();
  sigRotStartMouse = getMouseAngle(c.x, c.y, e.touches[0].clientX, e.touches[0].clientY);
  sigRotStartAngle = sigCurrentAngle;
  if (sigAngleBadge) sigAngleBadge.style.display = 'block';
  e.preventDefault(); e.stopPropagation();
}, { passive: false });

function moveSigOverlay(cx, cy) {
  if (!sigPreviewContainer || !sigOverlay) return;
  const cr = sigPreviewContainer.getBoundingClientRect();
  const x  = cx - sigDragOX - cr.left;
  const y  = cy - sigDragOY - cr.top;
  sigOverlay.style.left = `${(x / cr.width)  * 100}%`;
  sigOverlay.style.top  = `${(y / cr.height) * 100}%`;
}
function resizeSigOverlay(cx) {
  if (!sigPreviewContainer || !sigOverlay) return;
  const cr = sigPreviewContainer.getBoundingClientRect();
  const nw = Math.max(40, sigResW + (cx - sigResX));
  sigOverlay.style.width = `${Math.min(90, (nw / cr.width) * 100)}%`;
}
function rotateSigOverlay(cx, cy) {
  const c    = getOverlayCenter();
  const cur  = getMouseAngle(c.x, c.y, cx, cy);
  const diff = cur - sigRotStartMouse;
  let   ang  = sigRotStartAngle + diff;
  [0, 90, 180, -90, 270, -180].forEach(snap => {
    if (Math.abs(ang - snap) < 4) ang = snap;
  });
  applyRotation(ang);
}

document.addEventListener('mousemove', e => {
  if (sigDrag)   moveSigOverlay(e.clientX, e.clientY);
  if (sigResize) resizeSigOverlay(e.clientX);
  if (sigRotate) rotateSigOverlay(e.clientX, e.clientY);
});
document.addEventListener('mouseup', () => {
  sigDrag = sigResize = false;
  if (sigRotate) { sigRotate = false; if (sigAngleBadge) sigAngleBadge.style.display = 'none'; }
});
document.addEventListener('touchmove', e => {
  if (sigDrag)   { moveSigOverlay(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  if (sigResize) { resizeSigOverlay(e.touches[0].clientX); e.preventDefault(); }
  if (sigRotate) { rotateSigOverlay(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
}, { passive: false });
document.addEventListener('touchend', () => {
  sigDrag = sigResize = false;
  if (sigRotate) { sigRotate = false; if (sigAngleBadge) sigAngleBadge.style.display = 'none'; }
});

// ── Confirm ───────────────────────────────────────────────────────────────────
sigConfirmBtn?.addEventListener('click', () => {
  refreshOverlay();
  const src = sigOverlayImg?.src;
  if (!src || sigOverlay?.style.display === 'none') {
    alert('Please draw or upload a signature first.'); return;
  }

  const cr    = sigPreviewContainer.getBoundingClientRect();
  const or    = sigOverlay.getBoundingClientRect();
  const xPct  = (or.left + or.width  / 2 - cr.left) / cr.width  - (or.width  / cr.width  / 2);
  const yPct  = (or.top  + or.height / 2 - cr.top)  / cr.height - (or.height / cr.height / 2);
  const wPct  = or.width  / cr.width;
  const hPct  = or.height / cr.height;

  const b64 = src.startsWith('data:') ? src.split(',')[1] : src;
  document.getElementById('sigData').value     = b64;
  document.getElementById('sigX').value        = xPct.toFixed(4);
  document.getElementById('sigY').value        = yPct.toFixed(4);
  document.getElementById('sigW').value        = wPct.toFixed(4);
  document.getElementById('sigH').value        = hPct.toFixed(4);
  document.getElementById('sigRotation').value = sigCurrentAngle.toFixed(1);

  const ps = document.getElementById('sigPageSelect');
  document.getElementById('sigPage').value = ps.value;

  const tw = document.getElementById('sigThumbWrap');
  if (tw) {
    let img = tw.querySelector('img.sig-set-thumb');
    if (!img) { img = document.createElement('img'); img.className = 'sig-set-thumb'; tw.appendChild(img); }
    img.src = src; img.style.cssText = 'display:block;max-height:40px;border-radius:4px;';
  }
  if (sigEmptyLbl) sigEmptyLbl.style.display = 'none';

  const meta = document.getElementById('sigMeta');
  if (meta) {
    const angleStr = sigCurrentAngle !== 0 ? ` · ${Math.round(sigCurrentAngle)}°` : '';
    meta.textContent = `${ps.options[ps.selectedIndex]?.text} · ${Math.round(wPct*100)}% wide${angleStr}`;
  }

  closeSigModal();
});

document.getElementById('sigPageSelect')?.addEventListener('change', e => {
  document.getElementById('sigPage').value = e.target.value;
});

// ─── [existing script.js content — paste your original script.js above this line] ───

// ══════════════════════════════════════════════════════════════════════════════
// PDF COMPRESSOR UI
// Appended below existing script.js content. No conflicts — fully self-contained.
// ══════════════════════════════════════════════════════════════════════════════
(function initCompressor() {
  const cmpDropzone      = document.getElementById('cmpDropzone');
  const cmpInput         = document.getElementById('cmpInput');
  const cmpFileBar       = document.getElementById('cmpFileBar');
  const cmpFileName      = document.getElementById('cmpFileName');
  const cmpFileSize      = document.getElementById('cmpFileSize');
  const cmpClearBtn      = document.getElementById('cmpClearBtn');
  const cmpSubmitBtn     = document.getElementById('cmpSubmitBtn');
  const cmpProgressWrap  = document.getElementById('cmpProgressWrap');
  const cmpProgressFill  = document.getElementById('cmpProgressFill');
  const cmpProgressPct   = document.getElementById('cmpProgressPct');
  const cmpProgressLabel = document.getElementById('cmpProgressLabel');
  const cmpResult        = document.getElementById('cmpResult');
  const cmpBefore        = document.getElementById('cmpBefore');
  const cmpAfter         = document.getElementById('cmpAfter');
  const cmpSavedBadge    = document.getElementById('cmpSavedBadge');
  const cmpStatus        = document.getElementById('cmpStatus');

  if (!cmpDropzone) return; // guard: section not present

  const fmtBytes = b =>
    b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(2)} MB`;

  let currentFile = null;

  function setFile(file) {
    if (!file || file.type !== 'application/pdf') {
      cmpStatus.textContent = 'Please select a PDF file.';
      cmpStatus.className   = 'status error';
      return;
    }
    currentFile = file;
    cmpFileName.textContent = file.name;
    cmpFileSize.textContent = fmtBytes(file.size);
    cmpFileBar.classList.add('visible');
    cmpDropzone.classList.add('has-file');
    cmpSubmitBtn.disabled = false;
    cmpResult.classList.remove('visible');
    cmpStatus.textContent = '';
  }

  function clearFile() {
    currentFile = null;
    cmpFileBar.classList.remove('visible');
    cmpDropzone.classList.remove('has-file');
    cmpSubmitBtn.disabled = true;
    cmpResult.classList.remove('visible');
    cmpStatus.textContent = '';
    cmpInput.value = '';
  }

  // Drop / click
  cmpDropzone.addEventListener('click', e => { if (e.target !== cmpInput) cmpInput.click(); });
  cmpDropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') cmpInput.click(); });
  cmpDropzone.addEventListener('dragover',  e => { e.preventDefault(); cmpDropzone.classList.add('drag-over'); });
  cmpDropzone.addEventListener('dragleave', () => cmpDropzone.classList.remove('drag-over'));
  cmpDropzone.addEventListener('drop', e => {
    e.preventDefault();
    cmpDropzone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  });
  cmpInput.addEventListener('change', () => { if (cmpInput.files[0]) setFile(cmpInput.files[0]); });
  cmpClearBtn.addEventListener('click', clearFile);

  // Submit
  cmpSubmitBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    const preset = document.querySelector('input[name="cmpPreset"]:checked')?.value ?? 'high';
    const fd = new FormData();
    fd.append('file', currentFile);
    fd.append('preset', preset);

    cmpSubmitBtn.disabled = true;
    cmpProgressWrap.style.display = 'block';
    cmpProgressFill.style.width   = '0%';
    cmpProgressPct.textContent    = '0%';
    cmpProgressLabel.textContent  = 'Compressing…';
    cmpResult.classList.remove('visible');
    cmpStatus.textContent = '';

    // Animated fake progress while server works
    let fake = 0;
    const timer = setInterval(() => {
      fake = Math.min(fake + Math.random() * 10, 88);
      cmpProgressFill.style.width = `${fake}%`;
      cmpProgressPct.textContent  = `${Math.round(fake)}%`;
    }, 250);

    try {
      const res = await fetch('/compress-pdf', { method: 'POST', body: fd });
      clearInterval(timer);
      cmpProgressFill.style.width = '100%';
      cmpProgressPct.textContent  = '100%';

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      // Read size stats from response headers before consuming the body
      const origSize = parseInt(res.headers.get('X-Original-Size')   ?? '0', 10);
      const newSize  = parseInt(res.headers.get('X-Compressed-Size') ?? '0', 10);
      const savedPct = parseInt(res.headers.get('X-Saved-Percent')   ?? '0', 10);

    const blob  = await res.blob();
const url   = URL.createObjectURL(blob);
const a     = document.createElement('a');
const disp  = res.headers.get('content-disposition') ?? '';
const utf8Match  = disp.match(/filename\*=UTF-8''([^;\s]+)/i);
const asciiMatch = disp.match(/filename="(.+?)"/);
a.href     = url;
a.download = utf8Match
  ? decodeURIComponent(utf8Match[1])
  : (asciiMatch?.[1] ?? 'compressed.pdf');
a.click();
URL.revokeObjectURL(url);

      // Show before/after stats
      if (origSize && newSize) {
        cmpBefore.textContent     = fmtBytes(origSize);
        cmpAfter.textContent      = fmtBytes(newSize);
        cmpSavedBadge.textContent = savedPct > 0 ? `↓ ${savedPct}% smaller` : 'Already optimal';
        cmpResult.classList.add('visible');
      }

      cmpProgressLabel.textContent = 'Done ✓';
      cmpStatus.textContent        = `Downloaded: ${a.download}`;
      cmpStatus.className          = 'status success';

    } catch (err) {
      clearInterval(timer);
      cmpProgressFill.style.width  = '0%';
      cmpProgressLabel.textContent = 'Error';
      cmpStatus.textContent        = err.message;
      cmpStatus.className          = 'status error';
    } finally {
      cmpSubmitBtn.disabled = false;
      setTimeout(() => { cmpProgressWrap.style.display = 'none'; }, 3500);
    }
  });
})();


// ══════════════════════════════════════════════════════════════════════════════
// SCANDRIFT PDF CANVAS EDITOR — Full rewrite
// Append this entire block to the bottom of public/script.js
// Features: whiteout, blackout, highlight, text (with formatting), draw,
//           arrow, line, circle, rectangle, stamp, eraser,
//           zoom, drag/resize annotations, page thumbnail sidebar, undo/redo
// ══════════════════════════════════════════════════════════════════════════════
(function initEditor() {

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const editorDropzone  = document.getElementById('editorDropzone');
  const editorInput     = document.getElementById('editorInput');
  const editorFileBar   = document.getElementById('editorFileBar');
  const editorFileName  = document.getElementById('editorFileName');
  const editorFileSz    = document.getElementById('editorFileSz');
  const editorClearBtn  = document.getElementById('editorClearBtn');
  const editorOpenBtn   = document.getElementById('editorOpenBtn');
  const editorModal     = document.getElementById('editorModal');
  const editorCloseBtn  = document.getElementById('editorCloseBtn');
  const editorCanvas    = document.getElementById('editorCanvas');
  const editorLoading   = document.getElementById('editorLoading');
  const editorLoadingTxt= document.getElementById('editorLoadingTxt');
  const editorStatus    = document.getElementById('editorStatus');
  const editorFilename  = document.getElementById('editorFilename');
  const editorPageInfo  = document.getElementById('editorPageInfo');
  const editorPrevPage  = document.getElementById('editorPrevPage');
  const editorNextPage  = document.getElementById('editorNextPage');
  const editorUndoBtn   = document.getElementById('editorUndo');
  const editorRedoBtn   = document.getElementById('editorRedo');
  const editorExportBtn = document.getElementById('editorExportBtn');
  const editorZoomIn    = document.getElementById('editorZoomIn');
  const editorZoomOut   = document.getElementById('editorZoomOut');
  const editorZoomReset = document.getElementById('editorZoomReset');
  const editorZoomLabel = document.getElementById('editorZoomLabel');
  const thumbSidebar    = document.getElementById('editorThumbSidebar');

  // Signature refs
  const editorSigBtn    = document.getElementById('editorSigBtn');
  const editorSigModal  = document.getElementById('editorSigModal');
  const editorSigClose  = document.getElementById('editorSigModalClose');
  const editorSigCanvas = document.getElementById('editorSigCanvas');
  const editorSigClear  = document.getElementById('editorSigClearBtn');
  const editorSigConfirm= document.getElementById('editorSigConfirm');
  const editorSigUploadZone = document.getElementById('editorSigUploadZone');
  const editorSigFileInput  = document.getElementById('editorSigFileInput');
  const editorSigTabDraw    = document.getElementById('editorSigTabDraw');
  const editorSigTabUpload  = document.getElementById('editorSigTabUpload');
  const editorSigPanelDraw  = document.getElementById('editorSigPanelDraw');
  const editorSigPanelUpload= document.getElementById('editorSigPanelUpload');
  const editorSigPreview    = document.getElementById('editorSigUploadPreview');

  // Tool option inputs
  const editorColor     = document.getElementById('editorColor');
  const editorFontSize  = document.getElementById('editorFontSize');
  const editorFontFamily= document.getElementById('editorFontFamily');
  const editorBold      = document.getElementById('editorBold');
  const editorItalic    = document.getElementById('editorItalic');
  const editorLineWidth = document.getElementById('editorLineWidth');
  const editorStampType = document.getElementById('editorStampType');

  if (!editorDropzone) return;

  const ctx = editorCanvas?.getContext('2d');
  if (!ctx) return;

  // ── State ─────────────────────────────────────────────────────────────────────
  const state = {
    pages:         [],   // base64 JPEG strings
    annotations:   [],   // array of arrays per page
    history:       [],   // undo stack
    future:        [],   // redo stack
    baseImages:    [],   // loaded Image objects
    currentPage:   0,
    tool:          'whiteout',
    color:         '#ffffff',
    fontSize:      18,
    fontFamily:    'sans-serif',
    bold:          false,
    italic:        false,
    lineWidth:     3,
    stampText:     'APPROVED',
    isDrawing:     false,
    startX:        0,
    startY:        0,
    currentPoints: [],
    scale:         1,    // fit-to-screen scale
    zoom:          1,    // user zoom multiplier
    filename:      'document',
    pageDims:      null, // original PDF page dimensions [{w, h}] in points
    // Signature state
    sigDataURL:    null, // current signature image data URL
    sigPlaced:     false,// whether sig overlay is on canvas
    sigOverlayX:   0.6,  // position as fraction of page
    sigOverlayY:   0.8,
    sigOverlayW:   0.25, // size as fraction of page
    // Selection / drag state
    selected:      null,  // { annIdx } or null
    dragMode:      null,  // 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br'
    dragOffX:      0,
    dragOffY:      0,
    dragOrigAnn:   null,
  };

  // ── File drop ─────────────────────────────────────────────────────────────────
  const fmtBytes = b => b < 1_048_576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1_048_576).toFixed(2)} MB`;
  let currentFile = null;

  function setEditorFile(file) {
    if (!file) return;
    currentFile = file;
    editorFileName.textContent = file.name;
    editorFileSz.textContent   = fmtBytes(file.size);
    editorFileBar.classList.add('visible');
    editorDropzone.classList.add('has-file');
    editorOpenBtn.disabled = false;
    state.filename = file.name.replace(/\.[^.]+$/, '');
  }
  function clearEditorFile() {
    currentFile = null;
    editorFileBar.classList.remove('visible');
    editorDropzone.classList.remove('has-file');
    editorOpenBtn.disabled = true;
    editorInput.value = '';
  }

  editorDropzone.addEventListener('click', e => { if (e.target !== editorInput) editorInput.click(); });
  editorDropzone.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') editorInput.click(); });
  editorDropzone.addEventListener('dragover',  e => { e.preventDefault(); editorDropzone.classList.add('drag-over'); });
  editorDropzone.addEventListener('dragleave', () => editorDropzone.classList.remove('drag-over'));
  editorDropzone.addEventListener('drop', e => {
    e.preventDefault(); editorDropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) setEditorFile(e.dataTransfer.files[0]);
  });
  editorInput.addEventListener('change', () => { if (editorInput.files[0]) setEditorFile(editorInput.files[0]); });
  editorClearBtn.addEventListener('click', clearEditorFile);

  // ── Open modal ────────────────────────────────────────────────────────────────
  editorOpenBtn.addEventListener('click', async () => {
    if (!currentFile) return;
    editorModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.querySelector('.scan-beam')?.style.setProperty('display','none');
    if (editorLoading) editorLoading.style.display = 'flex';
    if (editorFilename) editorFilename.textContent = state.filename;
    await loadEditorPages(currentFile);
  });

  function closeEditorModal() {
    editorModal.style.display = 'none';
    document.body.style.overflow = '';
    document.querySelector('.scan-beam')?.style.removeProperty('display');
    removeTextToolbar();
  }
  editorCloseBtn?.addEventListener('click', closeEditorModal);
  editorModal?.addEventListener('click', e => { if (e.target === editorModal) closeEditorModal(); });

  // ── Load pages ────────────────────────────────────────────────────────────────
  async function loadEditorPages(file) {
    if (editorLoadingTxt) editorLoadingTxt.textContent = 'Rendering pages…';
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/editor/pages', { method:'POST', body:fd });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||'Failed'); }
      const data = await res.json();
      const { pages } = data;

      state.pages       = pages;
      state.annotations = pages.map(() => []);
      state.history     = [];
      state.future      = [];
      state.zoom        = 1;
      state.selected    = null;
      state.pageDims    = data.pageDims ?? null; // original PDF page dimensions in points

      state.baseImages = await Promise.all(pages.map(b64 => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = `data:image/jpeg;base64,${b64}`;
      })));

      buildThumbnails();
      setEditorPage(0);
      if (editorLoading) editorLoading.style.display = 'none';
    } catch (err) {
      if (editorLoadingTxt) editorLoadingTxt.textContent = `Error: ${err.message}`;
    }
  }

  // ── Thumbnail sidebar ─────────────────────────────────────────────────────────
  function buildThumbnails() {
    if (!thumbSidebar) return;
    thumbSidebar.innerHTML = '';
    state.baseImages.forEach((img, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'editor-thumb' + (i === 0 ? ' active' : '');
      wrap.dataset.page = i;

      const canvas = document.createElement('canvas');
      const thumbW = 100, thumbH = Math.round(img.naturalHeight * thumbW / img.naturalWidth);
      canvas.width  = thumbW;
      canvas.height = thumbH;
      canvas.style.width  = thumbW + 'px';
      canvas.style.height = thumbH + 'px';
      const c = canvas.getContext('2d');
      c.drawImage(img, 0, 0, thumbW, thumbH);

      const label = document.createElement('span');
      label.textContent = i + 1;

      wrap.append(canvas, label);
      wrap.addEventListener('click', () => setEditorPage(i));
      thumbSidebar.appendChild(wrap);
    });
  }

  function updateThumbnail(pageIdx) {
    if (!thumbSidebar) return;
    const wrap   = thumbSidebar.querySelector(`[data-page="${pageIdx}"]`);
    if (!wrap) return;
    const canvas = wrap.querySelector('canvas');
    if (!canvas) return;
    const img = state.baseImages[pageIdx];
    const c   = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    const scale = canvas.width / img.naturalWidth;
    c.save();
    c.scale(scale, scale);
    for (const ann of state.annotations[pageIdx]) drawAnnotation(c, ann);
    c.restore();
  }

  // ── Page navigation ───────────────────────────────────────────────────────────
  function setEditorPage(idx) {
    state.currentPage = Math.max(0, Math.min(idx, state.pages.length - 1));
    state.selected    = null;
    removeTextToolbar();
    const img = state.baseImages[state.currentPage];
    const dpr = window.devicePixelRatio || 1;

    const area = document.getElementById('editorCanvasArea');
    const maxW = (area ? area.clientWidth  : window.innerWidth  - 300) - 48;
    const maxH = (area ? area.clientHeight : window.innerHeight - 120) - 48;

    const scaleW = maxW / img.naturalWidth;
    const scaleH = maxH / img.naturalHeight;
    state.scale  = Math.min(scaleW, scaleH, 1.5);

    applyZoom();

    // Update thumbnail active state
    thumbSidebar?.querySelectorAll('.editor-thumb').forEach((el, i) => {
      el.classList.toggle('active', i === state.currentPage);
    });
    // Scroll thumbnail into view
    thumbSidebar?.querySelector('.editor-thumb.active')?.scrollIntoView({ block:'nearest' });

    if (editorPageInfo) editorPageInfo.textContent = `${state.currentPage + 1} / ${state.pages.length}`;
    if (editorPrevPage) editorPrevPage.disabled = state.currentPage === 0;
    if (editorNextPage) editorNextPage.disabled = state.currentPage === state.pages.length - 1;
  }

  editorPrevPage?.addEventListener('click', () => setEditorPage(state.currentPage - 1));
  editorNextPage?.addEventListener('click', () => setEditorPage(state.currentPage + 1));

  // ── Zoom ──────────────────────────────────────────────────────────────────────
  function applyZoom() {
    if (!state.baseImages[state.currentPage]) return;
    const img = state.baseImages[state.currentPage];
    const dpr = window.devicePixelRatio || 1;
    const totalScale = state.scale * state.zoom;

    const cssW = Math.round(img.naturalWidth  * totalScale);
    const cssH = Math.round(img.naturalHeight * totalScale);

    editorCanvas.style.width  = cssW + 'px';
    editorCanvas.style.height = cssH + 'px';
    editorCanvas.width        = Math.round(cssW * dpr);
    editorCanvas.height       = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (editorZoomLabel) editorZoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    render();
  }

  editorZoomIn?.addEventListener('click', () => {
    state.zoom = Math.min(state.zoom * 1.25, 5);
    applyZoom();
  });
  editorZoomOut?.addEventListener('click', () => {
    state.zoom = Math.max(state.zoom / 1.25, 0.2);
    applyZoom();
  });
  editorZoomReset?.addEventListener('click', () => {
    state.zoom = 1;
    applyZoom();
  });

  // Mouse wheel zoom
  document.getElementById('editorCanvasArea')?.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    state.zoom = Math.max(0.2, Math.min(5, state.zoom * delta));
    applyZoom();
  }, { passive: false });

  // Pages are rendered at 300 DPI server-side.
  // Natural image coords = pixel coords at 300 DPI.
  function getCanvasCoords(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    const cx   = src.clientX - rect.left;
    const cy   = src.clientY - rect.top;
    const totalScale = state.scale * state.zoom;
    return { x: cx / totalScale, y: cy / totalScale };
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function render() {
    if (!ctx || !state.baseImages[state.currentPage]) return;
    const img  = state.baseImages[state.currentPage];
    const cssW = parseInt(editorCanvas.style.width)  || editorCanvas.width;
    const cssH = parseInt(editorCanvas.style.height) || editorCanvas.height;
    const totalScale = state.scale * state.zoom;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(img, 0, 0, cssW, cssH);

    ctx.save();
    ctx.scale(totalScale, totalScale);
    for (let i = 0; i < state.annotations[state.currentPage].length; i++) {
      const ann = state.annotations[state.currentPage][i];
      drawAnnotation(ctx, ann);
      // Draw selection handles
      if (state.selected?.annIdx === i) drawSelectionHandles(ctx, ann);
    }
    ctx.restore();
  }

  // ── Draw annotation ───────────────────────────────────────────────────────────
  function drawAnnotation(c, ann) {
    c.save();
    switch (ann.type) {
      case 'whiteout':
        c.fillStyle = '#ffffff';
        c.fillRect(ann.x, ann.y, ann.w, ann.h);
        break;

      case 'blackout':
        c.fillStyle = '#000000';
        c.fillRect(ann.x, ann.y, ann.w, ann.h);
        break;

      case 'highlight':
        c.globalAlpha = 0.38;
        c.fillStyle   = ann.color;
        c.fillRect(ann.x, ann.y, ann.w, ann.h);
        break;

      case 'rect-outline':
        c.strokeStyle = ann.color;
        c.lineWidth   = ann.lineWidth ?? 3;
        c.strokeRect(ann.x, ann.y, ann.w, ann.h);
        break;

      case 'circle':
        c.strokeStyle = ann.color;
        c.lineWidth   = ann.lineWidth ?? 3;
        c.beginPath();
        c.ellipse(ann.x + ann.w/2, ann.y + ann.h/2, Math.abs(ann.w/2), Math.abs(ann.h/2), 0, 0, Math.PI*2);
        c.stroke();
        break;

      case 'arrow': {
        const dx = ann.x2 - ann.x1, dy = ann.y2 - ann.y1;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len < 2) break;
        const ux = dx/len, uy = dy/len;
        const hw = Math.max(8, (ann.lineWidth??3) * 3);
        c.strokeStyle = ann.color;
        c.fillStyle   = ann.color;
        c.lineWidth   = ann.lineWidth ?? 3;
        c.lineCap     = 'round';
        c.beginPath();
        c.moveTo(ann.x1, ann.y1);
        c.lineTo(ann.x2 - ux*hw*0.8, ann.y2 - uy*hw*0.8);
        c.stroke();
        // Arrowhead
        c.beginPath();
        c.moveTo(ann.x2, ann.y2);
        c.lineTo(ann.x2 - ux*hw - uy*hw*0.5, ann.y2 - uy*hw + ux*hw*0.5);
        c.lineTo(ann.x2 - ux*hw + uy*hw*0.5, ann.y2 - uy*hw - ux*hw*0.5);
        c.closePath();
        c.fill();
        break;
      }

      case 'line':
        c.strokeStyle = ann.color;
        c.lineWidth   = ann.lineWidth ?? 3;
        c.lineCap     = 'round';
        c.beginPath();
        c.moveTo(ann.x1, ann.y1);
        c.lineTo(ann.x2, ann.y2);
        c.stroke();
        break;

      case 'text': {
        const parts = [];
        if (ann.bold)   parts.push('bold');
        if (ann.italic) parts.push('italic');
        parts.push(`${ann.fontSize ?? 18}px`);
        parts.push(ann.fontFamily ?? 'sans-serif');
        c.font      = parts.join(' ');
        c.fillStyle = ann.color ?? '#000000';
        c.fillText(ann.text, ann.x, ann.y + (ann.fontSize ?? 18));
        break;
      }

      case 'stamp': {
        const fs = ann.fontSize ?? 28;
        c.font        = `bold ${fs}px sans-serif`;
        c.strokeStyle = ann.color;
        c.fillStyle   = ann.color;
        c.lineWidth   = 2.5;
        c.globalAlpha = 0.72;
        const metrics = c.measureText(ann.text);
        const pad = 10;
        c.strokeRect(ann.x - pad, ann.y - fs * 0.8 - pad, metrics.width + pad*2, fs + pad*2);
        c.fillText(ann.text, ann.x, ann.y);
        break;
      }

      case 'pen':
        if (!ann.points || ann.points.length < 2) break;
        c.strokeStyle = ann.color;
        c.lineWidth   = ann.lineWidth ?? 3;
        c.lineCap     = 'round';
        c.lineJoin    = 'round';
        c.beginPath();
        c.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          const pm = ann.points[i-1], pc = ann.points[i];
          c.quadraticCurveTo(pm.x, pm.y, (pm.x+pc.x)/2, (pm.y+pc.y)/2);
        }
        c.stroke();
        break;

      case 'signature': {
        // Load image from dataURL and draw it
        if (!ann._img) {
          const img = new Image();
          img.src = ann.dataURL;
          ann._img = img;
          img.onload = () => render(); // re-render once loaded
        }
        if (ann._img?.complete && ann._img.naturalWidth > 0) {
          c.drawImage(ann._img, ann.x, ann.y, ann.w, ann.h);
        }
        break;
      }
    }
    c.restore();
  }

  // ── Selection handles ─────────────────────────────────────────────────────────
  const HANDLE_SIZE = 8;

  function getAnnotationBounds(ann) {
    if (['whiteout','blackout','highlight','rect-outline','circle'].includes(ann.type)) {
      return { x: ann.x, y: ann.y, w: ann.w, h: ann.h };
    }
    if (['arrow','line'].includes(ann.type)) {
      return {
        x: Math.min(ann.x1, ann.x2),
        y: Math.min(ann.y1, ann.y2),
        w: Math.abs(ann.x2 - ann.x1),
        h: Math.abs(ann.y2 - ann.y1),
      };
    }
    if (ann.type === 'text') {
      // Measure actual text width using a temp canvas
      const fs     = ann.fontSize ?? 18;
      const weight = ann.bold   ? 'bold'   : 'normal';
      const fstyle = ann.italic ? 'italic' : 'normal';
      const family = ann.fontFamily ?? 'sans-serif';
      const tmp = document.createElement('canvas').getContext('2d');
      tmp.font = `${fstyle} ${weight} ${fs}px ${family}`;
      const w = tmp.measureText(ann.text || '').width || fs * 6;
      return { x: ann.x, y: ann.y, w: Math.max(w, 40), h: fs * 1.5 };
    }
    if (ann.type === 'stamp') {
      const fs  = ann.fontSize ?? 28;
      const tmp = document.createElement('canvas').getContext('2d');
      tmp.font  = `bold ${fs}px sans-serif`;
      const w   = tmp.measureText(ann.text || '').width || fs * 5;
      return { x: ann.x - 10, y: ann.y - fs * 0.8 - 10, w: w + 20, h: fs + 20 };
    }
    if (ann.type === 'pen' && ann.points?.length) {
      const xs = ann.points.map(p=>p.x), ys = ann.points.map(p=>p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs)-x, h: Math.max(...ys)-y };
    }
    if (ann.type === 'signature') {
      return { x: ann.x, y: ann.y, w: ann.w, h: ann.h };
    }
    return null;
  }

  function drawSelectionHandles(c, ann) {
    const b = getAnnotationBounds(ann);
    if (!b) return;
    c.save();
    c.strokeStyle = '#2563eb';
    c.fillStyle   = '#ffffff';
    c.lineWidth   = 1.5;
    // Dashed border
    c.setLineDash([4, 3]);
    c.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    c.setLineDash([]);
    // Corner handles
    const hs = HANDLE_SIZE;
    const corners = [
      [b.x - hs/2,       b.y - hs/2      ],
      [b.x + b.w - hs/2, b.y - hs/2      ],
      [b.x - hs/2,       b.y + b.h - hs/2],
      [b.x + b.w - hs/2, b.y + b.h - hs/2],
    ];
    for (const [cx, cy] of corners) {
      c.fillRect(cx, cy, hs, hs);
      c.strokeRect(cx, cy, hs, hs);
    }
    c.restore();
  }

  function getHandleAtPoint(ann, x, y) {
    const b = getAnnotationBounds(ann);
    if (!b) return null;
    const hs = HANDLE_SIZE;
    const handles = [
      { name:'tl', x: b.x - hs/2,       y: b.y - hs/2       },
      { name:'tr', x: b.x + b.w - hs/2, y: b.y - hs/2       },
      { name:'bl', x: b.x - hs/2,       y: b.y + b.h - hs/2 },
      { name:'br', x: b.x + b.w - hs/2, y: b.y + b.h - hs/2 },
    ];
    for (const h of handles) {
      if (x >= h.x - 2 && x <= h.x + hs + 2 && y >= h.y - 2 && y <= h.y + hs + 2) {
        return h.name;
      }
    }
    return null;
  }

  function pointInAnnotation(ann, x, y, pad = 6) {
    const b = getAnnotationBounds(ann);
    if (!b) return false;
    const x1 = Math.min(b.x, b.x + b.w) - pad;
    const y1 = Math.min(b.y, b.y + b.h) - pad;
    const x2 = Math.max(b.x, b.x + b.w) + pad;
    const y2 = Math.max(b.y, b.y + b.h) + pad;
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  }

  // ── Tool buttons ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.editor-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.editor-tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tool     = btn.dataset.tool;
      state.selected = null;
      updateToolOpts();
      render();
    });
  });

  const TOOL_DEFAULTS = {
    whiteout:     { color:'#ffffff' },
    blackout:     { color:'#000000' },
    highlight:    { color:'#fbbf24' },
    'rect-outline':{ color:'#dc2626', lineWidth:3 },
    circle:       { color:'#2563eb', lineWidth:3 },
    arrow:        { color:'#dc2626', lineWidth:3 },
    line:         { color:'#374151', lineWidth:3 },
    text:         { color:'#000000' },
    stamp:        { color:'#dc2626' },
    pen:          { color:'#1e3a8a', lineWidth:3 },
    eraser:       {},
    select:       {},
  };

  function updateToolOpts() {
    const tool = state.tool;
    const def  = TOOL_DEFAULTS[tool] ?? {};
    if (def.color !== undefined) { state.color = def.color; if(editorColor) editorColor.value = state.color; }
    if (def.lineWidth !== undefined) { state.lineWidth = def.lineWidth; if(editorLineWidth) editorLineWidth.value = state.lineWidth; }

    // Show/hide option rows
    const show = id => { const el = document.getElementById(id); if(el) el.style.display=''; };
    const hide = id => { const el = document.getElementById(id); if(el) el.style.display='none'; };

    hide('editorColorRow'); hide('editorFontRow'); hide('editorWidthRow'); hide('editorStampRow');

    if (['highlight','rect-outline','circle','arrow','line','pen','stamp'].includes(tool)) show('editorColorRow');
    if (tool === 'text') { show('editorColorRow'); show('editorFontRow'); }
    if (['pen','rect-outline','circle','arrow','line'].includes(tool)) show('editorWidthRow');
    if (tool === 'stamp') show('editorStampRow');
  }

  editorColor?.addEventListener('input',  () => { state.color      = editorColor.value; });
  editorFontSize?.addEventListener('change', () => { state.fontSize = parseInt(editorFontSize.value); });
  editorFontFamily?.addEventListener('change', () => { state.fontFamily = editorFontFamily.value; });
  editorBold?.addEventListener('change',   () => { state.bold      = editorBold.checked; });
  editorItalic?.addEventListener('change', () => { state.italic    = editorItalic.checked; });
  editorLineWidth?.addEventListener('change', () => { state.lineWidth = parseInt(editorLineWidth.value); });
  editorStampType?.addEventListener('change', () => { state.stampText = editorStampType.value; });

  // ── History ───────────────────────────────────────────────────────────────────
  function saveHistory() {
    state.history.push(JSON.parse(JSON.stringify(state.annotations)));
    state.future = [];
    if (state.history.length > 80) state.history.shift();
  }
  function undo() {
    if (!state.history.length) return;
    state.future.push(JSON.parse(JSON.stringify(state.annotations)));
    state.annotations = state.history.pop();
    state.selected = null;
    render();
    updateThumbnail(state.currentPage);
  }
  function redo() {
    if (!state.future.length) return;
    state.history.push(JSON.parse(JSON.stringify(state.annotations)));
    state.annotations = state.future.pop();
    state.selected = null;
    render();
    updateThumbnail(state.currentPage);
  }
  editorUndoBtn?.addEventListener('click', undo);
  editorRedoBtn?.addEventListener('click', redo);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!editorModal || editorModal.style.display === 'none') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey||e.metaKey) && e.key==='z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey||e.metaKey) && (e.key==='y'||(e.key==='z'&&e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selected !== null) {
        saveHistory();
        state.annotations[state.currentPage].splice(state.selected.annIdx, 1);
        state.selected = null;
        render();
        updateThumbnail(state.currentPage);
      }
      return;
    }
    if (e.key === 'Escape') { state.selected = null; render(); return; }

    const shortcuts = {
      w:'whiteout', b:'blackout', h:'highlight',
      r:'rect-outline', c:'circle', a:'arrow',
      l:'line', t:'text', p:'pen',
      s:'stamp', e:'eraser', v:'select',
    };
    if (shortcuts[e.key] && !e.ctrlKey && !e.metaKey) {
      state.tool = shortcuts[e.key];
      document.querySelectorAll('.editor-tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === state.tool);
      });
      updateToolOpts();
    }
    // Zoom shortcuts
    if ((e.ctrlKey||e.metaKey) && e.key==='+') { e.preventDefault(); state.zoom = Math.min(state.zoom*1.25,5); applyZoom(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='-') { e.preventDefault(); state.zoom = Math.max(state.zoom/1.25,0.2); applyZoom(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='0') { e.preventDefault(); state.zoom=1; applyZoom(); }
  });

  // ── Pointer events ────────────────────────────────────────────────────────────
  editorCanvas.addEventListener('mousedown',  onPointerDown, { passive:false });
  editorCanvas.addEventListener('mousemove',  onPointerMove, { passive:false });
  editorCanvas.addEventListener('mouseup',    onPointerUp,   { passive:false });
  editorCanvas.addEventListener('mouseleave', onPointerLeave,{ passive:false });
  editorCanvas.addEventListener('touchstart', e=>{e.preventDefault();onPointerDown(e);},{passive:false});
  editorCanvas.addEventListener('touchmove',  e=>{e.preventDefault();onPointerMove(e);},{passive:false});
  editorCanvas.addEventListener('touchend',   e=>{e.preventDefault();onPointerUp(e);},  {passive:false});

  function getEventCoords(e) {
    return e.touches ? getCanvasCoords({ touches: e.touches }) : getCanvasCoords(e);
  }

  function onPointerDown(e) {
    if (!state.pages.length) return;
    const { x, y } = getEventCoords(e);
    state.startX = x; state.startY = y;

    // ── Eraser ──────────────────────────────────────────────────────────────
    if (state.tool === 'eraser') { eraseAt(x, y); return; }

    // ── Stamp ───────────────────────────────────────────────────────────────
    if (state.tool === 'stamp') {
      saveHistory();
      state.annotations[state.currentPage].push({
        type:'stamp', x, y,
        text: state.stampText,
        color: state.color,
        fontSize: 28,
      });
      render();
      updateThumbnail(state.currentPage);
      return;
    }

    // ── Text ────────────────────────────────────────────────────────────────
    if (state.tool === 'text') { placeTextInput(x, y); return; }

    // ── Select / move / resize ───────────────────────────────────────────────
    if (state.tool === 'select') {
      const anns = state.annotations[state.currentPage];

      // If something already selected, check its handles first
      if (state.selected !== null) {
        const ann    = anns[state.selected.annIdx];
        if (ann) {
          const handle = getHandleAtPoint(ann, x, y);
          if (handle) {
            state.dragMode    = 'resize-' + handle;
            state.dragOrigAnn = JSON.parse(JSON.stringify(ann));
            state.isDrawing   = true;
            return;
          }
          // Click inside the already-selected annotation to move it
          if (pointInAnnotation(ann, x, y)) {
            const b = getAnnotationBounds(ann);
            state.dragMode    = 'move';
            state.dragOffX    = x - (b?.x ?? 0);
            state.dragOffY    = y - (b?.y ?? 0);
            state.dragOrigAnn = JSON.parse(JSON.stringify(ann));
            state.isDrawing   = true;
            return;
          }
        }
      }

      // Click on any annotation (topmost first)
      for (let i = anns.length - 1; i >= 0; i--) {
        if (pointInAnnotation(anns[i], x, y)) {
          const b = getAnnotationBounds(anns[i]);
          state.selected    = { annIdx: i };
          state.dragMode    = 'move';
          state.dragOffX    = x - (b?.x ?? 0);
          state.dragOffY    = y - (b?.y ?? 0);
          state.dragOrigAnn = JSON.parse(JSON.stringify(anns[i]));
          state.isDrawing   = true;
          render();
          // Show float toolbar for text annotations
          if (anns[i].type === 'text') showTextToolbar(i);
          else removeTextToolbar();
          return;
        }
      }

      // Clicked empty space — deselect
      state.selected = null;
      removeTextToolbar();
      render();
      return;
    }

    // ── Drawing tools ────────────────────────────────────────────────────────
    state.isDrawing = true;
    if (state.tool === 'pen') state.currentPoints = [{ x, y }];
  }

  function onPointerMove(e) {
    if (!state.pages.length) return;
    const { x, y } = getEventCoords(e);

    // Cursor style
    if (state.tool === 'select') {
      let cursor = 'default';
      if (state.selected !== null) {
        const ann    = state.annotations[state.currentPage][state.selected.annIdx];
        const handle = getHandleAtPoint(ann, x, y);
        if (handle) { cursor = handle==='tl'||handle==='br' ? 'nwse-resize' : 'nesw-resize'; }
        else if (pointInAnnotation(ann, x, y)) cursor = 'move';
      }
      editorCanvas.style.cursor = cursor;
    }

    if (!state.isDrawing) return;

    // Drag/resize selected annotation
    if (state.tool === 'select' && state.selected !== null && state.dragMode) {
      const ann  = state.annotations[state.currentPage][state.selected.annIdx];
      const orig = state.dragOrigAnn;
      const b    = getAnnotationBounds(orig);

      if (state.dragMode === 'move') {
        const dx = x - state.startX, dy = y - state.startY;
        moveAnnotation(ann, orig, dx, dy);
      } else {
        // Resize — update bounds based on handle
        const dx = x - state.startX, dy = y - state.startY;
        resizeAnnotation(ann, orig, state.dragMode, dx, dy);
      }
      render();
      // Reposition float toolbar if dragging a text annotation
      if (ann?.type === 'text') {
        removeTextToolbar();
        showTextToolbar(state.selected.annIdx);
      }
      return;
    }

    if (state.tool === 'pen') state.currentPoints.push({ x, y });

    // Live preview
    render();
    const totalScale = state.scale * state.zoom;
    ctx.save();
    ctx.scale(totalScale, totalScale);
    drawPreview(ctx, x, y);
    ctx.restore();
  }

  function onPointerUp(e) {
    if (!state.isDrawing) return;
    const src = e.changedTouches ? e.changedTouches[0] : e;
    const { x, y } = getCanvasCoords(src);

    if (state.tool === 'select') {
      if (state.dragMode && state.dragOrigAnn) {
        saveHistory();
        // The annotation is already updated in place during move — just record
      }
      state.dragMode = null;
      state.dragOrigAnn = null;
      state.isDrawing = false;
      render();
      updateThumbnail(state.currentPage);
      return;
    }

    state.isDrawing = false;
    const nx = Math.min(state.startX, x), ny = Math.min(state.startY, y);
    const nw = Math.abs(x - state.startX), nh = Math.abs(y - state.startY);

    if (state.tool === 'pen') {
      if (state.currentPoints.length < 3) { render(); return; }
      saveHistory();
      state.annotations[state.currentPage].push({
        type:'pen', points:[...state.currentPoints],
        color:state.color, lineWidth:state.lineWidth,
      });
      state.currentPoints = [];
    } else if (['arrow','line'].includes(state.tool)) {
      if (Math.hypot(x - state.startX, y - state.startY) < 4) { render(); return; }
      saveHistory();
      state.annotations[state.currentPage].push({
        type:state.tool,
        x1:state.startX, y1:state.startY, x2:x, y2:y,
        color:state.color, lineWidth:state.lineWidth,
      });
    } else if (['whiteout','blackout','highlight','rect-outline','circle'].includes(state.tool)) {
      if (nw < 4 && nh < 4) { render(); return; }
      saveHistory();
      state.annotations[state.currentPage].push({
        type:state.tool, x:nx, y:ny, w:nw, h:nh,
        color:state.color, lineWidth:state.lineWidth,
      });
    }

    render();
    updateThumbnail(state.currentPage);
  }

  function onPointerLeave() {
    if (state.isDrawing && state.tool === 'pen' && state.currentPoints.length > 3) {
      saveHistory();
      state.annotations[state.currentPage].push({
        type:'pen', points:[...state.currentPoints],
        color:state.color, lineWidth:state.lineWidth,
      });
      state.currentPoints = [];
      state.isDrawing = false;
      render();
      updateThumbnail(state.currentPage);
    }
  }

  function drawPreview(c, x, y) {
    c.save();
    c.globalAlpha = 0.7;
    switch (state.tool) {
      case 'whiteout':    c.fillStyle=  '#ffffff'; c.fillRect(state.startX,state.startY,x-state.startX,y-state.startY); break;
      case 'blackout':    c.fillStyle=  '#000000'; c.fillRect(state.startX,state.startY,x-state.startX,y-state.startY); break;
      case 'highlight':   c.fillStyle=state.color; c.globalAlpha=0.38; c.fillRect(state.startX,state.startY,x-state.startX,y-state.startY); break;
      case 'rect-outline':c.strokeStyle=state.color;c.lineWidth=state.lineWidth;c.strokeRect(state.startX,state.startY,x-state.startX,y-state.startY); break;
      case 'circle': {
        const w=x-state.startX,h=y-state.startY;
        c.strokeStyle=state.color;c.lineWidth=state.lineWidth;
        c.beginPath();c.ellipse(state.startX+w/2,state.startY+h/2,Math.abs(w/2),Math.abs(h/2),0,0,Math.PI*2);c.stroke();
        break;
      }
      case 'arrow':
      case 'line':
        drawAnnotation(c,{type:state.tool,x1:state.startX,y1:state.startY,x2:x,y2:y,color:state.color,lineWidth:state.lineWidth});
        break;
      case 'pen':
        if (state.currentPoints.length>1) drawAnnotation(c,{type:'pen',points:state.currentPoints,color:state.color,lineWidth:state.lineWidth});
        break;
    }
    c.restore();
  }

  // ── Move / resize helpers ─────────────────────────────────────────────────────
  function moveAnnotation(ann, orig, dx, dy) {
    if (['whiteout','blackout','highlight','rect-outline','circle'].includes(ann.type)) {
      ann.x = orig.x + dx; ann.y = orig.y + dy;
    } else if (['arrow','line'].includes(ann.type)) {
      ann.x1=orig.x1+dx; ann.y1=orig.y1+dy; ann.x2=orig.x2+dx; ann.y2=orig.y2+dy;
    } else if (['text','stamp'].includes(ann.type)) {
      ann.x=orig.x+dx; ann.y=orig.y+dy;
    } else if (ann.type === 'signature') {
      ann.x=orig.x+dx; ann.y=orig.y+dy;
    } else if (ann.type==='pen') {
      ann.points = orig.points.map(p=>({x:p.x+dx, y:p.y+dy}));
    }
  }

  function resizeAnnotation(ann, orig, handle, dx, dy) {
    if (['whiteout','blackout','highlight','rect-outline','circle'].includes(ann.type)) {
      switch (handle) {
        case 'resize-tl': ann.x=orig.x+dx; ann.y=orig.y+dy; ann.w=Math.max(10,orig.w-dx); ann.h=Math.max(10,orig.h-dy); break;
        case 'resize-tr': ann.y=orig.y+dy; ann.w=Math.max(10,orig.w+dx); ann.h=Math.max(10,orig.h-dy); break;
        case 'resize-bl': ann.x=orig.x+dx; ann.w=Math.max(10,orig.w-dx); ann.h=Math.max(10,orig.h+dy); break;
        case 'resize-br': ann.w=Math.max(10,orig.w+dx); ann.h=Math.max(10,orig.h+dy); break;
      }
      return;
    }
    // For text/stamp — resize by scaling fontSize
    if (ann.type === 'text' || ann.type === 'stamp') {
      const origFs = orig.fontSize ?? 18;
      const b      = getAnnotationBounds(orig);
      if (!b || b.h < 1) return;
      let newH = b.h;
      switch (handle) {
        case 'resize-tl': case 'resize-tr': newH = b.h - dy; break;
        case 'resize-bl': case 'resize-br': newH = b.h + dy; break;
      }
      const ratio = Math.max(0.3, newH / b.h);
      ann.fontSize = Math.max(6, Math.round(origFs * ratio));
      if (handle === 'resize-tl' || handle === 'resize-tr') {
        ann.y = orig.y + (b.h - (ann.fontSize * 1.5));
      }
    }
    // For signature — resize width/height directly, maintain aspect ratio
    if (ann.type === 'signature') {
      switch (handle) {
        case 'resize-tl': ann.x=orig.x+dx; ann.y=orig.y+dy; ann.w=Math.max(20,orig.w-dx); ann.h=Math.max(10,orig.h-dy); break;
        case 'resize-tr': ann.y=orig.y+dy; ann.w=Math.max(20,orig.w+dx); ann.h=Math.max(10,orig.h-dy); break;
        case 'resize-bl': ann.x=orig.x+dx; ann.w=Math.max(20,orig.w-dx); ann.h=Math.max(10,orig.h+dy); break;
        case 'resize-br': ann.w=Math.max(20,orig.w+dx); ann.h=Math.max(10,orig.h+dy); break;
      }
    }
  }

  // ── Eraser ────────────────────────────────────────────────────────────────────
  function eraseAt(x, y) {
    const anns = state.annotations[state.currentPage];
    for (let i = anns.length - 1; i >= 0; i--) {
      if (pointInAnnotation(anns[i], x, y, 12)) {
        saveHistory();
        anns.splice(i, 1);
        state.selected = null;
        render();
        updateThumbnail(state.currentPage);
        return;
      }
    }
  }

  // ── Floating text format toolbar ─────────────────────────────────────────────
  // Shows above a selected text annotation with bold/italic/color/size controls
  function showTextToolbar(annIdx) {
    removeTextToolbar();
    const ann  = state.annotations[state.currentPage][annIdx];
    if (!ann || ann.type !== 'text') return;

    const b    = getAnnotationBounds(ann);
    if (!b) return;

    const rect       = editorCanvas.getBoundingClientRect();
    const totalScale = state.scale * state.zoom;

    const toolbar = document.createElement('div');
    toolbar.id    = 'editorFloatToolbar';
    toolbar.style.cssText = `
      position: fixed;
      left: ${rect.left + b.x * totalScale}px;
      top:  ${rect.top  + b.y * totalScale - 46}px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--surface, #1a1a1a);
      border: 1px solid var(--border-mid, #333);
      border-radius: 8px;
      padding: 4px 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      z-index: 99998;
      font-family: 'IBM Plex Mono', monospace;
      white-space: nowrap;
    `;

    const btn = (label, title, active, onClick) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.style.cssText = `
        background: ${active ? 'var(--accent, #c0392b)' : 'transparent'};
        border: 1px solid ${active ? 'var(--accent, #c0392b)' : 'var(--border-mid, #444)'};
        border-radius: 4px;
        color: ${active ? '#fff' : 'var(--text-2, #ccc)'};
        cursor: pointer;
        font-size: 0.75rem;
        font-weight: bold;
        padding: 2px 7px;
        min-width: 26px;
        transition: all 0.1s;
      `;
      b.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); onClick(); });
      return b;
    };

    const sep = () => {
      const d = document.createElement('div');
      d.style.cssText = 'width:1px;height:20px;background:var(--border-mid,#444);margin:0 2px;';
      return d;
    };

    // Bold
    toolbar.appendChild(btn('B', 'Bold', ann.bold, () => {
      saveHistory();
      ann.bold = !ann.bold;
      render();
      updateThumbnail(state.currentPage);
      showTextToolbar(annIdx);
    }));

    // Italic
    toolbar.appendChild(btn('I', 'Italic', ann.italic, () => {
      saveHistory();
      ann.italic = !ann.italic;
      render();
      updateThumbnail(state.currentPage);
      showTextToolbar(annIdx);
    }));

    toolbar.appendChild(sep());

    // Font size - decrease
    toolbar.appendChild(btn('−', 'Smaller', false, () => {
      saveHistory();
      ann.fontSize = Math.max(6, (ann.fontSize ?? 18) - 2);
      render();
      updateThumbnail(state.currentPage);
      showTextToolbar(annIdx);
    }));

    // Font size display
    const sizeLabel = document.createElement('span');
    sizeLabel.textContent = ann.fontSize ?? 18;
    sizeLabel.style.cssText = 'font-size:0.7rem;color:var(--text-3,#888);min-width:22px;text-align:center;';
    toolbar.appendChild(sizeLabel);

    // Font size - increase
    toolbar.appendChild(btn('+', 'Larger', false, () => {
      saveHistory();
      ann.fontSize = Math.min(200, (ann.fontSize ?? 18) + 2);
      render();
      updateThumbnail(state.currentPage);
      showTextToolbar(annIdx);
    }));

    toolbar.appendChild(sep());

    // Font family
    const fontSel = document.createElement('select');
    fontSel.style.cssText = `
      background: var(--surface-2, #222);
      border: 1px solid var(--border-mid, #444);
      border-radius: 4px;
      color: var(--text-2, #ccc);
      font-size: 0.7rem;
      padding: 2px 4px;
      cursor: pointer;
    `;
    [['sans-serif','Sans'],['serif','Serif'],['monospace','Mono'],
     ['Georgia','Georgia'],['Arial','Arial'],['Times New Roman','Times']].forEach(([v,l]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = l;
      if (v === (ann.fontFamily ?? 'sans-serif')) o.selected = true;
      fontSel.appendChild(o);
    });
    fontSel.addEventListener('mousedown', e => e.stopPropagation());
    fontSel.addEventListener('change', () => {
      saveHistory();
      ann.fontFamily = fontSel.value;
      render();
      updateThumbnail(state.currentPage);
    });
    toolbar.appendChild(fontSel);

    toolbar.appendChild(sep());

    // Color picker
    const colorInp = document.createElement('input');
    colorInp.type  = 'color';
    colorInp.value = ann.color ?? '#000000';
    colorInp.style.cssText = 'width:28px;height:24px;border-radius:4px;border:1px solid var(--border-mid,#444);cursor:pointer;padding:0;background:none;';
    colorInp.addEventListener('mousedown', e => e.stopPropagation());
    colorInp.addEventListener('input', () => {
      saveHistory();
      ann.color = colorInp.value;
      render();
      updateThumbnail(state.currentPage);
    });
    toolbar.appendChild(colorInp);

    toolbar.appendChild(sep());

    // Edit text button
    toolbar.appendChild(btn('✏ Edit', 'Edit text', false, () => {
      removeTextToolbar();
      const savedAnn = { ...ann };
      const idx = state.annotations[state.currentPage].indexOf(ann);
      if (idx >= 0) {
        saveHistory();
        state.annotations[state.currentPage].splice(idx, 1);
        render();
      }
      state.color      = savedAnn.color;
      state.fontSize   = savedAnn.fontSize ?? 18;
      state.fontFamily = savedAnn.fontFamily ?? 'sans-serif';
      state.bold       = savedAnn.bold   ?? false;
      state.italic     = savedAnn.italic ?? false;
      if (editorColor)      editorColor.value      = state.color;
      if (editorFontSize)   editorFontSize.value   = state.fontSize;
      if (editorFontFamily) editorFontFamily.value = state.fontFamily;
      if (editorBold)       editorBold.checked     = state.bold;
      if (editorItalic)     editorItalic.checked   = state.italic;
      placeTextInput(savedAnn.x, savedAnn.y, savedAnn.text);
    }));

    // Delete button
    toolbar.appendChild(btn('🗑', 'Delete', false, () => {
      removeTextToolbar();
      const idx = state.annotations[state.currentPage].indexOf(ann);
      if (idx >= 0) {
        saveHistory();
        state.annotations[state.currentPage].splice(idx, 1);
        state.selected = null;
        render();
        updateThumbnail(state.currentPage);
      }
    }));

    document.body.appendChild(toolbar);
  }

  function removeTextToolbar() {
    document.getElementById('editorFloatToolbar')?.remove();
  }

  // ── Double-click to edit text ─────────────────────────────────────────────────
  editorCanvas.addEventListener('dblclick', (e) => {
    if (!state.pages.length) return;
    const { x, y } = getCanvasCoords(e);
    const anns = state.annotations[state.currentPage];

    // Find topmost text annotation at this point
    for (let i = anns.length - 1; i >= 0; i--) {
      if (anns[i].type !== 'text') continue;
      if (pointInAnnotation(anns[i], x, y, 8)) {
        const ann = anns[i];
        // Remove it temporarily so we can re-place it via input
        saveHistory();
        anns.splice(i, 1);
        render();
        // Re-open input pre-filled with existing text + settings
        state.color      = ann.color;
        state.fontSize   = ann.fontSize ?? 18;
        state.fontFamily = ann.fontFamily ?? 'sans-serif';
        state.bold       = ann.bold   ?? false;
        state.italic     = ann.italic ?? false;
        // Sync UI controls
        if (editorColor)      editorColor.value      = state.color;
        if (editorFontSize)   editorFontSize.value   = state.fontSize;
        if (editorFontFamily) editorFontFamily.value = state.fontFamily;
        if (editorBold)       editorBold.checked     = state.bold;
        if (editorItalic)     editorItalic.checked   = state.italic;
        placeTextInput(ann.x, ann.y, ann.text);
        return;
      }
    }
  });

  // ── Text input ────────────────────────────────────────────────────────────────
  function placeTextInput(x, y, prefill = '') {
    const rect       = editorCanvas.getBoundingClientRect();
    const totalScale = state.scale * state.zoom;

    const screenX = rect.left + x * totalScale;
    const screenY = rect.top  + y * totalScale;
    const fs      = Math.round((state.fontSize ?? 18) * totalScale);

    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.value       = prefill;
    inp.placeholder = 'Type and press Enter…';
    inp.style.cssText = `
      position: fixed;
      left: ${screenX}px;
      top:  ${screenY}px;
      font-size: ${fs}px;
      font-weight: ${state.bold   ? 'bold'   : 'normal'};
      font-style:  ${state.italic ? 'italic' : 'normal'};
      font-family: ${state.fontFamily ?? 'sans-serif'};
      color: ${state.color ?? '#000000'};
      background: rgba(255,255,255,0.96);
      border: 2px dashed ${state.color ?? '#000000'};
      border-radius: 3px;
      outline: none;
      padding: 2px 8px;
      z-index: 99999;
      min-width: 160px;
      max-width: 500px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.35);
    `;
    document.body.appendChild(inp);

    // Select all prefilled text so user can immediately replace or append
    setTimeout(() => { inp.focus(); if (prefill) inp.select(); }, 30);

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const text = inp.value.trim();
      inp.remove();
      if (!text) return;
      saveHistory();
      state.annotations[state.currentPage].push({
        type:       'text',
        x,
        y,
        text,
        color:      state.color      ?? '#000000',
        fontSize:   state.fontSize   ?? 18,
        fontFamily: state.fontFamily ?? 'sans-serif',
        bold:       state.bold       ?? false,
        italic:     state.italic     ?? false,
      });
      render();
      updateThumbnail(state.currentPage);
    };

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { committed = true; inp.remove(); }
    });
    inp.addEventListener('blur', commit);
  }

  // ── Signature ─────────────────────────────────────────────────────────────────

  // Signature drawing canvas
  let edSigDrawing = false, edSigHasDrawn = false;
  let edSigLastX = 0, edSigLastY = 0;
  let edSigStrokes = []; // committed strokes for multi-stroke signatures
  const edSigCtx = editorSigCanvas?.getContext('2d');

  // Signature drawing — smooth catmull-rom spline
  let edSigPoints = []; // buffer of {x, y} points for smooth curve

  function edSigGetXY(e) {
    const r = editorSigCanvas.getBoundingClientRect();
    const s = e.touches ? e.touches[0] : e;
    return [
      (s.clientX - r.left) * (editorSigCanvas.width  / r.width),
      (s.clientY - r.top)  * (editorSigCanvas.height / r.height),
    ];
  }

  function edSigReset() {
    if (!edSigCtx) return;
    edSigCtx.clearRect(0, 0, editorSigCanvas.width, editorSigCanvas.height);
    edSigHasDrawn = false;
    edSigPoints = [];
  }

  // Redraw the full stroke from point buffer using quadratic bezier through midpoints
  function edSigRedrawStroke(color) {
    if (edSigPoints.length < 2) return;
    edSigCtx.beginPath();
    edSigCtx.moveTo(edSigPoints[0].x, edSigPoints[0].y);
    for (let i = 1; i < edSigPoints.length - 1; i++) {
      const mx = (edSigPoints[i].x + edSigPoints[i + 1].x) / 2;
      const my = (edSigPoints[i].y + edSigPoints[i + 1].y) / 2;
      edSigCtx.quadraticCurveTo(edSigPoints[i].x, edSigPoints[i].y, mx, my);
    }
    const last = edSigPoints[edSigPoints.length - 1];
    edSigCtx.lineTo(last.x, last.y);
    edSigCtx.strokeStyle = color;
    edSigCtx.lineWidth   = 2.2;
    edSigCtx.lineJoin    = 'round';
    edSigCtx.lineCap     = 'round';
    edSigCtx.stroke();
  }

  editorSigCanvas?.addEventListener('pointerdown', e => {
    edSigDrawing = true;
    const [x, y] = edSigGetXY(e);
    edSigLastX = x; edSigLastY = y;
    edSigPoints = [{ x, y }];
    editorSigCanvas.setPointerCapture(e.pointerId);
    edSigHasDrawn = true;
    e.preventDefault();
  }, { passive: false });

  editorSigCanvas?.addEventListener('pointermove', e => {
    if (!edSigDrawing) return;
    const [x, y] = edSigGetXY(e);
    const dist = Math.hypot(x - edSigLastX, y - edSigLastY);
    if (dist < 2) return; // skip micro-movements that cause dots
    edSigPoints.push({ x, y });
    edSigLastX = x; edSigLastY = y;

    // Clear and redraw entire current stroke for smoothness
    edSigCtx.clearRect(0, 0, editorSigCanvas.width, editorSigCanvas.height);
    // Redraw all committed strokes first
    for (const stroke of edSigStrokes) {
      edSigCtx.beginPath();
      edSigCtx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
      for (let i = 1; i < stroke.pts.length - 1; i++) {
        const mx = (stroke.pts[i].x + stroke.pts[i + 1].x) / 2;
        const my = (stroke.pts[i].y + stroke.pts[i + 1].y) / 2;
        edSigCtx.quadraticCurveTo(stroke.pts[i].x, stroke.pts[i].y, mx, my);
      }
      const last = stroke.pts[stroke.pts.length - 1];
      edSigCtx.lineTo(last.x, last.y);
      edSigCtx.strokeStyle = stroke.color;
      edSigCtx.lineWidth   = 2.2;
      edSigCtx.lineJoin    = 'round';
      edSigCtx.lineCap     = 'round';
      edSigCtx.stroke();
    }
    // Draw current stroke
    edSigRedrawStroke('#0a0a0a');
    e.preventDefault();
  }, { passive: false });

  editorSigCanvas?.addEventListener('pointerup', () => {
    if (edSigDrawing && edSigPoints.length > 1) {
      edSigStrokes.push({ pts: [...edSigPoints], color: '#0a0a0a' });
    }
    edSigPoints = [];
    edSigDrawing = false;
  });
  editorSigCanvas?.addEventListener('pointerleave', () => {
    if (edSigDrawing && edSigPoints.length > 1) {
      edSigStrokes.push({ pts: [...edSigPoints], color: '#0a0a0a' });
    }
    edSigPoints = [];
    edSigDrawing = false;
  });

  editorSigClear?.addEventListener('click', () => {
    edSigStrokes = [];
    edSigReset();
    if (editorSigPreview) { editorSigPreview.src = ''; editorSigPreview.style.display = 'none'; }
  });

  // Signature tab switching
  editorSigTabDraw?.addEventListener('click', () => {
    editorSigTabDraw.classList.add('active');
    editorSigTabUpload?.classList.remove('active');
    if (editorSigPanelDraw)   editorSigPanelDraw.style.display   = '';
    if (editorSigPanelUpload) editorSigPanelUpload.style.display = 'none';
  });
  editorSigTabUpload?.addEventListener('click', () => {
    editorSigTabUpload.classList.add('active');
    editorSigTabDraw?.classList.remove('active');
    if (editorSigPanelUpload) editorSigPanelUpload.style.display = '';
    if (editorSigPanelDraw)   editorSigPanelDraw.style.display   = 'none';
  });

  // Upload signature image
  editorSigUploadZone?.addEventListener('click', () => editorSigFileInput?.click());
  editorSigFileInput?.addEventListener('change', () => {
    const f = editorSigFileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (editorSigPreview) {
        editorSigPreview.src = ev.target.result;
        editorSigPreview.style.display = 'block';
      }
    };
    reader.readAsDataURL(f);
  });

  // Open/close signature modal
  editorSigBtn?.addEventListener('click', () => {
    edSigReset();
    if (editorSigModal) editorSigModal.style.display = 'flex';
  });
  editorSigClose?.addEventListener('click', () => {
    if (editorSigModal) editorSigModal.style.display = 'none';
  });
  editorSigModal?.addEventListener('click', e => {
    if (e.target === editorSigModal) editorSigModal.style.display = 'none';
  });

  // Confirm — place signature as a draggable annotation
  editorSigConfirm?.addEventListener('click', () => {
    let dataURL = null;
    const isDrawTab = editorSigPanelUpload?.style.display === 'none'
                   || !editorSigPanelUpload;

    if (isDrawTab && edSigHasDrawn) {
      dataURL = editorSigCanvas.toDataURL('image/png');
    } else if (editorSigPreview?.src && editorSigPreview.src !== window.location.href) {
      dataURL = editorSigPreview.src;
    }

    if (!dataURL) {
      alert('Please draw or upload a signature first.');
      return;
    }

    if (editorSigModal) editorSigModal.style.display = 'none';

    // Get current page natural dimensions
    const img = state.baseImages[state.currentPage];
    if (!img) return;

    const W = img.naturalWidth, H = img.naturalHeight;
    const sigW = Math.round(W * 0.25);
    const sigH = Math.round(sigW * 0.35); // approx aspect ratio

    saveHistory();
    state.annotations[state.currentPage].push({
      type:    'signature',
      x:       Math.round(W * 0.55),
      y:       Math.round(H * 0.8),
      w:       sigW,
      h:       sigH,
      dataURL,
    });

    render();
    updateThumbnail(state.currentPage);
  });

  // ── Draw signature annotation ─────────────────────────────────────────────────
  // Extend drawAnnotation to handle 'signature' type
  const _origDrawAnnotation = drawAnnotation;
  // We patch after definition — handled inline in drawAnnotation below

  // ── Extend getAnnotationBounds for signature ──────────────────────────────────
  // Already handled in getAnnotationBounds via the rect-style fallback

  // ── Export ────────────────────────────────────────────────────────────────────
  editorExportBtn?.addEventListener('click', async () => {
    if (!state.pages.length) return;
    editorExportBtn.disabled   = true;
    editorExportBtn.textContent = 'Exporting…';

    try {
      const exportPages = [];
      for (let i = 0; i < state.pages.length; i++) {
        const img  = state.baseImages[i];
        const off  = document.createElement('canvas');
        off.width  = img.naturalWidth;
        off.height = img.naturalHeight;
        const c    = off.getContext('2d');
        c.drawImage(img, 0, 0);
        for (const ann of state.annotations[i]) drawAnnotation(c, ann);
        exportPages.push(off.toDataURL('image/png'));
      }

      const res = await fetch('/editor/export', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          pages: exportPages,
          filename: state.filename,
          pageDims: state.pageDims ?? null,
        }),
      });
      if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error||'Export failed'); }

      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      const disp      = res.headers.get('content-disposition') || '';
      const utf8Match = disp.match(/filename\*=UTF-8''([^;\s]+)/i);
      const asciiMatch= disp.match(/filename="(.+?)"/);
      a.href     = url;
      a.download = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : (asciiMatch?.[1] ?? `${state.filename}_edited.pdf`);
      a.click();
      URL.revokeObjectURL(url);

      editorExportBtn.textContent = 'Done ✓';
      setTimeout(() => { editorExportBtn.disabled=false; editorExportBtn.textContent='↓ Export PDF'; }, 2500);
    } catch (err) {
      editorExportBtn.disabled   = false;
      editorExportBtn.textContent = '↓ Export PDF';
      if (editorStatus) { editorStatus.textContent=`Export failed: ${err.message}`; editorStatus.className='status error'; }
    }
  });

  // ── Cursor map ────────────────────────────────────────────────────────────────
  editorCanvas.addEventListener('mousemove', () => {
    if (state.tool === 'select') return; // handled above
    const cursors = {
      whiteout:'crosshair', blackout:'crosshair', highlight:'crosshair',
      'rect-outline':'crosshair', circle:'crosshair', arrow:'crosshair',
      line:'crosshair', text:'text', pen:'crosshair',
      stamp:'copy', eraser:'cell',
    };
    editorCanvas.style.cursor = cursors[state.tool] ?? 'default';
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  // Sync initial values from DOM so state matches what's displayed
  if (editorFontSize)   state.fontSize   = parseInt(editorFontSize.value)   || 20;
  if (editorFontFamily) state.fontFamily = editorFontFamily.value            || 'sans-serif';
  if (editorLineWidth)  state.lineWidth  = parseInt(editorLineWidth.value)   || 3;
  if (editorBold)       state.bold       = editorBold.checked;
  if (editorItalic)     state.italic     = editorItalic.checked;

  updateToolOpts();

})();

// ── Button spinner helpers ─────────────────────────────────────────────────────
// Call setButtonLoading(btn, true) to show spinner, false to restore
function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  const labelEl = btn.querySelector('.btn-label');
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
    if (labelEl && label) labelEl.textContent = label;
  } else {
    btn.classList.remove('loading');
    // Don't re-enable here — caller decides
    if (labelEl && label) labelEl.textContent = label;
  }
}

// ── Patch scan form submit to use spinner ─────────────────────────────────────
// Wrap the existing doSubmit function to add spinner behaviour.
// This runs AFTER the existing script.js code so doSubmit is already defined.
(function patchScanSpinner() {
  const submitBtn = document.getElementById('submitBtn');
  if (!submitBtn) return;

  const _origDoSubmit = window.doSubmit;
  if (typeof _origDoSubmit !== 'function') {
    // doSubmit is not on window — patch via form submit event instead
    const form = document.getElementById('form');
    if (!form) return;

    // Observe progress wrap to detect when processing ends
    const progressLabel = document.getElementById('progressLabel');
    const observer = new MutationObserver(() => {
      const txt = progressLabel?.textContent ?? '';
      if (txt === 'Done ✓' || txt === 'Error') {
        setButtonLoading(submitBtn, false, 'Apply Scan Effect');
        submitBtn.disabled = false;
      }
    });
    if (progressLabel) observer.observe(progressLabel, { childList: true, characterData: true, subtree: true });

    form.addEventListener('submit', () => {
      setButtonLoading(submitBtn, true, 'Processing…');
    }, { capture: true });
    return;
  }

  // If doSubmit is accessible, wrap it directly
  window.doSubmit = async function(...args) {
    setButtonLoading(submitBtn, true, 'Processing…');
    try {
      await _origDoSubmit(...args);
    } finally {
      setButtonLoading(submitBtn, false, 'Apply Scan Effect');
      submitBtn.disabled = false;
    }
  };
})();

// ── Patch compress button spinner ─────────────────────────────────────────────
// Hooks into the existing compressor IIFE by observing cmpProgressLabel.
(function patchCompressSpinner() {
  const cmpBtn   = document.getElementById('cmpSubmitBtn');
  const cmpLabel = document.getElementById('cmpProgressLabel');
  if (!cmpBtn || !cmpLabel) return;

  const observer = new MutationObserver(() => {
    const txt = cmpLabel.textContent ?? '';
    if (txt === 'Done ✓' || txt === 'Error') {
      setButtonLoading(cmpBtn, false, 'Compress PDF');
      cmpBtn.disabled = false;
    }
  });
  observer.observe(cmpLabel, { childList: true, characterData: true, subtree: true });

  // Intercept clicks before the compressor IIFE handles them
  cmpBtn.addEventListener('click', () => {
    setButtonLoading(cmpBtn, true, 'Compressing…');
  }, { capture: true });
})();

// ── Patch editor open button spinner ─────────────────────────────────────────
(function patchEditorSpinner() {
  const openBtn   = document.getElementById('editorOpenBtn');
  const loadingEl = document.getElementById('editorLoading');
  if (!openBtn || !loadingEl) return;

  // Watch for loading overlay to hide (means pages finished rendering)
  const observer = new MutationObserver(() => {
    if (loadingEl.style.display === 'none') {
      setButtonLoading(openBtn, false, 'Open in Editor');
      openBtn.disabled = false;
    }
  });
  observer.observe(loadingEl, { attributes: true, attributeFilter: ['style'] });

  openBtn.addEventListener('click', () => {
    setButtonLoading(openBtn, true, 'Loading…');
  }, { capture: true });
})();


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}