'use strict';

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

let currentFiles = []; // array of File objects

const FMT_MAP = {
  'application/pdf':'PDF','image/jpeg':'JPG','image/jpg':'JPG',
  'image/png':'PNG','image/webp':'WEBP','image/tiff':'TIFF','image/bmp':'BMP',
};
const fmtBytes = b => b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

function setFiles(files) {
  currentFiles = Array.from(files);
  const isPdf  = currentFiles.length === 1 && currentFiles[0].type === 'application/pdf';
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

  // Image format option: only show for single images, hide for multi/PDF
  fmtImageWrap.style.display = (!isMulti && !isPdf) ? '' : 'none';
  if (isMulti || isPdf) document.getElementById('f-pdf').checked = true;

  // Load preview from first file
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

dropzone.addEventListener('click', () => pdfInput.click());
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
  });
});
function setSlider(id, val) {
  const el = document.getElementById(id);
  if (el) { el.value = val; el.dispatchEvent(new Event('input')); }
}

// ── Slider value display ──────────────────────────────────────────────────────
[['noise','noiseVal'],['yellowTint','tintVal'],['brightness','brightVal'],
 ['contrast','contrastVal'],['rotation','rotVal'],['manualSkew','skewVal']].forEach(([inputId, spanId]) => {
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

// Crumple intensity slider
const crumpleInput = document.getElementById('crumpleIntensity');
const crumpleSpan  = document.getElementById('crumpleVal');
crumpleInput?.addEventListener('input', () => {
  crumpleSpan.textContent = parseFloat(crumpleInput.value).toFixed(1);
});

// ── Advanced panel ────────────────────────────────────────────────────────────
const advToggle = document.getElementById('advToggle');
const advBody   = document.getElementById('advBody');
const advCaret  = document.getElementById('advCaret');
function toggleAdv() {
  const open = advBody.classList.toggle('open');
  advToggle.setAttribute('aria-expanded', open);
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

// ── Form submit ───────────────────────────────────────────────────────────────
const form          = document.getElementById('form');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressPct   = document.getElementById('progressPct');
const progressLabel = document.getElementById('progressLabel');
const progressTrack = document.getElementById('progressTrack');
const statusMsg     = document.getElementById('statusMsg');

form?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentFiles.length) return;

  const sigEnabled = document.getElementById('sigEnabled')?.checked;
  const sigDataVal = document.getElementById('sigData')?.value;
  if (sigEnabled && !sigDataVal) {
    statusMsg.textContent = 'Please configure your signature first (click Configure).';
    statusMsg.className = 'status error'; return;
  }

  const fd = new FormData();

  // Append all files — single PDF, single image, or multiple images
  if (currentFiles.length === 1) {
    fd.append('file', currentFiles[0]);
  } else {
    currentFiles.forEach(f => fd.append('files', f));
  }

  ['noise','yellowTint','brightness','contrast','rotation','manualSkew','sharpness','dpi'].forEach(id => {
    fd.append(id, document.getElementById(id).value);
  });
  fd.append('grain',             document.getElementById('grain').checked);
  fd.append('deskew',            document.getElementById('deskew').checked);
  fd.append('bindingShadow',     document.getElementById('bindingShadow').checked);
  fd.append('crumple',           document.getElementById('crumple').checked);
  fd.append('crumpleIntensity',  document.getElementById('crumpleIntensity')?.value ?? '1.0');
  fd.append('format',            document.querySelector('input[name="format"]:checked')?.value ?? 'pdf');

  if (sigEnabled && sigDataVal) {
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
});

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
  const r  = sigOverlay.getBoundingClientRect();
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

// Drag — no clamping: user can place anywhere on the page, including the bottom
sigOverlay?.addEventListener('mousedown', e => {
  if (e.target === sigResizeHandle || e.target === sigRotateHandle) return;
  sigDrag = true;
  const r  = sigOverlay.getBoundingClientRect();
  // Use offset from the untransformed top-left by computing from container-relative coords
  const cr = sigPreviewContainer.getBoundingClientRect();
  sigDragOX = e.clientX - r.left;
  sigDragOY = e.clientY - r.top;
  e.preventDefault();
});
sigOverlay?.addEventListener('touchstart', e => {
  if (e.target === sigResizeHandle || e.target === sigRotateHandle) return;
  sigDrag = true;
  const r  = sigOverlay.getBoundingClientRect();
  sigDragOX = e.touches[0].clientX - r.left;
  sigDragOY = e.touches[0].clientY - r.top;
  e.preventDefault();
}, { passive: false });

// Resize
sigResizeHandle?.addEventListener('mousedown', e => {
  sigResize = true;
  sigResX = e.clientX;
  sigResW = sigOverlay.getBoundingClientRect().width;
  e.preventDefault(); e.stopPropagation();
});
sigResizeHandle?.addEventListener('touchstart', e => {
  sigResize = true;
  sigResX = e.touches[0].clientX;
  sigResW = sigOverlay.getBoundingClientRect().width;
  e.preventDefault(); e.stopPropagation();
}, { passive: false });

// Rotate
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
  // No hard clamp — allows full placement including bottom of page
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
  // Snap to 0/90/180/-90 when within 4 degrees
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
  if (sigRotate) {
    sigRotate = false;
    if (sigAngleBadge) sigAngleBadge.style.display = 'none';
  }
});
document.addEventListener('touchmove', e => {
  if (sigDrag)   { moveSigOverlay(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  if (sigResize) { resizeSigOverlay(e.touches[0].clientX); e.preventDefault(); }
  if (sigRotate) { rotateSigOverlay(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
}, { passive: false });
document.addEventListener('touchend', () => {
  sigDrag = sigResize = false;
  if (sigRotate) {
    sigRotate = false;
    if (sigAngleBadge) sigAngleBadge.style.display = 'none';
  }
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
  // Position is center-based so rotation doesn't shift it
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

  // Update sig thumb in the card
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