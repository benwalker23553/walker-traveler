/* Walker traveler — connects the tablet app to the shop's own database (Supabase).
   Gives the app the same small data interface it had inside Claude, so the screens and rules are unchanged. */
(function () {
  const URL_ = 'https://ztpkhjgsxzlwxjzddgzf.supabase.co';
  const KEY = 'sb_publishable_Zq17n4I5OapehYOckC7JQA_H7shyW9S';
  const SHOP_EMAIL = 'floor@walker-traveler.shop';
  /* ---------- safety: no request may hang the tablet. Each call gets a time limit; when the server is slow a banner says so and the work waits on the tablet ---------- */
  const net = { slow: 0, fail: 0, okAt: Date.now(), pend: 0 };
  const banner = () => { let b = document.getElementById('wt-netbar'); const bad = net.pend > 0 && (net.slow > 0 || net.fail > 0);
    if (!bad) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'wt-netbar'; b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2000;background:#B45309;color:#fff;font:600 15px system-ui,sans-serif;padding:8px 14px;text-align:center'; (document.body || document.documentElement).appendChild(b); }
    b.textContent = '⚠ The shop server is slow right now — keep working; your taps are saved on this tablet and send when it is back.'; };
  const safeFetch = (u, o) => {
    const url = String(typeof u === 'string' ? u : (u && u.url) || ''), big = /\/storage\/v1\//.test(url), ms = big ? 120000 : /\/auth\/v1\//.test(url) ? 15000 : 25000;
    const ac = new AbortController(), t0 = Date.now(); if (o && o.signal) o.signal.addEventListener('abort', () => ac.abort());
    net.pend++; const slowT = setTimeout(() => { net.slow++; banner(); }, big ? 30000 : 6000), killT = setTimeout(() => ac.abort(), ms);
    return window.fetch.call(window, u, Object.assign({}, o, { signal: ac.signal })).then((r) => { if (r.status >= 500) { net.fail++; } else if (Date.now() - t0 < 6000) { net.fail = 0; net.slow = 0; net.okAt = Date.now(); } return r; },
      (e) => { net.fail++; throw e; }).finally(() => { clearTimeout(slowT); clearTimeout(killT); net.pend--; if (net.slow > 0 && Date.now() - t0 >= 6000) net.slow--; banner(); });
  };
  window.WT_NET = net;
  const sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: (u, o) => safeFetch(u, o) } });
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
  // The sign-in check can hang when the server is overloaded. If this tablet already has a saved shop sign-in, open with it after 8 s and keep retrying behind the scenes.
  let decided = false; const hasSaved = () => { try { return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)); } catch (e) { return false; } };
  const decide = (ok) => { if (decided) return; decided = true; if (ok) ready(true); else loginScreen(); };
  sb.auth.getSession().then(({ data }) => decide(!!(data && data.session)), () => decide(hasSaved()));
  setTimeout(() => { if (!decided && hasSaved()) decide(true); }, 8000);
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && decided && !hasSaved()) loginScreen('This tablet was signed out of the shop. A manager enters the shop password once to set it up again.'); });

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
  // debug: ?skipcol=jobs,prints loads the app with those data sets left empty (to find what makes a screen hang)
  const SKIPCOL = (new URLSearchParams(location.search).get('skipcol') || '').split(',').filter(Boolean);
  async function loadCol(col) {
    const out = new Map(); let from = 0;
    if (SKIPCOL.indexOf(col) >= 0 || SKIPCOL.indexOf('all') >= 0) { cache[col] = out; return out; }
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
    // Catch up after the tablet wakes, Wi-Fi returns or the live link reconnects — at most once every 3 minutes, spread out so tablets don't all download at once
    let lastSync = Date.now(); const resync = () => { if (Date.now() - lastSync < 180000) return; lastSync = Date.now(); setTimeout(() => Object.keys(cache).forEach((c) => loadCol(c).then(() => emit(c)).catch(() => {})), Math.random() * 15000); };
    channel = sb.channel('docs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p) => {
      const r = p.new && p.new.col ? p.new : null; if (!r) return;
      (cache[r.col] = cache[r.col] || new Map()).set(r.id, r.data); emit(r.col);
    }).subscribe((st) => { if (st === 'SUBSCRIBED') resync(); });
    // Catch up after the tablet wakes or Wi-Fi returns
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
    window.addEventListener('online', resync);
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
      const net = async () => { const { data, error } = await sb.storage.from('files').download(path); if (error) throw error; if (C) C.put(key, new Response(data)).catch(() => {}); return data; };
      const hit = C ? await C.match(key).catch(() => null) : null;
      // Saved copy first so the tablet opens fast and 20 tablets don't all pull megabytes at once; a quiet refresh later keeps it current.
      if (hit) { if (/^data\//.test(path)) setTimeout(() => net().catch(() => {}), 120000 + Math.random() * 240000); return hit.blob(); }
      try { return await net(); } catch (e) { delete fileCache[path]; throw e; }
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
    try { const b = await Promise.race([getFile('data/base.json'), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 15000))]); base = JSON.parse(await b.text()); try { localStorage.setItem('wt-base', JSON.stringify(base)); } catch (e) { /* full */ } }
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
