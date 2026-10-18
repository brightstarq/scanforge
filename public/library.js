'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   SCANDRIFT — library.js
   "My Documents": every scan, compression and edit is saved in the visitor's
   own browser (IndexedDB), so they can come back, download a result again or
   send it to another tool. Nothing here touches the server.

   Each record keeps metadata, a small thumbnail and, budget permitting, the
   output file itself. When the file budget is exceeded the oldest files are
   dropped first but their history entry stays (shown as "File no longer kept").
═══════════════════════════════════════════════════════════════════════════ */

(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtBytes = b => {
    if (!b) return '0 KB';
    if (b < 1_048_576) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
    if (b < 1_073_741_824) return `${(b / 1_048_576).toFixed(b < 10 * 1_048_576 ? 2 : 1)} MB`;
    return `${(b / 1_073_741_824).toFixed(2)} GB`;
  };
  const splitBytes = b => { const t = fmtBytes(b).split(' '); return `${t[0]} <em>${t[1]}</em>`; };

  const MAX_FILE   = 50 * 1_048_576;   // largest single result we keep
  const BUDGET     = 500 * 1_048_576;  // total bytes of kept files
  const MAX_ITEMS  = 300;              // history entries

  // ══════════════════════════════════════════════════════════════════════════
  // STORE (IndexedDB, with an in-memory fallback for private windows)
  // ══════════════════════════════════════════════════════════════════════════
  const DB_NAME = 'scandrift', STORE = 'docs';
  let dbPromise = null;
  let memory = null; // used when IndexedDB is unavailable

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const os = req.result.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('createdAt', 'createdAt');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { memory = []; resolve(null); };
        req.onblocked = () => { memory = []; resolve(null); };
      } catch { memory = []; resolve(null); }
    });
    return dbPromise;
  }
  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  async function all() {
    const db = await openDb();
    if (!db) return memory.slice().sort((a, b) => b.createdAt - a.createdAt);
    const rows = await tx(db, 'readonly', os => os.getAll());
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }
  async function put(rec) {
    const db = await openDb();
    if (!db) { memory = memory.filter(r => r.id !== rec.id); memory.push(rec); return; }
    await tx(db, 'readwrite', os => os.put(rec));
  }
  async function del(id) {
    const db = await openDb();
    if (!db) { memory = memory.filter(r => r.id !== id); return; }
    await tx(db, 'readwrite', os => os.delete(id));
  }
  async function clearAll() {
    const db = await openDb();
    if (!db) { memory = []; return; }
    await tx(db, 'readwrite', os => os.clear());
  }

  // Keep the file budget and entry count in check, oldest first.
  async function prune() {
    const rows = await all(); // newest first
    let used = 0;
    for (const r of rows) {
      if (!r.blob) continue;
      if (used + r.blob.size > BUDGET) { r.blob = null; r.dropped = true; await put(r); }
      else used += r.blob.size;
    }
    for (const r of rows.slice(MAX_ITEMS)) await del(r.id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECORDING RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  async function thumbFrom(src) {
    try {
      const img = await new Promise((res, rej) => {
        if (src instanceof HTMLCanvasElement) return res(src);
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
      });
      const w = 120, ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.max(1, Math.round(w * ratio));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', .72);
    } catch { return null; }
  }
  async function thumbFromFile(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return null;
    const url = URL.createObjectURL(file);
    try { return await thumbFrom(url); } finally { URL.revokeObjectURL(url); }
  }

  const ext = n => (String(n).split('.').pop() || '').toUpperCase().slice(0, 4);

  document.addEventListener('sd:result', async e => {
    const d = e.detail || {};
    if (!d.blob) return;
    const sources = d.sources || [];
    const srcName = sources.length > 1 ? `${sources.length} files` : (sources[0]?.name ?? '');
    const before = d.before ?? sources.reduce((a, f) => a + (f?.size || 0), 0);

    let thumb = null;
    if (d.tool === 'scan') {
      const prev = $('#stageOrigImg');
      if (prev?.src) thumb = await thumbFrom(prev.src);
    } else if (d.tool === 'edit') {
      const c = $('#editorThumbSidebar canvas');
      if (c) thumb = await thumbFrom(c);
    } else if (d.tool === 'compress') {
      thumb = await thumbFromFile(sources[0]);
    }

    const pagesFromScan = () => {
      const lbl = $('#filePages')?.textContent ?? '';
      const n = parseInt(lbl, 10);
      return d.capped ? Math.min(d.capped, n || d.capped) : (n || null);
    };

    const rec = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      tool: d.tool,
      name: d.name,
      srcName,
      mime: d.blob.type || 'application/octet-stream',
      before,
      after: d.blob.size,
      pages: d.tool === 'scan' ? pagesFromScan() : (d.pages ?? null),
      capped: d.capped ?? null,
      createdAt: Date.now(),
      thumb,
      blob: d.blob.size <= MAX_FILE ? d.blob : null,
      dropped: d.blob.size > MAX_FILE,
    };
    try {
      await put(rec);
      await prune();
    } catch (err) {
      // Quota exceeded or storage blocked: keep the entry without the file
      console.warn('Could not save to My Documents:', err?.message);
      try { rec.blob = null; rec.dropped = true; await put(rec); } catch {}
    }
    refresh();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SEND A FILE TO A TOOL
  // ══════════════════════════════════════════════════════════════════════════
  const ACCEPT = {
    scanner:    f => /\.(pdf|jpe?g|png|webp|tiff?|bmp)$/i.test(f.name),
    compressor: f => /\.(pdf|jpe?g|png|webp|docx|xlsx|pptx|zip)$/i.test(f.name),
    editor:     f => /\.(pdf|jpe?g|png|webp)$/i.test(f.name),
  };
  const TOOL_LABEL = { scanner: 'Scanner', compressor: 'Compressor', editor: 'Editor' };

  function sendTo(tool, files) {
    files = files.filter(ACCEPT[tool]);
    if (!files.length) return;
    if (tool === 'editor') files = files.slice(0, 1);
    location.hash = `#/${tool}`;
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    const input = { scanner: '#pdfInput', compressor: '#cmpInput', editor: '#editorInput' }[tool];
    const el = $(input);
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (tool === 'editor') setTimeout(() => $('#editorOpenBtn')?.click(), 0);
  }
  window.ScanDriftLibrary = { sendTo };

  function recordFile(rec) {
    return rec.blob ? new File([rec.blob], rec.name, { type: rec.mime }) : null;
  }

  // Tool picker for files dropped on the Overview
  let pending = [];
  const modal = $('#routeModal');
  function openPicker(files) {
    pending = Array.from(files).filter(f => f.size <= 50 * 1_048_576);
    if (!pending.length) return;
    $('#routeTitle').textContent = pending.length === 1 ? 'What would you like to do with this file?' : `What would you like to do with ${pending.length} files?`;
    $('#routeFiles').textContent = pending.slice(0, 3).map(f => f.name).join(', ') + (pending.length > 3 ? ` and ${pending.length - 3} more` : '');
    const notes = [];
    $$('.route-opt', modal).forEach(b => {
      const n = pending.filter(ACCEPT[b.dataset.tool]).length;
      b.disabled = !n;
      if (b.dataset.tool === 'editor' && n && pending.length > 1) notes.push('The Editor opens one file at a time — it will use the first one.');
      if (n && n < pending.length && b.dataset.tool !== 'editor') notes.push(`${TOOL_LABEL[b.dataset.tool]} will skip ${pending.length - n} unsupported file${pending.length - n === 1 ? '' : 's'}.`);
    });
    $('#routeNote').textContent = notes.join(' ');
    modal.style.display = 'flex';
  }
  function closePicker() { modal.style.display = 'none'; pending = []; }
  $$('.route-opt', modal).forEach(b => b.addEventListener('click', () => { const f = pending; closePicker(); sendTo(b.dataset.tool, f); }));
  $('#routeClose')?.addEventListener('click', closePicker);
  modal?.addEventListener('click', e => { if (e.target === modal) closePicker(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal?.style.display === 'flex') closePicker(); });

  const ovDrop = $('#ovDrop'), ovInput = $('#ovInput');
  ovDrop?.addEventListener('click', e => { if (e.target !== ovInput) ovInput.click(); });
  ovDrop?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ovInput.click(); } });
  ovDrop?.addEventListener('dragover', e => { e.preventDefault(); ovDrop.classList.add('drag-over'); });
  ovDrop?.addEventListener('dragleave', () => ovDrop.classList.remove('drag-over'));
  ovDrop?.addEventListener('drop', e => { e.preventDefault(); ovDrop.classList.remove('drag-over'); if (e.dataTransfer.files.length) openPicker(e.dataTransfer.files); });
  ovInput?.addEventListener('change', () => { if (ovInput.files.length) openPicker(ovInput.files); ovInput.value = ''; });
  $('#ovNewBtn')?.addEventListener('click', () => ovInput.click());

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ══════════════════════════════════════════════════════════════════════════
  const TOOL_META = {
    scan:     { label: 'Scanned',    pill: 'scan',     icon: 'i-scan',     verb: 'Scan completed' },
    compress: { label: 'Compressed', pill: 'compress', icon: 'i-compress', verb: 'File compressed' },
    edit:     { label: 'Edited',     pill: 'edit',     icon: 'i-edit',     verb: 'PDF edited' },
  };

  function when(ts) {
    const d = new Date(ts), now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const day = 86_400_000, start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= start) return `Today, ${time}`;
    if (ts >= start - day) return `Yesterday, ${time}`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  function ago(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
  function subline(r) {
    const bits = [];
    if (r.pages) bits.push(`${r.pages} page${r.pages === 1 ? '' : 's'}`);
    bits.push(fmtBytes(r.after));
    if (r.tool === 'compress' && r.before > r.after) bits.push(`${Math.round((1 - r.after / r.before) * 100)}% smaller`);
    if (r.srcName && r.srcName !== r.name) bits.push(`from ${r.srcName}`);
    return bits.join(' · ');
  }

  function rowHtml(r) {
    const m = TOOL_META[r.tool] ?? TOOL_META.scan;
    const thumb = r.thumb ? `<img src="${r.thumb}" alt="">` : esc(ext(r.name));
    return `
      <div class="doc-row" data-id="${esc(r.id)}">
        <span class="doc-name"><span class="doc-thumb">${thumb}</span><span><b title="${esc(r.name)}">${esc(r.name)}</b><small>${esc(subline(r))}</small></span></span>
        <span class="doc-when">${esc(when(r.createdAt))}</span>
        <span><span class="pill ${m.pill}">${m.label}</span>${r.blob ? '' : '<small class="hint" style="display:block;margin-top:3px">File no longer kept</small>'}</span>
        <span class="doc-acts">
          <button type="button" class="use" data-act="use" ${r.blob ? '' : 'disabled'} title="Open in another tool">Use in… <svg class="ic"><use href="#i-chev-r"/></svg></button>
          <button type="button" class="icon-btn" data-act="dl" ${r.blob ? '' : 'disabled'} title="Download again"><svg class="ic"><use href="#i-download"/></svg></button>
          <button type="button" class="icon-btn" data-act="rm" title="Remove from history"><svg class="ic"><use href="#i-trash"/></svg></button>
        </span>
      </div>`;
  }
  const HEAD = '<div class="doc-row head"><span>Document</span><span>Saved</span><span>Status</span><span></span></div>';

  let rows = [];
  let filter = 'all', query = '';

  function renderTable(el, list, emptyHtml) {
    el.innerHTML = list.length ? HEAD + list.map(rowHtml).join('') : HEAD + `<div class="doc-empty">${emptyHtml}</div>`;
  }

  function renderOverview() {
    const now = new Date();
    const h = now.getHours();
    $('#ovDate').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    $('#ovGreeting').textContent = h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

    const scans = rows.filter(r => r.tool === 'scan');
    const comps = rows.filter(r => r.tool === 'compress');
    const week = rows.filter(r => r.createdAt > Date.now() - 7 * 86_400_000).length;
    const saved = comps.reduce((a, r) => a + Math.max(0, r.before - r.after), 0);
    const kept = rows.filter(r => r.blob);
    const stored = kept.reduce((a, r) => a + r.blob.size, 0);

    $('#stDocs').textContent = rows.length;
    $('#stDocsSub').textContent = rows.length ? `${week} in the last 7 days` : 'Nothing yet — your results land here';
    $('#stDocsSub').classList.toggle('up', week > 0);
    $('#stScans').textContent = scans.length;
    $('#stScansSub').textContent = `${scans.reduce((a, r) => a + (r.pages || 0), 0)} pages scanned`;
    $('#stSaved').innerHTML = splitBytes(saved);
    $('#stSavedSub').textContent = `Across ${comps.length} compressed file${comps.length === 1 ? '' : 's'}`;
    $('#stStored').innerHTML = splitBytes(stored);
    $('#stStoredSub').textContent = `${kept.length} file${kept.length === 1 ? '' : 's'} you can download again`;

    renderTable($('#ovRecent'), rows.slice(0, 5),
      `<span>Nothing here yet. Scan, compress or edit a file and it will show up here.</span><a class="btn btn-line btn-sm" href="#/scanner">Try the Scanner</a>`);

    const act = $('#ovActivity');
    act.innerHTML = rows.length ? rows.slice(0, 4).map(r => {
      const m = TOOL_META[r.tool] ?? TOOL_META.scan;
      const extra = r.tool === 'compress' && r.before > r.after ? ` · ${Math.round((1 - r.after / r.before) * 100)}% smaller` : r.tool === 'scan' ? ' is ready' : ' was saved';
      return `<div class="act"><span class="sc-ic"><svg class="ic"><use href="#${m.icon}"/></svg></span><div><strong>${m.verb}</strong><p>${esc(r.name)}${esc(extra)}</p></div><time>${ago(r.createdAt)}</time></div>`;
    }).join('') : '<div class="act-empty">No activity yet.</div>';

    // Storage bar uses our own budget, which is what actually limits saving
    const pct = Math.min(100, stored / BUDGET * 100);
    $('#ovsUsed').textContent = `${fmtBytes(stored)} used`;
    $('#ovsCap').textContent = `of ${fmtBytes(BUDGET)}`;
    $('#ovsFill').style.width = `${pct}%`;
    $('#ovsFree').textContent = `${fmtBytes(Math.max(0, BUDGET - stored))} available`;
    $('#ovsPct').textContent = `${pct < 1 && stored ? '<1' : Math.round(pct)}% used`;
  }

  function renderLibrary() {
    const q = query.trim().toLowerCase();
    const list = rows.filter(r => (filter === 'all' || r.tool === filter) && (!q || r.name.toLowerCase().includes(q) || (r.srcName || '').toLowerCase().includes(q)));
    const empty = rows.length
      ? `<span>No documents match${q ? ` “${esc(query)}”` : ''}.</span>`
      : `<span>Your library is empty. Everything you scan, compress or edit is saved here, in this browser only.</span><a class="btn btn-line btn-sm" href="#/overview">Go to Overview</a>`;
    renderTable($('#libList'), list, empty);
    $('#libClear').disabled = !rows.length;
  }

  async function refresh() {
    try { rows = await all(); } catch { rows = []; }
    const n = rows.length;
    $('#navDocCount').textContent = n ? (n > 99 ? '99+' : n) : '';
    renderOverview();
    renderLibrary();
  }

  // ── Row actions (shared by both tables) ────────────────────────────────────
  let menu = null;
  function closeMenu() { menu?.remove(); menu = null; }
  document.addEventListener('click', e => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('scroll', closeMenu, true);

  function download(rec) {
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url; a.download = rec.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function onTableClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const id = btn.closest('.doc-row')?.dataset.id;
    const rec = rows.find(r => r.id === id); if (!rec) return;
    const act = btn.dataset.act;
    if (act === 'dl' && rec.blob) download(rec);
    if (act === 'rm') { await del(rec.id); refresh(); }
    if (act === 'use' && rec.blob) {
      e.stopPropagation();
      closeMenu();
      const file = recordFile(rec);
      menu = document.createElement('div');
      menu.className = 'use-menu';
      menu.innerHTML = ['scanner', 'compressor', 'editor'].map(t => {
        const ok = ACCEPT[t](file);
        const icon = { scanner: 'i-scan', compressor: 'i-compress', editor: 'i-edit' }[t];
        const label = { scanner: 'Scan it', compressor: 'Compress it', editor: 'Edit it' }[t];
        return `<button type="button" data-tool="${t}" ${ok ? '' : 'disabled'}><svg class="ic"><use href="#${icon}"/></svg>${label}</button>`;
      }).join('');
      document.body.appendChild(menu);
      const r = btn.getBoundingClientRect();
      const top = Math.min(r.bottom + 6, innerHeight - menu.offsetHeight - 8);
      menu.style.top = `${top}px`;
      menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
      menu.addEventListener('click', ev => {
        const b = ev.target.closest('button[data-tool]'); if (!b || b.disabled) return;
        closeMenu();
        sendTo(b.dataset.tool, [file]);
      });
    }
  }
  $('#ovRecent')?.addEventListener('click', onTableClick);
  $('#libList')?.addEventListener('click', onTableClick);

  // ── Library controls ───────────────────────────────────────────────────────
  $('#libSearch')?.addEventListener('input', e => { query = e.target.value; renderLibrary(); });
  $$('#libFilter button').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.f;
    $$('#libFilter button').forEach(x => x.classList.toggle('on', x === b));
    renderLibrary();
  }));
  $('#libClear')?.addEventListener('click', async () => {
    if (!rows.length) return;
    if (!confirm(`Remove all ${rows.length} documents from this browser? This can't be undone.`)) return;
    await clearAll();
    refresh();
  });
  // Overview search jumps into the library with the query filled in
  $('#ovSearch')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    query = e.target.value; $('#libSearch').value = query; e.target.value = '';
    location.hash = '#/documents';
    renderLibrary();
  });

  document.addEventListener('sd:route', e => { if (e.detail === 'overview' || e.detail === 'documents') refresh(); });
  // Another tab may have added documents
  window.addEventListener('focus', refresh);

  refresh();
})();
