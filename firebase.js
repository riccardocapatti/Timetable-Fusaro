// ═══════════════════════════════════════════════════
// FIREBASE INIT
// ═══════════════════════════════════════════════════
firebase.initializeApp({
  apiKey:            "AIzaSyCKON7eXkaaOl71opdx2r-uVsF28EzImKk",
  authDomain:        "timetable-c4ca3.firebaseapp.com",
  databaseURL:       "https://timetable-c4ca3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "timetable-c4ca3",
  storageBucket:     "timetable-c4ca3.firebasestorage.app",
  messagingSenderId: "727475559535",
  appId:             "1:727475559535:web:fc82eb862419c4727ac19a"
});

var APP_URL   = "https://riccardocapatti.github.io/Timetable-Fusaro/timetable.html";
var EMAIL_KEY = "fusaro_email_for_signin";

// ═══════════════════════════════════════════════════
// SYNC STATUS
// ═══════════════════════════════════════════════════
function setSyncStatus(state, text) {
  var bar = document.getElementById("sync-bar");
  var txt = document.getElementById("sync-text");
  if (!bar) return;
  bar.className     = state;
  txt.textContent   = text;
  bar.style.display = "inline-flex";
}

// Called by saveData() in app.js after SDK is loaded
function fbSave() {
  var u = firebase.auth().currentUser;
  if (!u) return;
  setSyncStatus("syncing", "Salvataggio\u2026");
  firebase.database().ref("piano/v1").set(appData)
    .then(function()  { setSyncStatus("synced", "Sincronizzato \u2713"); })
    .catch(function(e){ console.error(e); setSyncStatus("error", "Errore \u2717"); });
}

// ═══════════════════════════════════════════════════
// AUTH SCREEN HELPERS
// ═══════════════════════════════════════════════════
function showApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.body.classList.remove("auth-open");
}

function showAuthScreen() {
  document.getElementById("auth-screen").style.display = "flex";
  document.body.classList.add("auth-open");
  document.getElementById("auth-step-email").style.display = "block";
  document.getElementById("auth-step-sent").style.display  = "none";
}

function showSentStep(email) {
  document.getElementById("auth-step-email").style.display = "none";
  document.getElementById("auth-step-sent").style.display  = "block";
  document.getElementById("auth-sent-email").textContent   = email;
}

// ═══════════════════════════════════════════════════
// USER BADGE
// ═══════════════════════════════════════════════════
function renderUserBadge(user) {
  var el = document.getElementById("user-badge");
  if (!user) { el.innerHTML = ""; return; }
  el.innerHTML =
    '<span id="user-name">' + (user.displayName || user.email || "") + '</span>' +
    '<button class="signout-btn" id="btn-signout">Esci</button>';
  document.getElementById("btn-signout").addEventListener("click", function() {
    firebase.auth().signOut();
  });
}

// ═══════════════════════════════════════════════════
// DATA MIGRATION
// ═══════════════════════════════════════════════════
function migrateSnap(raw) {
  (raw.groups || []).forEach(function(g) {
    if (g.collapsed === undefined) g.collapsed = false;
    (g.tasks || []).forEach(function(t) {
      if (!t.priority) t.priority = "";
      if (!t.dueDate)  t.dueDate  = "";
      if (t.people === undefined) t.people = 1;
      if (typeof t.people === "string") {
        var n = parseInt(t.people.replace(/[^0-9]/g, ""));
        t.people = isNaN(n) ? 1 : n;
      }
    });
  });
  if (!raw.trasferte) raw.trasferte = [];
  return raw;
}

// ═══════════════════════════════════════════════════
// REALTIME DATABASE SUBSCRIPTION
// ═══════════════════════════════════════════════════
function subscribeToData() {
  setSyncStatus("syncing", "Connessione\u2026");
  firebase.database().ref("piano/v1").on("value",
    function(snap) {
      var raw = snap.val();
      if (raw && raw.groups) {
        appData = migrateSnap(raw);
      } else {
        // First run — push default data
        appData = makeDefaultData();
        firebase.database().ref("piano/v1").set(appData);
      }
      render();
      renderTrasferte();
      setSyncStatus("synced", "Sincronizzato \u2713");
    },
    function(err) {
      console.error("DB error:", err);
      setSyncStatus("error", "Errore connessione");
    }
  );
}

// ═══════════════════════════════════════════════════
// EMAIL LINK SIGN-IN
// ═══════════════════════════════════════════════════
function sendSignInLink(email) {
  var btn   = document.getElementById("btn-send-link");
  var errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  btn.disabled      = true;
  btn.textContent   = "Invio in corso\u2026";

  firebase.auth().sendSignInLinkToEmail(email, {
    url:              APP_URL,
    handleCodeInApp:  true
  })
  .then(function() {
    localStorage.setItem(EMAIL_KEY, email);
    showSentStep(email);
    btn.disabled    = false;
    btn.textContent = "Invia link di accesso";
  })
  .catch(function(err) {
    errEl.textContent = err.message;
    btn.disabled      = false;
    btn.textContent   = "Invia link di accesso";
  });
}

document.getElementById("btn-send-link").addEventListener("click", function() {
  var email = document.getElementById("auth-email-input").value.trim();
  if (!email) {
    document.getElementById("auth-error").textContent = "Inserisci un indirizzo email valido.";
    return;
  }
  sendSignInLink(email);
});

document.getElementById("auth-email-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") document.getElementById("btn-send-link").click();
});

document.getElementById("btn-resend").addEventListener("click", function() {
  document.getElementById("auth-step-sent").style.display  = "none";
  document.getElementById("auth-step-email").style.display = "block";
  document.getElementById("auth-error").textContent = "";
});

// ═══════════════════════════════════════════════════
// HANDLE MAGIC LINK ON PAGE LOAD
// ═══════════════════════════════════════════════════
if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
  var storedEmail = localStorage.getItem(EMAIL_KEY);
  if (!storedEmail) {
    storedEmail = window.prompt("Inserisci l'email con cui hai richiesto il link:");
  }
  if (storedEmail) {
    firebase.auth().signInWithEmailLink(storedEmail, window.location.href)
      .then(function() {
        localStorage.removeItem(EMAIL_KEY);
        window.history.replaceState(null, "", APP_URL);
      })
      .catch(function(err) {
        document.getElementById("auth-error").textContent = err.message;
        showAuthScreen();
      });
  } else {
    showAuthScreen();
  }
}

// ═══════════════════════════════════════════════════
// AUTH STATE OBSERVER
// ═══════════════════════════════════════════════════
firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    showApp();
    renderUserBadge(user);
    subscribeToData();
  } else {
    if (!firebase.auth().isSignInWithEmailLink(window.location.href)) {
      showAuthScreen();
      renderUserBadge(null);
      document.getElementById("sync-bar").style.display = "none";
    }
  }
});
