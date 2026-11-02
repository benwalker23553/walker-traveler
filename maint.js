/* ================================================================
   Walker Digital Traveler — Maintenance / PM Module
   Standalone add-on: loads after supa.js boots the app.
   Adds a MAINTENANCE tile to the main menu that shows
   pm_equipment (480 machines) and pm_work_orders from Supabase.
   ================================================================ */
(function () {
  'use strict';

  /* ---- helpers ---- */
  const esc = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  const fmtD = d => { if (!d) return '—'; return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };

  function pmStatus(eq) {
    if (!eq.last_pm_date || !eq.pm_freq_days) return 'unknown';
    const days = Math.floor((Date.now() - new Date(eq.last_pm_date)) / 864e5);
    const freq = parseInt(eq.pm_freq_days) || 365;
    return days > freq ? 'overdue' : days > freq * 0.8 ? 'due-soon' : 'on-track';
  }
  function daysSince(eq) {
    if (!eq.last_pm_date) return null;
    return Math.floor((Date.now() - new Date(eq.last_pm_date)) / 864e5);
  }

  /* ---- state ---- */
  const M = { equipment:[], workOrders:[], loaded:false, filter:'all', search:'', detail:null, tab:'equipment', showForm:false };

  /* ---- data ---- */
  async function load() {
    if (M.loaded) return;
    const sb = window.WT_SB;
    const [e, w] = await Promise.all([
      sb.from('pm_equipment').select('*').order('area').order('name'),
      sb.from('pm_work_orders').select('*').order('work_date',{ascending:false})
    ]);
    M.equipment = e.data || [];
    M.workOrders = w.data || [];
    M.loaded = true;
  }

  /* ---- CSS (injected once) ---- */
  const css = document.createElement('style');
  css.textContent = `
.maint-summary{display:flex;gap:.5rem;padding:.75rem 1rem;overflow-x:auto}
.maint-stat{text-align:center;min-width:4.5rem;padding:.5rem .75rem;background:var(--c2,#f5f5f5);border-radius:.5rem}
.maint-stat .num{display:block;font-size:1.5rem;font-weight:700}
.maint-stat .label{font-size:.75rem;opacity:.7}
.maint-stat.bad{background:#fee}.maint-stat.bad .num{color:var(--red,#c00)}
.maint-stat.warn{background:#fff8e0}.maint-stat.warn .num{color:#b86e00}
.maint-stat.muted{opacity:.6}
.maint-filters{display:flex;gap:.375rem;padding:.5rem 1rem;overflow-x:auto;flex-wrap:nowrap}
.chip{padding:.375rem .75rem;border-radius:999px;border:1px solid var(--c4,#ccc);background:var(--c1,#fff);font-size:.8rem;cursor:pointer;white-space:nowrap}
.chip.on{background:var(--c9,#333);color:#fff;border-color:var(--c9,#333)}
.chip.on.bad{background:var(--red,#c00);border-color:var(--red,#c00)}
.maint-search{padding:.5rem 1rem}
.maint-search input{width:100%;padding:.5rem .75rem;border:1px solid var(--c4,#ccc);border-radius:.375rem;font-size:.9rem;box-sizing:border-box}
.maint-list{padding:0 1rem}
.maint-card{display:block;width:100%;text-align:left;margin:.375rem 0;padding:.75rem;background:var(--c1,#fff);border:1px solid var(--c3,#e0e0e0);border-radius:.5rem;cursor:pointer}
.maint-card:active{background:var(--c2,#f0f0f0)}
.m-card-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem}
.m-card-meta{font-size:.8rem;color:var(--c6,#666);margin-top:.25rem}
.m-tag{font-size:.7rem;padding:.125rem .5rem;border-radius:999px;font-weight:600;display:inline-block}
.m-tag.bad{background:#fee;color:#c00}.m-tag.warn{background:#fff3cd;color:#856404}
.maint-detail{padding:0 1rem}
.maint-info{display:grid;grid-template-columns:1fr 1fr;gap:.25rem .75rem;padding:.5rem 0}
.m-info-row{display:flex;flex-direction:column;padding:.375rem 0}
.m-info-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;color:var(--c6,#888)}
.m-info-val{font-size:.9rem}
.maint-section{margin:1rem 0}.maint-section h3{font-size:1rem;margin-bottom:.5rem}
.maint-tasks{margin:0;padding-left:1.25rem}.maint-tasks li{font-size:.85rem;margin:.25rem 0}
.maint-form label{display:block;margin:.5rem 0;font-size:.85rem;font-weight:600}
.maint-form input,.maint-form textarea{display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid var(--c4,#ccc);border-radius:.375rem;font-size:.9rem;box-sizing:border-box}
.m-tab{padding:.5rem 1rem;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-size:.9rem}
.m-tab.on{border-bottom-color:var(--c9,#333);font-weight:600}
`;
  document.head.appendChild(css);

  /* ---- renderMaint ---- */
  async function renderMaint() {
    const main = document.getElementById('main');
    if (!main) return;

    if (!M.loaded) {
      main.innerHTML = '<div class="head"><div><h1>Maintenance</h1><p class="muted">Loading equipment data…</p></div></div>';
      await load();
    }

    let h = '';

    /* ---- DETAIL VIEW ---- */
    if (M.detail) {
      const eq = M.equipment.find(e => e.equip_id === M.detail);
      if (!eq) { M.detail = null; return renderMaint(); }
      const orders = M.workOrders.filter(w => w.equip_id === eq.equip_id);
      const st = pmStatus(eq);
      const stC = st==='overdue'?'bad':st==='due-soon'?'warn':'';

      h += '<div class="head"><div>';
      h += '<button class="btn sm" id="m-back" style="margin-bottom:.5rem">← Back</button>';
      h += '<h2>'+esc(eq.name)+' <span class="m-tag '+stC+'">'+(st==='overdue'?'OVERDUE':st==='due-soon'?'DUE SOON':st==='on-track'?'OK':'—')+'</span></h2>';
      h += '<p class="muted">#'+esc(eq.equip_id)+'</p></div></div>';

      h += '<div class="maint-detail"><div class="maint-info">';
      [['Area',eq.area],['Type',eq.type],['Status',eq.status],['Manufacturer',eq.manufacturer],
       ['Model',eq.model],['Serial',eq.serial_number],['Location',eq.location_raw],
       ['PM Freq',eq.pm_freq_days?eq.pm_freq_days+' days':null],['Last PM',fmtD(eq.last_pm_date)],
       ['Due',fmtD(eq.due_date)],['Cal Due',fmtD(eq.cal_due)]].forEach(([l,v])=>{
        if(v) h+='<div class="m-info-row"><span class="m-info-label">'+l+'</span><span class="m-info-val">'+esc(v)+'</span></div>';
      });
      h += '</div>';

      if (eq.pm_tasks && Array.isArray(eq.pm_tasks) && eq.pm_tasks.length) {
        h += '<div class="maint-section"><h3>PM Tasks</h3><ul class="maint-tasks">';
        eq.pm_tasks.forEach(t => { h += '<li>'+esc(typeof t==='string'?t:t.task||JSON.stringify(t))+'</li>'; });
        h += '</ul></div>';
      }
      if (eq.notes) h += '<div class="maint-section"><h3>Notes</h3><p>'+esc(eq.notes)+'</p></div>';
      if (eq.cal_notes) h += '<div class="maint-section"><h3>Calibration Notes</h3><p>'+esc(eq.cal_notes)+'</p></div>';

      h += '<div class="maint-section"><h3>Work History ('+orders.length+')</h3>';
      if (M.showForm) {
        const today = new Date().toISOString().split('T')[0];
        h += '<div class="maint-form card" style="padding:1rem;margin:.5rem 0"><h3>New Work Order</h3>';
        h += '<label>Date<input type="date" id="wo-date" value="'+today+'"></label>';
        h += '<label>Tech<input type="text" id="wo-tech" placeholder="Name"></label>';
        h += '<label>Tasks Done<textarea id="wo-tasks" rows="3" placeholder="Describe work performed"></textarea></label>';
        h += '<label>Parts Used<input type="text" id="wo-parts" placeholder="Parts, materials"></label>';
        h += '<label>Supervisor<input type="text" id="wo-super" placeholder="Supervisor name"></label>';
        h += '<label>Notes<input type="text" id="wo-notes" placeholder="Additional notes"></label>';
        h += '<div style="display:flex;gap:.5rem;margin-top:.5rem">';
        h += '<button class="btn sm" id="wo-save">Save</button>';
        h += '<button class="btn sm" id="wo-cancel" style="background:var(--c5)">Cancel</button>';
        h += '</div></div>';
      } else {
        h += '<button class="btn sm" id="m-new-wo">+ Log Work</button>';
      }
      orders.forEach(wo => {
        h += '<div class="card" style="margin:.5rem 0;padding:.75rem">';
        h += '<div class="m-card-top"><strong>'+fmtD(wo.work_date)+'</strong><span class="muted">'+esc(wo.tech)+'</span></div>';
        h += '<div class="m-card-meta">'+esc(wo.tasks_done)+'</div>';
        if(wo.parts_used) h += '<div class="m-card-meta"><em>Parts: '+esc(wo.parts_used)+'</em></div>';
        h += '</div>';
      });
      h += '</div></div>';

    /* ---- LIST VIEW ---- */
    } else {
      h += '<div class="head"><div><h1>Maintenance</h1>';
      h += '<p class="muted">'+M.equipment.filter(e=>e.status==='active').length+' active machines · '+M.workOrders.length+' work orders</p>';
      h += '</div></div>';

      h += '<div style="display:flex;gap:0;padding:0 1rem;border-bottom:1px solid var(--c3,#ddd)">';
      h += '<button class="m-tab '+(M.tab==='equipment'?'on':'')+'" data-mt="equipment">Equipment</button>';
      h += '<button class="m-tab '+(M.tab==='orders'?'on':'')+'" data-mt="orders">Work Orders</button>';
      h += '</div>';

      if (M.tab === 'equipment') {
        const active = M.equipment.filter(e=>e.status==='active');
        const overdue = active.filter(e=>pmStatus(e)==='overdue').length;
        const dueSoon = active.filter(e=>pmStatus(e)==='due-soon').length;

        h += '<div class="maint-summary">';
        h += '<div class="maint-stat"><span class="num">'+active.length+'</span><span class="label">Active</span></div>';
        h += '<div class="maint-stat bad"><span class="num">'+overdue+'</span><span class="label">Overdue</span></div>';
        h += '<div class="maint-stat warn"><span class="num">'+dueSoon+'</span><span class="label">Due Soon</span></div>';
        h += '<div class="maint-stat muted"><span class="num">'+M.equipment.filter(e=>e.status==='inactive').length+'</span><span class="label">Inactive</span></div>';
        h += '</div>';

        const areas = [...new Set(M.equipment.map(e=>e.area))].sort();
        h += '<div class="maint-filters">';
        h += '<button class="chip '+(M.filter==='all'?'on':'')+'" data-mf="all">All</button>';
        h += '<button class="chip '+(M.filter==='overdue'?'on bad':'')+'" data-mf="overdue">Overdue</button>';
        areas.forEach(a=>{h+='<button class="chip '+(M.filter===a?'on':'')+'" data-mf="'+esc(a)+'">'+esc(a)+'</button>';});
        h += '<button class="chip '+(M.filter==='inactive'?'on':'')+'" data-mf="inactive">Inactive</button>';
        h += '</div>';

        h += '<div class="maint-search"><input type="text" placeholder="Search equipment…" value="'+esc(M.search)+'" id="maint-q"></div>';

        let items = M.filter==='inactive' ? M.equipment.filter(e=>e.status==='inactive')
          : M.filter==='overdue' ? M.equipment.filter(e=>e.status==='active'&&pmStatus(e)==='overdue')
          : M.filter!=='all' ? M.equipment.filter(e=>e.status==='active'&&e.area===M.filter)
          : M.equipment.filter(e=>e.status==='active');
        if (M.search) {
          const q = M.search.toLowerCase();
          items = items.filter(e=>(e.name||'').toLowerCase().includes(q)||(e.equip_id||'').toLowerCase().includes(q)||(e.manufacturer||'').toLowerCase().includes(q)||(e.type||'').toLowerCase().includes(q));
        }

        h += '<div class="maint-list">';
        if (!items.length) h += '<p class="muted" style="padding:1rem">No equipment found.</p>';
        items.forEach(eq => {
          const st = pmStatus(eq), d = daysSince(eq);
          const stC = st==='overdue'?'bad':st==='due-soon'?'warn':'';
          h += '<button class="card maint-card" data-meq="'+esc(eq.equip_id)+'">';
          h += '<div class="m-card-top"><strong>'+esc(eq.name)+'</strong>';
          h += '<span class="m-tag '+stC+'">'+(st==='overdue'?'OVERDUE':st==='due-soon'?'DUE SOON':st==='on-track'?'OK':'—')+'</span></div>';
          h += '<div class="m-card-meta">'+esc(eq.area)+(eq.type?' · '+esc(eq.type):'')+' · #'+esc(eq.equip_id)+'</div>';
          if (d!==null) {
            h += '<div class="m-card-meta">Last PM: '+fmtD(eq.last_pm_date)+' ('+d+' days ago)';
            if(eq.pm_freq_days) h += ' · Every '+eq.pm_freq_days+' days';
            h += '</div>';
          }
          h += '</button>';
        });
        h += '</div>';
      } else {
        h += '<div class="maint-list">';
        M.workOrders.forEach(wo => {
          const eq = M.equipment.find(e=>e.equip_id===wo.equip_id);
          h += '<div class="card maint-card" data-meq="'+esc(wo.equip_id)+'" style="margin:.5rem 0">';
          h += '<div class="m-card-top"><strong>'+(eq?esc(eq.name):'#'+esc(wo.equip_id))+'</strong><span>'+fmtD(wo.work_date)+'</span></div>';
          h += '<div class="m-card-meta">'+esc(wo.tech)+' · '+esc(wo.location||(eq&&eq.area)||'')+'</div>';
          h += '<div class="m-card-meta">'+esc(wo.tasks_done)+'</div>';
          h += '</div>';
        });
        if (!M.workOrders.length) h += '<p class="muted" style="padding:1rem">No work orders yet.</p>';
        h += '</div>';
      }
    }

    main.innerHTML = h;
    bindEvents(main);
  }

  /* ---- events ---- */
  function bindEvents(main) {
    main.querySelectorAll('[data-mf]').forEach(b=>{b.onclick=ev=>{ev.stopPropagation();M.filter=b.dataset.mf;M.search='';renderMaint();}});
    const qi = document.getElementById('maint-q');
    if(qi){qi.oninput=()=>{M.search=qi.value;renderMaint();};setTimeout(()=>{const e=document.getElementById('maint-q');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},0);}
    main.querySelectorAll('[data-meq]').forEach(b=>{b.onclick=ev=>{ev.stopPropagation();M.detail=b.dataset.meq;M.showForm=false;renderMaint();}});
    main.querySelectorAll('[data-mt]').forEach(b=>{b.onclick=ev=>{ev.stopPropagation();M.tab=b.dataset.mt;renderMaint();}});
    const bb=document.getElementById('m-back');if(bb)bb.onclick=ev=>{ev.stopPropagation();M.detail=null;M.showForm=false;renderMaint();};
    const nw=document.getElementById('m-new-wo');if(nw)nw.onclick=ev=>{ev.stopPropagation();M.showForm=true;renderMaint();};
    const cc=document.getElementById('wo-cancel');if(cc)cc.onclick=ev=>{ev.stopPropagation();M.showForm=false;renderMaint();};
    const sv=document.getElementById('wo-save');
    if(sv) sv.onclick = async ev =>{
      ev.stopPropagation();
      const wo={equip_id:M.detail,work_date:document.getElementById('wo-date').value,
        tech:document.getElementById('wo-tech').value,tasks_done:document.getElementById('wo-tasks').value,
        parts_used:document.getElementById('wo-parts').value||null,supervisor:document.getElementById('wo-super').value||null,
        location:M.equipment.find(e=>e.equip_id===M.detail)?.area||null,
        notes:document.getElementById('wo-notes').value||null,checklist:[]};
      if(!wo.work_date||!wo.tech||!wo.tasks_done){alert('Please fill date, tech, and tasks.');return;}
      sv.textContent='Saving…';sv.disabled=true;
      const {error}=await window.WT_SB.from('pm_work_orders').insert([wo]).select();
      if(error){alert('Error: '+error.message);sv.textContent='Save';sv.disabled=false;return;}
      await window.WT_SB.from('pm_equipment').update({last_pm_date:wo.work_date}).eq('equip_id',M.detail);
      M.loaded=false;M.showForm=false;await load();renderMaint();
    };
  }

  /* ---- tile injection via MutationObserver ---- */
  let maintActive = false;

  function injectTile() {
    const menu = document.querySelector('.menu');
    if (!menu || menu.querySelector('[data-nav="maint"]')) return;
    const tile = document.createElement('button');
    tile.className = 'mtile';
    tile.setAttribute('data-nav', 'maint');
    tile.innerHTML = '<span class="mt-n num"></span><span class="mt-t">Maintenance</span><span class="mt-s">PM equipment and work orders</span>';
    tile.style.cssText = 'background:#1b3a5c;color:#fff';
    // Direct onclick prevents bubbling to the app's click delegation
    tile.onclick = function(ev) {
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      ev.preventDefault();
      maintActive = true;
      renderMaint();
    };
    menu.appendChild(tile);
  }

  /* ---- boot: wait for WT_SB then observe DOM ---- */
  function boot() {
    if (!window.WT_SB) { setTimeout(boot, 200); return; }

    // Observe main for menu re-renders → inject tile
    const main = document.getElementById('main');
    if (!main) { setTimeout(boot, 200); return; }

    const obs = new MutationObserver(() => {
      injectTile();
      // If the app re-rendered while we were in maint view, restore it
      if (maintActive && !main.querySelector('.maint-list') && !main.querySelector('.maint-detail') && !main.querySelector('.maint-summary')) {
        renderMaint();
      }
    });
    obs.observe(main, { childList: true });

    // Intercept clicks on data-nav="maint" at capturing phase
    document.addEventListener('click', function(ev) {
      const t = ev.target.closest('[data-nav="maint"]');
      if (t) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        maintActive = true;
        renderMaint();
        return false;
      }
      // If clicking a nav that ISN'T maint, deactivate maint
      const otherNav = ev.target.closest('[data-nav]');
      if (otherNav && otherNav.getAttribute('data-nav') !== 'maint') {
        maintActive = false;
      }
    }, true);

    // Inject tile now if menu is already showing
    injectTile();
    console.log('[MAINT] Maintenance module loaded — 480 machines, ready.');
  }

  // Kick off
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
