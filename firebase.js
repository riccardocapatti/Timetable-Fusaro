// ═══════════════════════════════════════════════════════════
// FIREBASE.JS — Timetable page: auth guard + DB subscription
// Depends on: firebase-config.js, db.js, users.js, app.js
// ═══════════════════════════════════════════════════════════
firebase.initializeApp(FIREBASE_CONFIG);

// ── Show loading overlay until data arrives ───────────────────
showLoading(true);

// ── Auth guard ────────────────────────────────────────────────
firebase.auth().onAuthStateChanged(function(user) {
  if (!user) {
    window.location.href = INDEX_URL;
    return;
  }

  // Load user profile → optionally load all users → check DB
  loadCurrentUser(user)
    .then(function() {
      if (isCapoCantiere()) return loadAllUsers();
    })
    .then(function() {
      checkAndMigrate();
    })
    .catch(function(err) {
      console.error("Startup error:", err);
      setSyncStatus("error", "Errore avvio");
      showLoading(false);
    });
});

// ── Loading overlay ───────────────────────────────────────────
function showLoading(show) {
  var el = document.getElementById("loading-overlay");
  if (el) el.style.display = show ? "flex" : "none";
}

// ── Sync status bar ───────────────────────────────────────────
function setSyncStatus(state, text) {
  var bar = document.getElementById("sync-bar");
  var txt = document.getElementById("sync-text");
  if (!bar) return;
  bar.className     = state;
  txt.textContent   = text;
  bar.style.display = "inline-flex";
}

// ── No-op fbSave (all writes go through db.js) ───────────────
function fbSave() {}

// ── Check DB version, migrate if needed ───────────────────────
function checkAndMigrate() {
  setSyncStatus("syncing", "Connessione\u2026");

  dbRef("groups").once("value", function(snap) {
    if (snap.exists()) {
      startSubscription();
    } else {
      // Check for v1 data to migrate
      firebase.database().ref("piano/v1").once("value", function(v1snap) {
        var v1 = v1snap.val();
        if (v1 && v1.groups && v1.groups.length) {
          setSyncStatus("syncing", "Migrazione dati\u2026");
          dbMigrateFromV1(v1).then(startSubscription);
        } else {
          // Truly first run — push default data
          dbPushDefaultData().then(startSubscription);
        }
      });
    }
  }, function(err) {
    console.error("DB check error:", err);
    setSyncStatus("error", "Errore connessione");
    showLoading(false);
  });
}

// ── Realtime subscription ─────────────────────────────────────
var _firstLoad = true;
function startSubscription() {
  dbSubscribe(
    function(data) {
      appData = data;
      render();
      renderTrasferte();
      applyRoleVisibility();
      if (_firstLoad) {
        _firstLoad = false;
        showLoading(false);
        if (typeof initUserPanel === "function") initUserPanel();
      }
      setSyncStatus("synced", "Sincronizzato ✓");
    },
    function(err) {
      setSyncStatus("error", "Errore connessione");
      showLoading(false);
    }
  );
}

// ── Override cycleStatus: per-field write + permission check ──
function cycleStatus(gid, tid) {
  var task = findTask(gid, tid);
  if (!task) return;

  if (!canEditTask(task)) {
    alert("Non hai i permessi per modificare questa attività.");
    return;
  }

  var CYCLE = { none:"partial", partial:"done", done:"none" };
  var next  = CYCLE[task.status] || "none";
  task.status    = next;
  task.updatedBy = currentUser ? currentUser.uid : "";
  task.updatedAt = Date.now();

  // Atomic per-field writes
  dbSetTaskStatus(gid, tid, next);
  dbRef("groups/" + gid + "/tasks/" + tid + "/updatedBy").set(task.updatedBy);
  dbRef("groups/" + gid + "/tasks/" + tid + "/updatedAt").set(task.updatedAt);

  // Optimistic local re-render (subscription will confirm)
  var tr = document.querySelector('tr[data-task-id="' + tid + '"]');
  if (tr) {
    tr.classList.remove("row-done", "row-partial");
    if (next === "done")    tr.classList.add("row-done");
    if (next === "partial") tr.classList.add("row-partial");
    var btn = tr.querySelector(".status-btn");
    if (btn) {
      btn.dataset.status = next;
      btn.querySelector(".btn-label").textContent =
        { none:"\u2013", partial:"In corso", done:"Completato" }[next];
    }
  }
  updatePills();
}

// ── JSON import → v2 structure ────────────────────────────────
var importInput = document.getElementById("import-file-input");
if (importInput) {
  // Remove any existing listener added by app.js
  var newInput = importInput.cloneNode(true);
  importInput.parentNode.replaceChild(newInput, importInput);

  newInput.addEventListener("change", function() {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var parsed = JSON.parse(e.target.result);
        if (!parsed.groups || !Array.isArray(parsed.groups)) {
          alert("File JSON non valido.");
          return;
        }
        if (!confirm("Sovrascrivere tutti i dati correnti con questo file?")) return;
        setSyncStatus("syncing", "Importazione\u2026");
        // Clear existing v2 data first then migrate
        dbRef("").remove().then(function() {
          return dbMigrateFromV1(parsed);
        }).then(function() {
          setSyncStatus("synced", "Importazione completata \u2713");
          alert("\u2713 Importazione completata!");
        }).catch(function(err) {
          setSyncStatus("error", "Errore importazione");
          console.error(err);
        });
      } catch(err) {
        alert("Errore lettura JSON:\n" + err.message);
      }
    };
    reader.readAsText(file);
  });
}
