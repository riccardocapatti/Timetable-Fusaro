// ═══════════════════════════════════════════════════════════
// FIREBASE.JS — Timetable page: auth guard + DB subscription
// ═══════════════════════════════════════════════════════════
firebase.initializeApp(FIREBASE_CONFIG);

// ── Loading overlay ───────────────────────────────────────────
var _loadingTimer = null;

function showLoading(show, msg) {
  var el  = document.getElementById("loading-overlay");
  var txt = document.getElementById("loading-status");
  if (el)  el.style.display = show ? "flex" : "none";
  if (txt && msg) txt.textContent = msg;
  document.body.classList.toggle("is-loading", show);
  console.log("[LOADING]", show, msg || "");

  // Safety timeout — always hide after 10s no matter what
  if (show) {
    clearTimeout(_loadingTimer);
    _loadingTimer = setTimeout(function() {
      console.warn("[LOADING] Safety timeout — forcing hide");
      showLoading(false, "");
    }, 10000);
  } else {
    clearTimeout(_loadingTimer);
  }
}

// ── Sync status bar ───────────────────────────────────────────
function setSyncStatus(state, text) {
  var bar = document.getElementById("sync-bar");
  var txt = document.getElementById("sync-text");
  if (!bar) return;
  bar.className     = state;
  txt.textContent   = text;
  bar.style.display = "inline-flex";
  console.log("[SYNC]", state, text);
}

// ── No-op fbSave ─────────────────────────────────────────────
function fbSave() {}

// ── Auth guard ────────────────────────────────────────────────
firebase.auth().onAuthStateChanged(function(user) {
  console.log("[AUTH] onAuthStateChanged, user:", user ? user.email : "null");

  if (!user) {
    console.log("[AUTH] No user — redirecting to index");
    window.location.href = INDEX_URL;
    return;
  }

  showLoading(true, "Caricamento profilo…");

  loadCurrentUser(user)
    .then(function() {
      console.log("[AUTH] User loaded:", currentUserData);
      showLoading(true, "Caricamento utenti…");
      if (isCapoCantiere()) {
        console.log("[AUTH] Is capo — loading all users");
        return loadAllUsers();
      }
    })
    .then(function() {
      console.log("[AUTH] Ready — checking DB");
      showLoading(true, "Connessione database…");
      checkAndMigrate();
    })
    .catch(function(err) {
      console.error("[AUTH] Startup error:", err);
      showLoading(false);
      alert("Errore di avvio: " + err.message);
    });
});

// ── Check DB, migrate if needed ───────────────────────────────
function checkAndMigrate() {
  console.log("[DB] checkAndMigrate start");

  dbRef("groups").once("value")
    .then(function(snap) {
      console.log("[DB] v2 groups exists:", snap.exists(), "numChildren:", snap.numChildren());

      if (snap.exists()) {
        console.log("[DB] v2 data found — subscribing");
        startSubscription();
        return;
      }

      // No v2 — check v1
      console.log("[DB] No v2 data — checking v1");
      showLoading(true, "Controllo dati precedenti…");

      return firebase.database().ref("piano/v1/groups").once("value")
        .then(function(v1snap) {
          console.log("[DB] v1 groups exists:", v1snap.exists());

          if (v1snap.exists()) {
            showLoading(true, "Migrazione dati…");
            return firebase.database().ref("piano/v1").once("value")
              .then(function(full) {
                return dbMigrateFromV1(full.val());
              })
              .then(function() {
                console.log("[DB] Migration done — subscribing");
                startSubscription();
              });
          } else {
            // Truly empty DB — start immediately, don't wait for data
            console.log("[DB] Empty DB — starting empty");
            startSubscription();
          }
        });
    })
    .catch(function(err) {
      console.error("[DB] checkAndMigrate error:", err);
      showLoading(false);
      alert("Errore database: " + err.message + "\n\nVerifica le regole Firebase.");
    });
}

// ── Realtime subscription ─────────────────────────────────────
var _firstLoad = true;

function startSubscription() {
  console.log("[DB] startSubscription called");
  showLoading(true, "Caricamento dati…");

  dbSubscribe(
    function(data) {
      console.log("[DB] Data received — groups:", data.groups.length, "trasferte:", data.trasferte.length);
      appData = data;
      render();
      renderTrasferte();
      applyRoleVisibility();

      // Always hide on first callback — even if data is empty
      if (_firstLoad) {
        _firstLoad = false;
        console.log("[APP] First load complete — hiding overlay");
        showLoading(false);
        if (typeof initUserPanel === "function") initUserPanel();
      }
      setSyncStatus("synced", "Sincronizzato \u2713");
    },
    function(err) {
      console.error("[DB] Subscription error:", err);
      setSyncStatus("error", "Errore connessione");
      // Hide loading even on error so user isn't stuck
      if (_firstLoad) {
        _firstLoad = false;
        showLoading(false);
      }
      alert("Errore connessione: " + err.message);
    }
  );

  // Hard fallback: if subscription never fires within 8s, hide loading anyway
  setTimeout(function() {
    if (_firstLoad) {
      _firstLoad = false;
      console.warn("[DB] Subscription timeout — forcing hide");
      showLoading(false);
      setSyncStatus("error", "Timeout connessione");
      render();
      renderTrasferte();
      if (typeof initUserPanel === "function") initUserPanel();
    }
  }, 8000);
}

// ── Override cycleStatus ──────────────────────────────────────
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
  dbSetTaskStatus(gid, tid, next);
  dbRef("groups/" + gid + "/tasks/" + tid + "/updatedBy").set(task.updatedBy);
  dbRef("groups/" + gid + "/tasks/" + tid + "/updatedAt").set(task.updatedAt);
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

// ── JSON import ───────────────────────────────────────────────
var importInput = document.getElementById("import-file-input");
if (importInput) {
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
        if (!confirm("Sovrascrivere tutti i dati correnti?")) return;
        setSyncStatus("syncing", "Importazione\u2026");
        dbRef("").remove()
          .then(function() { return dbMigrateFromV1(parsed); })
          .then(function() {
            setSyncStatus("synced", "Importazione completata \u2713");
            alert("\u2713 Importazione completata!");
          })
          .catch(function(err) {
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
