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
// Checks if a pre-registered record exists (added by capo_cantiere before first login)
// If found, migrates it to the real UID and preserves the role/name set by capo.
function registerUser(user) {
  var realRef = firebase.database().ref("users/" + user.uid);
  var email   = user.email.toLowerCase();

  return realRef.once("value").then(function(snap) {
    if (snap.exists()) {
      // Already registered — update last login and fix display name if needed
      var existing = snap.val();
      var updates  = { lastLogin: Date.now() };
      // If name is still the raw email prefix, try to improve it
      if (existing.name && existing.name === email.split("@")[0]) {
        updates.name = formatDisplayName(email);
      }
      return realRef.update(updates);
    }

    // No real UID record yet — search all users for a pre-registered record
    // matching this email (manager may have added them before first login)
    return firebase.database().ref("users")
      .orderByChild("email")
      .equalTo(email)
      .once("value")
      .then(function(querySnap) {
        var preKey  = null;
        var preData = null;

        querySnap.forEach(function(child) {
          // Find a pre-registered record (key starts with "pre_" or has preRegistered flag)
          if (child.key !== user.uid &&
              (child.key.indexOf("pre_") === 0 || child.val().preRegistered)) {
            preKey  = child.key;
            preData = child.val();
          }
        });

        if (preData) {
          // Found pre-registered record — migrate to real UID
          return realRef.set({
            uid:          user.uid,
            email:        email,
            name:         preData.name || formatDisplayName(email),
            role:         preData.role || "operaio",
            createdAt:    Date.now(),
            migratedFrom: preKey
          }).then(function() {
            // Remove the placeholder
            return firebase.database().ref("users/" + preKey).remove();
          });
        } else {
          // Truly new user — create with default role and formatted name
          return realRef.set({
            uid:       user.uid,
            email:     email,
            name:      formatDisplayName(email),
            role:      "operaio",
            createdAt: Date.now()
          });
        }
      });
  });
}

// Format display name from email: nome.cognome@fusaroimpianti.it → Nome Cognome
function formatDisplayName(email) {
  var prefix = email.split("@")[0];           // "nome.cognome"
  return prefix
    .split(".")
    .map(function(part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");                                // "Nome Cognome"
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
