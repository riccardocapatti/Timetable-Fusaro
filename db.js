// ═══════════════════════════════════════════════════════════
// DB.JS — Per-node Firebase reads/writes
// All writes touch the smallest possible node to avoid
// overwriting concurrent edits from other users.
// ═══════════════════════════════════════════════════════════

var DB_ROOT = "piano/v2";   // v2 = new per-node structure

// ── Sync status ──────────────────────────────────────────────
function setSyncStatus(state, text) {
  var bar = document.getElementById("sync-bar");
  var txt = document.getElementById("sync-text");
  if (!bar) return;
  bar.className     = state;
  txt.textContent   = text;
  bar.style.display = "inline-flex";
}

// ── Helpers ──────────────────────────────────────────────────
function dbRef(path) {
  return firebase.database().ref(DB_ROOT + "/" + path);
}

// ── TASKS — write a single task node only ────────────────────
function dbSaveTask(groupId, task) {
  setSyncStatus("syncing", "Salvataggio\u2026");
  return dbRef("groups/" + groupId + "/tasks/" + task.id)
    .set(task)
    .then(function()  { setSyncStatus("synced", "Sincronizzato \u2713"); })
    .catch(function(e){ setSyncStatus("error", "Errore \u2717"); console.error(e); });
}

function dbDeleteTask(groupId, taskId) {
  setSyncStatus("syncing", "Eliminazione\u2026");
  return dbRef("groups/" + groupId + "/tasks/" + taskId)
    .remove()
    .then(function()  { setSyncStatus("synced", "Sincronizzato \u2713"); })
    .catch(function(e){ setSyncStatus("error", "Errore \u2717"); console.error(e); });
}

// ── GROUPS — write group metadata (not tasks) ─────────────────
function dbSaveGroupMeta(group) {
  setSyncStatus("syncing", "Salvataggio\u2026");
  var meta = { id: group.id, label: group.label, colorIdx: group.colorIdx, collapsed: group.collapsed, order: group.order || 0 };
  return dbRef("groups/" + group.id + "/meta")
    .set(meta)
    .then(function()  { setSyncStatus("synced", "Sincronizzato \u2713"); })
    .catch(function(e){ setSyncStatus("error", "Errore \u2717"); console.error(e); });
}

function dbDeleteGroup(groupId) {
  setSyncStatus("syncing", "Eliminazione\u2026");
  return dbRef("groups/" + groupId)
    .remove()
    .then(function()  { setSyncStatus("synced", "Sincronizzato \u2713"); })
    .catch(function(e){ setSyncStatus("error", "Errore \u2717"); console.error(e); });
}

// ── TRASFERTE ────────────────────────────────────────────────
function dbSaveTrasferta(t) {
  return dbRef("trasferte/" + t.id).set(t)
    .catch(function(e){ console.error(e); });
}

function dbDeleteTrasferta(id) {
  return dbRef("trasferte/" + id).remove()
    .catch(function(e){ console.error(e); });
}

// ── TASK STATUS — smallest possible write ─────────────────────
function dbSetTaskStatus(groupId, taskId, status) {
  setSyncStatus("syncing", "Salvataggio\u2026");
  return dbRef("groups/" + groupId + "/tasks/" + taskId + "/status")
    .set(status)
    .then(function()  { setSyncStatus("synced", "Sincronizzato \u2713"); })
    .catch(function(e){ setSyncStatus("error", "Errore \u2717"); console.error(e); });
}

// ── TASK ASSIGNMENT ───────────────────────────────────────────
function dbSetTaskAssignment(groupId, taskId, assignedTo) {
  // assignedTo: array of uids
  return dbRef("groups/" + groupId + "/tasks/" + taskId + "/assignedTo")
    .set(assignedTo)
    .catch(function(e){ console.error(e); });
}

// ── FULL SUBSCRIPTION ─────────────────────────────────────────
function dbSubscribe(onData, onError) {
  dbRef("").on("value",
    function(snap) {
      var raw = snap.val() || {};
      var data = normalizeDbData(raw);
      onData(data);
    },
    function(err) {
      console.error("DB subscription error:", err);
      if (onError) onError(err);
    }
  );
}

// ── Normalize flat Firebase structure → appData shape ─────────
function normalizeDbData(raw) {
  var groups = [];
  var groupsRaw = raw.groups || {};

  Object.keys(groupsRaw).forEach(function(gid) {
    var g     = groupsRaw[gid];
    var meta  = g.meta  || {};
    var tasks = g.tasks || {};

    var taskArr = Object.keys(tasks).map(function(tid) {
      var t = tasks[tid];
      // Migrate missing fields
      return {
        id:         tid,
        name:       t.name       || "",
        days:       t.days       || "—",
        people:     typeof t.people === "number" ? t.people : 1,
        status:     t.status     || "none",
        priority:   t.priority   || "",
        dueDate:    t.dueDate    || "",
        assignedTo: t.assignedTo || [],
        updatedBy:  t.updatedBy  || "",
        updatedAt:  t.updatedAt  || 0
      };
    });

    // Sort tasks by order field if present, else preserve insertion order
    taskArr.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    groups.push({
      id:        gid,
      label:     meta.label     || gid,
      colorIdx:  meta.colorIdx  || 0,
      collapsed: meta.collapsed || false,
      order:     meta.order     || 0,
      tasks:     taskArr
    });
  });

  // Sort groups by order
  groups.sort(function(a, b) { return a.order - b.order; });

  // Trasferte
  var trasferte = [];
  var tRaw = raw.trasferte || {};
  Object.keys(tRaw).forEach(function(tid) {
    trasferte.push(tRaw[tid]);
  });

  return { groups: groups, trasferte: trasferte };
}

// ── First-run: push default data to Firebase ──────────────────
function dbPushDefaultData() {
  var data    = makeDefaultData();
  var updates = {};

  data.groups.forEach(function(g, idx) {
    var gid  = g.id;
    updates["groups/" + gid + "/meta"] = {
      id: gid, label: g.label, colorIdx: g.colorIdx, collapsed: false, order: idx
    };
    g.tasks.forEach(function(t, tidx) {
      t.order      = tidx;
      t.assignedTo = [];
      t.updatedBy  = "";
      t.updatedAt  = 0;
      updates["groups/" + gid + "/tasks/" + t.id] = t;
    });
  });

  data.trasferte.forEach(function(t) {
    updates["trasferte/" + t.id] = t;
  });

  return dbRef("").update(updates);
}

// ── Migrate from v1 flat structure to v2 per-node structure ───
function dbMigrateFromV1(v1Data) {
  console.log("Migrating v1 data to v2 structure...");
  var updates = {};

  (v1Data.groups || []).forEach(function(g, idx) {
    var gid = g.id;
    updates["groups/" + gid + "/meta"] = {
      id: gid, label: g.label, colorIdx: g.colorIdx || 0, collapsed: g.collapsed || false, order: idx
    };
    (g.tasks || []).forEach(function(t, tidx) {
      updates["groups/" + gid + "/tasks/" + t.id] = {
        id:         t.id,
        name:       t.name       || "",
        days:       t.days       || "—",
        people:     t.people     || 1,
        status:     t.status     || "none",
        priority:   t.priority   || "",
        dueDate:    t.dueDate    || "",
        order:      tidx,
        assignedTo: [],
        updatedBy:  "",
        updatedAt:  0
      };
    });
  });

  (v1Data.trasferte || []).forEach(function(t) {
    updates["trasferte/" + t.id] = t;
  });

  return dbRef("").update(updates);
}
