'use strict';
// Public by design: the anon key only works within the RLS policies in schema.sql.
const SUPABASE_URL = 'https://gzvniozcdiaejdakdjfe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6dm5pb3pjZGlhZWpkYWtkamZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzQ0MjQsImV4cCI6MjEwNjQ1MDQyNH0.-LgqfTVvU-0gNAaXDXSv88AvmmPmzSC6hGu6chxUKas';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUSES = ['Not Started', 'In Progress', 'Waiting', 'Blocked', 'Done'];
const STATUS_CLASS = { 'In Progress': 's-ip', Waiting: 's-w', Blocked: 's-b', Done: 's-d' };
const FILTERS = [['open', 'Open'], ['In Progress', 'In Progress'], ['Waiting', 'Waiting'], ['Blocked', 'Blocked'], ['Done', 'Done'], ['all', 'All']];
const COLORS = ['oklch(0.68 0.17 33)', 'oklch(0.68 0.12 195)', 'oklch(0.62 0.17 300)', 'oklch(0.78 0.14 85)', 'oklch(0.64 0.15 150)', 'oklch(0.62 0.16 255)', 'oklch(0.66 0.19 355)'];
const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

const TASK_FIELDS = [
  ['title', 'Task', 'text', null, 'wide'],
  ['client_id', 'Client', 'client'],
  ['status', 'Status', 'select', STATUSES],
  ['due_date', 'Due date', 'date'],
  ['due_time', 'Time', 'time'],
  ['notes', 'Notes', 'textarea', null, 'wide'],
];
const CLIENT_FIELDS = [
  ['name', 'Client', 'text', null, 'wide'],
  ['health', 'Health', 'select', ['🟢 On Track', '🟡 Needs Attention', '🔴 At Risk']],
  ['priority', 'Priority', 'select', ['High', 'Medium', 'Low']],
  ['main_contact', 'Main contact', 'text'],
  ['channel', 'Channel', 'select', ['WhatsApp', 'Email', 'Slack', 'Phone']],
  ['current_focus', 'Current focus', 'textarea', null, 'wide'],
  ['next_action', 'Next action', 'text', null, 'wide'],
  ['next_action_due', 'Next action due', 'date'],
  ['next_action_owner', 'Owner', 'select', ['Me', 'Tony', 'Client', 'Team']],
  ['waiting_on', 'Waiting on', 'select', ['Nothing', 'Client', 'Tony', 'Internal', 'Me']],
  ['main_blocker', 'Main blocker', 'text'],
  ['last_touchpoint', 'Last touchpoint', 'date'],
  ['next_touchpoint', 'Next touchpoint', 'date'],
  ['service_scope', 'Service / scope', 'text'],
  ['timezone', 'Timezone', 'text'],
  ['important_links', 'Important links', 'url', null, 'wide'],
  ['notes', 'Notes', 'textarea', null, 'wide'],
];

const S = { enter: true, clients: [], tasks: [], filter: 'open', client: 'all', q: '', day: ymd(new Date()), view: 'home', user: null };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseDay(s) { const [y, m, d] = s.split('-'); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); }
function fmtDay(s) {
  const t = ymd(new Date());
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  return parseDay(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
}
const clientOf = id => S.clients.find(c => c.id === id);
const colorOf = id => { const i = S.clients.findIndex(c => c.id === id); return i < 0 ? 'var(--faint)' : COLORS[i % COLORS.length]; };
const isOpen = t => t.status !== 'Done';
const isLate = t => isOpen(t) && t.due_date && t.due_date < ymd(new Date());
const inClient = t => S.client === 'all' || t.client_id === S.client;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function clientStats(id) {
  const open = S.tasks.filter(t => t.client_id === id && isOpen(t));
  const today = ymd(new Date());
  return { open: open.length, late: open.filter(isLate).length, today: open.filter(t => t.due_date === today).length, next: open.find(t => t.due_date) };
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.role = 'status'; el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 3500);
}

// ---------- data ----------
async function load() {
  // ponytail: plain select caps at Supabase's 1000-row default; paginate once tasks pass that.
  const [c, t] = await Promise.all([
    sb.from('clients').select('*').order('name'),
    sb.from('tasks').select('*').order('due_date', { nullsFirst: false }).order('due_time', { nullsFirst: true }),
  ]);
  if (c.error || t.error) return toast((c.error || t.error).message);
  S.clients = c.data; S.tasks = t.data;
  render();
}

async function save(table, id, row) {
  const q = id ? sb.from(table).update(row).eq('id', id) : sb.from(table).insert(row);
  const { error } = await q;
  if (error) { toast(error.message); return false; }
  await load();
  return true;
}

async function setDone(task, done) {
  await save('tasks', task.id, { status: done ? 'Done' : 'Not Started', completed_at: done ? new Date().toISOString() : null });
}

// ---------- render ----------
function render() {
  for (const v of ['home', 'schedule', 'clients']) $('#v-' + v).hidden = S.view !== v;
  const enter = S.enter; S.enter = false;
  document.querySelectorAll('nav [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.view && (S.view !== 'home' || S.client === 'all')));
  renderSide();
  ({ home: renderHome, schedule: renderSchedule, clients: renderClients })[S.view]();
  $('#v-' + S.view).classList.toggle('enter', enter);
  if (enter) document.querySelectorAll(`#v-${S.view} .task, #v-${S.view} .ccard`).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
}

function taskCard(t) {
  const c = clientOf(t.client_id);
  const when = [t.due_date && S.view !== 'schedule' ? fmtDay(t.due_date) : '', fmtTime(t.due_time)].filter(Boolean).join(', ');
  return `<div class="task ${isOpen(t) ? '' : 'is-done'}" data-task="${t.id}" role="button" tabindex="0">
    <button class="check ${isOpen(t) ? '' : 'done'}" data-toggle="${t.id}" aria-label="${isOpen(t) ? 'Mark done' : 'Mark not done'}">${ICON.tick}</button>
    <div class="body">
      <div class="title">${esc(t.title)}</div>
      <div class="meta">
        ${S.client === 'all' || S.view !== 'home' ? `<span class="client"><i class="dot" style="--c:${colorOf(t.client_id)}"></i><span class="nm">${c ? esc(c.name) : 'No client'}</span></span>` : ''}
        <span class="stat">${t.status !== 'Not Started' ? `<span class="pill ${STATUS_CLASS[t.status] || ''}">${esc(t.status)}</span>` : ''}</span>
        <span class="when ${isLate(t) ? 'late' : ''}">${when ? ICON.clock + esc(when) : ''}</span>
      </div>
    </div>
  </div>`;
}

function clientCard(c) {
  const st = clientStats(c.id);
  return `<button class="ccard card" data-client="${c.id}">
    <div class="top"><i class="dot" style="--c:${colorOf(c.id)}"></i><b>${esc(c.name)}</b>${c.health ? `<span class="health">${esc(c.health)}</span>` : ''}</div>
    <div class="row"><span><strong>${st.open}</strong> open</span><span><strong class="${st.late ? 'late' : ''}">${st.late}</strong> overdue</span><span><strong>${st.today}</strong> today</span></div>
    <div class="next"><span>Next action</span>${c.next_action ? esc(c.next_action) : st.next ? esc(st.next.title) : 'Nothing scheduled'}</div>
  </button>`;
}

function renderSide() {
  $('#sideClients').innerHTML = S.clients.map(c => {
    const st = clientStats(c.id);
    const on = S.view === 'home' && S.client === c.id;
    return `<button class="side-item ${on ? 'on' : ''}" data-cfilter="${c.id}" ${on ? 'aria-current="true"' : ''}>
      <i class="dot" style="--c:${colorOf(c.id)}"></i><span class="name">${esc(c.name)}</span>
      <span class="n ${st.late ? 'late' : ''}" title="${st.late ? plural(st.late, 'overdue task') : plural(st.open, 'open task')}">${st.late || st.open || ''}</span></button>`;
  }).join('');
}

function clientPanel(c) {
  const fact = (label, v, cls = '') => v ? `<div><dt>${label}</dt><dd class="${cls}">${v}</dd></div>` : '';
  const link = v => /^https?:\/\//i.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v);
  const st = clientStats(c.id);
  const due = c.next_action_due ? ` (${esc(fmtDay(c.next_action_due))})` : '';
  return `<div class="cpanel card">
    <div class="cpanel-top"><i class="dot" style="--c:${colorOf(c.id)}"></i><h2>Client details</h2><button class="link-btn" data-client="${c.id}">Edit</button></div>
    <div class="health">${c.health ? esc(c.health) + ' · ' : ''}${plural(st.open, 'open task')}${st.late ? `, <span style="color:var(--late)">${st.late} overdue</span>` : ''}</div>
    <dl class="facts">
      ${fact('Current focus', esc(c.current_focus))}
      ${fact('Next action', c.next_action ? esc(c.next_action) + due : '', c.next_action_due && c.next_action_due < ymd(new Date()) ? 'late' : '')}
      ${fact('Waiting on', c.waiting_on && c.waiting_on !== 'Nothing' ? esc(c.waiting_on) : '')}
      ${fact('Blocker', esc(c.main_blocker))}
      ${fact('Contact', [c.main_contact, c.channel].filter(Boolean).map(esc).join(' · '))}
      ${fact('Next touchpoint', c.next_touchpoint ? esc(fmtDay(c.next_touchpoint)) : '')}
      ${fact('Links', c.important_links ? link(c.important_links) : '')}
    </dl>
  </div>`;
}

function glancePanel() {
  if (!S.clients.length) return '';
  return `<div class="glance card"><h2>Clients at a glance</h2>${S.clients.map(c => {
    const st = clientStats(c.id);
    const sub = st.next ? `Next: ${esc(st.next.title)}` : 'Nothing scheduled';
    return `<button class="glance-row" data-cfilter="${c.id}"><i class="dot" style="--c:${colorOf(c.id)}"></i><b>${esc(c.name)}</b>
      <span class="n ${st.late ? 'late' : ''}">${st.late ? st.late + ' overdue' : st.open + ' open'}</span><span class="sub">${sub}</span></button>`;
  }).join('')}</div>`;
}

function matches(t) {
  if (!inClient(t)) return false;
  if (S.filter === 'open' && !isOpen(t)) return false;
  if (!['open', 'all'].includes(S.filter) && t.status !== S.filter) return false;
  if (!S.q) return true;
  const hay = `${t.title} ${t.notes || ''} ${clientOf(t.client_id)?.name || ''}`.toLowerCase();
  return hay.includes(S.q.toLowerCase());
}

function renderHome() {
  const h = new Date().getHours();
  const name = (S.user?.email || '').split('@')[0];
  $('#who').textContent = name;
  $('#avatar').textContent = $('#avatarM').textContent = name.slice(0, 1).toUpperCase();
  const c = S.client === 'all' ? null : clientOf(S.client);
  if (!c) S.client = 'all';
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  $('#homeTitle').innerHTML = c ? `<i class="dot" style="--c:${colorOf(c.id)}"></i>${esc(c.name)}` : 'All work';

  const scoped = S.tasks.filter(inClient);
  const today = ymd(new Date());
  const late = scoped.filter(isLate).length, due = scoped.filter(t => isOpen(t) && t.due_date === today).length;
  const status = late || due
    ? [late && `<b class="late">${late} overdue</b>`, due && `<b>${due} due today</b>`].filter(Boolean).join(' · ')
    : 'Nothing overdue or due today';
  $('#greet').innerHTML = `${c ? '' : (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ' · '}${date} · ${status}`;
  const allOpen = S.tasks.filter(isOpen).length;
  $('#tabs').innerHTML = [['all', 'All', allOpen], ...S.clients.map(x => [x.id, x.name, clientStats(x.id).open])].map(([id, name, n]) =>
    `<button class="tab ${S.client === id ? 'on' : ''}" data-cfilter="${id}" role="tab" aria-selected="${S.client === id}">${id === 'all' ? '' : `<i class="dot" style="--c:${colorOf(id)}"></i>`}${esc(name)}<span class="n">${n}</span></button>`
  ).join('') + `<button class="tab" data-act="newClient" aria-label="Add client">${ICON.plus.replace('<svg', '<svg width="16" height="16"')}</button>`;

  $('#chips').innerHTML = FILTERS.map(([k, label]) => {
    const n = scoped.filter(t => k === 'all' || (k === 'open' ? isOpen(t) : t.status === k)).length;
    return `<button class="chip ${S.filter === k ? 'on' : ''}" data-filter="${esc(k)}" role="tab" aria-selected="${S.filter === k}">${label}<span class="n">${n}</span></button>`;
  }).join('');

  $('#aside').innerHTML = c ? clientPanel(c) : glancePanel();

  const list = S.tasks.filter(matches);
  if (!list.length) {
    $('#taskList').innerHTML = `<div class="empty card">${S.q ? '<b>No tasks match that search.</b>Try a client name or a word from the notes.'
      : `<b>Nothing ${S.filter === 'open' ? 'open' : 'here'}${c ? ' for ' + esc(c.name) : ''}.</b>New tasks land here, grouped by due date.<br><button class="btn primary" data-act="newTask">New task</button>`}</div>`;
    return;
  }

  if (S.filter === 'Done') {
    list.sort((a, b) => (b.completed_at || b.due_date || '').localeCompare(a.completed_at || a.due_date || ''));
    $('#taskList').innerHTML = `<div class="list">${list.map(taskCard).join('')}</div>`;
    return;
  }
  const groups = [
    ['Overdue', t => isOpen(t) && t.due_date && t.due_date < today, 'late'],
    ['Today', t => t.due_date === today],
    ['Upcoming', t => t.due_date > today],
    ['No date', t => !t.due_date],
    ['Earlier', t => !isOpen(t) && t.due_date && t.due_date < today],
  ];
  const seen = new Set();
  $('#taskList').innerHTML = `<div class="thead" aria-hidden="true"><span>Task</span><span class="client">Client</span><span class="stat">Status</span><span class="when">Due</span></div>` + groups.map(([label, fn, cls]) => {
    const g = list.filter(t => !seen.has(t) && fn(t));
    g.forEach(t => seen.add(t));
    if (label === 'Earlier') g.reverse();
    return g.length ? `<div class="group ${cls || ''}">${label}<span class="n">${g.length}</span></div><div class="list">${g.map(taskCard).join('')}</div>` : '';
  }).join('');
}

function renderSchedule() {
  const today = ymd(new Date());
  const d = parseDay(S.day);
  $('#dayTitle').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dayTasks = S.tasks.filter(t => t.due_date === S.day);
  const open = dayTasks.filter(isOpen).length;
  $('#daySub').textContent = dayTasks.length ? `${open} open, ${dayTasks.length - open} done` : 'Nothing scheduled. Add a task to plan this day.';

  const busy = new Set(S.tasks.filter(isOpen).map(t => t.due_date));
  const start = addDays(S.day < today ? S.day : today, -7);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  $('#days').innerHTML = days.map(s => {
    const x = parseDay(s);
    return `<button class="day ${s === S.day ? 'on' : ''} ${s === today ? 'today' : ''} ${busy.has(s) ? 'has' : ''}" data-day="${s}" aria-label="${x.toDateString()}" aria-pressed="${s === S.day}">
      <small>${x.toLocaleDateString(undefined, { weekday: 'short' })}</small><b>${String(x.getDate()).padStart(2, '0')}</b></button>`;
  }).join('');
  $('#days .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  $('#timeline').innerHTML = dayTasks.length
    ? dayTasks.map(t => `<div class="t">${t.due_time ? fmtTime(t.due_time) : 'Any time'}</div><div class="list">${taskCard(t)}</div>`).join('')
    : '';
}

function renderClients() {
  $('#clientCount').textContent = plural(S.clients.length, 'client');
  $('#clientList').innerHTML = S.clients.map(c => clientCard(c)).join('') || '<div class="empty card"><b>No clients yet.</b>Each client gets its own tab and color.</div>';
}

// ---------- sheets ----------
function fieldHTML([key, label, type, opts, wide], rec) {
  const v = rec[key] ?? '';
  const cls = wide ? 'class="wide"' : '';
  if (type === 'select' || type === 'client') {
    const list = type === 'client' ? S.clients.map(c => [c.id, c.name]) : opts.map(o => [o, o]);
    const blank = key === 'status' ? '' : '<option value="">None</option>';
    return `<label ${cls}>${label}<select name="${key}">${blank}${list.map(([val, txt]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select></label>`;
  }
  // Limits mirror the check constraints in hardening.sql; the DB is the real enforcement.
  if (type === 'textarea') return `<label ${cls}>${label}<textarea name="${key}" maxlength="5000">${esc(v)}</textarea></label>`;
  const val = type === 'time' && v ? v.slice(0, 5) : v;
  const max = type === 'url' ? 'maxlength="2000"' : type === 'text' ? 'maxlength="300"' : '';
  return `<label ${cls}>${label}<input name="${key}" type="${type}" value="${esc(val)}" ${max} ${key === 'title' || key === 'name' ? 'required' : ''}></label>`;
}

function closeSheet() { $('#sheetRoot').innerHTML = ''; }

function openSheet(title, fields, rec, onSave, onDelete) {
  $('#sheetRoot').innerHTML = `<div class="scrim"><form class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div><h2>${esc(title)}</h2>
    <div class="form">${fields.map(f => fieldHTML(f, rec)).join('')}
      <div class="actions">
        ${onDelete ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}
        <button type="button" class="btn" data-close>Cancel</button>
        <button class="btn primary">Save</button>
      </div>
    </div></form></div>`;
  const form = $('#sheetRoot form');
  form.querySelector('input,select')?.focus();
  form.onsubmit = async e => {
    e.preventDefault();
    const row = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]));
    form.querySelector('.primary').disabled = true;
    if (await onSave(row)) closeSheet(); else form.querySelector('.primary').disabled = false;
  };
  form.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (confirm('Delete this permanently?') && await onDelete()) closeSheet();
  });
}

function taskSheet(t) {
  const rec = t || { status: 'Not Started', due_date: S.view === 'schedule' ? S.day : ymd(new Date()), client_id: S.client === 'all' ? null : S.client };
  openSheet(t ? 'Edit task' : 'New task', TASK_FIELDS, rec, row => {
    const wasDone = t?.status === 'Done';
    if (row.status === 'Done' && !wasDone) row.completed_at = new Date().toISOString();
    if (row.status !== 'Done') row.completed_at = null;
    return save('tasks', t?.id, row);
  }, t && (async () => { const { error } = await sb.from('tasks').delete().eq('id', t.id); if (error) return toast(error.message); await load(); return true; }));
}

function clientSheet(c) {
  openSheet(c ? c.name : 'New client', CLIENT_FIELDS, c || {}, row => save('clients', c?.id, row),
    c && (async () => { const { error } = await sb.from('clients').delete().eq('id', c.id); if (error) return toast(error.message); await load(); return true; }));
}

function accountSheet() {
  $('#sheetRoot').innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="Account">
    <div class="grab"></div><h2>Account</h2>
    <p style="color:var(--muted);margin-bottom:18px">Signed in as ${esc(S.user?.email)}</p>
    <div class="actions"><button class="btn" data-close>Close</button><button class="btn primary" data-act="signout">Sign out</button></div>
  </div></div>`;
}

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-toggle],[data-task],[data-client],[data-cfilter],[data-view],[data-filter],[data-day],[data-act],[data-close],.scrim');
  if (!el) return;
  const d = el.dataset;
  if (el.classList.contains('scrim')) { if (e.target === el) closeSheet(); return; }
  if (d.close !== undefined) return closeSheet();
  if (d.toggle) { const t = S.tasks.find(x => x.id === d.toggle); return setDone(t, isOpen(t)); }
  if (d.task) return taskSheet(S.tasks.find(x => x.id === d.task));
  if (d.client) return clientSheet(clientOf(d.client));
  if (d.cfilter) { S.enter = true; S.client = d.cfilter; S.view = 'home'; scrollTo(0, 0); return render(); }
  if (d.view) { S.enter = true; S.view = d.view; if (d.view === 'home') S.client = 'all'; scrollTo(0, 0); return render(); }
  if (d.filter) { S.enter = true; S.filter = d.filter; return render(); }
  if (d.day) { S.day = d.day; return render(); }
  if (d.act === 'newTask') return taskSheet();
  if (d.act === 'newClient') return clientSheet();
  if (d.act === 'account') return accountSheet();
  if (d.act === 'today') { S.day = ymd(new Date()); return render(); }
  if (d.act === 'signout') { closeSheet(); return sb.auth.signOut(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  const typing = e.target.closest('input,textarea,select,[contenteditable]');
  if (!typing && !$('#sheetRoot').children.length && S.user && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === 'n') { e.preventDefault(); return taskSheet(); }
    if (e.key === '/') { e.preventDefault(); S.view = 'home'; render(); return $('#q').focus(); }
  }
  if (e.key === 'Enter' && e.target.dataset.task) e.target.click();
});
$('#q').addEventListener('input', e => { S.q = e.target.value; renderHome(); });

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) toast(error.message);
};

sb.auth.onAuthStateChange((_evt, session) => {
  S.user = session?.user || null;
  $('#login').hidden = !!S.user;
  $('#app').hidden = !S.user;
  if (S.user) load();
});

// Cheap cross-device sync: refetch whenever the tab comes back into view.
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) load(); });
