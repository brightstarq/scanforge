'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   SCANDRIFT — workspace.js
   UI layer for the redesign. Loaded after script.js, which still owns the scan
   submit, payment gate, signature placement and canvas editor. This file adds:
     · hash routing between the home page and the Scanner / Compressor / Editor
     · home page interactions (reveal, hero mock, workflow demo)
     · the Scanner's tabs, segmented controls and live before/after preview
     · the Compressor's multi-file queue
     · the Editor's tool panel, colour swatches and Layers list
═══════════════════════════════════════════════════════════════════════════ */

(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const fmtBytes = b => b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(b >= 10 * 1_048_576 ? 1 : 2)} MB`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasToken = () => { try { return !!(typeof getStoredToken === 'function' && getStoredToken()); } catch { return false; } };
  const FREE = typeof FREE_PAGE_LIMIT === 'number' ? FREE_PAGE_LIMIT : 3;

  // ══════════════════════════════════════════════════════════════════════════
  // ROUTER
  // ══════════════════════════════════════════════════════════════════════════
  const ROUTE_TITLES = { overview: 'Overview', documents: 'My Documents', scanner: 'Scanner', compressor: 'Compressor', editor: 'PDF Editor' };
  const HOME_TITLE = document.title;

  function route() {
    let h = location.hash;
    // Old in-page anchors now open the matching tool
    if (h === '#compress') { history.replaceState(null, '', '#/compressor'); h = '#/compressor'; }
    if (h === '#editor')   { history.replaceState(null, '', '#/editor');     h = '#/editor'; }
    const m = h.match(/^#\/(overview|documents|scanner|compressor|editor)/);
    const wasApp = root.classList.contains('view-app');

    if (m) {
      const name = m[1];
      root.classList.add('view-app'); root.classList.remove('view-home');
      $$('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === name));
      $$('.side-nav a').forEach(a => a.classList.toggle('on', a.dataset.route === name));
      document.title = `${ROUTE_TITLES[name]} — ScanDrift`;
      if (!wasApp) window.scrollTo(0, 0);
      document.dispatchEvent(new CustomEvent('sd:route', { detail: name }));
    } else {
      root.classList.add('view-home'); root.classList.remove('view-app');
      document.title = HOME_TITLE;
      const target = h.length > 1 ? document.getElementById(decodeURIComponent(h.slice(1))) : null;
      if (wasApp) requestAnimationFrame(() => target ? target.scrollIntoView() : window.scrollTo(0, 0));
      revealCheck();
    }
  }
  window.addEventListener('hashchange', route);

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED: range fill
  // ══════════════════════════════════════════════════════════════════════════
  function paintRange(el) {
    const min = parseFloat(el.min || 0), max = parseFloat(el.max || 100), v = parseFloat(el.value);
    el.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
  }
  document.addEventListener('input', e => { if (e.target.type === 'range') paintRange(e.target); });
  $$('input[type=range]').forEach(paintRange);

  // ══════════════════════════════════════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════════════════════════════════════
  let revealObs = null;
  function revealCheck() {
    if (!('IntersectionObserver' in window)) { $$('[data-reveal]').forEach(el => el.classList.add('in')); return; }
    if (!revealObs) {
      revealObs = new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); revealObs.unobserve(en.target); }
      }), { rootMargin: '0px 0px -8% 0px' });
      $$('[data-reveal]').forEach((el, i) => {
        // Stagger siblings slightly
        const sib = Array.from(el.parentElement.children).filter(c => c.hasAttribute('data-reveal'));
        el.style.transitionDelay = `${Math.min(sib.indexOf(el), 4) * 70}ms`;
        revealObs.observe(el);
      });
    }
  }

  const homeHead = $('#homeHead');
  window.addEventListener('scroll', () => homeHead?.classList.toggle('scrolled', window.scrollY > 12), { passive: true });

  // Hero workspace mock — cycles Scanner → Compressor → Editor
  (function heroMock() {
    const tabs = $$('.mock-tab'), panes = $$('.mock-pane'), line = $('.mock-scanline');
    if (!tabs.length) return;
    const order = tabs.map(t => t.dataset.mock);
    let idx = 0, timer = null, hover = false;
    function show(i) {
      idx = i;
      tabs.forEach((t, j) => { t.classList.toggle('on', j === i); const s = t.querySelector('span'); if (s) { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; } });
      panes.forEach(p => p.classList.toggle('on', p.dataset.pane === order[i]));
      if (line) { line.classList.remove('run'); void line.offsetWidth; line.classList.add('run'); }
    }
    function next() { if (!hover && root.classList.contains('view-home')) show((idx + 1) % order.length); }
    tabs.forEach((t, i) => t.addEventListener('click', () => { show(i); clearInterval(timer); timer = setInterval(next, 4200); }));
    const win = $('.mock-window');
    win?.addEventListener('mouseenter', () => { hover = true; });
    win?.addEventListener('mouseleave', () => { hover = false; });
    show(0);
    timer = setInterval(next, 4200);

    // Mini before/after follows the pointer
    const split = $('#mockSplit'), after = $('#mockSplitAfter'), bar = $('#mockSplitBar');
    split?.addEventListener('pointermove', e => {
      const r = split.getBoundingClientRect();
      const p = Math.max(5, Math.min(95, (e.clientX - r.left) / r.width * 100));
      after.style.clipPath = `inset(0 0 0 ${p}%)`; bar.style.left = `${p}%`;
    });
    const LOOKS = { light: ['Light', 'contrast(1.02) sepia(.03)', '-.3deg', .25], medium: ['Medium', 'contrast(1.06) sepia(.08)', '-.6deg', .45], heavy: ['Heavy', 'contrast(1.14) sepia(.16) brightness(.97)', '-1.1deg', .75] };
    $$('#mockLooks button').forEach(b => b.addEventListener('click', () => {
      $$('#mockLooks button').forEach(x => x.classList.toggle('on', x === b));
      const [name, filter, rot, grain] = LOOKS[b.dataset.look];
      $('#mockLook').textContent = name;
      const doc = $('#mockScanned');
      doc.style.filter = filter; doc.style.transform = `rotate(${rot})`;
      doc.querySelector('.grain').style.opacity = grain;
    }));
  })();

  // Workflow demo card
  (function workflow() {
    const paper = $('#wfPaper'); if (!paper) return;
    const B = $('#wfB'), C = $('#wfC'), F = $('#wfFinish'), P = $('#wfPreset'), grain = $('#wfGrain'), scan = $('#wfScan');
    const FINISH = { white: '#ffffff', ivory: '#fffaee', recycled: '#f3efe4' };
    const PRESET = { light: [.25, '-.2deg'], medium: [.45, '-.5deg'], heavy: [.8, '-1deg'] };
    function apply() {
      const b = .85 + B.value / 100 * .3, c = .85 + C.value / 100 * .35;
      const [g, rot] = PRESET[P.value];
      paper.style.background = FINISH[F.value];
      paper.style.filter = `brightness(${b.toFixed(2)}) contrast(${c.toFixed(2)})`;
      paper.style.transform = `rotate(${rot})`;
      grain.style.opacity = g;
      $('#wfBv').textContent = `${B.value}%`; $('#wfCv').textContent = `${C.value}%`;
    }
    function sweep() { scan.classList.remove('run'); void scan.offsetWidth; scan.classList.add('run'); }
    [B, C].forEach(el => el.addEventListener('input', apply));
    [F, P].forEach(el => el.addEventListener('change', () => { apply(); sweep(); }));
    apply();

    const steps = $$('.wf-step');
    let i = 0, t = null;
    function show(n) {
      i = n;
      steps.forEach((s, j) => { s.classList.toggle('on', j === n); const bar = s.querySelector('i'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; });
      if (n === 1) { P.value = P.value === 'medium' ? 'heavy' : 'medium'; apply(); }
      if (n === 2) sweep();
    }
    steps.forEach((s, j) => s.addEventListener('click', () => { show(j); clearInterval(t); t = setInterval(() => root.classList.contains('view-home') && show((i + 1) % steps.length), 4500); }));
    t = setInterval(() => root.classList.contains('view-home') && show((i + 1) % steps.length), 4500);
  })();

  // Home deep-dive before/after: pointer events (script.js already handles mouse/touch drag)
  // FAQ +/× is handled in script.js; CSS styles the open state.

  // ══════════════════════════════════════════════════════════════════════════
  // SIDEBAR / PRICING NOTES
  // ══════════════════════════════════════════════════════════════════════════
  let priceLabel = '$5';
  if (typeof loadPaystackConfig === 'function') {
    loadPaystackConfig().then(cfg => { if (cfg?.configured && cfg.display) priceLabel = cfg.display; refreshPricing(); }).catch(() => {});
  }

  const scan = { files: [], pages: [], count: 0, page: 0, view: 'split', split: 50, custom: false, loadId: 0 };

  function refreshPricing() {
    const unlocked = hasToken();
    const card = $('#sideUnlock');
    if (card) {
      card.classList.toggle('unlocked', unlocked);
      $('#sideUnlockTitle').textContent = unlocked ? 'Scanner unlocked' : `Scanner: ${FREE} pages free`;
      $('#sideUnlockText').textContent = unlocked
        ? 'Unlimited pages in this browser until your 10-hour pass runs out.'
        : `Longer documents are a one-time ${priceLabel} unlock, valid for 10 hours. Compressor and Editor are always free.`;
    }
    const note = $('#scanPriceNote');
    if (note) note.textContent = unlocked ? 'Unlimited pages · unlocked' : `First ${FREE} pages free`;
    const box = $('#priceBox'), txt = $('#priceBoxText');
    if (box && txt) {
      box.classList.toggle('unlocked', unlocked);
      box.querySelector('b').textContent = unlocked ? 'Unlimited pages unlocked' : `First ${FREE} pages are free`;
      if (unlocked) txt.textContent = 'Every page is processed at full quality while your 10-hour pass is active.';
      else if (scan.count > FREE) txt.textContent = `This document has ${scan.count} pages. A one-time ${priceLabel} unlock covers every page for 10 hours, or you can scan the first ${FREE} free.`;
      else if (scan.count) txt.textContent = `This document has ${scan.count} page${scan.count === 1 ? '' : 's'}, so it scans free. Longer documents are a one-time ${priceLabel} unlock for 10 hours.`;
      else txt.textContent = `A one-time ${priceLabel} unlock covers every page for 10 hours. No subscription.`;
    }
    renderThumbs();
  }
  window.addEventListener('storage', refreshPricing);
  document.addEventListener('visibilitychange', refreshPricing);
  $('#successCta')?.addEventListener('click', () => setTimeout(refreshPricing, 450));

  // ══════════════════════════════════════════════════════════════════════════
  // SCANNER
  // ══════════════════════════════════════════════════════════════════════════
  const form = $('#form');
  const card = $('#scanStageCard');
  const stage = $('#scanStage');
  const fxPage = $('#stageFx');
  const fxImg = $('#stageFxImg');
  const origImg = $('#stageOrigImg');
  const bleedImg = $('#stageBleedImg');
  const layers = $('#fxLayers');
  const clip = $('#stageClip');
  const handle = $('#stageHandle');

  // Tabs
  $$('.ctrl-card .tab').forEach(t => t.addEventListener('click', () => {
    $$('.ctrl-card .tab').forEach(x => x.classList.toggle('on', x === t));
    $$('.ctrl-card .tab-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
  }));

  // Segmented controls bound to hidden <select>s (sharpness, dpi)
  $$('.seg[data-for]').forEach(seg => {
    const sel = document.getElementById(seg.dataset.for);
    const sync = () => $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.value === sel.value));
    $$('button', seg).forEach(b => b.addEventListener('click', () => {
      sel.value = b.dataset.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sync();
    }));
    sel.addEventListener('change', sync);
    sync();
  });

  // Tab counters
  function updateCounts() {
    const n = g => $$(`.sw-input[data-group="${g}"]`).filter(i => i.checked).length;
    const p = n('paper'), ph = n('physics');
    $('#paperCount').textContent = p || '';
    $('#physicsCount').textContent = ph || '';
  }

  // Preview mode
  $$('#viewSeg button').forEach(b => b.addEventListener('click', () => {
    scan.view = b.dataset.view;
    $$('#viewSeg button').forEach(x => x.classList.toggle('on', x === b));
    applySplit();
  }));
  function applySplit() {
    stage.classList.toggle('mode-original', scan.view === 'original');
    stage.classList.toggle('mode-scanned', scan.view === 'scanned');
    clip.style.clipPath = scan.view === 'split' ? `inset(0 0 0 ${scan.split}%)` : scan.view === 'original' ? 'inset(0 0 0 100%)' : 'none';
    handle.style.left = `${scan.split}%`;
  }
  let dragging = false;
  function setSplitFrom(e) {
    const r = stage.getBoundingClientRect();
    scan.split = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100));
    applySplit();
  }
  stage.addEventListener('pointerdown', e => { if (scan.view !== 'split') return; dragging = true; stage.setPointerCapture(e.pointerId); setSplitFrom(e); });
  stage.addEventListener('pointermove', e => { if (dragging) setSplitFrom(e); });
  stage.addEventListener('pointerup', () => { dragging = false; });
  stage.addEventListener('pointercancel', () => { dragging = false; });

  $('#replaceBtn')?.addEventListener('click', () => $('#pdfInput').click());

  // Load page previews whenever script.js accepts new files
  const BROWSER_IMG = new Set(['image/jpeg', 'image/png', 'image/webp']);
  async function serverPreview(file) {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/preview-pages', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('preview failed');
    const data = await res.json();
    return { count: data.count, pages: data.pages.map(b => `data:image/jpeg;base64,${b}`) };
  }
  function readAsDataURL(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }

  document.addEventListener('sd:scan-files', async e => {
    const files = e.detail || [];
    const id = ++scan.loadId;
    scan.files = files; scan.pages = []; scan.page = 0; scan.count = files.length;
    card.classList.add('has-doc');
    stage.classList.add('loading');
    $('#filePages').textContent = '';
    updateOutName();
    try {
      if (files.length === 1) {
        const f = files[0];
        if (BROWSER_IMG.has(f.type)) { scan.pages = [await readAsDataURL(f)]; scan.count = 1; }
        else { const r = await serverPreview(f); scan.pages = r.pages; scan.count = r.count; }
      } else {
        for (const f of files.slice(0, 12)) {
          if (id !== scan.loadId) return;
          scan.pages.push(BROWSER_IMG.has(f.type) ? await readAsDataURL(f) : (await serverPreview(f)).pages[0]);
        }
      }
    } catch (err) {
      console.warn('Preview failed:', err.message);
    }
    if (id !== scan.loadId) return;
    stage.classList.remove('loading');
    $('#filePages').textContent = scan.count ? `${scan.count} page${scan.count === 1 ? '' : 's'}` : '';
    // Signature placement modal uses the first page as its backdrop
    const thumb = $('#sigPageThumb'), ph = $('#sigPreviewPlaceholder');
    if (thumb && scan.pages[0]) { thumb.src = scan.pages[0]; thumb.style.display = 'block'; if (ph) ph.style.display = 'none'; }
    showPage(0);
    refreshPricing();
    updateFx();
  });

  document.addEventListener('sd:scan-clear', () => {
    scan.loadId++;
    scan.files = []; scan.pages = []; scan.count = 0;
    card.classList.remove('has-doc');
    origImg.removeAttribute('src'); fxImg.removeAttribute('src'); bleedImg.removeAttribute('src');
    $('#scanThumbs').innerHTML = '';
    refreshPricing();
    updateOutName();
  });

  function showPage(i) {
    scan.page = Math.max(0, Math.min(i, Math.max(scan.pages.length - 1, 0)));
    const src = scan.pages[scan.page];
    if (src) { origImg.src = src; fxImg.src = src; }
    else { origImg.removeAttribute('src'); fxImg.removeAttribute('src'); }
    const total = scan.count || scan.pages.length || 1;
    $('#scanPageLabel').textContent = `Page ${scan.page + 1} of ${total}`;
    renderThumbs();
    updateBleed();
  }

  function renderThumbs() {
    const wrap = $('#scanThumbs'); if (!wrap) return;
    const unlocked = hasToken();
    wrap.innerHTML = '';
    scan.pages.forEach((src, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb' + (i === scan.page ? ' on' : '');
      const locked = !unlocked && i >= FREE;
      b.title = locked ? `Page ${i + 1} · needs the ${priceLabel} unlock` : `Page ${i + 1}`;
      b.innerHTML = `<img src="${src}" alt="">` + (locked ? '<span class="lock"><svg class="ic"><use href="#i-lock"/></svg></span>' : '');
      b.addEventListener('click', () => showPage(i));
      wrap.appendChild(b);
    });
    if (scan.count > scan.pages.length) {
      const more = document.createElement('span');
      more.className = 'thumb more';
      more.textContent = `+${scan.count - scan.pages.length}`;
      more.title = 'Preview shows the first pages only';
      wrap.appendChild(more);
    }
  }

  // ── Live preview: approximates the server-side effects with CSS ────────────
  const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.25 0 0 0 0 0.22 0 0 0 0 0.15 0 0 0 1.4 -0.45'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
  const num = id => parseFloat(document.getElementById(id)?.value ?? 0);
  const on  = id => !!document.getElementById(id)?.checked;

  function updateBleed() {
    const show = on('backBleed') && (scan.count >= 2 || scan.files.length >= 2) && scan.pages.length;
    if (!show) { bleedImg.style.display = 'none'; return; }
    const other = scan.pages[(scan.page + 1) % scan.pages.length] || scan.pages[scan.page];
    bleedImg.src = other;
    bleedImg.style.display = 'block';
    bleedImg.style.opacity = Math.min(.4, num('backBleedOpacity') * 1.6).toFixed(3);
  }

  function updateFx() {
    const t = num('yellowTint'), noise = num('noise'), rot = num('rotation'), skew = num('manualSkew');
    const sharp = parseInt($('#sharpness').value, 10);

    const filters = [];
    if (on('channelMisreg')) filters.push('url(#fxMisreg)');
    if (on('motionSmear')) filters.push('url(#fxSmear)');
    filters.push(`brightness(${num('brightness')})`, `contrast(${num('contrast')})`, `sepia(${(t * .035).toFixed(3)})`);
    if (sharp === 0) filters.push('blur(.4px)');
    if (sharp === 2) filters.push('contrast(1.06)');
    if (on('jpegInternalize')) filters.push('saturate(.85)', 'blur(.2px)');
    fxImg.style.filter = filters.join(' ');
    fxPage.style.background = `rgb(255,${Math.round(254 - t * 2.4)},${Math.round(250 - t * 10)})`;
    fxPage.style.transform = `rotate(${-rot}deg) skewX(${(skew * .4).toFixed(2)}deg)`;

    layers.textContent = '';
    const add = css => { const d = document.createElement('div'); d.style.cssText = css; layers.appendChild(d); };
    if (on('grain')) add(`background-image:${NOISE};opacity:${Math.min(1, .08 + noise / 30 * .8).toFixed(2)};mix-blend-mode:multiply`);
    const heavy = $('#p-heavy')?.checked && !scan.custom;
    if (noise > 12 || heavy) add('background:radial-gradient(ellipse at center, transparent 55%, rgba(70,50,20,.14))');
    if (on('bindingShadow')) add('background:linear-gradient(90deg, rgba(0,0,0,.32), rgba(0,0,0,.1) 4%, transparent 13%)');
    if (on('crumple')) add(`opacity:${Math.min(1, num('crumpleIntensity') * .75).toFixed(2)};mix-blend-mode:multiply;background-image:linear-gradient(115deg, transparent 30%, rgba(0,0,0,.09) 31%, rgba(255,255,255,.4) 32%, transparent 35%), linear-gradient(62deg, transparent 54%, rgba(0,0,0,.08) 56%, transparent 60%), linear-gradient(172deg, transparent 40%, rgba(0,0,0,.07) 42%, transparent 45%), linear-gradient(20deg, transparent 70%, rgba(0,0,0,.06) 72%, transparent 76%), radial-gradient(ellipse at 30% 70%, rgba(0,0,0,.08), transparent 50%), radial-gradient(ellipse at 75% 25%, rgba(0,0,0,.06), transparent 45%)`);
    if (on('ambientLeak')) add('background:radial-gradient(ellipse 60% 80% at 104% 50%, rgba(255,255,255,.95), rgba(255,206,140,.35) 35%, transparent 70%)');
    if (on('moire')) add('opacity:.9;mix-blend-mode:multiply;background-image:repeating-radial-gradient(circle at 20% 30%, rgba(0,0,0,.06) 0 1px, transparent 1px 3px), repeating-radial-gradient(circle at 80% 70%, rgba(0,0,0,.05) 0 1px, transparent 1px 3.2px)');
    if (on('scanDropout')) add('background:linear-gradient(transparent calc(31% - 1px), rgba(255,255,255,.95) calc(31% - 1px), rgba(255,255,255,.95) 31%, transparent 31%), linear-gradient(transparent calc(67% - 1px), rgba(40,40,40,.35) calc(67% - 1px), rgba(40,40,40,.35) 67%, transparent 67%)');
    if (on('focusGradient')) {
      const to = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[$('#focusEdge').value] || 'right';
      const m = `linear-gradient(to ${to}, transparent 20%, black)`;
      const b = (num('focusGradientIntensity') * 1.3).toFixed(2);
      add(`backdrop-filter:blur(${b}px);-webkit-backdrop-filter:blur(${b}px);mask-image:${m};-webkit-mask-image:${m}`);
    }
    updateBleed();

    // Mode label
    const model = $('#scannerModel');
    let label = 'Custom';
    if (model?.value) label = model.options[model.selectedIndex].text.split(' — ')[0];
    else if (!scan.custom) { const p = $('input[name="preset"]:checked'); if (p) label = p.value[0].toUpperCase() + p.value.slice(1); }
    $('#modeLabel').textContent = label;
    updateCounts();
  }

  // Any control change refreshes the preview. Manual slider moves mark the
  // look as Custom; picking a preset or scanner model clears that.
  form.addEventListener('input', e => {
    if (e.target.type === 'range' && e.isTrusted && !['crumpleIntensity', 'focusGradientIntensity', 'backBleedOpacity'].includes(e.target.id)) scan.custom = true;
    updateFx();
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'preset' || e.target.id === 'scannerModel') scan.custom = false;
    if (e.target.name === 'format') updateOutName();
    updateFx();
  });

  function updateOutName() {
    const el = $('#outName'); if (!el) return;
    const f = scan.files[0];
    if (!f) { el.textContent = ''; return; }
    const base = (scan.files.length > 1 ? 'images' : f.name.replace(/\.[^.]+$/, '')).replace(/[^\w.-]+/g, '_');
    const fmt = $('input[name="format"]:checked')?.value ?? 'pdf';
    const ext = fmt === 'zip' ? 'zip' : fmt === 'image' ? (f.type === 'image/png' ? 'png' : 'jpg') : 'pdf';
    el.textContent = `Saves as ${base}_scanned.${ext}`;
  }

  updateFx();
  updateCounts();

  // ══════════════════════════════════════════════════════════════════════════
  // COMPRESSOR — multi-file queue
  // ══════════════════════════════════════════════════════════════════════════
  (function compressor() {
    const dz = $('#cmpDropzone'), input = $('#cmpInput'), list = $('#cmpList'), empty = $('#cmpEmpty');
    const btn = $('#cmpSubmitBtn'), status = $('#cmpStatus');
    const pWrap = $('#cmpProgressWrap'), pFill = $('#cmpProgressFill'), pPct = $('#cmpProgressPct'), pLbl = $('#cmpProgressLabel');
    if (!dz) return;

    const PDF_T = new Set(['application/pdf']);
    const IMG_T = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    const DOC_T = new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
    ]);
    const ZIP_T = new Set(['application/zip', 'application/x-zip', 'application/x-zip-compressed']);
    function detect(f) {
      const ext = f.name.split('.').pop().toLowerCase();
      if (PDF_T.has(f.type) || ext === 'pdf') return 'pdf';
      if (IMG_T.has(f.type) || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
      if (ZIP_T.has(f.type) || ext === 'zip') return 'zip';
      if (DOC_T.has(f.type) || ['docx', 'xlsx', 'pptx', 'doc'].includes(ext)) return 'office';
      return null;
    }
    const TYPE = {
      pdf:    { label: 'PDF', icon: 'i-file', hint: 'PDF · structure-aware compression' },
      image:  { label: 'Image', icon: 'i-image', hint: 'Image · quality and format' },
      office: { label: 'Office document', icon: 'i-office', hint: 'Office · embedded images recompressed' },
      zip:    { label: 'ZIP archive', icon: 'i-archive', hint: 'ZIP · repacked at maximum deflate' },
    };

    let queue = [], sel = null, nextId = 1, running = false;

    function msg(text, isErr = false) {
      status.textContent = text;
      status.className = text ? (isErr ? 'status error' : 'status success') : 'status';
    }

    function addFiles(files) {
      const rejected = [];
      let first = null;
      for (const f of files) {
        const type = detect(f);
        if (!type) { rejected.push(`${f.name} (unsupported type)`); continue; }
        if (f.size > 50 * 1024 * 1024) { rejected.push(`${f.name} (over 50 MB)`); continue; }
        const item = { id: nextId++, file: f, type, status: 'queued', before: f.size, after: null, blob: null, name: null, error: null };
        queue.push(item);
        first ??= item.id;
      }
      if (first) sel = first;
      msg(rejected.length ? `Skipped: ${rejected.join(', ')}. Accepted: PDF, JPG, PNG, WEBP, DOCX, XLSX, PPTX, ZIP.` : '', !!rejected.length);
      render();
    }

    function render() {
      list.innerHTML = '';
      empty.style.display = queue.length ? 'none' : '';
      for (const it of queue) {
        const row = document.createElement('div');
        row.className = 'cmp-row cmp-item' + (it.id === sel ? ' sel' : '');
        const savedPct = it.after != null && it.before ? Math.max(0, Math.round((1 - it.after / it.before) * 100)) : null;
        const statusTxt = { queued: 'Queued', running: 'Compressing…', done: 'Ready to download', error: it.error || 'Failed' }[it.status];
        row.innerHTML = `
          <span class="cmp-file"><span class="file-ic"><svg class="ic"><use href="#${TYPE[it.type].icon}"/></svg></span>
            <span><b title="${esc(it.file.name)}">${esc(it.file.name)}</b><small class="${it.status === 'error' ? 'err' : ''}">${TYPE[it.type].label} · ${esc(statusTxt)}</small></span></span>
          <span class="cmp-before">${fmtBytes(it.before)}</span>
          <span class="cmp-after">${it.after != null ? fmtBytes(it.after) : '—'}</span>
          <span class="cmp-saved"><b>${savedPct != null ? (savedPct > 0 ? `−${savedPct}%` : 'Optimal') : it.status === 'running' ? '…' : ''}</b><i class="${it.status === 'running' ? 'run' : ''}"><span style="width:${savedPct ?? 0}%"></span></i></span>
          <span class="cmp-acts">
            ${it.status === 'done' ? `<button type="button" class="icon-btn" data-dl="${it.id}" title="Download"><svg class="ic"><use href="#i-download"/></svg></button>` : ''}
            <button type="button" class="icon-btn" data-rm="${it.id}" title="Remove" ${it.status === 'running' ? 'disabled' : ''}><svg class="ic"><use href="#i-x"/></svg></button>
          </span>`;
        row.addEventListener('click', e => {
          const dl = e.target.closest('[data-dl]'), rm = e.target.closest('[data-rm]');
          if (dl) { e.stopPropagation(); download(it); return; }
          if (rm) { e.stopPropagation(); if (it.status !== 'running') { queue = queue.filter(x => x !== it); if (sel === it.id) sel = queue[0]?.id ?? null; render(); } return; }
          sel = it.id; render();
        });
        list.appendChild(row);
      }
      renderSide();
      renderTotals();
    }

    function renderSide() {
      const it = queue.find(x => x.id === sel);
      $('#cmpSelName').textContent = it ? it.file.name : 'No file selected';
      $('#cmpSelHint').textContent = it ? TYPE[it.type].hint : 'Add a file to see its options.';
      $('#cmpPdfOpts').style.display = !it || it.type === 'pdf' ? '' : 'none';
      $('#cmpImgOpts').style.display = it?.type === 'image' ? '' : 'none';
      $('#cmpDocOpts').style.display = it && (it.type === 'office' || it.type === 'zip') ? '' : 'none';
    }

    function renderTotals() {
      const before = queue.reduce((a, x) => a + x.before, 0);
      const anyDone = queue.some(x => x.status === 'done');
      const after = queue.reduce((a, x) => a + (x.status === 'done' ? x.after : x.before), 0);
      $('#cmpTotBefore').textContent = queue.length ? fmtBytes(before) : '—';
      $('#cmpTotAfter').textContent = anyDone ? fmtBytes(after) : '—';
      $('#cmpTotSaved').textContent = anyDone && before ? `${Math.max(0, Math.round((1 - after / before) * 100))}%` : '—';
      const pending = queue.filter(x => x.status === 'queued' || x.status === 'error').length;
      const label = btn.querySelector('.btn-label');
      btn.dataset.mode = pending ? 'run' : anyDone ? 'download' : 'run';
      if (running) { btn.disabled = true; return; }
      btn.disabled = !queue.length;
      btn.classList.remove('loading');
      if (pending) label.textContent = `Compress ${pending} file${pending === 1 ? '' : 's'}`;
      else if (anyDone) label.textContent = `Download all · ${fmtBytes(queue.filter(x => x.status === 'done').reduce((a, x) => a + x.after, 0))}`;
      else label.textContent = 'Compress files';
      btn.querySelector('.btn-ic use').setAttribute('href', pending || !anyDone ? '#i-compress' : '#i-download');
    }

    function parseFilename(disp) {
      const utf8 = disp.match(/filename\*=UTF-8''([^;\s]+)/i);
      if (utf8) return decodeURIComponent(utf8[1]);
      const ascii = disp.match(/filename="(.+?)"/);
      return ascii ? ascii[1] : null;
    }

    function download(it) {
      if (!it.blob) return;
      const url = URL.createObjectURL(it.blob);
      const a = document.createElement('a');
      a.href = url; a.download = it.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    async function compressOne(it) {
      const fd = new FormData();
      fd.append('file', it.file);
      let endpoint;
      if (it.type === 'pdf') { endpoint = '/compress-pdf'; fd.append('preset', $('input[name="cmpPreset"]:checked')?.value ?? 'high'); }
      else if (it.type === 'image') { endpoint = '/compress-image'; fd.append('quality', $('#cmpImgQual').value); fd.append('format', $('#cmpImgFmt').value); }
      else { endpoint = '/compress-doc'; fd.append('quality', 80); }
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const newSize = parseInt(res.headers.get('X-Compressed-Size') ?? '0', 10) || blob.size;
      it.blob = blob;
      it.after = newSize;
      it.name = parseFilename(res.headers.get('content-disposition') ?? '') ?? it.file.name.replace(/(\.[^.]+)$/, '_compressed$1');
    }

    async function run() {
      const todo = queue.filter(x => x.status === 'queued' || x.status === 'error');
      if (!todo.length) return;
      running = true; msg('');
      btn.classList.add('loading'); btn.disabled = true;
      btn.querySelector('.btn-label').textContent = 'Compressing…';
      pWrap.style.display = 'block';
      let done = 0, failed = 0;
      const step = () => {
        const pct = Math.round(done / todo.length * 100);
        pFill.style.width = `${pct}%`; pPct.textContent = `${pct}%`;
        pLbl.textContent = done < todo.length ? `Compressing ${done + 1} of ${todo.length}` : 'Done';
      };
      step();
      for (const it of todo) {
        if (!queue.includes(it)) { done++; continue; }
        it.status = 'running'; it.error = null; render();
        try {
          await compressOne(it); it.status = 'done';
          document.dispatchEvent(new CustomEvent('sd:result', { detail: {
            tool: 'compress', blob: it.blob, name: it.name, sources: [it.file], before: it.before, after: it.after,
          } }));
        }
        catch (err) { it.status = 'error'; it.error = err.message; failed++; }
        done++; step(); render();
      }
      running = false;
      setTimeout(() => { pWrap.style.display = 'none'; }, 1500);
      const ok = todo.filter(x => x.status === 'done');
      if (ok.length === 1 && todo.length === 1) download(ok[0]);
      if (failed) msg(`${failed} file${failed === 1 ? '' : 's'} could not be compressed. Hover the row for details, or press the button to retry.`, true);
      else msg(ok.length === 1 ? `Downloaded ${ok[0].name}` : `${ok.length} files compressed. Download them one by one or all at once.`);
      render();
    }

    btn.addEventListener('click', async () => {
      if (running) return;
      if (btn.dataset.mode === 'download') {
        const done = queue.filter(x => x.status === 'done');
        for (const it of done) { download(it); await new Promise(r => setTimeout(r, 350)); }
        return;
      }
      run();
    });

    // Changing settings re-queues finished files of that type so the new
    // settings actually apply on the next run.
    function requeue(type) {
      let n = 0;
      queue.forEach(x => { if (x.type === type && x.status === 'done') { x.status = 'queued'; x.after = null; x.blob = null; n++; } });
      if (n) { msg(''); render(); }
    }
    $$('input[name="cmpPreset"]').forEach(r => r.addEventListener('change', () => requeue('pdf')));
    $('#cmpImgQual').addEventListener('input', () => { $('#cmpImgQualVal').textContent = $('#cmpImgQual').value; });
    $('#cmpImgQual').addEventListener('change', () => requeue('image'));
    $('#cmpImgFmt').addEventListener('change', () => requeue('image'));

    dz.addEventListener('click', e => { if (e.target !== input) input.click(); });
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
    input.addEventListener('change', () => { if (input.files.length) addFiles(input.files); input.value = ''; });

    render();
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // EDITOR — tool panel, swatches, layers
  // ══════════════════════════════════════════════════════════════════════════
  (function editorPanel() {
    const TOOLS = {
      whiteout:      ['Whiteout', 'W', 'Drag on the page to cover content with white.'],
      blackout:      ['Blackout', 'B', 'Drag on the page to redact content in black.'],
      highlight:     ['Highlight', 'H', 'Drag across a line of text to highlight it.'],
      'rect-outline':['Rectangle', 'R', 'Drag to draw an outlined rectangle.'],
      circle:        ['Circle', 'C', 'Drag to draw an outlined circle or ellipse.'],
      arrow:         ['Arrow', 'A', 'Drag from the tail to the point of the arrow.'],
      line:          ['Line', 'L', 'Drag to draw a straight line.'],
      text:          ['Text', 'T', 'Click where the text should go, type, then press Enter.'],
      pen:           ['Draw', 'P', 'Freehand pen — drag to draw.'],
      stamp:         ['Stamp', 'S', 'Click to place the selected stamp.'],
      select:        ['Select', 'V', 'Click an annotation to select it, then drag to move or pull a corner to resize. Delete removes it.'],
      eraser:        ['Eraser', 'E', 'Click any annotation to remove it.'],
    };
    const LAYER_NAMES = { whiteout: 'Whiteout', blackout: 'Blackout', highlight: 'Highlight', 'rect-outline': 'Rectangle', circle: 'Circle', arrow: 'Arrow', line: 'Line', pen: 'Drawing', signature: 'Signature' };
    const toolbar = $('.ed-toolbar');
    if (!toolbar) return;

    function currentTool() { return $('.editor-tool-btn.active', toolbar)?.dataset.tool ?? 'whiteout'; }
    function syncTool() {
      const t = TOOLS[currentTool()] ?? TOOLS.whiteout;
      $('#editorToolName').textContent = t[0];
      $('#editorToolKey').textContent = t[1];
      $('#editorToolHint').textContent = t[2];
      syncSwatches();
    }
    new MutationObserver(syncTool).observe(toolbar, { subtree: true, attributes: true, attributeFilter: ['class'] });

    const colorInput = $('#editorColor');
    function syncSwatches() {
      const c = (window.ScanDriftEditor?.state.color ?? colorInput.value).toLowerCase();
      let matched = false;
      $$('#editorSwatches button').forEach(b => { const m = b.dataset.c.toLowerCase() === c; b.classList.toggle('on', m); matched ||= m; });
      $('.swatch-custom')?.classList.toggle('on', !matched);
    }
    $$('#editorSwatches button').forEach(b => b.addEventListener('click', () => {
      window.ScanDriftEditor?.setColor(b.dataset.c);
      syncSwatches();
    }));
    colorInput?.addEventListener('input', syncSwatches);

    let raf = 0;
    document.addEventListener('sd:editor-render', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; renderLayers(); });
    });

    function renderLayers() {
      const ed = window.ScanDriftEditor; if (!ed) return;
      const st = ed.state;
      const anns = st.annotations[st.currentPage] ?? [];
      $('#editorLayerMeta').textContent = `Page ${st.currentPage + 1} · ${anns.length}`;
      $('#editorLayersEmpty').style.display = anns.length ? 'none' : '';
      const box = $('#editorLayers');
      box.innerHTML = '';
      anns.slice().reverse().forEach((a, ri) => {
        const idx = anns.length - 1 - ri;
        let label = LAYER_NAMES[a.type] ?? a.type;
        if (a.type === 'text') label = `Text · “${(a.text || '').slice(0, 24)}”`;
        if (a.type === 'stamp') label = `Stamp · ${a.text}`;
        const color = a.type === 'whiteout' ? '#ffffff' : a.type === 'blackout' ? '#000000' : a.type === 'signature' ? '#1d3d8f' : (a.color || '#17211f');
        const row = document.createElement('div');
        row.className = 'layer' + (st.selected?.annIdx === idx ? ' on' : '');
        row.innerHTML = `<i style="--c:${esc(color)}"></i><span>${esc(label)}</span><button type="button" class="icon-btn" title="Delete"><svg class="ic"><use href="#i-trash"/></svg></button>`;
        row.addEventListener('click', e => {
          if (e.target.closest('button')) { ed.remove(idx); return; }
          const sel = $('.editor-tool-btn[data-tool="select"]');
          if (currentTool() !== 'select') sel?.click();
          ed.select(idx);
        });
        box.appendChild(row);
      });
    }
    syncTool();
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // BOOT
  // ══════════════════════════════════════════════════════════════════════════
  route();
  refreshPricing();
  revealCheck();
})();
