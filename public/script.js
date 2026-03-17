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
  progressLabel.textContent = 'Processing…';

  let fake = 0;
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