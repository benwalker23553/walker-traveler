/* Walker traveler — connects the tablet app to the shop's own database (Supabase).
   Gives the app the same small data interface it had inside Claude, so the screens and rules are unchanged. */
(function () {
  const URL_ = 'https://ztpkhjgsxzlwxjzddgzf.supabase.co';
  const KEY = 'sb_publishable_Zq17n4I5OapehYOckC7JQA_H7shyW9S';
  const SHOP_EMAIL = 'floor@walker-traveler.shop';
  const sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  window.WT_SB = sb;
  const deep = (o) => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deep); } return o; };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------- shop login (once per device) ---------- */
  let ready;
  const authed = new Promise((res) => { ready = res; });
  function loginScreen(msg) {
    let el = document.getElementById('shop-login');
    if (!el) { el = document.createElement('div'); el.id = 'shop-login'; document.body.appendChild(el); }
    el.innerHTML = '<div class="sl-card"><h1>Walker Traveler</h1><p>Set up this tablet or phone. A manager enters the shop password once. After that, people only tap their name and PIN.</p>' +
      '<label>Shop password<input id="sl-pw" type="password" autocomplete="current-password"></label>' +
      (msg ? '<p class="sl-bad">' + msg + '</p>' : '') + '<button id="sl-go" type="button">Set up this device</button>' +
      '<p class="sl-small">Configurar este dispositivo: un gerente escribe la contraseña del taller una sola vez.</p></div>';
    el.hidden = false;
    const go = async () => {
      const pw = document.getElementById('sl-pw').value;
      const { error } = await sb.auth.signInWithPassword({ email: SHOP_EMAIL, password: pw });
      if (error) return loginScreen('That password did not work. Check it and try again.');
      el.hidden = true; ready(true);
    };
    document.getElementById('sl-go').onclick = go;
    document.getElementById('sl-pw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }
  sb.auth.getSession().then(({ data }) => { if (data && data.session) ready(true); else loginScreen(); });

  /* ---------- documents: same shape as before (collection / doc / onSnapshot / set) ---------- */
  const cache = {};            // col -> Map(id -> data)
  const subs = {};             // col -> [callbacks]
  const docSubs = {};          // 'col/id' -> [callbacks]
  let channel = null;
  function emit(col) {
    const m = cache[col] || new Map();
    (subs[col] || []).forEach((cb) => cb({ docs: [...m.entries()].map(([id, data]) => ({ id, data: () => deep(clone(data)) })) }));
    [...m.keys()].forEach((id) => (docSubs[col + '/' + id] || []).forEach((cb) => cb({ exists: true, data: () => deep(clone(m.get(id))) })));
  }
  async function loadCol(col) {
    const out = new Map(); let from = 0;
    for (;;) {
      const { data, error } = await sb.from('docs').select('id,data').eq('col', col).range(from, from + 999);
      if (error) throw error;
      data.forEach((r) => out.set(r.id, r.data));
      if (data.length < 1000) break; from += 1000;
    }
    cache[col] = out; return out;
  }
  function live() {
    if (channel) return;
    channel = sb.channel('docs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p) => {
      const r = p.new && p.new.col ? p.new : null; if (!r) return;
      (cache[r.col] = cache[r.col] || new Map()).set(r.id, r.data); emit(r.col);
    }).subscribe((st) => { if (st === 'SUBSCRIBED') Object.keys(cache).forEach((c) => loadCol(c).then(() => emit(c)).catch(() => {})); });
    // Catch up after the tablet wakes or Wi-Fi returns
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Object.keys(cache).forEach((c) => loadCol(c).then(() => emit(c)).catch(() => {})); });
    window.addEventListener('online', () => Object.keys(cache).forEach((c) => loadCol(c).then(() => emit(c)).catch(() => {})));
  }
  const db = {
    collection(col) {
      return { onSnapshot(cb, err) { (subs[col] = subs[col] || []).push(cb); loadCol(col).then(() => emit(col)).catch((e) => err && err(e)); live(); return () => {}; } };
    },
    doc(path) {
      const [col, id] = path.split('/');
      return {
        onSnapshot(cb, err) {
          (docSubs[path] = docSubs[path] || []).push(cb);
          loadCol(col).then((m) => { if (!m.has(id)) cb({ exists: false, data: () => undefined }); else emit(col); }).catch((e) => err && err(e)); live(); return () => {};
        },
        async get() {
          const { data, error } = await sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle();
          if (error) throw error; return data ? { exists: true, data: () => deep(clone(data.data)) } : { exists: false, data: () => undefined };
        },
        async acquire(o) { const { data, error } = await sb.rpc('acquire_lease', { p_path: path, p_holder: o.holder, p_ttl_ms: o.ttlMs || 8000 }); if (error) throw error; return { acquired: !!data }; },
        async set(v) {
          const data = clone(v);
          const { error } = await sb.from('docs').upsert({ col, id, data }, { onConflict: 'col,id' });
          if (error) throw error;
          (cache[col] = cache[col] || new Map()).set(id, data);
        }
      };
    }
  };

  /* ---------- files: master travelers and prints live in private storage ---------- */
  const fileCache = {};
  async function getFile(path) {
    if (!fileCache[path]) fileCache[path] = (async () => {
      const C = window.caches ? await caches.open('wt-files').catch(() => null) : null, key = new Request('/wt-files/' + path);
      try { const { data, error } = await sb.storage.from('files').download(path); if (error) throw error; if (C) C.put(key, new Response(data)).catch(() => {}); return data; }
      catch (e) { const hit = C ? await C.match(key) : null; if (hit) return hit.blob(); delete fileCache[path]; throw e; }
    })();
    return fileCache[path];
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = function (u, o) {
    const s = typeof u === 'string' ? u : (u && u.url) || '';
    if (/^(data|dwg|docs|pdm)\//.test(s)) return authed.then(() => getFile(s)).then((b) => new Response(b, { status: 200 }));
    return realFetch(u, o);
  };
  // <img src="docs/..."> → load from private storage
  // Images, videos and posters that point at private files are loaded through the shop login
  const PRIV = /^(docs|training|photos)\//;
  const fixEl = (el, attr) => { const s = el.getAttribute(attr) || ''; if (!PRIV.test(s) || el.dataset['wt' + attr]) return; el.dataset['wt' + attr] = s; el.removeAttribute(attr); authed.then(() => getFile(s)).then((b) => { el.setAttribute(attr, URL.createObjectURL(b)); if (el.tagName === 'SOURCE' && el.parentNode && el.parentNode.load) el.parentNode.load(); }).catch(() => {}); };
  const scan = (n) => { if (n.nodeType !== 1) return; [n].concat([...n.querySelectorAll('img,source,video')]).forEach((el) => { if (el.tagName === 'IMG' || el.tagName === 'SOURCE') fixEl(el, 'src'); if (el.tagName === 'VIDEO') fixEl(el, 'poster'); }); };
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(scan))).observe(document.documentElement, { childList: true, subtree: true });

  /* ---------- saving files: labels open and print; everything else downloads ---------- */
  const downloads = {
    async save({ filename, data }) {
      const blob = new Blob([data], { type: /\.html$/.test(filename) ? 'text/html' : /\.csv$/.test(filename) ? 'text/csv' : 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      if (/^labels-/.test(filename)) { const w = window.open(url, '_blank'); if (w) return; }
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }
  };

  window.claude = { use: async (n) => { await authed; if (n === 'db') return db; if (n === 'downloads') return downloads; return null; } };
  // login screen style
  const st = document.createElement('style'); st.textContent = '#shop-login{position:fixed;inset:0;z-index:1000;background:#1B3A5C;display:flex;align-items:center;justify-content:center;padding:16px}#shop-login .sl-card{background:#fff;color:#13202D;border-radius:10px;padding:28px;max-width:460px;width:100%;display:flex;flex-direction:column;gap:12px;font:16px/1.4 Barlow,Arial,sans-serif}#shop-login h1{margin:0;font:700 2rem "Barlow Condensed",Arial,sans-serif;text-transform:uppercase}#shop-login label{display:flex;flex-direction:column;gap:6px;font-weight:600}#shop-login input{font-size:1.2rem;padding:12px;border:2px solid #C3CDD8;border-radius:6px}#shop-login button{font:700 1.2rem Barlow,Arial,sans-serif;padding:14px;border:0;border-radius:6px;background:#006600;color:#fff}#shop-login .sl-bad{color:#B80000;font-weight:600}#shop-login .sl-small{color:#4A6580;font-size:.9rem}';
  document.head.appendChild(st);

  /* ---------- start the app after the shop login: load the shop's own data, then the screens ---------- */
  async function boot() {
    await authed;
    let base = null;
    try { const b = await getFile('data/base.json'); base = JSON.parse(await b.text()); try { localStorage.setItem('wt-base', JSON.stringify(base)); } catch (e) { /* full */ } }
    catch (e) { try { base = JSON.parse(localStorage.getItem('wt-base') || 'null'); } catch (e2) { base = null; } }
    if (!base) { const el = document.getElementById('main'); if (el) el.innerHTML = '<div class="wrap"><div class="banner bad"><div><b>Shop files are not loaded yet.</b> A manager loads them once from a PC with the starter files.</div></div></div>'; }
    globalThis.WT_BASE = base || {};
    document.querySelectorAll('script[type="text/wt-deferred"]').forEach((old) => { const n = document.createElement('script'); n.text = old.text; old.replaceWith(n); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.WT_PUSH_KEY = 'BNi80xO7NFSp-QcyCLMGt2tyhdhT9FlUU-qCe_cbNTYLOvUdYZ3l5QbjZ1-3fzcddo4ihbANe_VtrZJKZLiQewQ';
  window.WT_NOTIFY = async (body) => { await authed; return sb.functions.invoke('notify', { body }); };
  window.WT_SIGNOUT_DEVICE = async () => { await sb.auth.signOut(); location.reload(); };
})();
