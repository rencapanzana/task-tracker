'use strict';
// Public by design: the anon key only works within the RLS policies in schema.sql.
const SUPABASE_URL = 'https://gzvniozcdiaejdakdjfe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6dm5pb3pjZGlhZWpkYWtkamZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzQ0MjQsImV4cCI6MjEwNjQ1MDQyNH0.-LgqfTVvU-0gNAaXDXSv88AvmmPmzSC6hGu6chxUKas';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUSES = ['Not Started', 'In Progress', 'Waiting', 'Blocked', 'Done'];
const STATUS_CLASS = { 'In Progress': 's-ip', Waiting: 's-w', Blocked: 's-b', Done: 's-d' };
const FILTERS = [['open', 'Open'], ['In Progress', 'In Progress'], ['Waiting', 'Waiting'], ['Blocked', 'Blocked'], ['Done', 'Done'], ['all', 'All']];
const COLORS = ['#F0386B', '#F5C518', '#F97316', '#8B5CF6', '#10B981', '#3B82F6'];
const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6V6h-2v7.4l4.3 2.6 1-1.7z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10a2 2 0 0 1 2 2v16l-7-4-7 4V5a2 2 0 0 1 2-2z"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
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

const S = { clients: [], tasks: [], filter: 'open', q: '', day: ymd(new Date()), view: 'home', user: null };
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
const colorOf = id => { const i = S.clients.findIndex(c => c.id === id); return i < 0 ? '#C4B5FD' : COLORS[i % COLORS.length]; };
const isOpen = t => t.status !== 'Done';

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
  document.querySelectorAll('.nav [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  ({ home: renderHome, schedule: renderSchedule, clients: renderClients })[S.view]();
}

function taskCard(t) {
  const c = clientOf(t.client_id);
  const when = [t.due_date && S.view !== 'schedule' ? fmtDay(t.due_date) : '', fmtTime(t.due_time)].filter(Boolean).join(', ');
  return `<div class="task glass ${isOpen(t) ? '' : 'is-done'}" data-task="${t.id}" role="button" tabindex="0">
    <button class="check ${isOpen(t) ? '' : 'done'}" data-toggle="${t.id}" aria-label="${isOpen(t) ? 'Mark done' : 'Mark not done'}">${ICON.tick}</button>
    <div class="body">
      <div class="stripe-title" style="--c:${colorOf(t.client_id)}">${esc(t.title)}</div>
      <div class="meta">
        ${when ? `<span>${ICON.clock}${esc(when)}</span>` : ''}
        ${c ? `<span>${ICON.tag}${esc(c.name)}</span>` : ''}
        ${t.status !== 'Not Started' ? `<span class="pill ${STATUS_CLASS[t.status] || ''}">${esc(t.status)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function clientCard(c, full) {
  const open = S.tasks.filter(t => t.client_id === c.id && isOpen(t));
  const next = open.find(t => t.due_date);
  return `<button class="ccard glass ${full ? 'full' : ''}" data-client="${c.id}">
    <div class="stripe-title" style="--c:${colorOf(c.id)}">${esc(c.name)}</div>
    <div class="divider"></div>
    <div class="meta">
      <span>${ICON.clock}${next ? 'Next: ' + esc(fmtDay(next.due_date)) : 'Nothing scheduled'}</span>
      <span>${ICON.tag}${open.length} open task${open.length === 1 ? '' : 's'}</span>
      ${c.health ? `<span class="health">${esc(c.health)}</span>` : ''}
      ${full && c.next_action ? `<span>Next action: ${esc(c.next_action)}</span>` : ''}
    </div>
  </button>`;
}

function matches(t) {
  if (S.filter === 'open' && !isOpen(t)) return false;
  if (!['open', 'all'].includes(S.filter) && t.status !== S.filter) return false;
  if (!S.q) return true;
  const hay = `${t.title} ${t.notes || ''} ${clientOf(t.client_id)?.name || ''}`.toLowerCase();
  return hay.includes(S.q.toLowerCase());
}

function renderHome() {
  const h = new Date().getHours();
  $('#greet').textContent = h < 12 ? 'Good morning ☀️' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = (S.user?.email || '').split('@')[0];
  $('#who').textContent = name;
  $('#avatar').textContent = name.slice(0, 1).toUpperCase();

  $('#chips').innerHTML = FILTERS.map(([k, label]) => {
    const n = S.tasks.filter(t => k === 'all' || (k === 'open' ? isOpen(t) : t.status === k)).length;
    return `<button class="chip ${S.filter === k ? 'on' : ''}" data-filter="${esc(k)}" role="tab" aria-selected="${S.filter === k}">${label}<span class="n">${n}</span></button>`;
  }).join('');

  $('#clientStrip').innerHTML = S.clients.map(c => clientCard(c)).join('')
    || `<button class="ccard glass" data-act="newClient"><div class="stripe-title">Add your first client</div></button>`;

  const list = S.tasks.filter(matches);
  $('#listTitle').textContent = `${FILTERS.find(f => f[0] === S.filter)[1]} tasks`;
  if (!list.length) { $('#taskList').innerHTML = `<div class="empty">${S.q ? 'No tasks match that search.' : 'Nothing here. Tap + to add a task.'}</div>`; return; }

  if (S.filter === 'Done') {
    list.sort((a, b) => (b.completed_at || b.due_date || '').localeCompare(a.completed_at || a.due_date || ''));
    $('#taskList').innerHTML = list.map(taskCard).join('');
    return;
  }
  const today = ymd(new Date());
  const groups = [
    ['Overdue', t => isOpen(t) && t.due_date && t.due_date < today, 'late'],
    ['Today', t => t.due_date === today],
    ['Upcoming', t => t.due_date > today],
    ['No date', t => !t.due_date],
    ['Earlier', t => !isOpen(t) && t.due_date && t.due_date < today],
  ];
  const seen = new Set();
  $('#taskList').innerHTML = groups.map(([label, fn, cls]) => {
    const g = list.filter(t => !seen.has(t) && fn(t));
    g.forEach(t => seen.add(t));
    if (label === 'Earlier') g.reverse();
    return g.length ? `<div class="group ${cls || ''}">${label} · ${g.length}</div>${g.map(taskCard).join('')}` : '';
  }).join('');
}

function renderSchedule() {
  const today = ymd(new Date());
  const d = parseDay(S.day);
  $('#dayTitle').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dayTasks = S.tasks.filter(t => t.due_date === S.day);
  const open = dayTasks.filter(isOpen).length;
  $('#daySub').textContent = dayTasks.length ? `${open} open, ${dayTasks.length - open} done` : 'Nothing scheduled. Tap + to plan this day.';

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
    ? dayTasks.map(t => `<div class="t">${t.due_time ? fmtTime(t.due_time) : 'Any time'}</div>${taskCard(t)}`).join('')
    : '';
}

function renderClients() {
  $('#clientList').innerHTML = S.clients.map(c => clientCard(c, true)).join('') || '<div class="empty">No clients yet.</div>';
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
  const rec = t || { status: 'Not Started', due_date: S.view === 'schedule' ? S.day : ymd(new Date()) };
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
    <p style="color:var(--muted);margin-bottom:16px">Signed in as ${esc(S.user?.email)}</p>
    <div class="actions"><button class="btn" data-close>Close</button><button class="btn primary" data-act="signout">Sign out</button></div>
  </div></div>`;
}

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-toggle],[data-task],[data-client],[data-view],[data-filter],[data-day],[data-act],[data-close],.scrim');
  if (!el) return;
  const d = el.dataset;
  if (el.classList.contains('scrim')) { if (e.target === el) closeSheet(); return; }
  if (d.close !== undefined) return closeSheet();
  if (d.toggle) { const t = S.tasks.find(x => x.id === d.toggle); return setDone(t, isOpen(t)); }
  if (d.task) return taskSheet(S.tasks.find(x => x.id === d.task));
  if (d.client) return clientSheet(clientOf(d.client));
  if (d.view) { S.view = d.view; scrollTo(0, 0); return render(); }
  if (d.filter) { S.filter = d.filter; return render(); }
  if (d.day) { S.day = d.day; return render(); }
  if (d.act === 'newTask') return taskSheet();
  if (d.act === 'newClient') return clientSheet();
  if (d.act === 'account') return accountSheet();
  if (d.act === 'today') { S.day = ymd(new Date()); return render(); }
  if (d.act === 'signout') { closeSheet(); return sb.auth.signOut(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
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
