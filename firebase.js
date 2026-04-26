// ═══════════════════════════════════════════════════════════
// FIREBASE.JS — Timetable page: auth guard + DB subscription
// Depends on: firebase-config.js, db.js, users.js, app.js
// ═══════════════════════════════════════════════════════════
firebase.initializeApp(FIREBASE_CONFIG);

// fbSave is called by app.js saveData() for backwards compat
// In v2 we use granular db.js functions instead, but keep this
// as a safety net for the JSON import flow.
function fbSave() {
  // No-op: all saves now go through db.js granular functions.
  // JSON import calls dbPushDefaultData() directly.
}

// ── Auth guard ────────────────────────────────────────────────
firebase.auth().onAuthStateChanged(function(user) {
  if (!user) {
    // Not signed in — send to login page
    window.location.href = INDEX_URL;
    return;
  }

  // Signed in — load user profile, then data
  loadCurrentUser(user)
    .then(function() {
      if (isCapoCantiere()) {
        return loadAllUsers(); // preload for assignment picker
      }
    })
    .then(function() {
      checkAndMigrate();
    })
    .catch(function(err) {
      console.error("User load error:", err);
      setSyncStatus("error", "Errore caricamento utente");
    });
});

// ── Check if DB has data, migrate from v1 if needed ──────────
function checkAndMigrate() {
  setSyncStatus("syncing", "Connessione\u2026");

  // First check v2
  dbRef("groups").once("value", function(snap) {
    if (snap.exists()) {
      // v2 data exists — subscribe
      startSubscription();
    } else {
      // Check v1
      firebase.database().ref("piano/v1").once("value", function(v1snap) {
        if (v1snap.exists() && v1snap.val() && v1snap.val().groups) {
          setSyncStatus("syncing", "Migrazione dati\u2026");
          dbMigrateFromV1(v1snap.val()).then(function() {
            setSyncStatus("synced", "Migrazione completata \u2713");
            startSubscription();
          });
        } else {
          // No data at all — first run
          dbPushDefaultData().then(function() {
            startSubscription();
          });
        }
      });
    }
  });
}

// ── Subscribe to realtime data ────────────────────────────────
function startSubscription() {
  dbSubscribe(
    function(data) {
      appData = data;
      render();
      renderTrasferte();
      applyRoleVisibility();
      setSyncStatus("synced", "Sincronizzato \u2713");
    },
    function(err) {
      setSyncStatus("error", "Errore connessione");
    }
  );
}

// ── Override saveData for v2: use granular writes ─────────────
// app.js calls saveData() after every change.
// We intercept each specific action via the action functions below
// and call the appropriate db.js function instead.
// saveData() itself becomes a no-op for Firebase (still writes localStorage).

// ── Override cycleStatus to use per-field write ───────────────
var _originalCycleStatus = typeof cycleStatus === "function" ? cycleStatus : null;
function cycleStatus(gid, tid) {
  var task = findTask(gid, tid);
  if (!task) return;

  if (!canEditTask(task)) {
    alert("Non hai i permessi per modificare questa attività.");
    return;
  }

  var next = { none:"partial", partial:"done", done:"none" }[task.status] || "none";
  task.status    = next;
  task.updatedBy = currentUser ? currentUser.uid : "";
  task.updatedAt = Date.now();

  // Update just the status field in Firebase
  dbSetTaskStatus(gid, tid, next);

  // Also stamp updatedBy/updatedAt
  dbRef("groups/" + gid + "/tasks/" + tid + "/updatedBy").set(task.updatedBy);
  dbRef("groups/" + gid + "/tasks/" + tid + "/updatedAt").set(task.updatedAt);

  // Local re-render
  var tr = document.querySelector('tr[data-task-id="' + tid + '"]');
  if (tr) {
    tr.classList.remove("row-done", "row-partial");
    if (next === "done")    tr.classList.add("row-done");
    if (next === "partial") tr.classList.add("row-partial");
    var btn = tr.querySelector(".status-btn");
    if (btn) {
      btn.dataset.status = next;
      btn.querySelector(".btn-label").textContent = { none:"–", partial:"In corso", done:"Completato" }[next];
    }
  }
  updatePills();
}

// ── Wire JSON import to use v2 migration ─────────────────────
var _origImportInput = document.getElementById("import-file-input");
if (_origImportInput) {
  _origImportInput.addEventListener("change", function() {
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
        if (!confirm("Questo sovrascriverà tutti i dati correnti. Continuare?")) return;
        setSyncStatus("syncing", "Importazione\u2026");
        dbMigrateFromV1(parsed).then(function() {
          setSyncStatus("synced", "Importazione completata \u2713");
          alert("\u2713 Configurazione importata con successo!");
        });
      } catch(err) {
        alert("Errore lettura JSON:\n" + err.message);
      }
    };
    reader.readAsText(file);
  });
}
