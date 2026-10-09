/* Gaden Hub Admin v2 — a WordPress-style control panel.
   Loaded by index.html (loadAdmin) from the private Supabase bucket "admin-tools" (admin.js),
   falling back to /admin.js. It replaces the global admin() route handler.
   SECURITY: real authorization is enforced by Supabase RLS (see ADMIN-SETUP.md), not by this file. */
(function () {
  if (window._admLoaded) return;

  /* ================= config ================= */
  const SEC = {
    dash: ['📊', 'Dashboard'], pages: ['📄', 'Pages & Guides'], media: ['🖼', 'Media Library'], site: ['📣', 'Banner & Boards'],
    members: ['🧑‍🌾', 'Members'], listings: ['🛒', 'Listings'], comm: ['💬', 'Community'], reports: ['⚑', 'Reports'], messages: ['🗨', 'Chat Messages'], opps: ['🌾', 'Opportunities'],
    users: ['👥', 'Staff & Roles'], email: ['📧', 'Email Alerts'], log: ['🧾', 'Activity Log']
  };
  const GROUPS = [[null, ['dash']], ['Content', ['pages', 'media', 'site']], ['Marketplace', ['members', 'listings', 'opps']], ['Community', ['comm', 'reports', 'messages']], ['System', ['users', 'email', 'log']]];
  const ACC = { admin: null, editor: ['dash', 'pages', 'media', 'site', 'log'], moderator: ['dash', 'members', 'listings', 'comm', 'reports', 'messages', 'opps', 'log'] };
  const NEED = {
    dash: ['members', 'items', 'posts', 'threads', 'reports', 'pages', 'adminlog', 'opps'], pages: ['pages'], media: [], site: ['settings'],
    members: ['members', 'items'], listings: ['items'], comm: ['posts', 'threads'], reports: ['reports', 'items', 'posts', 'threads', 'members', 'messages'], messages: ['messages', 'reports'], opps: ['opps'],
    users: ['members', 'staff'], email: ['adminconf'], log: ['adminlog']
  };
  const AVL = ['Available', 'Low stock', 'Out of stock', 'Coming soon'], PER = 20;
  const DENIED = 'Blocked by database permissions (RLS). Run the policies in ADMIN-SETUP.md.';

  let C = {}, ERR = {}, LOADING = {}, S = 'dash', Q = '', VW = 'all', CT = 'posts', ED = null, MD = '', MT = 'lib', PAGE = 1, NAV = false, HEALTH = null, ROLE = null, ROLEP = null, SELR = null;

  const E = s => esc(s), el = id => document.getElementById(id);
  const dt = ts => ts ? new Date(+ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const snip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const ok = m => toast(m, 'ok'), bad = m => toast('Could not complete: ' + m, 'err');
  const can = s => { const a = ACC[ROLE || 'admin']; return !a || a.includes(s); };
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

  /* ================= data layer ================= */
  async function ld(c) {
    if (c === 'staff') {
      const r = await sb.from('staff').select('*');
      return (C.staff = r.error ? [] : (r.data || []).map(x => ({ id: x.user_id, role: x.role, hasRole: 'role' in x })));
    }
    let all = [], from = 0;
    for (;;) {
      const r = await sb.from('docs').select('id,data,ts').eq('coll', c).order('ts', { ascending: false }).range(from, from + 999);
      if (r.error) throw r.error;
      const d = r.data || []; all = all.concat(d);
      if (d.length < 1000 || all.length >= 5000) break; from += 1000;
    }
    return (C[c] = all.map(x => Object.assign({}, x.data, { id: x.id, ts: (x.data && x.data.ts) || x.ts })));
  }
  async function dbUpd(c, id, patch) {
    const cur = await sb.from('docs').select('data').eq('coll', c).eq('id', id).maybeSingle();
    if (cur.error) throw cur.error; if (!cur.data) throw new Error('That item no longer exists');
    const r = await sb.from('docs').update({ data: Object.assign({}, cur.data.data, patch) }).eq('coll', c).eq('id', id).select('id');
    if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error(DENIED);
  }
  async function dbDel(c, id) {
    const r = await sb.from('docs').delete().eq('coll', c).eq('id', id).select('id');
    if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error(DENIED);
  }
  async function dbPut(c, id, data) {
    const ts = Date.now();
    const r = await sb.from('docs').upsert({ coll: c, id, data: Object.assign({}, data, { ts }), ts }).select('id');
    if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error(DENIED);
  }
  async function log(action, target, note) {
    try {
      const ts = Date.now();
      await sb.from('docs').insert({ coll: 'adminlog', id: ts + '-' + Math.random().toString(36).slice(2, 6), data: { aid: UID, name: (user && user.name) || 'Admin', action, target: target || '', note: note || '', ts }, ts });
      delete C.adminlog;
    } catch (e) { }
  }
  async function run(fn, msg, colls) {
    try { await fn(); ok(msg); } catch (e) { bad(e.message || String(e)); }
    (colls || NEED[S]).forEach(c => { delete C[c]; }); draw();
  }
  async function initRole() {
    try { const r = await sb.from('staff').select('role').eq('user_id', UID).maybeSingle(); ROLE = (!r.error && r.data && r.data.role) || 'admin'; } catch (e) { ROLE = 'admin'; }
    if (!ACC.hasOwnProperty(ROLE)) ROLE = 'admin';
  }

  /* ================= markdown <-> visual editor =================
     The public site renders a small markdown subset: "# " (h2), "## " (h3), "- " lists, **bold**, bare links, and (new) ![alt](url) images. */
  function m2h(t) {
    const inl = x => x.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
    return esc(t || '').split(/\n{2,}/).map(b => {
      b = b.trim(); if (!b) return '';
      const im = b.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/); if (im) return '<p><img src="' + im[2] + '" alt="' + im[1] + '"></p>';
      if (/^# /.test(b)) return '<h2>' + inl(b.slice(2)) + '</h2>';
      if (/^## /.test(b)) return '<h3>' + inl(b.slice(3)) + '</h3>';
      const R = b.split('\n'); if (R.every(l => /^- /.test(l))) return '<ul>' + R.map(l => '<li>' + inl(l.slice(2)) + '</li>').join('') + '</ul>';
      return '<p>' + inl(b).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function h2m(root) {
    const out = []; let buf = '';
    const flush = () => { const s = buf.replace(/\u00a0/g, ' ').replace(/\n{2,}/g, '\n').trim(); if (s) out.push(s); buf = ''; };
    const BLK = /^(H[1-6]|UL|OL|IMG|P|DIV|BLOCKQUOTE)$/;
    const inlOne = c => {
      if (c.nodeType === 3) return c.textContent;
      const t = c.nodeName; if (t === 'BR') return '\n'; if (t === 'IMG') return '';
      const x = inl(c);
      if (t === 'B' || t === 'STRONG') { const m = x.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + '**' + m[2] + '**' + m[3] : x; }
      if (t === 'A') return c.getAttribute('href') || x;
      return x;
    };
    const inl = n => { let s = ''; n.childNodes.forEach(c => { s += inlOne(c); }); return s; };
    const img = n => '![' + (n.getAttribute('alt') || '').replace(/[\[\]]/g, '') + '](' + n.getAttribute('src') + ')';
    (function walk(p) {
      p.childNodes.forEach(n => {
        if (n.nodeType === 3) { buf += n.textContent; return; }
        if (n.nodeType !== 1) return;
        const t = n.nodeName;
        if (!BLK.test(t)) { buf += inlOne(n); return; }
        flush();
        if (t === 'H1' || t === 'H2') out.push('# ' + inl(n).trim());
        else if (/^H[3-6]$/.test(t)) out.push('## ' + inl(n).trim());
        else if (t === 'UL' || t === 'OL') out.push([].map.call(n.children, li => '- ' + inl(li).trim().replace(/\n+/g, ' ')).join('\n'));
        else if (t === 'IMG') out.push(img(n));
        else { walk(n); flush(); }
      });
    })(root);
    flush(); return out.filter(Boolean).join('\n\n');
  }
  window._admT = { m2h, h2m };

  /* ================= styles ================= */
  function css() {
    if (el('adm-css')) return;
    const s = document.createElement('style'); s.id = 'adm-css';
    s.textContent = `
#adm{position:fixed;inset:0;z-index:15;background:#f0f3f0;display:grid;grid-template-rows:46px 1fr;grid-template-columns:220px 1fr;font-size:14px;color:#1d2a1f}
#adm *{box-sizing:border-box}
.adm-top{grid-column:1/-1;background:#0b3d27;color:#e6f3ea;display:flex;align-items:center;gap:6px;padding:0 10px;min-width:0}
.adm-top a,.adm-top b,.adm-top button{color:#e6f3ea;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:13px;white-space:nowrap;background:none;border:0;font-family:inherit;text-decoration:none}
.adm-top a:hover,.adm-top button:hover{background:rgba(255,255,255,.12)}.adm-top b{font-size:15px}.adm-top .sp{flex:1}.adm-burger{display:none}
.adm-top .bell{background:#c8372d;border-radius:99px;padding:1px 7px;font-size:11px;margin-left:4px}
.adm-side{background:#12301f;overflow-y:auto;padding:8px 0 30px}
.adm-side h4{margin:16px 16px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7fae93}
.adm-side a{display:flex;gap:10px;align-items:center;padding:9px 16px;color:#d5e8dc;cursor:pointer;font-weight:600;border-left:4px solid transparent;text-decoration:none}
.adm-side a:hover{background:#1b4630;color:#fff}.adm-side a.on{background:#0b5d3b;color:#fff;border-left-color:#9be15d}.adm-side a span:first-child{width:20px;text-align:center}
.adm-c{overflow:auto;padding:22px 26px 60px;overscroll-behavior:contain}
.adm-c h1{font:700 23px/1.2 Poppins,sans-serif;margin:0;display:inline-block}
.adm-hd{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.adm-hd .btn{padding:6px 12px}
.adm-sub{color:#667064;margin:-8px 0 14px}
.pb{background:#fff;border:1px solid #dfe5df;border-radius:6px;margin-bottom:16px;min-width:0}
.pb>h3{margin:0;padding:11px 14px;font-size:14px;border-bottom:1px solid #e8ece8}.pb>.in{padding:14px}
.dg{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}
.hero2{background:linear-gradient(120deg,#0b5d3b,#1f8a4f);color:#fff;border-radius:8px;padding:22px 24px;margin-bottom:16px}
.hero2 h2{margin:0 0 6px;font:700 20px Poppins,sans-serif}.hero2 p{margin:0 0 14px;opacity:.9}.hero2 .btn{background:#fff;color:#0b5d3b;margin-right:8px}.hero2 .btn.y{background:#f5b301;color:#222}
.glance{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 14px}.glance a{padding:7px 0;border-bottom:1px solid #eef1ee;cursor:pointer;color:#0b5d3b;font-weight:600}.glance a b{color:#1d2a1f;margin-right:4px}
.adm table{width:100%;border-collapse:collapse}.adm th{text-align:left;font-size:12px;color:#667064;padding:9px 10px;border-bottom:1px solid #dfe5df;background:#fafcfa;white-space:nowrap}
.adm td{padding:10px;border-bottom:1px solid #eef1ee;vertical-align:top}.adm tr:hover td{background:#fafdfb}.adm td:first-child,.adm th:first-child{width:30px}
.adm .w{overflow-x:auto}.adm .acts{white-space:nowrap}.adm .acts .btn{margin-right:4px}
.adm .btn{border-radius:6px}.adm .btn.danger{background:#fbe3e0;color:#c8372d}.adm .btn.ghost2{background:#fff;color:#0b5d3b;border:1px solid #0b5d3b}
.adm input,.adm select,.adm textarea{margin:0;border-radius:6px}.adm .tbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-bottom:1px solid #e8ece8}
.adm .tbar input{flex:1;min-width:160px;width:auto}.adm .tbar select{width:auto}
.adm .views{display:flex;gap:6px;flex-wrap:wrap;list-style:none;margin:0;padding:10px 12px 0;font-size:13px}.adm .views a{cursor:pointer;color:#0b5d3b}.adm .views a.on{color:#1d2a1f;font-weight:700}.adm .views i{color:#667064;font-style:normal}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#fff1c2;color:#7a5a00}.pill.g{background:#e5f1e8;color:#0b5d3b}.pill.r{background:#fbe3e0;color:#c8372d}.pill.b{background:#dbeafe;color:#1d4ed8}
.pager{display:flex;gap:6px;align-items:center;justify-content:flex-end;padding:10px 12px;color:#667064}
.cm{background:#f4f7f4;border-radius:6px;padding:5px 9px;margin-top:5px;font-size:13px}
.edg{display:grid;grid-template-columns:1fr 270px;gap:16px;align-items:start}
.ttl{font-size:22px!important;padding:10px 12px!important;width:100%}
.edtb{display:flex;gap:4px;flex-wrap:wrap;padding:8px;background:#f6f8f6;border:1px solid #dfe5df;border-bottom:0;border-radius:6px 6px 0 0;align-items:center}
.edtb button{background:#fff;border:1px solid #d3dbd3;border-radius:5px;padding:5px 10px;cursor:pointer;font:inherit;font-size:13px}.edtb button:hover{background:#e5f1e8}.edtb .sp{flex:1}
.edtb button.tab.on{background:#0b5d3b;color:#fff;border-color:#0b5d3b}
#adm-ed{min-height:380px;background:#fff;border:1px solid #dfe5df;border-radius:0 0 6px 6px;padding:16px 18px;outline:none;line-height:1.6;font-size:15px}
#adm-ed:focus{border-color:#0b5d3b}#adm-ed img{max-width:100%;border-radius:8px}#adm-ed h2{font-size:24px;margin:.6em 0 .3em}#adm-ed h3{font-size:19px;margin:.6em 0 .3em}
textarea.code{min-height:380px;font-family:ui-monospace,Menlo,monospace;font-size:13px;border-radius:0 0 6px 6px}
.mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;padding:14px}.mg>div{border:1px solid #dfe5df;border-radius:8px;overflow:hidden;background:#fff;font-size:12px}
.mg img{width:100%;height:105px;object-fit:cover;display:block;cursor:pointer}.mg .fd{padding:14px 6px;text-align:center;cursor:pointer;font-size:13px}.mg .mt{padding:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.adm-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:30;display:grid;place-items:center;padding:16px}
.adm-dlg{background:#fff;border-radius:10px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:14px;color:#1d2a1f}
.adm-dlg h3{margin:0 0 10px}.adm-dlg .kv{display:grid;grid-template-columns:140px 1fr;gap:6px 10px}.adm-dlg .kv span:nth-child(odd){color:#667064}
.adm-dlg .mg{padding:0}.adm label.l{display:block;font-weight:600;margin:10px 0 4px}
@media(max-width:860px){#adm{grid-template-columns:1fr}.adm-burger{display:inline-block}.adm-side{position:absolute;top:46px;bottom:0;left:0;width:240px;z-index:3;transform:translateX(-100%);transition:transform .2s}
#adm.nav-open .adm-side{transform:none;box-shadow:6px 0 20px rgba(0,0,0,.3)}.adm-c{padding:16px 12px 60px}.edg{grid-template-columns:1fr}.adm-top .hide-m{display:none}}`;
    document.head.appendChild(s);
  }

  /* ================= shell ================= */
  function shell(inner) {
    const nbR = C.reports ? C.reports.length : 0;
    const side = GROUPS.map(g => {
      const items = g[1].filter(can); if (!items.length) return '';
      return (g[0] ? '<h4>' + g[0] + '</h4>' : '') + items.map(k => `<a class="${S === k ? 'on' : ''}" data-act="nav" data-id="${k}"><span>${SEC[k][0]}</span><span>${SEC[k][1]}</span>${k === 'reports' && nbR ? `<span class="pill r" style="margin-left:auto">${nbR}</span>` : ''}</a>`).join('');
    }).join('');
    return `<div id="adm" class="${NAV ? 'nav-open' : ''}"><div class="adm-top"><button class="adm-burger" data-act="burger" aria-label="Menu">☰</button><b data-act="nav" data-id="dash">🌱 Gaden Hub</b><a data-act="home" class="hide-m">Visit site ↗</a><span class="sp"></span>${can('pages') ? '<a data-act="pnew" class="hide-m">+ New page</a>' : ''}${can('reports') ? `<a data-act="nav" data-id="reports" title="Reports">🔔${nbR ? `<span class="bell">${nbR}</span>` : ''}</a>` : ''}<span class="hide-m" style="padding:0 6px">Howdy, <b style="padding:0">${E((user && user.name || 'Admin').split(' ')[0])}</b> <small style="opacity:.7">(${ROLE || 'admin'})</small></span><a data-act="logout">Log out</a></div><nav class="adm-side">${side}<a data-act="home"><span>↩</span><span>Back to site</span></a></nav><main class="adm-c" id="adm-c">${inner}</main></div>`;
  }
  function hd(title, sub, extra) {
    return `<div class="adm-hd"><h1>${title}</h1>${extra || ''}<span style="flex:1"></span><button class="btn alt sm" data-act="refresh">↻ Refresh</button></div>${sub ? '<p class="adm-sub">' + sub + '</p>' : ''}`;
  }
  function draw() {
    if (typeof tab !== 'undefined' && tab !== 'admin') return;
    const app = el('app'); if (!app) return; css();
    if (ROLE === null) { if (!ROLEP) ROLEP = initRole().then(() => draw()); app.innerHTML = shell('<div class="pb"><div class="in" style="text-align:center;color:#667064">Loading…</div></div>'); bind(); return; }
    if (!can(S)) S = 'dash';
    const old = el('adm-c'), top = old ? old.scrollTop : 0;
    const need = NEED[S].filter(c => !C[c]);
    if (ERR[S]) { app.innerHTML = shell(`<div class="pb"><div class="in" style="text-align:center"><h3>Could not load this section</h3><p style="color:#667064">${E(ERR[S])}</p><button class="btn" data-act="refresh">Try again</button></div></div>`); bind(); return; }
    if (need.length) {
      app.innerHTML = shell('<div class="pb"><div class="in" style="text-align:center;color:#667064">Loading…</div></div>'); bind();
      if (!LOADING[S]) {
        LOADING[S] = 1; const sec = S;
        Promise.all(need.map(ld)).then(() => { LOADING[sec] = 0; return sec === 'dash' ? health() : null; }).then(draw)
          .catch(e => { LOADING[sec] = 0; ERR[sec] = e.message || String(e); draw(); });
      }
      return;
    }
    app.innerHTML = shell(body()); bind();
    const nw = el('adm-c'); if (nw) nw.scrollTop = top;
    if (S === 'media') loadMedia();
    if (S === 'pages' && ED && ED.mode === 'v') { const e = el('adm-ed'); if (e) e.innerHTML = m2h(ED.body); }
  }
  function bind() { const r = el('adm'); if (!r) return; r.onclick = onClick; r.onchange = onChange; r.oninput = onInput; r.onmousedown = e => { if (e.target.closest('.edtb button')) e.preventDefault(); }; }
  const drawList = () => { const t = el('adm-tbl'); if (t) t.innerHTML = list(); };
  function body() {
    switch (S) {
      case 'dash': return dash();
      case 'pages': return ED ? editor() : hd('Pages & Guides', 'Pages, guides and news shown on the public site.', '<button class="btn sm" data-act="pnew">Add New</button>') + listBox();
      case 'media': return mediaView();
      case 'site': return site();
      case 'users': return users();
      case 'email': return email();
      case 'opps': return hd('Opportunities', 'Review buyer requests, programmes, funding, training and partnership posts before they go public. Only approve what you can reasonably trust.') + listBox(true);
      case 'messages': return hd('Chat Messages', 'Private conversations are opened only from here, one at a time, and <b>every view and deletion is logged</b>. Start with reported conversations.') + listBox(true);
      case 'members': return hd('Members', 'Review profiles and verify farmers, co-operatives and businesses.') + listBox(true);
      case 'listings': return hd('Listings', 'Marketplace products and wanted requests.') + listBox(true);
      case 'comm': return hd('Community', 'Posts and forum topics, with comment moderation.') + listBox(true);
      case 'reports': return hd('Reports', 'Content reported by members.') + listBox(false);
      case 'log': return hd('Activity Log', 'Every action taken from this dashboard.') + listBox(false);
    }
    return '';
  }
  const BULKS = () => S === 'members' ? [['verify', 'Verify'], ['unverify', 'Remove verified badge']] : S === 'listings' ? [['delete', 'Remove']] : S === 'comm' ? [['delete', 'Remove']] : S === 'opps' ? [['oapprove', 'Approve & publish'], ['oreject', 'Reject'], ['delete', 'Delete']] : S === 'reports' ? [['dismiss', 'Dismiss']] : S === 'pages' ? [['publish', 'Publish'], ['draft', 'Switch to draft'], ['trash', 'Delete']] : [];
  function listBox(search) {
    const b = BULKS();
    return `<div class="pb"><div class="tbar">${b.length ? `<select id="adm-bulk"><option value="">Bulk actions</option>${b.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select><button class="btn alt sm" data-act="bulk">Apply</button>` : ''}${S === 'comm' ? `<select id="adm-ct"><option value="posts"${CT === 'posts' ? ' selected' : ''}>Community posts</option><option value="threads"${CT === 'threads' ? ' selected' : ''}>Forum topics</option></select>` : ''}${search ? `<input id="adm-q" type="search" placeholder="Search…" value="${E(Q)}">` : ''}</div><div class="w" id="adm-tbl">${list()}</div></div>`;
  }
  const views = (arr, cur) => '<ul class="views">' + arr.map((v, i) => `<li><a class="${cur === v[0] ? 'on' : ''}" data-act="view" data-v="${v[0]}">${v[1]} <i>(${v[2]})</i></a>${i < arr.length - 1 ? ' |' : ''}</li>`).join('') + '</ul>';
  function pager(arr) {
    const pages = Math.max(1, Math.ceil(arr.length / PER)); if (PAGE > pages) PAGE = pages;
    const slice = arr.slice((PAGE - 1) * PER, PAGE * PER);
    return { slice, html: `<div class="pager"><span>${arr.length} item${arr.length === 1 ? '' : 's'}</span><button class="btn alt sm" data-act="pg" data-p="${PAGE - 1}" ${PAGE <= 1 ? 'disabled' : ''}>‹</button><span>${PAGE} / ${pages}</span><button class="btn alt sm" data-act="pg" data-p="${PAGE + 1}" ${PAGE >= pages ? 'disabled' : ''}>›</button></div>` };
  }
  const tbl = (cols, rows, pg, empty, sel) => `<table><thead><tr>${sel ? '<th><input type="checkbox" data-act="chkall"></th>' : '<th></th>'}${cols.map(c => '<th>' + c + '</th>').join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td></td><td colspan="${cols.length}" style="color:#667064;padding:22px">${empty || 'Nothing here yet.'}</td></tr>`}</tbody></table>${pg ? pg.html : ''}`;
  const ck = id => `<td><input type="checkbox" class="adm-ck" value="${E(id)}"></td>`;

  /* ================= lists ================= */
  function list() {
    const q = Q.toLowerCase();
    if (S === 'members') {
      const st = m => m.verified ? 'ver' : (m.reg ? 'pend' : 'unv'), all = C.members, n = k => all.filter(m => st(m) === k).length;
      const L = all.filter(m => (VW === 'all' || st(m) === VW) && ((m.name || '') + (m.biz || '') + (m.prov || '') + (m.district || '') + (m.reg || '') + (m.crop || '') + (m.type || '')).toLowerCase().includes(q));
      const cnt = {}; C.items.forEach(i => { if (i.by) cnt[i.by] = (cnt[i.by] || 0) + 1; }); const pg = pager(L);
      return views([['all', 'All', all.length], ['pend', 'Needs review', n('pend')], ['ver', 'Verified', n('ver')], ['unv', 'Unverified', n('unv')]], VW) +
        tbl(['Member', 'Type', 'Location', 'Reg. no.', 'Listings', 'Status', ''], pg.slice.map(m => `<tr>${ck(m.id)}<td><b>${E(m.biz || m.name)}</b>${m.biz && m.name && m.biz !== m.name ? '<div style="color:#667064">' + E(m.name) + '</div>' : ''}</td><td>${E(m.type)}</td><td>${E([m.district, m.prov].filter(Boolean).join(', '))}</td><td>${E(m.reg || '—')}</td><td>${cnt[m.id] || 0}</td><td>${m.verified ? '<span class="pill g">✔ Verified</span>' : m.reg ? '<span class="pill">Needs review</span>' : '<span style="color:#667064">Unverified</span>'}</td><td class="acts"><button class="btn sm" data-act="mrev" data-id="${E(m.id)}">Review</button></td></tr>`), pg, 'No members match.', 1);
    }
    if (S === 'listings') {
      const L = C.items.filter(i => ((i.n || '') + (i.s || '') + (i.cat || '') + (i.prov || '') + (i.district || '')).toLowerCase().includes(q)), pg = pager(L);
      return tbl(['Product', 'Seller', 'Category', 'Price', 'Availability', 'Posted', ''], pg.slice.map(i => `<tr>${ck(i.id)}<td><b>${E(i.n)}</b>${i.sec === 'wanted' ? ' <span class="pill b">Wanted</span>' : ''}</td><td>${E(i.s)}<div style="color:#667064">${E(i.prov)}</div></td><td>${E(i.cat)}</td><td>${E(i.p)}</td><td><select data-act="avail" data-id="${E(i.id)}" style="padding:4px 6px">${AVL.map(a => `<option${a === (i.avail || 'Available') ? ' selected' : ''}>${a}</option>`).join('')}</select></td><td>${dt(i.ts)}</td><td class="acts"><button class="btn sm" data-act="eitem" data-id="${E(i.id)}">Edit</button><button class="btn alt sm" data-act="vitem" data-id="${E(i.id)}">View</button><button class="btn danger sm" data-act="del" data-c="items" data-id="${E(i.id)}" data-n="${E(snip(i.n, 40))}">Remove</button></td></tr>`), pg, 'No listings match.', 1);
    }
    if (S === 'comm') {
      const cm = (c, d, arr, isP) => arr.length ? `<details><summary style="cursor:pointer;color:#0b5d3b">${arr.length}</summary>${arr.map((x, k) => `<div class="cm"><b>${E(isP ? x.n : x.n)}</b>: ${E(snip(x.x, 120))} <a data-act="rmcm" data-c="${c}" data-id="${E(d.id)}" data-k="${k}" style="color:#c8372d;cursor:pointer">remove</a></div>`).join('')}</details>` : '0';
      if (CT === 'posts') {
        const L = C.posts.filter(p => ((p.a || '') + (p.x || '') + (p.p || '') + (p.t || '')).toLowerCase().includes(q)), pg = pager(L);
        return tbl(['Author', 'Post', 'Comments', 'Date', ''], pg.slice.map(p => `<tr>${ck(p.id)}<td><b>${E(p.a)}</b><div style="color:#667064">${E(p.p)}</div></td><td>${p.t ? '<span class="pill g">' + E(p.t) + '</span> ' : ''}${E(snip(p.x, 170))}${p.img ? ' 📷' : ''}</td><td>${cm('posts', p, p.c || [], 1)}</td><td>${dt(p.ts)}</td><td class="acts"><button class="btn danger sm" data-act="del" data-c="posts" data-id="${E(p.id)}" data-n="post by ${E(p.a)}">Remove</button></td></tr>`), pg, 'No posts match.', 1);
      }
      const L = C.threads.filter(t => ((t.t || '') + (t.a || '')).toLowerCase().includes(q)), pg = pager(L);
      return tbl(['Topic', 'Started by', 'Replies', 'Date', ''], pg.slice.map(t => `<tr>${ck(t.id)}<td><b>${E(t.t)}</b></td><td>${E(t.a)}</td><td>${cm('threads', t, t.r || [])}</td><td>${dt(t.ts)}</td><td class="acts"><button class="btn danger sm" data-act="del" data-c="threads" data-id="${E(t.id)}" data-n="topic ${E(snip(t.t, 40))}">Remove</button></td></tr>`), pg, 'No topics match.', 1);
    }
    if (S === 'opps') {
      const all = C.opps, n = k => all.filter(o => (o.status || 'pending') === k).length, L = all.filter(o => (VW === 'all' || (o.status || 'pending') === VW) && ((o.title || '') + (o.org || '') + (o.owner || '') + (o.type || '')).toLowerCase().includes(q)), pg = pager(L);
      return views([['pending', 'Pending review', n('pending')], ['published', 'Published', n('published')], ['fulfilled', 'Fulfilled', n('fulfilled')], ['rejected', 'Rejected', n('rejected')], ['all', 'All', all.length]], VW) +
        tbl(['Post', 'By', 'Deadline', 'Status', ''], pg.slice.map(o => `<tr>${ck(o.id)}<td><span class="pill b">${E(o.type)}</span> <b>${E(o.title)}</b><div style="color:#667064">${E(snip(o.details, 150))}</div></td><td>${E(o.org)}<div style="color:#667064">${E(o.owner)} · ${E(o.loc)}</div></td><td>${E(o.deadline || '—')}</td><td>${{ published: '<span class="pill g">Published</span>', rejected: '<span class="pill r">Rejected</span>', fulfilled: '<span class="pill b">Fulfilled</span>' }[o.status] || '<span class="pill">Pending</span>'}</td><td class="acts">${o.status !== 'published' ? `<button class="btn sm" data-act="oset" data-id="${E(o.id)}" data-s="published" data-n="${E(snip(o.title, 40))}">Approve</button>` : `<button class="btn alt sm" data-act="oset" data-id="${E(o.id)}" data-s="fulfilled" data-n="${E(snip(o.title, 40))}">Mark fulfilled</button>`}${o.status !== 'rejected' ? `<button class="btn danger sm" data-act="oset" data-id="${E(o.id)}" data-s="rejected" data-n="${E(snip(o.title, 40))}">Reject</button>` : ''}</td></tr>`), pg, 'No posts in this view.', 1);
    }
    if (S === 'messages') {
      const all = convs(), rep = all.filter(t => t.reps.length), L = (VW === 'rep' ? rep : all).filter(t => (t.a + t.b + t.item + t.msgs.map(m => m.x).join(' ')).toLowerCase().includes(q)), pg = pager(L);
      return views([['rep', 'Reported', rep.length], ['all', 'All conversations', all.length]], VW) +
        tbl(['Participants', 'About', 'Messages', 'Last message', 'Reports', ''], pg.slice.map(t => `<tr><td></td><td><b>${E(t.a)}</b> ↔ <b>${E(t.b)}</b></td><td>${E(t.item || '—')}</td><td>${t.msgs.length}</td><td>${dt(t.last)}</td><td>${t.reps.length ? '<span class="pill r">' + t.reps.length + ' reported</span>' : '—'}</td><td class="acts"><button class="btn sm" data-act="cview" data-k="${E(t.k)}">Open</button></td></tr>`), pg, VW === 'rep' ? '🎉 No reported conversations.' : 'No conversations match.');
    }
    if (S === 'reports') {
      const pg = pager(C.reports);
      return tbl(['Reported item', 'Reason / details', 'By', 'Date', ''], pg.slice.map(r => {
        if (r.kind === 'conversation') { const cv = convOf(r); return `<tr>${ck(r.id)}<td>Conversation: <b>${E(snip(r.text, 60))}</b><div style="color:#667064">conversation</div></td><td>${E(snip(r.text, 200))}</td><td>${E(r.reporter || '—')}</td><td>${dt(r.ts)}</td><td class="acts">${cv ? `<button class="btn sm" data-act="cview" data-k="${E(cv.k)}">Open conversation</button>` : '<span style="color:#667064">Messages deleted</span> '}<button class="btn alt sm" data-act="dismiss" data-rid="${E(r.id)}">Dismiss</button></td></tr>`; }
        const t = target(r);
        return `<tr>${ck(r.id)}<td>${t ? t.k + ': <b>' + E(snip(t.label, 70)) + '</b>' : '<span style="color:#667064">Content no longer exists</span>'}<div style="color:#667064">${E(r.kind || 'post')}</div></td><td>${E(snip(r.text, 200))}</td><td>${E(r.reporter || '—')}</td><td>${dt(r.ts)}</td><td class="acts">${t && t.c === 'items' ? `<button class="btn alt sm" data-act="vitem" data-id="${E(t.id)}">Open</button>` : ''}${t && t.c === 'members' ? `<button class="btn alt sm" data-act="mrev" data-id="${E(t.id)}">Review</button>` : ''}${t && t.c !== 'members' ? `<button class="btn danger sm" data-act="rmrep" data-rid="${E(r.id)}" data-c="${t.c}" data-id="${E(t.id)}" data-n="${E(t.k)}">Remove content</button>` : ''}<button class="btn alt sm" data-act="dismiss" data-rid="${E(r.id)}">Dismiss</button></td></tr>`;
      }), pg, '🎉 Nothing to review.', 1);
    }
    if (S === 'pages') {
      const all = C.pages, n = p => all.filter(x => !!x.pub === p).length, L = all.filter(p => VW === 'all' || (VW === 'pub') === !!p.pub), pg = pager(L);
      return views([['all', 'All', all.length], ['pub', 'Published', n(true)], ['draft', 'Drafts', n(false)]], VW) +
        tbl(['Title', 'Status', 'Appears in', 'Updated', ''], pg.slice.map(p => `<tr>${ck(p.id)}<td><b>${E(p.title)}</b><div style="color:#667064">/p/${E(p.id)}</div></td><td>${p.pub ? '<span class="pill g">Published</span>' : '<span class="pill">Draft</span>'}</td><td>${[p.menu ? 'Footer menu' : '', p.guide ? 'Guides' : ''].filter(Boolean).join(', ') || '—'}</td><td>${dt(p.ts)}</td><td class="acts"><button class="btn sm" data-act="pedit" data-id="${E(p.id)}">Edit</button><button class="btn alt sm" data-act="ppage" data-id="${E(p.id)}">View</button></td></tr>`), pg, 'No pages yet. Click “Add New”.', 1);
    }
    if (S === 'log') {
      const pg = pager(C.adminlog);
      return tbl(['When', 'Admin', 'Action', 'Target'], pg.slice.map(l => `<tr><td></td><td style="white-space:nowrap">${new Date(+l.ts).toLocaleString('en-GB')}</td><td>${E(l.name)}</td><td>${E(l.action)}</td><td>${E(snip(l.target, 110))}${l.note ? '<div style="color:#667064">' + E(l.note) + '</div>' : ''}</td></tr>`), pg, 'No actions recorded yet.');
    }
    return '';
  }
  function target(r) {
    const id = String(r.pid || ''), f = (c, k, lab) => { const d = (C[c] || []).find(x => String(x.id) === id); return d ? { c, id: d.id, k, label: lab(d) } : null; };
    const order = r.kind === 'listing' ? ['i'] : r.kind === 'profile' ? ['m'] : (r.kind === 'topic' || r.kind === 'reply') ? ['t', 'p'] : ['p', 't', 'i', 'm'];
    for (const o of order) {
      const t = o === 'i' ? f('items', 'Listing', d => d.n + ' — ' + d.s) : o === 'p' ? f('posts', 'Post', d => d.a + ': ' + d.x) : o === 't' ? f('threads', 'Topic', d => d.t) : f('members', 'Profile', d => d.biz || d.name);
      if (t) return t;
    }
    return null;
  }


  /* ================= chat messages ================= */
  function convs() {
    const T = {};
    (C.messages || []).forEach(m => { const n = [String(m.from || ''), String(m.to || '')].sort(), k = n.join(' ↔ ') + '|' + (m.item || ''); const t = T[k] = T[k] || { k, a: n[0], b: n[1], item: m.item || '', msgs: [] }; t.msgs.push(m); });
    const R = (C.reports || []).filter(r => r.kind === 'conversation');
    return Object.values(T).map(t => { t.reps = R.filter(r => convMatch(r, t)); t.last = Math.max.apply(null, t.msgs.map(m => +m.ts || 0)); return t; }).sort((x, y) => y.last - x.last);
  }
  function convMatch(r, t) { const s = String(r.pid || ''), i = s.indexOf('|'), peer = i < 0 ? s : s.slice(0, i), item = i < 0 ? '' : s.slice(i + 1); return item === t.item && ((r.reporter === t.a && peer === t.b) || (r.reporter === t.b && peer === t.a)); }
  function convOf(r) { return convs().find(t => convMatch(r, t)); }
  function cview(k, silent) {
    const t = convs().find(x => x.k === k); if (!t) { closeModal(); return; }
    if (!silent) log('Opened conversation', t.a + ' ↔ ' + t.b + (t.item ? ' re: ' + t.item : ''));
    const ms = t.msgs.slice().sort((x, y) => (+x.ts || 0) - (+y.ts || 0));
    modal(`<h3>${E(t.a)} ↔ ${E(t.b)}</h3><p style="color:#667064;margin:0 0 10px">${t.item ? 'About: ' + E(t.item) + ' · ' : ''}${ms.length} message${ms.length === 1 ? '' : 's'}${t.reps.length ? ' · <span class="pill r">' + t.reps.length + ' report(s)</span>' : ''}</p>${t.reps.map(r => '<div class="cm" style="background:#fbe3e0">⚑ ' + E(r.reporter) + ': ' + E(snip(r.text, 200)) + '</div>').join('')}<div style="margin-top:10px">${ms.map(m => `<div class="cm" style="margin-bottom:6px"><div style="display:flex;gap:8px;align-items:center"><b>${E(m.from)}</b><span style="color:#667064;font-size:12px;flex:1">${new Date(+m.ts).toLocaleString('en-GB')}${m.kind === 'enquiry' ? ' · enquiry' : ''}</span><button class="btn danger sm" data-act="dmsg" data-id="${E(m.id)}" data-k="${E(k)}">🗑 Delete</button></div><div style="white-space:pre-wrap;margin-top:4px">${E(m.x)}</div></div>`).join('')}</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn alt" data-act="close">Close</button><button class="btn danger" data-act="delconv" data-k="${E(k)}">Delete entire conversation</button></div>`);
  }
  async function afterMsgDel(k, ids, label) {
    C.messages = (C.messages || []).filter(x => ids.indexOf(x.id) < 0);
    ok(label); if (convs().some(x => x.k === k)) cview(k, true); else closeModal(); drawList();
  }

  /* ================= email alerts ================= */
  function emailConf() { const d = (C.adminconf || []).find(x => x.id === 'notify') || {}; return Object.assign({ emails: [], rep: true, mem: true, ver: true, itm: false, msg: false, snip: false }, d); }
  function email() {
    const c = emailConf(), cb = (id, on, label, hint) => `<label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;cursor:pointer"><input type="checkbox" id="em-${id}" style="width:auto;margin-top:3px"${on ? ' checked' : ''}><span><b>${label}</b><br><span style="color:#667064">${hint}</span></span></label>`;
    return hd('Email Alerts', 'Get an email the moment something needs your attention.') + `<div class="dg"><div><div class="pb"><h3>Send alerts to</h3><div class="in"><textarea id="em-emails" rows="3" placeholder="you@example.com">${E((c.emails || []).join('\n'))}</textarea><p style="color:#667064;margin:6px 0 0">One address per line. Kept private: only staff can read this.</p></div></div>
<div class="pb"><h3>Alert me when…</h3><div class="in">${cb('rep', c.rep, 'A report is filed', 'Scam, abuse, fake listing, reported chat.')}${cb('mem', c.mem, 'A new member joins', 'Name, type and province.')}${cb('ver', c.ver, 'Someone asks to be verified', 'A registration number is added to a profile.')}${cb('itm', c.itm, 'A new listing is posted', 'Can be noisy on a busy site.')}</div></div></div>
<div><div class="pb"><h3>Emails to members</h3><div class="in">${cb('msg', c.msg, 'Email members about new chat messages', 'Sends “you have a new message” (at most one per 10 minutes per sender). Needs a verified sending domain.')}${cb('snip', c.snip, 'Include the first part of the message', 'Off is more private. The email then only says who wrote and where to read it.')}</div></div>
<div class="pb"><div class="in"><button class="btn" data-act="esave">Save settings</button> <button class="btn alt" data-act="etest">Send test email</button><p style="color:#667064;margin:10px 0 0">Emails are sent by a Supabase Edge Function. Setup steps are in ADMIN-SETUP.md. Until it is deployed the test will fail.</p></div></div></div></div>`;
  }

  /* ================= dashboard ================= */
  function weeks(arr) { const W = 7 * 864e5, now = Date.now(), b = new Array(8).fill(0); arr.forEach(x => { const k = Math.floor((now - (+x.ts || 0)) / W); if (k >= 0 && k < 8) b[7 - k]++; }); return b; }
  function chart() {
    const a = weeks(C.items), p = weeks(C.posts), mx = Math.max(1, ...a.map((v, i) => v + p[i]));
    return `<svg viewBox="0 0 320 120" style="width:100%;height:auto" role="img" aria-label="Listings and posts per week">${a.map((v, i) => { const h1 = v / mx * 80, h2 = p[i] / mx * 80, x = 8 + i * 39; return `<rect x="${x}" y="${92 - h1}" width="26" height="${h1}" fill="#0b5d3b" rx="2"/><rect x="${x}" y="${92 - h1 - h2}" width="26" height="${h2}" fill="#9be15d" rx="2"/><text x="${x + 13}" y="108" font-size="9" text-anchor="middle" fill="#667064">${i === 7 ? 'now' : (7 - i) + 'w'}</text>`; }).join('')}</svg><div style="font-size:12px;color:#667064"><span style="color:#0b5d3b">■</span> Listings &nbsp; <span style="color:#7ac143">■</span> Community posts — last 8 weeks</div>`;
  }
  function dash() {
    const M = C.members, V = M.filter(m => m.verified).length, P = M.filter(m => !m.verified && m.reg).length, dr = C.pages.filter(p => !p.pub).length, h = HEALTH || {};
    const gl = (n, l, s) => can(s) ? `<a data-act="nav" data-id="${s}"><b>${n}</b>${l}</a>` : `<a style="cursor:default"><b>${n}</b>${l}</a>`;
    const att = []; if (C.reports.length) att.push(['⚑', C.reports.length + ' report' + (C.reports.length > 1 ? 's' : '') + ' to review', 'reports']); if (P) att.push(['🧑‍🌾', P + ' member' + (P > 1 ? 's' : '') + ' awaiting verification', 'members']); const po = C.opps.filter(o => (o.status || 'pending') === 'pending').length; if (po) att.push(['🌾', po + ' opportunity post' + (po > 1 ? 's' : '') + ' awaiting approval', 'opps']); if (dr) att.push(['📄', dr + ' draft page' + (dr > 1 ? 's' : ''), 'pages']);
    const hl = (n, v) => `<div style="display:flex;padding:4px 0"><span style="flex:1">${n}</span>${v === undefined ? '…' : v ? '<span class="pill g">✓ OK</span>' : '<span class="pill r">✗ Problem</span>'}</div>`;
    return `<div class="hero2"><h2>Welcome to Gaden Hub, ${E((user && user.name || 'Admin').split(' ')[0])}!</h2><p>Manage the marketplace, community and content of PNG's digital agriculture hub.</p>${can('pages') ? '<button class="btn" data-act="pnew">✎ Write a page</button>' : ''}${can('reports') ? '<button class="btn" data-act="nav" data-id="reports">⚑ Review reports</button>' : ''}${can('members') ? '<button class="btn y" data-act="nav" data-id="members">✔ Verify members</button>' : ''}</div>
<div class="dg"><div>
<div class="pb"><h3>At a Glance</h3><div class="in"><div class="glance">${gl(M.length, 'Members', 'members')}${gl(V, 'Verified', 'members')}${gl(C.items.length, 'Listings', 'listings')}${gl(C.posts.length, 'Community posts', 'comm')}${gl(C.threads.length, 'Forum topics', 'comm')}${gl(C.pages.length, 'Pages & guides', 'pages')}</div></div></div>
<div class="pb"><h3>Needs attention</h3><div class="in">${att.length ? att.filter(a => can(a[2])).map(a => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eef1ee"><span>${a[0]}</span><span style="flex:1">${a[1]}</span><button class="btn sm" data-act="nav" data-id="${a[2]}">Open</button></div>`).join('') : '<span style="color:#667064">All clear. Nothing is waiting for you. ✅</span>'}</div></div>
${can('pages') ? `<div class="pb"><h3>Quick Draft</h3><div class="in"><input id="qd-t" placeholder="Title" style="margin-bottom:8px"><textarea id="qd-b" rows="4" placeholder="What's on your mind?"></textarea><button class="btn" style="margin-top:8px" data-act="qdraft">Save Draft</button></div></div>` : ''}
</div><div>
<div class="pb"><h3>Activity (last 8 weeks)</h3><div class="in">${chart()}</div></div>
<div class="pb"><h3>Recent admin activity</h3><div class="in">${C.adminlog.length ? C.adminlog.slice(0, 6).map(l => `<div style="padding:5px 0;border-bottom:1px solid #eef1ee"><b>${E(l.name)}</b> ${E(l.action)} <span style="color:#667064">${E(snip(l.target, 44))} · ${ago(l.ts)}</span></div>`).join('') : '<span style="color:#667064">No admin actions yet.</span>'}</div></div>
<div class="pb"><h3>Site Health</h3><div class="in">${hl('Database', h.db)}${hl('Photo storage', h.st)}${hl('Signed in as staff', h.auth)}<p style="color:#667064;margin:8px 0 0;font-size:12px">Chat messages are opened only from Chat Messages, one conversation at a time, and every view is logged. There are no payments, so no orders.</p></div></div>
</div></div>`;
  }
  async function health() { HEALTH = { db: true, auth: !!UID && ISADMIN }; try { const r = await sb.storage.from('photos').list('', { limit: 1 }); HEALTH.st = !r.error; } catch (e) { HEALTH.st = false; } }

  /* ================= site boards ================= */
  function site() {
    const v = id => { const d = (C.settings || []).find(x => x.id === id); return d && d.text || ''; };
    const box = (id, title, hint, rows) => `<div class="pb"><h3>${title}</h3><div class="in"><p style="color:#667064;margin:0 0 8px">${hint}</p><textarea id="st-${id}" rows="${rows}">${E(v(id))}</textarea><button class="btn" style="margin-top:10px" data-act="ssave" data-id="${id}">Save changes</button></div></div>`;
    return hd('Banner & Boards', 'Site-wide announcement and the weekly boards.') + '<div class="dg"><div>' + box('site', '📣 Announcement banner', 'Shown at the top of every page. Leave empty to hide.', 3) + box('events', '🎓 Training & events board', 'One per line: <b>Title | Date or place</b>', 8) + '</div><div>' + box('prices', '💰 Price board', 'One per line: <b>Item | Price</b>, e.g. <i>Sweet potato | K2.50/kg</i>', 14) + '</div></div>';
  }

  /* ================= staff & roles ================= */
  function users() {
    const mem = id => { const m = C.members.find(x => x.id === id); return m ? (m.biz || m.name) : '(no member profile)'; }, hasRole = C.staff.some(s => s.hasRole);
    const cand = C.members.filter(m => !C.staff.some(s => s.id === m.id));
    return hd('Staff & Roles', 'Who can use this dashboard.') +
      `<div class="pb"><div class="w"><table><thead><tr><th></th><th>Staff member</th><th>User ID</th><th>Role</th><th></th></tr></thead><tbody>${C.staff.map(s => `<tr><td></td><td><b>${E(mem(s.id))}</b>${s.id === UID ? ' <span class="pill g">you</span>' : ''}</td><td style="font-family:monospace;font-size:12px">${E(s.id)}</td><td>${hasRole ? `<select data-act="srole" data-id="${E(s.id)}">${['admin', 'editor', 'moderator'].map(r => `<option${r === (s.role || 'admin') ? ' selected' : ''}>${r}</option>`).join('')}</select>` : 'admin'}</td><td>${s.id === UID ? '' : `<button class="btn danger sm" data-act="sdel" data-id="${E(s.id)}">Remove</button>`}</td></tr>`).join('')}</tbody></table></div></div>
<div class="pb"><h3>Add staff</h3><div class="in"><div class="tbar" style="padding:0;border:0"><select id="su-m" style="flex:1"><option value="">Choose a member…</option>${cand.map(m => `<option value="${E(m.id)}">${E(m.biz || m.name)} (${E(m.prov || '')})</option>`).join('')}</select><select id="su-r">${hasRole ? '<option>moderator</option><option>editor</option><option>admin</option>' : '<option>admin</option>'}</select><button class="btn" data-act="sadd">Add</button></div>
<p style="color:#667064;margin:10px 0 0"><b>Administrator</b>: everything. <b>Editor</b>: pages, media, banner and boards. <b>Moderator</b>: members, listings, community and reports.</p>${hasRole ? '' : '<p style="color:#7a5a00;background:#fff1c2;padding:8px 10px;border-radius:6px">Roles are not enabled yet. Run the “roles” SQL in ADMIN-SETUP.md, then reload. Until then every staff member is a full administrator.</p>'}</div></div>`;
  }

  /* ================= page editor ================= */
  function editor() {
    const p = ED, vis = p.mode === 'v';
    return `${hd(p.isNew ? 'Add New Page' : 'Edit Page', '')}<div class="edg"><div>
<input class="ttl" id="ae-title" placeholder="Add title" value="${E(p.title)}">
<div style="color:#667064;margin:6px 0 12px;font-size:13px">Link: <code>#/p/</code>${p.isNew ? `<input id="ae-id" value="${E(p.id)}" placeholder="auto from title" style="display:inline;width:200px;padding:3px 8px">` : '<b>' + E(p.id) + '</b>'}</div>
<div class="edtb">${vis ? `<button data-act="fmt" data-f="p" title="Paragraph">¶</button><button data-act="fmt" data-f="h2"><b>Heading</b></button><button data-act="fmt" data-f="h3">Subheading</button><button data-act="fmt" data-f="b"><b>B</b></button><button data-act="fmt" data-f="ul">• List</button><button data-act="fmt" data-f="link">🔗 Link</button><button data-act="media">🖼 Add media</button><button data-act="fmt" data-f="undo">↶</button><button data-act="fmt" data-f="redo">↷</button>` : ''}<span class="sp"></span><button class="tab ${p.mode === 'v' ? 'on' : ''}" data-act="mode" data-m="v">Visual</button><button class="tab ${p.mode === 't' ? 'on' : ''}" data-act="mode" data-m="t">Text</button><button class="tab ${p.mode === 'p' ? 'on' : ''}" data-act="mode" data-m="p">Preview</button></div>
${vis ? '<div id="adm-ed" contenteditable="true"></div>' : p.mode === 't' ? `<textarea class="code" id="ae-body">${E(p.body)}</textarea>` : `<div id="adm-prev" style="background:#fff;border:1px solid #dfe5df;border-radius:0 0 6px 6px;padding:18px;min-height:380px"><h1 style="display:block;margin:0 0 10px">${E(p.title)}</h1>${md(p.body)}</div>`}
</div><div>
<div class="pb"><h3>Publish</h3><div class="in"><p style="margin:0 0 10px">Status: ${p.pub ? '<span class="pill g">Published</span>' : '<span class="pill">Draft</span>'}</p>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="psave" data-pub="1">${p.pub ? 'Update' : 'Publish'}</button><button class="btn alt" data-act="psave" data-pub="0">${p.pub ? 'Switch to draft' : 'Save draft'}</button></div>
<div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap">${p.isNew ? '' : `<a data-act="ppage" data-id="${E(p.id)}" style="cursor:pointer;color:#0b5d3b">View page</a><a data-act="del" data-c="pages" data-id="${E(p.id)}" data-n="page ${E(snip(p.title, 40))}" style="cursor:pointer;color:#c8372d">Delete</a>`}<a data-act="pcancel" style="cursor:pointer;color:#667064">← All pages</a></div></div></div>
<div class="pb"><h3>Where it appears</h3><div class="in"><label style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="checkbox" id="ae-menu" style="width:auto"${p.menu ? ' checked' : ''}> Footer menu</label><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ae-guide" style="width:auto"${p.guide ? ' checked' : ''}> Prices & Guides section</label></div></div>
</div></div>`;
  }
  function syncEd() {
    if (!ED) return;
    const g = id => el(id);
    if (g('ae-title')) ED.title = g('ae-title').value;
    if (g('ae-id') && ED.isNew) ED.id = g('ae-id').value;
    if (g('ae-menu')) { ED.menu = g('ae-menu').checked; ED.guide = g('ae-guide').checked; }
    if (ED.mode === 'v' && g('adm-ed')) ED.body = h2m(g('adm-ed')); else if (ED.mode === 't' && g('ae-body')) ED.body = g('ae-body').value;
  }
  function insertAtCaret(html) {
    const ed = el('adm-ed'); if (!ed) return;
    ed.focus(); const s = getSelection();
    if (SELR && ed.contains(SELR.commonAncestorContainer)) { s.removeAllRanges(); s.addRange(SELR); } else { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
    document.execCommand('insertHTML', false, html); syncEd();
  }

  /* ================= media library ================= */
  function mediaView() {
    return hd('Media Library', 'Upload and manage images. Insert them into pages with “Add media”.', '<label class="btn sm" style="margin:0;cursor:pointer">Add New<input type="file" id="adm-up" accept="image/*" multiple hidden></label>') +
      `<div class="pb"><div class="tbar"><button class="btn ${MT === 'lib' ? '' : 'alt'} sm" data-act="mtab" data-m="lib">Site uploads (yours)</button><button class="btn ${MT === 'mem' ? '' : 'alt'} sm" data-act="mtab" data-m="mem">Member photos</button>${MD ? `<button class="btn alt sm" data-act="mback">← All folders</button>` : ''}</div><div id="adm-tbl" style="padding:14px;color:#667064">Loading…</div></div>`;
  }
  async function files(folder) {
    const r = await sb.storage.from('photos').list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
    if (r.error) throw r.error;
    const rows = (r.data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
    return { dirs: rows.filter(f => !f.id), files: rows.filter(f => f.id).map(f => { const path = (folder ? folder + '/' : '') + f.name; return { path, name: f.name, url: sb.storage.from('photos').getPublicUrl(path).data.publicUrl, ts: Date.parse(f.created_at) }; }) };
  }
  async function loadMedia() {
    const box = el('adm-tbl'); if (!box) return;
    try {
      const folder = MT === 'lib' ? UID : MD, res = await files(folder);
      const mem = id => { const m = (C.members || []).find(x => x.id === id); return m ? (m.biz || m.name) : ''; };
      box.style.padding = '0';
      box.innerHTML = (MT === 'mem' && !MD ? (res.dirs.length ? `<div class="mg">${res.dirs.map(d => `<div><div class="fd" data-act="mopen" data-id="${E(d.name)}">📁<br>${E(snip(d.name, 16))}</div></div>`).join('')}</div>` : '<p style="padding:20px">No member photos.</p>') : (res.files.length ? `<div class="mg">${res.files.map(f => `<div><a href="${E(f.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${E(f.url)}" alt=""></a><div class="mt"><span style="flex:1">${dt(f.ts)}</span><a data-act="mcopy" data-u="${E(f.url)}" style="cursor:pointer;color:#0b5d3b">Copy URL</a><a data-act="mdel" data-id="${E(f.path)}" style="cursor:pointer;color:#c8372d">Delete</a></div></div>`).join('')}</div>` : '<p style="padding:20px">No images yet. Click “Add New” to upload.</p>'));
    } catch (e) { box.innerHTML = 'Could not list photos: ' + E(e.message || e) + '<br>Staff need storage policies (ADMIN-SETUP.md).'; }
  }
  async function upload(file) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file is not a valid image')); i.src = URL.createObjectURL(file); });
    const sc = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .85)), p = UID + '/' + Date.now() + Math.random().toString(36).slice(2, 6) + '.jpg';
    const r = await sb.storage.from('photos').upload(p, blob, { contentType: 'image/jpeg' }); if (r.error) throw r.error; return p;
  }
  async function doUploads(input, after) {
    const fl = [...input.files]; if (!fl.length) return; toast('Uploading…');
    try { for (const f of fl) await upload(f); await log('Uploaded ' + fl.length + ' image(s)', 'Media'); ok('Uploaded'); } catch (e) { bad(e.message || e); }
    input.value = ''; after();
  }
  function modal(html) { closeModal(); const o = document.createElement('div'); o.id = 'adm-modal'; o.className = 'adm-ov'; o.innerHTML = '<div class="adm-dlg">' + html + '</div>'; o.onclick = e => { if (e.target === o) return closeModal(); onClick(e); }; o.onchange = onChange; document.body.appendChild(o); }
  function closeModal() { const m = el('adm-modal'); if (m) m.remove(); }
  async function picker() {
    const ed = el('adm-ed'), s = getSelection(); SELR = ed && s.rangeCount && ed.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0).cloneRange() : null;
    modal('<h3>Insert media</h3><p style="color:#667064">Click an image to insert it. <label class="btn sm" style="cursor:pointer;margin-left:8px">Upload<input type="file" id="pk-up" accept="image/*" multiple hidden></label></p><div id="pk-g">Loading…</div><div style="text-align:right;margin-top:12px"><button class="btn alt" data-act="close">Close</button></div>');
    const g = async () => { try { const r = await files(UID); el('pk-g') && (el('pk-g').innerHTML = r.files.length ? '<div class="mg">' + r.files.map(f => `<div><img src="${E(f.url)}" alt="" data-act="pick" data-u="${E(f.url)}"></div>`).join('') + '</div>' : 'No images yet. Upload one.'); } catch (e) { el('pk-g') && (el('pk-g').textContent = 'Could not load: ' + (e.message || e)); } };
    g(); const up = el('pk-up'); if (up) up.onchange = () => doUploads(up, g);
  }
  function memberModal(id) {
    const m = C.members.find(x => x.id === id); if (!m) return; const n = (C.items || []).filter(i => i.by === id).length;
    const kv = [['Name', m.name], ['Business / group', m.biz], ['Type', m.type], ['Kind', m.kind], ['Registration no.', m.reg], ['Province', m.prov], ['District', m.district], ['Main crop', m.crop], ['Products', m.prods], ['Phone', m.phone], ['Website', m.web], ['Base', m.loc], ['Member since', m.since], ['About', m.about], ['Listings', n]].filter(x => x[1] !== undefined && x[1] !== '');
    modal(`<h3>${E(m.biz || m.name)} ${m.verified ? '<span class="pill g">✔ Verified</span>' : ''}</h3><div class="kv">${kv.map(x => `<span>${x[0]}</span><span>${E(x[1])}</span>`).join('')}</div>${!m.verified && !m.reg ? '<p class="pill" style="margin-top:12px">No registration number provided. Verify only after checking by other means.</p>' : ''}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;justify-content:flex-end"><button class="btn alt" data-act="close">Close</button><button class="btn alt" data-act="vmem" data-id="${E(m.id)}">Open public page</button><button class="btn ${m.verified ? 'danger' : ''}" data-act="verify" data-id="${E(m.id)}" data-v="${m.verified ? 0 : 1}">${m.verified ? 'Remove verified badge' : '✔ Verify member'}</button></div>`);
  }

  /* ================= events ================= */
  function onInput(e) {
    const t = e.target;
    if (t.id === 'adm-q') { Q = t.value; PAGE = 1; drawList(); }
    else if (t.id === 'adm-ed' || t.id === 'ae-body' || t.id === 'ae-title') syncEd();
  }
  function onChange(e) {
    const t = e.target, a = t.dataset && t.dataset.act;
    if (t.id === 'adm-ct') { CT = t.value; PAGE = 1; Q = ''; draw(); }
    else if (t.id === 'adm-up') doUploads(t, loadMedia);
    else if (t.id && t.id.indexOf('ae-') === 0) syncEd();
    else if (a === 'avail') { const id = t.dataset.id, v = t.value, it = C.items.find(x => x.id === id); run(async () => { await dbUpd('items', id, { avail: v }); await log('Set availability to "' + v + '"', 'Listing: ' + (it && it.n)); }, 'Availability updated'); }
    else if (a === 'srole') { const id = t.dataset.id, v = t.value; run(async () => { const r = await sb.from('staff').update({ role: v }).eq('user_id', id).select('user_id'); if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error(DENIED); await log('Changed staff role to ' + v, id); }, 'Role updated'); }
  }
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.act, id = b.dataset.id, c = b.dataset.c, d = b.dataset;
    switch (a) {
      case 'close': closeModal(); break;
      case 'burger': NAV = !NAV; el('adm').classList.toggle('nav-open', NAV); break;
      case 'nav': S = id; Q = ''; VW = id === 'messages' ? 'rep' : id === 'opps' ? 'pending' : 'all'; PAGE = 1; ED = null; MD = ''; NAV = false; ERR[S] = ''; NEED[S].forEach(k => { delete C[k]; }); draw(); break;
      case 'home': go('home'); break;
      case 'logout': logout(); break;
      case 'refresh': ERR[S] = ''; NEED[S].forEach(k => { delete C[k]; }); if (S === 'dash') HEALTH = null; draw(); break;
      case 'view': VW = d.v; PAGE = 1; draw(); break;
      case 'pg': PAGE = +d.p; drawList(); break;
      case 'chkall': document.querySelectorAll('.adm-ck').forEach(x => { x.checked = b.checked; }); break;
      case 'vitem': closeModal(); openP(id); break;
      case 'vmem': closeModal(); openB(id); break;
      case 'ppage': openPage(id); break;
      case 'mrev': memberModal(id); break;
      case 'verify': {
        const v = d.v === '1', m = C.members.find(x => x.id === id);
        if (v && !confirm('Verify ' + (m && (m.biz || m.name)) + '? Only do this after checking their registration number.')) return;
        closeModal(); run(async () => { await dbUpd('members', id, { verified: v }); await log(v ? 'Verified member' : 'Removed verified badge', (m && (m.biz || m.name)) + ' (' + id + ')'); }, v ? 'Member verified' : 'Badge removed', ['members']);
        break;
      }
      case 'eitem': {
        const i = C.items.find(x => x.id === id); if (!i) return;
        const cats = [...new Set(C.items.map(x => x.cat).filter(Boolean).concat(i.cat || []))];
        ask('Edit listing', [{ l: 'Product name', v: i.n }, { l: 'Price (e.g. K5.00 / kg)', v: i.p }, { l: 'Category', o: cats, v: i.cat }, { l: 'Details', v: i.d || '', a: 1, opt: 1 }], ([n, p, cat, dd]) => run(async () => { await dbUpd('items', id, { n, p, cat, d: dd }); await log('Edited listing', n + ' (' + id + ')'); }, 'Listing updated'), 'Save changes');
        break;
      }
      case 'del': {
        if (!confirm('Permanently delete ' + d.n + '? This cannot be undone.')) return;
        run(async () => { await dbDel(c, id); await log('Deleted ' + c.replace(/s$/, ''), d.n + ' (' + id + ')'); if (c === 'pages') ED = null; }, 'Deleted', c === 'pages' ? ['pages'] : null);
        break;
      }
      case 'rmcm': {
        if (!confirm('Remove this comment?')) return;
        run(async () => { const doc = C[c].find(x => x.id === id), arr = (c === 'posts' ? doc.c : doc.r || []).slice(); arr.splice(+d.k, 1); await dbUpd(c, id, c === 'posts' ? { c: arr } : { r: arr }); await log('Removed a comment', c + ' ' + id); }, 'Comment removed');
        break;
      }
      case 'rmrep': {
        if (!confirm('Remove the reported ' + d.n + ' and close this report?')) return;
        run(async () => { await dbDel(c, id); await dbDel('reports', d.rid); await log('Removed reported ' + d.n, c + ' ' + id); }, 'Content removed and report closed');
        break;
      }
      case 'dismiss': run(async () => { await dbDel('reports', d.rid); await log('Dismissed report', d.rid); }, 'Report dismissed'); break;
      case 'bulk': {
        const sel = el('adm-bulk'), v = sel && sel.value, ids = [...document.querySelectorAll('.adm-ck:checked')].map(x => x.value);
        if (!v || !ids.length) return toast('Choose an action and tick at least one item', 'err');
        if (/delete|dismiss|trash/.test(v) && !confirm('Apply “' + sel.options[sel.selectedIndex].text + '” to ' + ids.length + ' item(s)?')) return;
        const f = { verify: x => dbUpd('members', x, { verified: true }), unverify: x => dbUpd('members', x, { verified: false }), delete: x => dbDel(S === 'comm' ? CT : S === 'opps' ? 'opps' : 'items', x), oapprove: x => dbUpd('opps', x, { status: 'published' }), oreject: x => dbUpd('opps', x, { status: 'rejected' }), dismiss: x => dbDel('reports', x), publish: x => dbUpd('pages', x, { pub: true }), draft: x => dbUpd('pages', x, { pub: false }), trash: x => dbDel('pages', x) }[v];
        run(async () => { for (const x of ids) await f(x); await log('Bulk action “' + v + '” on ' + ids.length + ' item(s)', S); }, ids.length + ' item(s) updated');
        break;
      }
      /* pages */
      case 'pnew': S = 'pages'; ED = { isNew: true, id: '', title: '', body: '', pub: false, menu: false, guide: false, mode: 'v' }; NAV = false; draw(); break;
      case 'pedit': { const p = C.pages.find(x => x.id === id); ED = { isNew: false, id: p.id, title: p.title || '', body: p.body || '', pub: !!p.pub, menu: !!p.menu, guide: !!p.guide, mode: 'v' }; draw(); break; }
      case 'pcancel': ED = null; draw(); break;
      case 'mode': syncEd(); ED.mode = d.m; draw(); break;
      case 'fmt': {
        const f = d.f, ed = el('adm-ed'); if (!ed) return; ed.focus();
        if (f === 'link') { const u = prompt('Paste the link (https://…)'); if (u && /^https?:\/\//.test(u)) document.execCommand('insertText', false, ' ' + u + ' '); }
        else document.execCommand({ p: 'formatBlock', h2: 'formatBlock', h3: 'formatBlock', b: 'bold', ul: 'insertUnorderedList', undo: 'undo', redo: 'redo' }[f], false, { p: '<p>', h2: '<h2>', h3: '<h3>' }[f] || null);
        syncEd(); break;
      }
      case 'media': picker(); break;
      case 'pick': { const alt = (prompt('Describe the image for people who cannot see it (optional)') || '').replace(/[\[\]()"<>]/g, ''); closeModal(); insertAtCaret('<p><img src="' + d.u + '" alt="' + alt + '"></p><p><br></p>'); break; }
      case 'psave': {
        syncEd(); const title = (ED.title || '').trim(); if (!title) return toast('Please add a title first', 'err');
        let pid = ED.isNew ? (slug(ED.id) || slug(title) || 'page-' + Date.now()) : ED.id;
        if (ED.isNew) { const base = pid; let n = 2; while (C.pages.some(x => x.id === pid)) pid = base + '-' + n++; }
        const pub = d.pub === '1', data = { title, body: ED.body || '', pub, menu: !!ED.menu, guide: !!ED.guide }, isNew = ED.isNew;
        run(async () => { if (isNew) await dbPut('pages', pid, data); else await dbUpd('pages', pid, Object.assign(data, { ts: Date.now() })); await log((isNew ? 'Created' : 'Updated') + (pub ? ' (published)' : ' (draft)') + ' page', title); if (pub || isNew) ED = null; else { ED.pub = false; ED.isNew = false; ED.id = pid; } }, pub ? 'Page published' : 'Draft saved', ['pages']);
        break;
      }
      case 'qdraft': {
        const t = el('qd-t').value.trim(); if (!t) return toast('Please add a title first', 'err');
        const body = el('qd-b').value, pid = slug(t) || 'draft-' + Date.now();
        run(async () => { await dbPut('pages', pid + '-' + Date.now().toString(36).slice(-4), { title: t, body, pub: false, menu: false, guide: false }); await log('Saved quick draft', t); }, 'Draft saved', ['pages', 'adminlog']);
        break;
      }
      case 'ssave': { const txt = el('st-' + id).value.trim(); run(async () => { await dbPut('settings', id, { text: txt }); await log('Updated ' + ({ site: 'announcement banner', prices: 'price board', events: 'events board' })[id], snip(txt, 60)); }, 'Saved'); break; }
      /* media */
      case 'mtab': MT = d.m; MD = ''; draw(); break;
      case 'mopen': MD = id; draw(); break;
      case 'mback': MD = ''; draw(); break;
      case 'mcopy': (navigator.clipboard ? navigator.clipboard.writeText(d.u) : Promise.reject()).then(() => ok('Link copied'), () => prompt('Copy this link', d.u)); break;
      case 'mdel': {
        if (!confirm('Permanently delete this image? Pages using it will show a broken image.')) return;
        sb.storage.from('photos').remove([id]).then(r => { if (r.error || !r.data || !r.data.length) return bad(r.error ? r.error.message : DENIED); log('Deleted image', id); ok('Image deleted'); loadMedia(); });
        break;
      }
      case 'oset': run(async () => { await dbUpd('opps', id, { status: d.s }); await log('Set opportunity to ' + d.s, d.n); }, 'Opportunity ' + d.s); break;
      case 'cview': cview(d.k); break;
      case 'dmsg': {
        if (!confirm('Delete this message for everyone? This cannot be undone.')) return;
        const m = C.messages.find(x => x.id === id);
        (async () => { try { await dbDel('messages', id); await log('Deleted chat message', (m ? m.from + ' → ' + m.to : '') + ' (' + id + ')'); await afterMsgDel(d.k, [id], 'Message deleted'); } catch (e) { bad(e.message || e); } })();
        break;
      }
      case 'delconv': {
        const t = convs().find(x => x.k === d.k); if (!t || !confirm('Delete all ' + t.msgs.length + ' messages in this conversation? This cannot be undone.')) return;
        (async () => { try { const ids = t.msgs.map(x => x.id); for (const x of ids) await dbDel('messages', x); await log('Deleted conversation (' + ids.length + ' messages)', t.a + ' ↔ ' + t.b + (t.item ? ' re: ' + t.item : '')); await afterMsgDel(d.k, ids, 'Conversation deleted'); } catch (e) { bad(e.message || e); } })();
        break;
      }
      case 'esave': {
        const v = k => el('em-' + k).checked, list2 = el('em-emails').value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean), badE = list2.filter(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
        if (badE.length) return toast('Please fix this email address: ' + badE[0], 'err');
        run(async () => { await dbPut('adminconf', 'notify', { emails: list2, rep: v('rep'), mem: v('mem'), ver: v('ver'), itm: v('itm'), msg: v('msg'), snip: v('snip') }); await log('Updated email alert settings', list2.length + ' recipient(s)'); }, 'Settings saved');
        break;
      }
      case 'etest': {
        toast('Sending test email…');
        sb.functions.invoke('notify', { body: { test: true } }).then(r => { if (r.error) throw r.error; const n = r.data && r.data.sent; ok(n ? 'Test email sent to ' + n + ' address(es). Check your inbox.' : 'Function works, but no recipients are saved yet.'); }).catch(e => bad('the email function is not reachable (' + (e.message || e) + '). See ADMIN-SETUP.md, section 4.'));
        break;
      }
      /* staff */
      case 'sadd': {
        const m = el('su-m').value, role = el('su-r').value; if (!m) return toast('Choose a member first', 'err');
        if (!confirm('Give this member access to the admin dashboard as ' + role + '?')) return;
        run(async () => { const hasRole = C.staff.some(s => s.hasRole), r = await sb.from('staff').insert(hasRole ? { user_id: m, role } : { user_id: m }).select('user_id'); if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error(DENIED); await log('Added staff (' + role + ')', m); }, 'Staff member added', ['staff', 'members']);
        break;
      }
      case 'sdel': {
        if (!confirm('Remove this person’s admin access?')) return;
        run(async () => { const r = await sb.from('staff').delete().eq('user_id', id).select('user_id'); if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error(DENIED); await log('Removed staff access', id); }, 'Access removed', ['staff']);
        break;
      }
    }
  }

  window.admin = function () {
    if (!ISADMIN) return notfound();
    const a = document.activeElement; if (a && a.isContentEditable && el('adm') && el('adm').contains(a)) return; /* never redraw while typing in the visual editor */
    draw();
  };
  window._admLoaded = true;
})();
