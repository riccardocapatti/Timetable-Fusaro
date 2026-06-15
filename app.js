// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const STORAGE_KEY = 'fusaro_v4';

const GROUP_COLORS = [
  { name:'blue',   color:'#5fa8ff' },
  { name:'green',  color:'#52d9a0' },
  { name:'purple', color:'#c084fc' },
  { name:'amber',  color:'#fbbf24' },
  { name:'rose',   color:'#fb7185' },
  { name:'cyan',   color:'#22d3ee' },
  { name:'lime',   color:'#a3e635' },
  { name:'orange', color:'#fb923c' },
];

// Generate group header background from color — works on both dark and light glass
function groupBg(color) {
  // Use rgba tint of the accent color — adapts to whatever is behind it
  return 'rgba(' + hexToRgb(color) + ',.12)';
}

function hexToRgb(hex) {
  var r = parseInt(hex.slice(1,3),16);
  var g = parseInt(hex.slice(3,5),16);
  var b = parseInt(hex.slice(5,7),16);
  return r + ',' + g + ',' + b;
}

const LABELS  = { none:'–', partial:'In corso', done:'Completato' };
const CYCLE   = { none:'partial', partial:'done', done:'none' };
const PRIO_LABEL = { alta:'Alta', media:'Media', bassa:'Bassa', '':'—' };

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function uid() { return 'id-' + Math.random().toString(36).slice(2,9); }

// ─────────────────────────────────────────────
// DEFAULT DATA — empty, Firebase is source of truth
// ─────────────────────────────────────────────
function makeDefaultData() {
  return { groups: [], trasferte: [] };
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
  let total=0, done=0, partial=0;
  group.tasks.forEach(t => {
    const gu = computeGU(t.days, t.people);
    if (!isNaN(gu)) {
      total   += gu;
      if (t.status === 'done')    done    += gu;
      if (t.status === 'partial') partial += gu;
    }
  });
  // partial counts as 50% complete
  const completedValue = done + (partial * 0.5);
  const pct     = total > 0 ? Math.round((completedValue / total) * 100) : 0;
  const remaining = total - completedValue;
  return { total, remaining, pct };
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
  renderCardList();
  if (typeof initDragAndDrop === 'function') initDragAndDrop();
  if (typeof updateCollapseAllBtn === 'function') updateCollapseAllBtn();
}

function renderGroupHeader(tbody, group, c) {
  const tr = document.createElement('tr');
  var _gT = groupTotals(group);
  tr.className = 'group-header-row' + (group.collapsed ? ' group-collapsed' : '') + (_gT.pct === 100 && _gT.total > 0 ? ' group-complete' : '');
  var assignedUids  = getGroupAssignedUids(group);
  var assignedNames = assignedUids.map(function(uid) {
    var u = (typeof allUsers !== 'undefined' && allUsers[uid]);
    return u ? u.name.split(' ')[0] : '';
  }).filter(Boolean);
  var groupAssignBadge = assignedNames.length
    ? '<span class="assigned-badge" style="margin-left:8px">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10">' +
        '<circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>' +
        assignedNames.join(', ') + '</span>'
    : '';

  tr.innerHTML = `
    <td colspan="6">
      <div class="group-header-inner" style="background:'+groupBg(c.color)+'">
        <span class="group-label" data-action="toggle-group" data-group="${group.id}">
          <span class="collapse-icon">▸</span> ${escHtml(group.label)}${groupAssignBadge}
        </span>
        <div class="group-actions">
          <button class="icon-btn pdf"    title="Esporta gruppo PDF"   data-action="export-group"  data-group="${group.id}">↓</button>
          <button class="icon-btn clone"  title="Assegna gruppo"       data-action="assign-group"  data-group="${group.id}">👤</button>
          <button class="icon-btn"        title="Rinomina / colore"    data-action="rename-group"  data-group="${group.id}">✎</button>
          <button class="icon-btn clone"  title="Clona gruppo"         data-action="clone-group"   data-group="${group.id}">⧉</button>
          <button class="icon-btn" title="Archivia gruppo" data-action="archive-group" data-group="${group.id}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M1 3h14v3H1z"/><line x1="6" y1="9" x2="10" y2="9"/></svg>
          </button>
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
        ${task.note ? '<span class="note-badge" title="' + escHtml(task.note) + '">💬</span>' : ''}
        <div class="row-actions">
          <button class="icon-btn" title="Modifica" data-action="edit-task"   data-task="${task.id}" data-group="${group.id}">✎</button>
          <button class="icon-btn danger" title="Elimina" data-action="delete-task" data-task="${task.id}" data-group="${group.id}">✕</button>
          <button class="icon-btn ${task.note ? 'note-active' : ''}" title="${task.note ? escHtml(task.note) : 'Aggiungi nota'}" data-action="edit-note" data-task="${task.id}" data-group="${group.id}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><path d="M3 3h10v8H3z"/><path d="M3 11l2 2h8V3"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="9" x2="9" y2="9"/></svg>
          </button>
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
      <div class="add-task-inner" style="background:${groupBg(c.color)}">
        <button class="add-task-btn" data-action="add-task" data-group="${group.id}">
          <span style="font-size:14px;line-height:1">+</span> Aggiungi attività
        </button>
      </div>
    </td>`;
  tbody.appendChild(tr);
}

function renderSubtotalRow(tbody, group, c) {
  const { total, remaining, pct } = groupTotals(group);
  const tr = document.createElement('tr');
  tr.className = 'subtotal-row' + (group.collapsed ? ' collapsed-row' : '');
  tr.innerHTML = `
    <td colspan="2" class="subtotal-remaining">
      <span class="subtotal-pct">${pct}%</span>
      <span class="subtotal-divider">—</span>
      <span>${fmtNum(remaining)} Ore rimanenti</span>
    </td>
    <td colspan="2" class="subtotal-label">Totale ${escHtml(group.label)}</td>
    <td class="subtotal-val" colspan="2">${fmtNum(total)} Ore</td>`;
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

// Three-choice confirmation dialog — returns 'all', 'empty', or null (cancel)
function confirmDueDate(date, totalCount, conflictCount) {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '110';

    var box = document.createElement('div');
    box.className = 'modal';
    box.style.maxWidth = '400px';
    box.innerHTML =
      '<div class="modal-title">Scadenza gruppo</div>' +
      '<div style="font-size:13px;color:var(--text);margin-bottom:8px">Scadenza impostata: <b>' + date + '</b></div>' +
      (conflictCount > 0
        ? '<div class="field-hint" style="color:var(--danger);margin-bottom:16px;font-style:normal">ATTENZIONE: ' + conflictCount + ' attività hanno già una scadenza diversa.</div>'
        : '<div class="field-hint" style="margin-bottom:16px">Nessuna attività ha una scadenza esistente.</div>'
      ) +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<button class="btn-confirm" id="due-btn-all">Conferma tutto (' + totalCount + ' attività)</button>' +
        '<button class="btn-cancel" id="due-btn-empty" style="text-align:center">Mantieni esistenti (solo ' + (totalCount - conflictCount) + ' senza scadenza)</button>' +
        '<button class="btn-cancel" id="due-btn-cancel" style="text-align:center;color:var(--danger)">Annulla</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function cleanup(result) {
      document.body.removeChild(overlay);
      resolve(result);
    }

    document.getElementById('due-btn-all').addEventListener('click',    function() { cleanup('all'); });
    document.getElementById('due-btn-empty').addEventListener('click',  function() { cleanup('empty'); });
    document.getElementById('due-btn-cancel').addEventListener('click', function() { cleanup(null); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) cleanup(null); });
  });
}

// ─────────────────────────────────────────────
// LIVE Ore CALC IN MODAL
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
function groupModalBody(label='', colorIdx=0, dueDate='') {
  return `
    <div class="field-group">
      <label class="field-label">Nome gruppo</label>
      <input class="field-input" data-field="label" placeholder="es. Gruppo T6" value="${escHtml(label)}" />
    </div>
    <div class="field-group">
      <label class="field-label">Colore</label>
      <div class="color-picker" id="color-picker">${swatchesHtml(colorIdx)}</div>
    </div>
    <div class="field-group">
      <label class="field-label">Scadenza gruppo (opzionale)</label>
      <input class="field-input" data-field="groupDueDate" type="date" value="${escHtml(dueDate)}" style="color-scheme:dark" />
      <div class="field-hint">Se impostata, sovrascrive la scadenza di tutte le attività del gruppo.</div>
    </div>`;
}

async function addGroup() {
  const result = await openModal('Nuovo Gruppo', groupModalBody(), 'Aggiungi');
  attachSwatches();
  if (!result?.label) return;
  var newGroup = { id:uid(), label:result.label, colorIdx:result.colorIdx??0, collapsed:false, order:appData.groups.length, tasks:[] };
  appData.groups.push(newGroup);
  if (typeof dbSaveGroupMeta === 'function') dbSaveGroupMeta(newGroup);
  render();
}

async function renameGroup(gid) {
  const g = findGroup(gid); if (!g) return;
  // Show current group due date (most common among tasks, or empty)
  var currentDue = g.tasks.length ? (g.tasks[0].dueDate || '') : '';
  const result = await openModal('Modifica Gruppo', groupModalBody(g.label, g.colorIdx, currentDue));
  attachSwatches();
  if (!result?.label) return;

  g.label    = result.label;
  g.colorIdx = result.colorIdx ?? g.colorIdx;


  // If a group due date was set, apply it to tasks
  var newDue = (result.groupDueDate || '').trim();
  if (newDue) {
    var tasksWithDue = g.tasks.filter(function(t) { return t.dueDate && t.dueDate !== newDue; });
    var choice = await confirmDueDate(newDue, g.tasks.length, tasksWithDue.length);
    if (choice === 'all') {
      g.tasks.forEach(function(t) {
        t.dueDate = newDue;
        if (typeof dbSaveTask === 'function') dbSaveTask(gid, t);
      });
    } else if (choice === 'empty') {
      g.tasks.forEach(function(t) {
        if (!t.dueDate) {
          t.dueDate = newDue;
          if (typeof dbSaveTask === 'function') dbSaveTask(gid, t);
        }
      });
    }
    // null = annullato — nessuna modifica alle scadenze
  }

  if (typeof dbSaveGroupMeta === 'function') { dbSaveGroupMeta(g); } else { saveData(); }
  render();
}

async function cloneGroup(gid) {
  const g = findGroup(gid); if (!g) return;
  const nextColor = (g.colorIdx+1) % GROUP_COLORS.length;
  const result = await openModal('Clona Gruppo', groupModalBody(g.label+' (copia)', nextColor), 'Clona');
  attachSwatches();
  if (!result?.label) return;

  const idx      = appData.groups.findIndex(x=>x.id===gid);
  const newGroup = {
    id:       uid(),
    label:    result.label,
    colorIdx: result.colorIdx ?? nextColor,
    collapsed:false,
    order:    idx + 1,
    tasks:    g.tasks.map(function(t) {
      return Object.assign({}, t, { id:uid(), status:'none', assignedTo:null, updatedBy:'', updatedAt:0 });
    })
  };

  appData.groups.splice(idx+1, 0, newGroup);

  // Write to Firebase v2
  if (typeof dbSaveGroupMeta === 'function') {
    dbSaveGroupMeta(newGroup);
    newGroup.tasks.forEach(function(t) {
      dbSaveTask(newGroup.id, t);
    });
  }
  render();
}

function archiveGroup(gid) {
  var g = findGroup(gid); if (!g) return;
  g.archived = true;
  // Remove from local appData immediately so render() hides it now
  appData.groups = appData.groups.map(function(x) {
    return x.id === gid ? Object.assign({}, x, { archived: true }) : x;
  });
  if (typeof dbSaveGroupMeta === 'function') dbSaveGroupMeta(g);
  render();
  renderCardList();
  renderArchivePanel();
}

function unarchiveGroup(gid) {
  var g = findGroup(gid); if (!g) return;
  g.archived = false;
  if (typeof dbSaveGroupMeta === 'function') dbSaveGroupMeta(g);
  render();
  renderArchivePanel();
}

function deleteGroup(gid) {
  // Permanent delete — only callable from archive panel
  if (!confirm('Eliminare definitivamente questo gruppo e tutte le sue attività? Questa azione non è reversibile.')) return;
  appData.groups = appData.groups.filter(function(g){ return g.id !== gid; });
  renderArchivePanel();
  render();
  if (typeof dbDeleteGroup === 'function') dbDeleteGroup(gid);
}

function toggleGroup(gid) {
  var g = findGroup(gid); if (!g) return;
  g.collapsed = !g.collapsed;
  if (typeof dbSaveGroupMeta === 'function') dbSaveGroupMeta(g);
  render();
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
        <label class="field-label">Ore</label>
        <input class="field-input" data-field="days" placeholder="es. 1.5 o —" value="${days}" />
      </div>
      <div class="field-group">
        <label class="field-label">Persone</label>
        <input class="field-input" data-field="people" type="number" min="1" value="${people}" />
      </div>
      <div class="field-group">
        <label class="field-label">Ore totali (auto)</label>
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
    ${assignHtml}
    <div class="field-group">
      <label class="field-label">Note</label>
      <textarea class="field-input field-textarea" data-field="note" placeholder="Aggiungi una nota..." rows="2">${escHtml(t?.note||'')}</textarea>
    </div>`;
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
    note:result.note||'',
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
  task.note     = result.note     || '';
  // Read assignment if capo_cantiere — dbSaveTask handles {uid:true} conversion
  if (typeof readAssignmentFromModal === 'function') {
    task.assignedTo = readAssignmentFromModal();
  }
  task.updatedBy = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : '';
  task.updatedAt = Date.now();
  // dbSaveTask writes the whole task — ensure assignedTo is already set above
  if (typeof dbSaveTask === 'function') { dbSaveTask(gid, task); } else { saveData(); }
  render();
}

async function editNote(gid, tid) {
  var task = findTask(gid, tid); if (!task) return;
  var result = await openModal(
    'Nota — ' + task.name,
    '<div class="field-group">' +
      '<label class="field-label">Nota</label>' +
      '<textarea class="field-input field-textarea" data-field="note" placeholder="Aggiungi una nota..." rows="5">' +
        escHtml(task.note || '') +
      '</textarea>' +
    '</div>',
    'Salva'
  );
  if (result === null) return;
  task.note = (result.note || '').trim();
  task.updatedBy = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : '';
  task.updatedAt = Date.now();
  if (typeof dbSaveTask === "function") dbSaveTask(gid, task);
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
  // NOTE: firebase.js overrides this function with a version that
  // checks permissions and calls dbSetTaskStatus. This is the fallback.
  var task = findTask(gid, tid); if (!task) return;
  task.status = CYCLE[task.status] || 'none';
  if (typeof dbSetTaskStatus === 'function') dbSetTaskStatus(gid, tid, task.status);
  render();
}

// ─────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────
function exportPdf(groupId) {
  // Track rows we temporarily expanded for print
  var expandedForPrint = [];

  appData.groups.forEach(function(g) {
    // Always hide archived groups
    var isArchived  = g.archived;
    // Hide if groupId filter and not this group
    var isFiltered  = groupId && g.id !== groupId;
    var shouldHide  = isArchived || isFiltered;

    // All rows belonging to this group
    var allRows = document.querySelectorAll('[data-group-id="' + g.id + '"]');
    var hdr     = document.querySelector('.group-header-row[data-group-id="' + g.id + '"]');

    if (shouldHide) {
      allRows.forEach(function(r) { r.classList.add('print-hide'); });
      if (hdr) hdr.classList.add('print-hide');
    } else {
      allRows.forEach(function(r) { r.classList.remove('print-hide'); });
      if (hdr) hdr.classList.remove('print-hide');

      // Force-expand collapsed groups for print
      if (g.collapsed) {
        expandedForPrint.push(g.id);
        document.querySelectorAll(
          '.collapsed-row[data-group-id="' + g.id + '"]'
        ).forEach(function(r) { r.classList.add('print-expand'); });
      }
    }
  });

  // Set page title
  var origTitle = document.title;
  if (groupId) {
    var g = findGroup(groupId);
    document.title = 'Piano di Lavoro – ' + (g ? g.label : 'Gruppo') + ' – Fusaro Impianti';
  } else {
    document.title = 'Piano di Lavoro Completo – Fusaro Impianti S.r.l.';
  }

  window.print();

  // Restore after print
  setTimeout(function() {
    document.title = origTitle;
    document.querySelectorAll('.print-hide').forEach(function(el) { el.classList.remove('print-hide'); });
    document.querySelectorAll('.print-expand').forEach(function(el) { el.classList.remove('print-expand'); });
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
  if (action === 'edit-note')    { editNote(gid, tid); return; }
  if (action === 'rename-group') { renameGroup(gid); return; }
  if (action === 'clone-group')  { cloneGroup(gid); return; }
  if (action === 'delete-group') { deleteGroup(gid); return; }
  if (action === 'toggle-group') { toggleGroup(gid); return; }
  if (action === 'export-group') { exportPdf(gid); return; }
  if (action === 'assign-group') { assignGroup(gid); return; }
  if (action === 'archive-group') { archiveGroup(gid); return; }
});

document.getElementById('btn-add-group').addEventListener('click', addGroup);
document.getElementById('btn-export-all').addEventListener('click', () => exportPdf(null));

// ─────────────────────────────────────────────
// HAMBURGER MENU
// ─────────────────────────────────────────────
function openMenu()  { document.body.classList.add('menu-open'); }
function closeMenu() { document.body.classList.remove('menu-open'); }

var hamburgerBtn = document.getElementById('btn-hamburger');
var closeMenuBtn = document.getElementById('btn-close-menu');
var menuOverlay  = document.getElementById('menu-overlay');

hamburgerBtn && hamburgerBtn.addEventListener('click', openMenu);
closeMenuBtn && closeMenuBtn.addEventListener('click', closeMenu);
menuOverlay  && menuOverlay.addEventListener('click', closeMenu);

// Close menu on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeMenu();
});

// ─────────────────────────────────────────────
// CARD LIST RENDERER (mobile theme)
// ─────────────────────────────────────────────
function renderCardList() {
  var container = document.getElementById('card-list-container');
  if (!container) return;

  // Auto-responsive: show cards when screen ≤720px (matches CSS media query)
  var isMobile = window.matchMedia('(max-width:720px)').matches;
  container.style.display = isMobile ? 'block' : 'none';
  if (!isMobile) return;

  container.innerHTML = '';

  appData.groups.filter(function(g){ return !g.archived; }).forEach(function(group) {
    var c = GROUP_COLORS[group.colorIdx % GROUP_COLORS.length];

    // Group wrapper
    var { total: _t, remaining: _r, pct: _pct } = groupTotals(group);
    var groupEl = document.createElement('div');
    groupEl.className = 'card-group' + (_pct === 100 && _t > 0 ? ' group-complete' : '');
    groupEl.dataset.gid = group.id;

    // Group header
    var { total, remaining, pct } = groupTotals(group);
    var headerEl = document.createElement('div');
    headerEl.className = 'card-group-header';
    headerEl.style.background = groupBg(c.color);
    headerEl.innerHTML =
      '<span class="card-group-label">' +
        '<span class="collapse-icon"' + (group.collapsed ? ' style="transform:rotate(-90deg)"' : '') + '>▸</span>' +
        escHtml(group.label) +
      '</span>' +
      (typeof isCapoCantiere === 'function' && isCapoCantiere() ?
        '<div class="card-group-actions" style="display:flex;gap:6px">' +
          '<button class="icon-btn" data-action="assign-group" data-group="' + group.id + '" title="Assegna gruppo">👤</button>' +
          '<button class="icon-btn" data-action="rename-group" data-group="' + group.id + '" title="Rinomina">✎</button>' +
          '<button class="icon-btn clone" data-action="clone-group"  data-group="' + group.id + '" title="Clona gruppo">⧉</button>' +
          '<button class="icon-btn" data-action="archive-group" data-group="' + group.id + '" title="Archivia gruppo">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M1 3h14v3H1z"/><line x1="6" y1="9" x2="10" y2="9"/></svg>' +
          '</button>' +
        '</div>' : '');
    headerEl.querySelector('.card-group-label').addEventListener('click', function() {
      toggleGroup(group.id);
    });
    headerEl.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = this.dataset.action;
        var gid    = this.dataset.group;
        if (action === 'rename-group')  renameGroup(gid);
        if (action === 'clone-group')   cloneGroup(gid);
        if (action === 'archive-group') archiveGroup(gid);
        if (action === 'assign-group')  assignGroup(gid);
      });
    });
    groupEl.appendChild(headerEl);

    // Subtotal bar
    var subtotalEl = document.createElement('div');
    subtotalEl.className = 'card-group-subtotal';
    subtotalEl.innerHTML =
      '<span class="subtotal-remaining-text">' + pct + '% — ' + fmtNum(remaining) + ' Ore rim.</span>' +
      '<span class="subtotal-total-text">' + fmtNum(total) + ' Ore tot.</span>';
    groupEl.appendChild(subtotalEl);

    if (!group.collapsed) {
      // Task cards
      group.tasks.forEach(function(task) {
        if (hideDone && task.status === 'done') return;

        var visible = typeof canSeeTask !== 'function' || canSeeTask(task);
        if (!visible) return;

        var gu   = computeGU(task.days, task.people);
        var card = document.createElement('div');
        card.className = 'card-task' +
          (task.status === 'done'    ? ' row-done'    : '') +
          (task.status === 'partial' ? ' row-partial' : '');
        card.dataset.taskId  = task.id;
        card.dataset.groupId = group.id;

        var canEdit = typeof canEditTask !== 'function' || canEditTask(task);

        // Status icon
        var statusIcon =
          task.status === 'done'    ? '<svg viewBox="0 0 20 20" fill="none" stroke="#52d9a0" stroke-width="2.2" width="18" height="18"><polyline points="4,10 8,14 16,6"/></svg>' :
          task.status === 'partial' ? '<svg viewBox="0 0 20 20" fill="none" stroke="#f7c948" stroke-width="2" width="18" height="18"><circle cx="10" cy="10" r="7"/><polyline points="10,6 10,10 13,12"/></svg>' :
                                      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><circle cx="10" cy="10" r="7"/></svg>';

        var badges = prioBadgeHtml(task.priority) +
          dueBadgeHtml(task.dueDate) +
          (typeof assignmentBadgeHtml === 'function' ? assignmentBadgeHtml(task) : '');

        card.innerHTML =
          '<div class="card-task-header">' +
            '<span class="card-task-name" style="border-left:3px solid ' + c.color + ';padding-left:9px">' +
              escHtml(task.name) +
            '</span>' +
            '<div class="card-task-icons">' +
              '<button class="card-icon-btn card-status-icon status-' + task.status + '" title="Cambia stato">' +
                statusIcon +
              '</button>' +
              (canEdit ?
                '<button class="card-icon-btn card-edit-icon" data-action="edit-task" data-task="' + task.id + '" data-group="' + group.id + '" title="Modifica">' +
                  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M14 3l3 3-9 9H5v-3L14 3z"/></svg>' +
                '</button>' +
                '<button class="card-icon-btn card-delete-icon" data-action="delete-task" data-task="' + task.id + '" data-group="' + group.id + '" title="Elimina">' +
                  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>' +
                '</button>' +
                '<button class="card-icon-btn card-note-icon' + (task.note ? ' has-note' : '') + '" data-action="view-note" data-task="' + task.id + '" data-group="' + group.id + '" title="' + (task.note ? escHtml(task.note) : 'Aggiungi nota') + '">' +
                  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M4 4h12v9H4z"/><path d="M4 13l3 3h9V4"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="11" x2="11" y2="11"/></svg>' +
                '</button>'
              : '') +
            '</div>' +
          '</div>' +
          (badges ? '<div class="card-task-badges">' + badges + '</div>' : '') +
          '<div class="card-task-meta">' +
            '<span><b>' + (isNaN(parseNum(task.days)) ? '—' : fmtNum(parseNum(task.days))) + '</b> ore</span>' +
            '<span><b>×' + task.people + '</b> pers.</span>' +
            '<span><b>' + fmtNum(gu) + '</b> ore tot.</span>' +
          '</div>' +
          (task.note ? '<div class="card-task-note">' + escHtml(task.note) + '</div>' : '');

        // Wire status icon
        card.querySelector('.card-status-icon').addEventListener('click', function() {
          if (canEdit && typeof cycleStatus === 'function') cycleStatus(group.id, task.id);
        });

        // Wire edit/delete
        card.querySelectorAll('[data-action]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var action = this.dataset.action;
            var tid    = this.dataset.task;
            var gid    = this.dataset.group;
            if (action === 'edit-task')   editTask(gid, tid);
            if (action === 'delete-task') deleteTask(gid, tid);
            if (action === 'view-note')   editNote(gid, tid);
          });
        });

        groupEl.appendChild(card);
      });

      // Add task button (capo only)
      if (typeof isCapoCantiere !== 'function' || isCapoCantiere()) {
        var addBtn = document.createElement('button');
        addBtn.className = 'card-add-task-btn';
        addBtn.className = 'card-add-task-btn';
        // color and border set by CSS only
        addBtn.textContent = '+ Aggiungi attività';
        addBtn.addEventListener('click', function() { addTask(group.id); });
        groupEl.appendChild(addBtn);
      }
    }

    container.appendChild(groupEl);
  });

  // Add group button (capo only)
  if (typeof isCapoCantiere !== 'function' || isCapoCantiere()) {
    var addGroupBtn = document.createElement('button');
    addGroupBtn.className = 'card-add-group-btn';
    addGroupBtn.textContent = '+ Aggiungi Gruppo';
    addGroupBtn.addEventListener('click', addGroup);
    container.appendChild(addGroupBtn);
  }
}

// ─────────────────────────────────────────────
// HIDE COMPLETED TOGGLE
// ─────────────────────────────────────────────
var hideDone = false;
var toggleDoneBtn = document.getElementById('btn-toggle-done');

function updateToggleDone() {
  document.body.classList.toggle('hide-done', hideDone);
  if (toggleDoneBtn) toggleDoneBtn.classList.toggle('active', hideDone);
  var lbl = document.getElementById('toggle-done-label');
  if (lbl) lbl.textContent = hideDone ? 'Mostra completate' : 'Nascondi completate';
  renderCardList(); // update card view too
}

toggleDoneBtn && toggleDoneBtn.addEventListener('click', function() {
  hideDone = !hideDone;
  updateToggleDone();
});

// ─────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────
var THEMES = ['dark','light','mobile'];
function applyTheme(theme) {
  currentTheme = theme;
  // Only two themes: 'dark' (glass dark, default) and 'white-glass'
  document.body.classList.remove('white-glass');
  if (theme === 'white-glass') document.body.classList.add('white-glass');
  // Set html/body background for iOS overscroll
  document.documentElement.style.background = (theme === 'white-glass') ? '#c8d8ec' : '#080c23';
  localStorage.setItem('fusaro_theme', theme);
  document.querySelectorAll('.theme-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  renderCardList();
}

var currentTheme = localStorage.getItem('fusaro_theme') || 'dark';
var CURRENT_VERSION = 'v0.06';
applyTheme(currentTheme);

document.querySelectorAll('.theme-opt').forEach(function(btn) {
  btn.addEventListener('click', function() {
    applyTheme(this.dataset.theme);
    closeMenu();
  });
});

applyTheme(currentTheme);

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
// GROUP ASSIGNMENT
// ─────────────────────────────────────────────

// Get the union of all assignedTo UIDs across a group's tasks
function getGroupAssignedUids(group) {
  var uidSet = {};
  (group.tasks || []).forEach(function(t) {
    (Array.isArray(t.assignedTo) ? t.assignedTo : []).forEach(function(uid) {
      uidSet[uid] = true;
    });
  });
  return Object.keys(uidSet);
}

async function assignGroup(gid) {
  const group = findGroup(gid);
  if (!group) return;

  // Build user picker (same as task picker but for entire group)
  const users = (typeof allUsers !== 'undefined') ? allUsers : {};
  const uids  = Object.keys(users);

  if (uids.length === 0) {
    alert('Nessun utente disponibile. Aggiungi utenti dal pannello Utenti.');
    return;
  }

  const currentAssigned = getGroupAssignedUids(group);

  const options = uids.map(function(uid) {
    const u       = users[uid];
    const checked = currentAssigned.indexOf(uid) !== -1 ? 'checked' : '';
    return '<label class="assign-option">' +
      '<input type="checkbox" class="assign-checkbox" value="' + uid + '" ' + checked + '>' +
      '<span class="assign-name">' + escHtml(u.name || u.email) + '</span>' +
      '<span class="assign-role role-' + (u.role||'operaio') + '">' +
        (u.role === 'manager' ? 'Manager' : u.role === 'capo_cantiere' ? 'Capo' : 'Operaio') +
      '</span>' +
    '</label>';
  }).join('');

  const result = await openModal(
    'Assegna gruppo: ' + group.label,
    '<div class="field-group">' +
      '<label class="field-label">Assegna tutti i task a</label>' +
      '<div class="assign-list">' + options + '</div>' +
      '<p style="color:var(--muted);font-size:11px;margin-top:10px">' +
        'Sovrascrive le assegnazioni di tutti i task del gruppo.' +
      '</p>' +
    '</div>',
    'Assegna'
  );

  if (!result) return;

  // Collect checked UIDs from modal
  const checked = document.querySelectorAll('#modal-body .assign-checkbox:checked');
  const newUids = [];
  checked.forEach(function(cb) { newUids.push(cb.value); });

  // Apply to every task in the group
  const promises = group.tasks.map(function(task) {
    task.assignedTo = newUids;
    if (typeof dbSetTaskAssignment === 'function') {
      return dbSetTaskAssignment(gid, task.id, newUids);
    }
    return Promise.resolve();
  });

  await Promise.all(promises);
  render();
}

// ─────────────────────────────────────────────
// ARCHIVE PANEL
// ─────────────────────────────────────────────
function openArchivePanel() {
  var panel = document.getElementById('archive-panel');
  if (panel) panel.style.display = 'flex';
  renderArchivePanel();
}

function closeArchivePanel() {
  var panel = document.getElementById('archive-panel');
  if (panel) panel.style.display = 'none';
}

function renderArchivePanel() {
  var list = document.getElementById('archive-list');
  if (!list) return;

  var archived = (appData.groups || []).filter(function(g){ return g.archived; });

  if (archived.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">Nessun gruppo archiviato.</div>';
    return;
  }

  list.innerHTML = archived.map(function(g) {
    var c = GROUP_COLORS[g.colorIdx % GROUP_COLORS.length];
    var taskCount = (g.tasks || []).length;
    var doneCount = (g.tasks || []).filter(function(t){ return t.status === 'done'; }).length;
    return '<div class="archive-item" data-gid="' + g.id + '">' +
      '<div class="archive-item-header" style="border-left:3px solid ' + c.color + '">' +
        '<div>' +
          '<div class="archive-item-label">' + escHtml(g.label) + '</div>' +
          '<div class="archive-item-meta">' + taskCount + ' attività &middot; ' + doneCount + ' completate</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-shrink:0">' +
          '<button class="btn-cancel" style="font-size:12px;padding:6px 12px" data-action="unarchive" data-gid="' + g.id + '">' +
            '↩ Ripristina' +
          '</button>' +
          '<button class="btn-cancel" style="font-size:12px;padding:6px 12px;color:var(--danger);border-color:rgba(248,113,113,.3)" data-action="delete-perm" data-gid="' + g.id + '">' +
            '✕ Elimina' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Wire buttons
  list.querySelectorAll('[data-action]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var gid    = this.dataset.gid;
      var action = this.dataset.action;
      if (action === 'unarchive')   unarchiveGroup(gid);
      if (action === 'delete-perm') deleteGroup(gid);
    });
  });
}

// Wire archive panel open/close buttons (called after DOM ready)
document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('btn-close-archive-panel');
  if (closeBtn) closeBtn.addEventListener('click', closeArchivePanel);

  var panel = document.getElementById('archive-panel');
  if (panel) panel.addEventListener('click', function(e) {
    if (e.target === panel) closeArchivePanel();
  });
});

// ─────────────────────────────────────────────
// COLLAPSE / EXPAND ALL GROUPS
// ─────────────────────────────────────────────
function setAllGroupsCollapsed(collapsed) {
  appData.groups.forEach(function(g) {
    if (g.archived) return;
    g.collapsed = collapsed;
    if (typeof dbSaveGroupMeta === 'function') dbSaveGroupMeta(g);
  });
  render();
  updateCollapseAllBtn();
}

function updateCollapseAllBtn() {
  var btn   = document.getElementById('btn-collapse-all');
  var label = document.getElementById('collapse-all-label');
  if (!btn || !label) return;
  var anyExpanded = appData.groups.some(function(g) { return !g.archived && !g.collapsed; });
  label.textContent = anyExpanded ? 'Comprimi tutti' : 'Espandi tutti';
  btn.dataset.collapsed = anyExpanded ? '0' : '1';
}

document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('btn-collapse-all');
  btn && btn.addEventListener('click', function() {
    var shouldCollapse = this.dataset.collapsed !== '1';
    setAllGroupsCollapsed(shouldCollapse);
  });
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
  var t = { id:uid(), giorni:r.giorni||'1', luogo:r.luogo };
  appData.trasferte.push(t);
  if (typeof dbSaveTrasferta === 'function') dbSaveTrasferta(t, currentUser ? currentUser.uid : null); else saveData();
  renderTrasferte();
}

async function editTrasferta(id) {
  const t = (appData.trasferte||[]).find(x=>x.id===id); if (!t) return;
  const r = await openModal('Modifica Trasferta', trasfertaBody(t));
  if (!r?.luogo) return;
  t.giorni = r.giorni||'1'; t.luogo = r.luogo;
  if (typeof dbSaveTrasferta === 'function') dbSaveTrasferta(t, currentUser ? currentUser.uid : null); else saveData();
  renderTrasferte();
}

function deleteTrasferta(id) {
  if (!confirm('Eliminare questa trasferta?')) return;
  appData.trasferte = (appData.trasferte||[]).filter(function(t){ return t.id !== id; });
  if (typeof dbDeleteTrasferta === 'function') dbDeleteTrasferta(id, currentUser ? currentUser.uid : null); else saveData();
  renderTrasferte();
}



// ─────────────────────────────────────────────
// GROUP DRAG TO REORDER
// ─────────────────────────────────────────────
(function() {
  var dragSrcId   = null;   // gid being dragged
  var ghost       = null;   // floating ghost element
  var longPressTimer = null;
  var touchDragging  = false;
  var touchStartY    = 0;
  var touchStartX    = 0;
  var LONG_PRESS_MS  = 500;

  // ── Utility: get group header rows in DOM order ────────────────
  function getHeaderRows() {
    return Array.from(document.querySelectorAll('.group-header-row[data-group-id]'))
      .filter(function(r) { return !r.classList.contains('print-hide'); });
  }

  // ── Commit new order to appData + Firebase ─────────────────────
  function commitOrder(newOrder) {
    // newOrder: array of gids in new order
    var grouped = {};
    appData.groups.forEach(function(g) { grouped[g.id] = g; });
    appData.groups = newOrder.map(function(gid, idx) {
      var g = grouped[gid];
      if (g) g.order = idx;
      return g;
    }).filter(Boolean);

    // Persist each group meta
    appData.groups.forEach(function(g) {
      if (typeof dbSaveGroupMeta === 'function') dbSaveGroupMeta(g);
    });
    render();
  }

  // ── Create a ghost element that follows pointer ────────────────
  function createGhost(headerRow, x, y) {
    var inner = headerRow.querySelector('.group-header-inner');
    ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = inner ? (inner.querySelector('.group-label') || inner).textContent.trim() : '…';
    ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;left:' + x + 'px;top:' + y + 'px;transform:translate(-50%,-50%)';
    document.body.appendChild(ghost);
  }

  function moveGhost(x, y) {
    if (!ghost) return;
    ghost.style.left = x + 'px';
    ghost.style.top  = y + 'px';
  }

  function removeGhost() {
    if (ghost) { ghost.remove(); ghost = null; }
  }

  // ── Find which group header the pointer is over ────────────────
  function groupIdAtPoint(x, y) {
    // Temporarily hide ghost so elementFromPoint works
    if (ghost) ghost.style.display = 'none';
    var el = document.elementFromPoint(x, y);
    if (ghost) ghost.style.display = '';
    if (!el) return null;
    var row = el.closest('.group-header-row, .card-group');
    return row ? (row.dataset.groupId || row.dataset.gid || null) : null;
  }

  // ── DESKTOP DRAG & DROP ────────────────────────────────────────
  function initDesktopDrag(row) {
    var gid = row.dataset.groupId;
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', function(e) {
      dragSrcId = gid;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', gid);
      // Use the group label as drag image text
      var inner = row.querySelector('.group-label');
      if (inner && e.dataTransfer.setDragImage) {
        var img = document.createElement('div');
        img.className = 'drag-ghost';
        img.textContent = inner.textContent.trim();
        img.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
        document.body.appendChild(img);
        e.dataTransfer.setDragImage(img, 60, 20);
        setTimeout(function() { img.remove(); }, 0);
      }
    });

    row.addEventListener('dragend', function() {
      row.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(function(r) { r.classList.remove('drag-over'); });
      dragSrcId = null;
    });

    row.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.drag-over').forEach(function(r) { r.classList.remove('drag-over'); });
      if (gid !== dragSrcId) row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', function() {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', function(e) {
      e.preventDefault();
      row.classList.remove('drag-over');
      var srcId = e.dataTransfer.getData('text/plain') || dragSrcId;
      if (!srcId || srcId === gid) return;
      var headers = getHeaderRows();
      var order   = headers.map(function(r) { return r.dataset.groupId; });
      var fromIdx = order.indexOf(srcId);
      var toIdx   = order.indexOf(gid);
      if (fromIdx === -1 || toIdx === -1) return;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, srcId);
      commitOrder(order);
    });
  }

  // ── MOBILE LONG PRESS + TOUCH DRAG ────────────────────────────
  function initTouchDrag(row) {
    var gid = row.dataset.groupId;

    row.addEventListener('touchstart', function(e) {
      var touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      longPressTimer = setTimeout(function() {
        touchDragging = true;
        dragSrcId = gid;
        row.classList.add('dragging');
        createGhost(row, touchStartX, touchStartY);
        // Haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(40);
      }, LONG_PRESS_MS);
    }, { passive: true });

    row.addEventListener('touchmove', function(e) {
      var touch = e.touches[0];
      // Cancel long press if finger moved too far before threshold
      if (!touchDragging) {
        var dx = Math.abs(touch.clientX - touchStartX);
        var dy = Math.abs(touch.clientY - touchStartY);
        if (dx > 8 || dy > 8) { clearTimeout(longPressTimer); }
        return;
      }
      e.preventDefault(); // prevent scroll while dragging
      moveGhost(touch.clientX, touch.clientY);

      // Highlight target row
      var overId = groupIdAtPoint(touch.clientX, touch.clientY);
      document.querySelectorAll('.drag-over').forEach(function(r) { r.classList.remove('drag-over'); });
      if (overId && overId !== gid) {
        var targetRow = document.querySelector('[data-group-id="' + overId + '"]');
        if (targetRow) targetRow.classList.add('drag-over');
      }
    }, { passive: false });

    row.addEventListener('touchend', function(e) {
      clearTimeout(longPressTimer);
      if (!touchDragging) return;

      var touch = e.changedTouches[0];
      var overId = groupIdAtPoint(touch.clientX, touch.clientY);

      removeGhost();
      row.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(function(r) { r.classList.remove('drag-over'); });
      touchDragging = false;

      if (overId && overId !== gid) {
        var headers = getHeaderRows();
        var order   = headers.map(function(r) { return r.dataset.groupId; });
        var fromIdx = order.indexOf(gid);
        var toIdx   = order.indexOf(overId);
        if (fromIdx !== -1 && toIdx !== -1) {
          order.splice(fromIdx, 1);
          order.splice(toIdx, 0, gid);
          commitOrder(order);
        }
      }
      dragSrcId = null;
    }, { passive: true });

    row.addEventListener('touchcancel', function() {
      clearTimeout(longPressTimer);
      removeGhost();
      row.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(function(r) { r.classList.remove('drag-over'); });
      touchDragging = false;
      dragSrcId = null;
    }, { passive: true });
  }

  // ── CARD VIEW: same logic on card group headers ────────────────
  function initCardDrag(cardGroupEl, gid) {
    var header = cardGroupEl.querySelector('.card-group-header');
    if (!header) return;
    // Store gid on header for groupIdAtPoint to find
    header.dataset.groupId = gid;

    initDesktopDrag(header);
    initTouchDrag(header);
  }

  // ── PUBLIC: called after each render ──────────────────────────
  window.initDragAndDrop = function() {
    // Table view
    document.querySelectorAll('.group-header-row[data-group-id]').forEach(function(row) {
      // Only init once (check for draggable attr)
      if (!row.getAttribute('draggable')) {
        initDesktopDrag(row);
        initTouchDrag(row);
      }
    });
    // Card view
    document.querySelectorAll('#card-list-container .card-group[data-gid]').forEach(function(el) {
      if (!el.dataset.dragInit) {
        el.dataset.dragInit = '1';
        initCardDrag(el, el.dataset.gid);
      }
    });
  };
})();

// ─────────────────────────────────────────────
// VERSION PANEL
// ─────────────────────────────────────────────
var VERSION_HISTORY = [
  {
    v: 'v0.07', date: '2026-06-08',
    files: ['app.js', 'users.js', 'db.js', 'style.css', 'index-auth.js'],
    desc: 'Aggiunto ruolo Manager (sopra Capo Cantiere). Solo il Manager può modificare i ruoli utente. Note per attività: icona dedicata che apre un modal minimale. Pre-registrazione utenti corretta: associazione tramite ricerca email invece di chiave placeholder.'
  },
  {
    v: 'v0.06', date: '2026-06-07',
    files: ['style.css', 'app.js', 'timetable.html'],
    desc: 'Blocco scroll pagina quando menu aperto. Rinominato: Giorni → Ore, colonna calcolata → Ore Totali. Card meta aggiornata. Giorni ora rappresentano ore effettive di lavoro.'
  },
  {
    v: 'v0.05', date: '2026-06-07',
    files: ['style.css', 'app.js', 'timetable.html'],
    desc: 'CSS completo riscritto da zero. Rimossi tutti i duplicati. Glass Dark ripristinato. Testo bianco su scuro, nero su chiaro. Pannello versioni aggiunto.'
  },
  {
    v: 'v0.04', date: '2026-06-06',
    files: ['app.js', 'style.css'],
    desc: 'Drag & drop per riordinare i gruppi (desktop + mobile long press). Colori gruppo non influenzano più il testo delle attività.'
  },
  {
    v: 'v0.03', date: '2026-06-05',
    files: ['app.js', 'db.js', 'users.js', 'timetable.html', 'style.css'],
    desc: 'Archiviazione gruppi al posto dell\'eliminazione diretta. Pannello archivio con ripristino ed eliminazione definitiva.'
  },
  {
    v: 'v0.02', date: '2026-06-04',
    files: ['style.css', 'app.js', 'timetable.html'],
    desc: 'Sistema temi semplificato: Glass Scuro e Glass Chiaro. Rimossi tema scuro classico, chiaro e mobile separato. Layout card automatico via media query ≤720px.'
  },
  {
    v: 'v0.01', date: '2026-06-03',
    files: ['app.js', 'db.js', 'users.js', 'firebase.js'],
    desc: 'Sanity check funzioni DB. Tutte le operazioni (trasferte, gruppi, task) ora scrivono su Firebase v2. Corretti archivio, clone e toggle gruppi.'
  },
  {
    v: 'v0.00', date: '2026-06-01',
    files: ['tutti i file'],
    desc: 'Prima versione alpha funzionante. Firebase Realtime DB, autenticazione email link, ruoli capo_cantiere / operaio, struttura dati v2 per nodo, interfaccia Glass UI.'
  }
];

function openVersionPanel() {
  var panel = document.getElementById('version-panel');
  var list  = document.getElementById('version-list');
  if (!panel || !list) return;

  list.innerHTML = VERSION_HISTORY.map(function(entry) {
    return '<div class="version-item">' +
      '<span class="version-tag">' + entry.v + '</span>' +
      '<span class="version-files">' + entry.files.length + ' file</span>' +
      '<div>' +
        '<div class="version-desc">' + entry.desc + '</div>' +
        '<div style="font-family:\'DM Mono\',monospace;font-size:9px;color:var(--muted);margin-top:3px;letter-spacing:.04em">' +
          entry.date + ' &nbsp;·&nbsp; ' + entry.files.join(', ') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  panel.style.display = 'flex';
}

function closeVersionPanel() {
  var panel = document.getElementById('version-panel');
  if (panel) panel.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
  var btn      = document.getElementById('btn-version-panel');
  var closeBtn = document.getElementById('btn-close-version-panel');
  var panel    = document.getElementById('version-panel');

  btn      && btn.addEventListener('click',      function() { if (typeof closeMenu==='function') closeMenu(); openVersionPanel(); });
  closeBtn && closeBtn.addEventListener('click', closeVersionPanel);
  panel    && panel.addEventListener('click',    function(e) { if (e.target===panel) closeVersionPanel(); });
});
