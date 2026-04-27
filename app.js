// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const STORAGE_KEY = 'fusaro_v4';

const GROUP_COLORS = [
  { name:'blue',   bg:'#1a2840', color:'#5fa8ff' },
  { name:'green',  bg:'#1a2830', color:'#52d9a0' },
  { name:'purple', bg:'#251f38', color:'#c084fc' },
  { name:'amber',  bg:'#2a1f10', color:'#fbbf24' },
  { name:'rose',   bg:'#2a1520', color:'#fb7185' },
  { name:'cyan',   bg:'#0f2530', color:'#22d3ee' },
  { name:'lime',   bg:'#182510', color:'#a3e635' },
  { name:'orange', bg:'#2a1a08', color:'#fb923c' },
];

const LABELS  = { none:'–', partial:'In corso', done:'Completato' };
const CYCLE   = { none:'partial', partial:'done', done:'none' };
const PRIO_LABEL = { alta:'Alta', media:'Media', bassa:'Bassa', '':'—' };

// ─────────────────────────────────────────────
// TASK FACTORY
// ─────────────────────────────────────────────
function uid() { return 'id-' + Math.random().toString(36).slice(2,9); }

function makeCabinTasks(prefix) {
  return [
    { name:`Plastiche ${prefix}`,                  days:'—',   people:1 },
    { name:`Infilaggio ${prefix}`,                 days:'0.5', people:2 },
    { name:`Installazioni ${prefix}`,              days:'1.5', people:2 },
    { name:`Quadro ${prefix} ★`,                  days:'3',   people:1 },
    { name:`Allacciamento Vano Tecnico ${prefix}`, days:'1',   people:1 },
    { name:`Allacciamento Quadro ${prefix} ★`,    days:'3',   people:1 },
    { name:`Programmazione ${prefix} ★`,          days:'1',   people:1 },
    { name:`Collaudo ${prefix}`,                   days:'0.5', people:1 },
  ].map(t => ({ id:uid(), name:t.name, days:t.days, people:t.people, status:'none', priority:'', dueDate:'' }));
}

// ─────────────────────────────────────────────
// DEFAULT DATA
// ─────────────────────────────────────────────
function makeDefaultData() {
  return {
    trasferte: [
      { id:'tr-1', giorni:'1', luogo:'Cartura Fibre' },
      { id:'tr-2', giorni:'1', luogo:'Cartura TVCC'  },
      { id:'tr-3', giorni:'1', luogo:'Baucino'       },
      { id:'tr-4', giorni:'1', luogo:'Bologna'       },
    ],
    groups: [
      {
        id:'g-t5', label:'Gruppo T5', colorIdx:0, collapsed:false,
        tasks:[
          { id:'t5-getti',       name:'Preparazione Getti + Installazione', days:'0.5', people:1, status:'done',    priority:'',      dueDate:'' },
          { id:'t5-vano',        name:'Allacciamenti Vano Tecnico T5',       days:'0.5', people:1, status:'none',    priority:'',      dueDate:'' },
          { id:'t5-quadro',      name:'Allacciamento Quadro T5C ★',          days:'1',   people:1, status:'done',    priority:'',      dueDate:'' },
          { id:'t5-prog',        name:'Programmazione T5 ★',                 days:'1',   people:1, status:'done',    priority:'',      dueDate:'' },
          { id:'t5-collaudo',    name:'Collaudo T5',                         days:'0.5', people:1, status:'partial', priority:'alta',  dueDate:'' },
          { id:'t5-gettoniera',  name:'Installazione Gettoniera – ultima T5', days:'—',  people:1, status:'none',    priority:'alta',  dueDate:'' },
          { id:'t5-ionizzatore', name:'Installazione Ionizzatore – ultima T5',days:'—',  people:1, status:'none',    priority:'media', dueDate:'' },
        ]
      },
      { id:'g-t1',  label:'Gruppo T1',  colorIdx:1, collapsed:false, tasks:[
        { id:uid(), name:'Plastiche T1',                         days:'—',   people:1, status:'done', priority:'',     dueDate:'' },
        { id:uid(), name:'Infilaggio T1',                        days:'0.5', people:2, status:'none', priority:'',     dueDate:'' },
        { id:uid(), name:'Installazioni T1',                     days:'1.5', people:2, status:'none', priority:'',     dueDate:'' },
        { id:uid(), name:'Quadro T1 ★',                         days:'3',   people:1, status:'none', priority:'alta', dueDate:'' },
        { id:uid(), name:'Allacciamento Vano Tecnico T1',         days:'1',   people:1, status:'none', priority:'',     dueDate:'' },
        { id:uid(), name:'Allacciamento Quadro T1 ★',            days:'3',   people:1, status:'none', priority:'',     dueDate:'' },
        { id:uid(), name:'Programmazione T1 ★',                  days:'1',   people:1, status:'none', priority:'',     dueDate:'' },
        { id:uid(), name:'Collaudo T1',                           days:'0.5', people:1, status:'none', priority:'',     dueDate:'' },
      ]},
      { id:'g-t2',  label:'Gruppo T2',  colorIdx:2, collapsed:false, tasks: makeCabinTasks('T2')  },
      { id:'g-t3',  label:'Gruppo T3',  colorIdx:3, collapsed:false, tasks: makeCabinTasks('T3')  },
      { id:'g-t4a', label:'Gruppo T4A', colorIdx:4, collapsed:false, tasks: makeCabinTasks('T4A') },
      { id:'g-t4b', label:'Gruppo T4B', colorIdx:5, collapsed:false, tasks: makeCabinTasks('T4B') },
    ]
  };
}

// ─────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────
function saveData() {
  // localStorage fallback only (Firebase writes via db.js)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); } catch(e) {}
}

// appData starts empty — populated by firebase.js after auth
var appData = { groups: [], trasferte: [] };

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function escHtml(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function parseNum(s) {
  if (!s || s==='—' || s==='-') return NaN;
  return parseFloat(String(s).replace(',','.'));
}
function fmtNum(n) {
  if (isNaN(n)) return '—';
  return String(Math.round(n*10)/10).replace('.',',');
}
function computeGU(days, people) {
  const d = parseNum(days), p = parseFloat(people);
  return (isNaN(d)||isNaN(p)) ? NaN : d * p;
}
function guToBarWidth(gu) { return isNaN(gu) ? 2 : Math.min(100, Math.round((gu/18)*100)); }

function groupTotals(group) {
  let total=0, remaining=0;
  group.tasks.forEach(t => {
    const gu = computeGU(t.days, t.people);
    if (!isNaN(gu)) { total += gu; if (t.status !== 'done') remaining += gu; }
  });
  return { total, remaining };
}

function findGroup(gid) { return appData.groups.find(g=>g.id===gid); }
function findTask(gid, tid) { const g=findGroup(gid); return g ? g.tasks.find(t=>t.id===tid) : null; }

// Due date helpers
function dueDaysLeft(dueDate) {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dueDate);
  return Math.round((due - today) / 86400000);
}
function dueBadgeHtml(dueDate) {
  if (!dueDate) return '';
  const d = dueDaysLeft(dueDate);
  let cls = 'due-badge', label = '';
  if (d < 0)      { cls += ' overdue';  label = `⚠ scaduta ${Math.abs(d)}g fa`; }
  else if (d <= 7){ cls += ' due-soon'; label = `⏰ ${d===0?'oggi':d+'g'}`; }
  else             { label = `📅 ${new Date(dueDate).toLocaleDateString('it-IT',{day:'2-digit',month:'short'})}`; }
  return `<span class="${cls}">${label}</span>`;
}
function prioBadgeHtml(p) {
  if (!p) return '';
  return `<span class="prio prio-${p}">${p==='alta'?'▲':p==='media'?'●':'▼'} ${PRIO_LABEL[p]}</span>`;
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function render() {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  appData.groups.forEach(group => {
    const c = GROUP_COLORS[group.colorIdx % GROUP_COLORS.length];
    renderGroupHeader(tbody, group, c);
    group.tasks.forEach(task => renderTaskRow(tbody, task, group, c));
    renderAddTaskRow(tbody, group, c);
    renderSubtotalRow(tbody, group, c);
  });
  updatePills();
}

function renderGroupHeader(tbody, group, c) {
  const tr = document.createElement('tr');
  tr.className = 'group-header-row' + (group.collapsed ? ' group-collapsed' : '');
  tr.dataset.groupId = group.id;
  tr.innerHTML = `
    <td colspan="6">
      <div class="group-header-inner" style="background:${c.bg}">
        <span class="group-label" style="color:${c.color}" data-action="toggle-group" data-group="${group.id}">
          <span class="collapse-icon">▸</span> ${escHtml(group.label)}
        </span>
        <div class="group-actions">
          <button class="icon-btn pdf"    title="Esporta gruppo PDF" data-action="export-group" data-group="${group.id}">↓</button>
          <button class="icon-btn"        title="Rinomina / colore"  data-action="rename-group" data-group="${group.id}">✎</button>
          <button class="icon-btn clone"  title="Clona gruppo"       data-action="clone-group"  data-group="${group.id}">⧉</button>
          <button class="icon-btn danger" title="Elimina gruppo"     data-action="delete-group" data-group="${group.id}">✕</button>
        </div>
      </div>
    </td>`;
  tbody.appendChild(tr);
}

function renderTaskRow(tbody, task, group, c) {
  const tr = document.createElement('tr');
  tr.className = 'task-row' + (group.collapsed ? ' collapsed-row' : '');
  tr.dataset.taskId  = task.id;
  tr.dataset.groupId = group.id;
  if (task.status==='done')    tr.classList.add('row-done');
  if (task.status==='partial') tr.classList.add('row-partial');

  const gu   = computeGU(task.days, task.people);
  const dDisp = (task.days==='—'||task.days==='-') ? '—' : fmtNum(parseNum(task.days));

  tr.innerHTML = `
    <td>
      <div class="task-name-cell">
        <span class="task-name" style="border-left:2px solid ${c.color};padding-left:10px">${escHtml(task.name)}</span>
        ${prioBadgeHtml(task.priority)}
        ${dueBadgeHtml(task.dueDate)}
        ${typeof assignmentBadgeHtml === 'function' ? assignmentBadgeHtml(task) : ''}
        <div class="row-actions">
          <button class="icon-btn" title="Modifica" data-action="edit-task"   data-task="${task.id}" data-group="${group.id}">✎</button>
          <button class="icon-btn danger" title="Elimina" data-action="delete-task" data-task="${task.id}" data-group="${group.id}">✕</button>
        </div>
      </div>
    </td>
    <td class="num days">${escHtml(dDisp)}</td>
    <td class="num people" style="text-align:center">×${task.people}</td>
    <td class="total-cell">${escHtml(fmtNum(gu))}</td>
    <td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="background:${c.color};width:${guToBarWidth(gu)}%"></div></div></td>
    <td style="text-align:center">
      <button class="status-btn" data-status="${task.status}" data-task="${task.id}" data-group="${group.id}">
        <span class="btn-dot"></span><span class="btn-label">${LABELS[task.status]||'–'}</span>
      </button>
    </td>`;
  tbody.appendChild(tr);
}

function renderAddTaskRow(tbody, group, c) {
  const tr = document.createElement('tr');
  tr.className = 'add-task-row' + (group.collapsed ? ' collapsed-row' : '');
  tr.innerHTML = `
    <td colspan="6">
      <div class="add-task-inner" style="background:${c.bg}22">
        <button class="add-task-btn" data-action="add-task" data-group="${group.id}" style="color:${c.color}88">
          <span style="font-size:14px;line-height:1">+</span> Aggiungi attività
        </button>
      </div>
    </td>`;
  tbody.appendChild(tr);
}

function renderSubtotalRow(tbody, group, c) {
  const { total, remaining } = groupTotals(group);
  const tr = document.createElement('tr');
  tr.className = 'subtotal-row' + (group.collapsed ? ' collapsed-row' : '');
  tr.innerHTML = `
    <td colspan="2" class="subtotal-remaining"><span>rimanenti &nbsp;</span>${fmtNum(remaining)} G·U</td>
    <td colspan="2" class="subtotal-label">Totale ${escHtml(group.label)}</td>
    <td class="subtotal-val" colspan="2" style="text-align:right;color:${c.color}">${fmtNum(total)}</td>`;
  tbody.appendChild(tr);
}

// ─────────────────────────────────────────────
// PILLS
// ─────────────────────────────────────────────
function updatePills() {
  let total=0, done=0, partial=0, remaining=0, highPrio=0, dueSoon=0;
  appData.groups.forEach(g => g.tasks.forEach(t => {
    total++;
    if (t.status==='done')    done++;
    if (t.status==='partial') partial++;
    if (t.status!=='done') {
      const gu = computeGU(t.days, t.people);
      if (!isNaN(gu)) remaining += gu;
    }
    if (t.priority==='alta' && t.status!=='done') highPrio++;
    const dl = dueDaysLeft(t.dueDate);
    if (dl !== null && dl <= 7 && t.status !== 'done') dueSoon++;
  }));
  document.getElementById('pill-total').textContent     = total;
  document.getElementById('pill-done').textContent      = done;
  document.getElementById('pill-partial').textContent   = partial;
  document.getElementById('pill-remaining').textContent = fmtNum(remaining);
  document.getElementById('pill-high').textContent      = highPrio;
  document.getElementById('pill-due').textContent       = dueSoon;
}

// ─────────────────────────────────────────────
// MODAL SYSTEM
// ─────────────────────────────────────────────
let modalResolve = null;
function openModal(title, bodyHTML, confirmLabel='Salva') {
  return new Promise(resolve => {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-confirm').textContent = confirmLabel;
    document.getElementById('modal').style.display = 'flex';
    const first = document.querySelector('#modal-body input:not([readonly]),#modal-body select');
    if (first) setTimeout(() => first.focus(), 50);
  });
}
function closeModal(result) {
  document.getElementById('modal').style.display = 'none';
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}
document.getElementById('modal-cancel').addEventListener('click', () => closeModal(null));
document.getElementById('modal').addEventListener('click', e => { if (e.target===document.getElementById('modal')) closeModal(null); });
document.getElementById('modal-confirm').addEventListener('click', () => {
  const result = {};
  document.querySelectorAll('#modal-body [data-field]').forEach(el => { result[el.dataset.field] = el.value.trim(); });
  const sel = document.querySelector('#modal-body .color-radio:checked');
  if (sel) result.colorIdx = parseInt(sel.value);
  const prio = document.querySelector('#modal-body .prio-opt:checked');
  if (prio) result.priority = prio.value;
  closeModal(result);
});
document.getElementById('modal-body').addEventListener('keydown', e => {
  if (e.key==='Enter' && e.target.tagName!=='TEXTAREA') document.getElementById('modal-confirm').click();
});

// ─────────────────────────────────────────────
// LIVE G·U CALC IN MODAL
// ─────────────────────────────────────────────
function attachGuCalc() {
  const di = document.querySelector('#modal-body [data-field="days"]');
  const pi = document.querySelector('#modal-body [data-field="people"]');
  const gi = document.querySelector('#modal-body [data-field="gu"]');
  if (!di||!pi||!gi) return;
  const recalc = () => { const gu=computeGU(di.value,pi.value); gi.value=isNaN(gu)?'—':fmtNum(gu); };
  di.addEventListener('input', recalc); pi.addEventListener('input', recalc); recalc();
}

// ─────────────────────────────────────────────
// COLOR SWATCHES — radio-based, no JS needed
// ─────────────────────────────────────────────
function attachSwatches() { /* no-op: handled natively by radio inputs */ }
function swatchesHtml(activeIdx) {
  return GROUP_COLORS.map((c,i)=>`<label style="display:inline-flex;flex-direction:column;align-items:center;cursor:pointer"><input type="radio" class="color-radio" name="color-radio-group" value="${i}" ${i===activeIdx?'checked':''}><span class="color-swatch" style="background:${c.color}" title="${c.name}"></span></label>`).join('');
}

// ─────────────────────────────────────────────
// GROUP ACTIONS
// ─────────────────────────────────────────────
function groupModalBody(label='', colorIdx=0) {
  return `
    <div class="field-group">
      <label class="field-label">Nome gruppo</label>
      <input class="field-input" data-field="label" placeholder="es. Gruppo T6" value="${escHtml(label)}" />
    </div>
    <div class="field-group">
      <label class="field-label">Colore</label>
      <div class="color-picker" id="color-picker">${swatchesHtml(colorIdx)}</div>
    </div>`;
}

async function addGroup() {
  const result = await openModal('Nuovo Gruppo', groupModalBody(), 'Aggiungi');
  attachSwatches();
  if (!result?.label) return;
  appData.groups.push({ id:uid(), label:result.label, colorIdx:result.colorIdx??0, collapsed:false, tasks:[] });
  saveData(); render();
}

async function renameGroup(gid) {
  const g = findGroup(gid); if (!g) return;
  const result = await openModal('Modifica Gruppo', groupModalBody(g.label, g.colorIdx));
  attachSwatches();
  if (!result?.label) return;
  g.label = result.label; g.colorIdx = result.colorIdx ?? g.colorIdx;
  if (typeof dbSaveGroupMeta === 'function') { dbSaveGroupMeta(g); } else { saveData(); }
  render();
}

async function cloneGroup(gid) {
  const g = findGroup(gid); if (!g) return;
  const nextColor = (g.colorIdx+1) % GROUP_COLORS.length;
  const result = await openModal('Clona Gruppo', groupModalBody(g.label+' (copia)', nextColor), 'Clona');
  attachSwatches();
  if (!result?.label) return;
  const newGroup = {
    id:uid(), label:result.label,
    colorIdx: result.colorIdx ?? nextColor,
    collapsed: false,
    tasks: g.tasks.map(t => ({ ...t, id:uid(), status:'none' }))
  };
  const idx = appData.groups.findIndex(x=>x.id===gid);
  appData.groups.splice(idx+1, 0, newGroup);
  saveData(); render();
}

function deleteGroup(gid) {
  if (!confirm('Eliminare questo gruppo e tutte le sue attività?')) return;
  appData.groups = appData.groups.filter(g=>g.id!==gid);
  if (typeof dbDeleteGroup === 'function') { dbDeleteGroup(gid); } else { saveData(); }
  render();
}

function toggleGroup(gid) {
  const g = findGroup(gid); if (!g) return;
  g.collapsed = !g.collapsed;
  saveData(); render();
}

// ─────────────────────────────────────────────
// TASK MODAL BODY
// ─────────────────────────────────────────────
function taskModalBody(t) {
  const name   = t ? escHtml(t.name)   : '';
  const days   = t ? escHtml(String(t.days))   : '';
  const people = t ? t.people : 1;
  const due    = t?.dueDate || '';
  const prio   = t?.priority || '';
  const mkOpt  = (v, lbl) => `<input type="radio" class="prio-opt" name="prio-radio" value="${v}" id="pr-${v}" ${prio===v?'checked':''}><label for="pr-${v}">${lbl}</label>`;
  var assignHtml = (typeof assignmentPickerHtml === 'function' && t) ? assignmentPickerHtml(t) : '';
  return `
    <div class="field-group">
      <label class="field-label">Nome attività</label>
      <input class="field-input" data-field="name" placeholder="es. Installazione quadro" value="${name}" />
    </div>
    <div class="field-row">
      <div class="field-group">
        <label class="field-label">Giorni</label>
        <input class="field-input" data-field="days" placeholder="es. 1.5 o —" value="${days}" />
      </div>
      <div class="field-group">
        <label class="field-label">Persone</label>
        <input class="field-input" data-field="people" type="number" min="1" value="${people}" />
      </div>
      <div class="field-group">
        <label class="field-label">G·U (auto)</label>
        <input class="field-input" data-field="gu" readonly placeholder="—" />
      </div>
    </div>
    <div class="field-row">
      <div class="field-group">
        <label class="field-label">Priorità</label>
        <div class="prio-picker">
          ${mkOpt('alta','▲ Alta')}
          ${mkOpt('media','● Media')}
          ${mkOpt('bassa','▼ Bassa')}
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Scadenza</label>
        <input class="field-input" data-field="dueDate" type="date" value="${escHtml(due)}" style="color-scheme:dark;" />
      </div>
    </div>
    ${assignHtml}`;
}

async function addTask(gid) {
  const result = await openModal('Nuova Attività', taskModalBody(null), 'Aggiungi');
  attachGuCalc();
  if (!result?.name) return;
  const group = findGroup(gid); if (!group) return;
  var newTask = {
    id:uid(), name:result.name,
    days:result.days||'—', people:parseFloat(result.people)||1,
    status:'none', priority:result.priority||'', dueDate:result.dueDate||'',
    assignedTo:[], order: group.tasks.length,
    updatedBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : '',
    updatedAt: Date.now()
  };
  group.tasks.push(newTask);
  if (typeof dbSaveTask === 'function') { dbSaveTask(gid, newTask); } else { saveData(); }
  render();
}

async function editTask(gid, tid) {
  const task = findTask(gid, tid); if (!task) return;
  const result = await openModal('Modifica Attività', taskModalBody(task));
  attachGuCalc();
  if (!result?.name) return;
  task.name     = result.name;
  task.days     = result.days   || '—';
  task.people   = parseFloat(result.people) || 1;
  task.priority = result.priority || '';
  task.dueDate  = result.dueDate  || '';
  // Read assignment if capo_cantiere
  if (typeof readAssignmentFromModal === 'function') {
    task.assignedTo = readAssignmentFromModal();
    if (typeof dbSetTaskAssignment === 'function') {
      dbSetTaskAssignment(gid, tid, task.assignedTo);
    }
  }
  task.updatedBy = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : '';
  task.updatedAt = Date.now();
  if (typeof dbSaveTask === 'function') { dbSaveTask(gid, task); } else { saveData(); }
  render();
}

function deleteTask(gid, tid) {
  if (!confirm('Eliminare questa attività?')) return;
  const g = findGroup(gid); if (!g) return;
  g.tasks = g.tasks.filter(t=>t.id!==tid);
  if (typeof dbDeleteTask === 'function') { dbDeleteTask(gid, tid); } else { saveData(); }
  render();
}

function cycleStatus(gid, tid) {
  const task = findTask(gid, tid); if (!task) return;
  task.status = CYCLE[task.status] || 'none';
  saveData(); render();
}

// ─────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────
function exportPdf(groupId) {
  // Mark which groups to show/hide for print
  appData.groups.forEach(g => {
    const rows = document.querySelectorAll(`[data-group-id="${g.id}"], tr[data-group-id="${g.id}"]`);
    rows.forEach(r => {
      if (groupId && g.id !== groupId) { r.classList.add('print-hide'); r.classList.remove('print-show'); }
      else { r.classList.remove('print-hide'); }
    });
    // also header rows
    const hdr = document.querySelector(`.group-header-row[data-group-id="${g.id}"]`);
    if (hdr) {
      if (groupId && g.id !== groupId) hdr.classList.add('print-hide');
      else hdr.classList.remove('print-hide');
    }
  });

  // Set page title
  const origTitle = document.title;
  if (groupId) {
    const g = findGroup(groupId);
    document.title = `Piano di Lavoro – ${g ? g.label : 'Gruppo'} – Fusaro Impianti`;
  } else {
    document.title = 'Piano di Lavoro Completo – Fusaro Impianti S.r.l.';
  }

  window.print();

  // Restore after print dialog closes
  setTimeout(() => {
    document.title = origTitle;
    document.querySelectorAll('.print-hide').forEach(el => el.classList.remove('print-hide'));
  }, 1000);
}

// ─────────────────────────────────────────────
// EVENT DELEGATION
// ─────────────────────────────────────────────
document.getElementById('table-body').addEventListener('click', e => {
  const btn = e.target.closest('[data-action], .status-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const gid = btn.dataset.group;
  const tid = btn.dataset.task;
  if (btn.classList.contains('status-btn')) { cycleStatus(gid, tid); return; }
  if (action === 'add-task')     { addTask(gid); return; }
  if (action === 'edit-task')    { editTask(gid, tid); return; }
  if (action === 'delete-task')  { deleteTask(gid, tid); return; }
  if (action === 'rename-group') { renameGroup(gid); return; }
  if (action === 'clone-group')  { cloneGroup(gid); return; }
  if (action === 'delete-group') { deleteGroup(gid); return; }
  if (action === 'toggle-group') { toggleGroup(gid); return; }
  if (action === 'export-group') { exportPdf(gid); return; }
});

document.getElementById('btn-add-group').addEventListener('click', addGroup);
document.getElementById('btn-export-all').addEventListener('click', () => exportPdf(null));

// ─────────────────────────────────────────────
// HIDE COMPLETED TOGGLE
// ─────────────────────────────────────────────
let hideDone = false;
const toggleDoneBtn = document.getElementById('btn-toggle-done');
function updateToggleDoneLabel() {
  toggleDoneBtn.classList.toggle('active', hideDone);
  const textNode = [...toggleDoneBtn.childNodes].find(n => n.nodeType === 3);
  if (textNode) textNode.textContent = hideDone ? ' Mostra completate' : ' Nascondi completate';
}
toggleDoneBtn.addEventListener('click', () => {
  hideDone = !hideDone;
  document.body.classList.toggle('hide-done', hideDone);
  updateToggleDoneLabel();
});

// ─────────────────────────────────────────────
// THEME TOGGLE
// ─────────────────────────────────────────────
let isLight = localStorage.getItem('fusaro_theme') === 'light';
const themeBtn = document.getElementById('btn-theme');
function applyTheme() {
  document.body.classList.toggle('light', isLight);
  themeBtn.classList.toggle('theme-active', isLight);
  const textNode = [...themeBtn.childNodes].find(n => n.nodeType === 3);
  if (textNode) textNode.textContent = isLight ? ' Tema scuro' : ' Tema chiaro';
  localStorage.setItem('fusaro_theme', isLight ? 'light' : 'dark');
}
applyTheme();
themeBtn.addEventListener('click', () => { isLight = !isLight; applyTheme(); });

// ─────────────────────────────────────────────
// JSON EXPORT / IMPORT
// ─────────────────────────────────────────────
document.getElementById('btn-export-json').addEventListener('click', () => {
  const payload = JSON.stringify(appData, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href     = url;
  a.download = `fusaro-piano-${date}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const importFileInput = document.getElementById('import-file-input');
document.getElementById('btn-import-json').addEventListener('click', () => {
  importFileInput.value = '';
  importFileInput.click();
});
importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      // basic validation
      if (!parsed.groups || !Array.isArray(parsed.groups)) {
        alert('File JSON non valido: struttura non riconosciuta.');
        return;
      }
      // migrate fields
      parsed.groups.forEach(g => {
        if (g.collapsed === undefined) g.collapsed = false;
        g.tasks.forEach(t => {
          if (!t.priority) t.priority = '';
          if (!t.dueDate)  t.dueDate  = '';
          if (t.people === undefined) t.people = 1;
          if (typeof t.people === 'string') {
            const n = parseInt(t.people.replace(/[^\d]/g,''));
            t.people = isNaN(n) ? 1 : n;
          }
        });
      });
      if (!parsed.trasferte) parsed.trasferte = [];
      appData = parsed;
      saveData();
      render();
      renderTrasferte();
      alert('✓ Configurazione importata con successo!');
    } catch (err) {
      alert('Errore durante la lettura del file JSON:\n' + err.message);
    }
  };
  reader.readAsText(file);
});

// ─────────────────────────────────────────────
// TRASFERTE
// ─────────────────────────────────────────────
function renderTrasferte() {
  const sec = document.getElementById('trasferte-section');
  sec.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'notes-title'; title.textContent = 'Trasferte previste';
  sec.appendChild(title);
  (appData.trasferte||[]).forEach(t => {
    const div = document.createElement('div');
    div.className = 'trasferta-item';
    div.innerHTML = `
      <div class="note-dot"></div>
      <span class="trasferta-text">${escHtml(t.giorni)} giorno${t.giorni!=='1'?'i':''} – ${escHtml(t.luogo)}</span>
      <div class="trasferta-actions">
        <button class="icon-btn" style="width:18px;height:18px;font-size:11px" data-tr-action="edit"   data-tr-id="${t.id}">✎</button>
        <button class="icon-btn danger" style="width:18px;height:18px;font-size:11px" data-tr-action="delete" data-tr-id="${t.id}">✕</button>
      </div>`;
    sec.appendChild(div);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'add-trasferta-btn';
  addBtn.innerHTML = '<span style="font-size:13px;line-height:1">+</span> Aggiungi trasferta';
  addBtn.addEventListener('click', addTrasferta);
  sec.appendChild(addBtn);
  sec.querySelectorAll('[data-tr-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.trAction==='edit')   editTrasferta(btn.dataset.trId);
      if (btn.dataset.trAction==='delete') deleteTrasferta(btn.dataset.trId);
    });
  });
}

function trasfertaBody(t) {
  return `<div class="field-row">
    <div class="field-group" style="max-width:80px">
      <label class="field-label">Giorni</label>
      <input class="field-input" data-field="giorni" value="${t?escHtml(t.giorni):'1'}" />
    </div>
    <div class="field-group">
      <label class="field-label">Luogo</label>
      <input class="field-input" data-field="luogo" placeholder="es. Bologna" value="${t?escHtml(t.luogo):''}" />
    </div>
  </div>`;
}

async function addTrasferta() {
  const r = await openModal('Nuova Trasferta', trasfertaBody(null), 'Aggiungi');
  if (!r?.luogo) return;
  if (!appData.trasferte) appData.trasferte = [];
  appData.trasferte.push({ id:uid(), giorni:r.giorni||'1', luogo:r.luogo });
  saveData(); renderTrasferte();
}

async function editTrasferta(id) {
  const t = (appData.trasferte||[]).find(x=>x.id===id); if (!t) return;
  const r = await openModal('Modifica Trasferta', trasfertaBody(t));
  if (!r?.luogo) return;
  t.giorni = r.giorni||'1'; t.luogo = r.luogo;
  saveData(); renderTrasferte();
}

function deleteTrasferta(id) {
  if (!confirm('Eliminare questa trasferta?')) return;
  appData.trasferte = (appData.trasferte||[]).filter(t=>t.id!==id);
  saveData(); renderTrasferte();
}


