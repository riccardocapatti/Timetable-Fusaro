// ═══════════════════════════════════════════════════════════
// INDEX AUTH — handles login page only
// ═══════════════════════════════════════════════════════════
firebase.initializeApp(FIREBASE_CONFIG);

// ── If this page loaded because the user clicked a magic link ──
if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
  var storedEmail = localStorage.getItem(EMAIL_KEY);

  if (storedEmail) {
    showStatus("loading", "Accesso in corso\u2026");
    firebase.auth().signInWithEmailLink(storedEmail, window.location.href)
      .then(function(result) {
        localStorage.removeItem(EMAIL_KEY);
        // Register/update user in DB then redirect
        return registerUser(result.user);
      })
      .then(function() {
        window.location.href = APP_URL;
      })
      .catch(function(err) {
        showStatus("error", "Errore: " + err.message);
      });
  } else {
    // Different browser — ask for email
    showEmailConfirmStep();
  }
}

// ── Auth state: if already signed in, go straight to app ──
firebase.auth().onAuthStateChanged(function(user) {
  if (user && !firebase.auth().isSignInWithEmailLink(window.location.href)) {
    window.location.href = APP_URL;
  }
});

// ── Register user in /users/{uid} on first sign in ────────
function registerUser(user) {
  var ref = firebase.database().ref("users/" + user.uid);
  return ref.once("value").then(function(snap) {
    if (!snap.exists()) {
      // First time — create record with default role
      return ref.set({
        uid:       user.uid,
        email:     user.email,
        name:      user.displayName || user.email.split("@")[0],
        role:      "operaio",   // default — capo_cantiere must be set manually in Firebase console
        createdAt: Date.now()
      });
    }
    // Existing user — just update last login
    return ref.update({ lastLogin: Date.now() });
  });
}

// ── Send magic link ─────────────────────────────────────────
function sendSignInLink(email) {
  var btn   = document.getElementById("btn-send-link");
  var errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  btn.disabled      = true;
  btn.textContent   = "Invio in corso\u2026";

  firebase.auth().sendSignInLinkToEmail(email, {
    url:             INDEX_URL,   // link returns to index.html, not timetable
    handleCodeInApp: true
  })
  .then(function() {
    localStorage.setItem(EMAIL_KEY, email);
    showSentStep(email);
  })
  .catch(function(err) {
    errEl.textContent = err.message;
    btn.disabled      = false;
    btn.textContent   = "Invia link di accesso";
  });
}

// ── Email confirmation step (different browser) ─────────────
function showEmailConfirmStep() {
  document.getElementById("auth-step-email").style.display   = "none";
  document.getElementById("auth-step-confirm").style.display = "block";
}

document.getElementById("btn-confirm-email") && 
document.getElementById("btn-confirm-email").addEventListener("click", function() {
  var email = document.getElementById("auth-confirm-email-input").value.trim();
  if (!email) return;
  showStatus("loading", "Accesso in corso\u2026");
  firebase.auth().signInWithEmailLink(email, window.location.href)
    .then(function(result) {
      localStorage.removeItem(EMAIL_KEY);
      return registerUser(result.user);
    })
    .then(function() {
      window.location.href = APP_URL;
    })
    .catch(function(err) {
      showStatus("error", "Email non valida o link scaduto.");
    });
});

// ── UI helpers ──────────────────────────────────────────────
function showSentStep(email) {
  document.getElementById("auth-step-email").style.display = "none";
  document.getElementById("auth-step-sent").style.display  = "block";
  document.getElementById("auth-sent-email").textContent   = email;
}

function showStatus(type, msg) {
  document.getElementById("auth-step-email").style.display   = "none";
  document.getElementById("auth-step-sent").style.display    = "none";
  document.getElementById("auth-step-confirm").style.display = "none";
  var el = document.getElementById("auth-status");
  el.style.display = "block";
  el.className     = "auth-status " + type;
  el.textContent   = msg;
}

// ── Button wiring ───────────────────────────────────────────
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
