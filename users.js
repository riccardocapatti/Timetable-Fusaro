// ═══════════════════════════════════════════════════════════
// USERS.JS — User management, role checking, assignment UI
// ═══════════════════════════════════════════════════════════

var currentUser     = null;   // Firebase auth user
var currentUserData = null;   // { uid, name, email, role }
var allUsers        = {};     // uid → { uid, name, email, role }

var ROLES = {
  capo_cantiere: "Capo Cantiere",
  operaio:       "Operaio"
};

// ── Load current user's profile from DB ──────────────────────
// If no record exists yet, create one (first login on this device)
function loadCurrentUser(firebaseUser) {
  currentUser = firebaseUser;
  var ref = firebase.database().ref("users/" + firebaseUser.uid);

  return ref.once("value")
    .then(function(snap) {
      if (snap.exists()) {
        // Record exists — use it
        currentUserData = snap.val();
        console.log("[USERS] Loaded existing user:", currentUserData.email, "role:", currentUserData.role);
      } else {
        // No record — create it now (first login)
        currentUserData = {
          uid:       firebaseUser.uid,
          email:     firebaseUser.email,
          name:      firebaseUser.email.split("@")[0],
          role:      "operaio",
          createdAt: Date.now()
        };
        console.log("[USERS] Creating new user record:", currentUserData.email);
        // Write to Firebase — will succeed now that rules allow auth.uid === $uid writes
        return ref.set(currentUserData).then(function() {
          console.log("[USERS] User record created OK");
        });
      }
    })
    .then(function() {
      renderUserBadge(currentUserData);
      return currentUserData;
    })
    .catch(function(err) {
      // Rules blocked the read — use a local fallback so app still loads
      console.warn("[USERS] Could not read user record (rules?):", err.message);
      currentUserData = {
        uid:   firebaseUser.uid,
        email: firebaseUser.email,
        name:  firebaseUser.email.split("@")[0],
        role:  "operaio"
      };
      renderUserBadge(currentUserData);
      return currentUserData;
    });
}

// ── Load all users (for assignment picker — capo only) ────────
function loadAllUsers() {
  return firebase.database().ref("users")
    .once("value")
    .then(function(snap) {
      allUsers = snap.val() || {};
      console.log("[USERS] Loaded", Object.keys(allUsers).length, "users");
    })
    .catch(function(err) {
      console.warn("[USERS] Could not load all users:", err.message);
      allUsers = {};
    });
}

// ── Role checks ───────────────────────────────────────────────
function isCapoCantiere() {
  return currentUserData && currentUserData.role === "capo_cantiere";
}

function canEditTask(task) {
  if (!currentUserData) return false;
  if (isCapoCantiere()) return true;
  var assigned = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  return assigned.indexOf(currentUserData.uid) !== -1;
}

function canSeeTask(task) {
  if (!currentUserData) return false;
  if (isCapoCantiere()) return true;
  var assigned = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  // Operaio sees unassigned tasks and their own tasks
  return assigned.length === 0 || assigned.indexOf(currentUserData.uid) !== -1;
}

// ── Render user badge in header ───────────────────────────────
function renderUserBadge(userData) {
  var el = document.getElementById("user-badge");
  if (!el) return;
  if (!userData) { el.innerHTML = ""; return; }

  var roleLabel = ROLES[userData.role] || userData.role;
  el.innerHTML =
    '<span id="user-name">' + escHtml(userData.name) + '</span>' +
    '<span class="user-role role-' + userData.role + '">' + roleLabel + '</span>' +
    '<button class="signout-btn" id="btn-signout">Esci</button>';

  document.getElementById("btn-signout").addEventListener("click", function() {
    firebase.auth().signOut().then(function() {
      window.location.href = INDEX_URL;
    });
  });
}

// ── Assignment badge HTML (shown on task rows) ────────────────
function assignmentBadgeHtml(task) {
  var assigned = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  if (assigned.length === 0) return "";

  var names = assigned.map(function(uid) {
    var u = allUsers[uid];
    return u ? u.name.split(" ")[0] : uid.slice(0,6);
  });

  return '<span class="assigned-badge" title="Assegnato a: ' + escHtml(names.join(", ")) + '">' +
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10">' +
    '<circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>' +
    names.join(", ") +
    '</span>';
}

// ── Assignment picker modal body (capo only) ─────────────────
function assignmentPickerHtml(task) {
  if (!isCapoCantiere()) return "";

  var assigned = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  var options  = Object.keys(allUsers).map(function(uid) {
    var u       = allUsers[uid];
    var checked = assigned.indexOf(uid) !== -1 ? "checked" : "";
    return '<label class="assign-option">' +
      '<input type="checkbox" class="assign-checkbox" value="' + uid + '" ' + checked + '>' +
      '<span class="assign-name">' + escHtml(u.name) + '</span>' +
      '<span class="assign-role role-' + u.role + '">' + (ROLES[u.role] || u.role) + '</span>' +
      '</label>';
  }).join("");

  if (!options) return '<div class="field-group"><p style="color:var(--muted);font-size:12px">Nessun utente registrato.</p></div>';

  return '<div class="field-group">' +
    '<label class="field-label">Assegna a</label>' +
    '<div class="assign-list">' + options + '</div>' +
    '</div>';
}

// ── Read selected assignment from modal ───────────────────────
function readAssignmentFromModal() {
  var checked = document.querySelectorAll("#modal-body .assign-checkbox:checked");
  var uids    = [];
  checked.forEach(function(cb) { uids.push(cb.value); });
  return uids;
}

// ── Apply role-based visibility to rendered table ────────────
function applyRoleVisibility() {
  if (isCapoCantiere()) return; // sees everything

  // Hide tasks not assigned to current user
  document.querySelectorAll(".task-row").forEach(function(row) {
    var tid = row.dataset.taskId;
    var gid = row.dataset.groupId;
    var g   = findGroup(gid);
    if (!g) return;
    var t   = g.tasks.find(function(x) { return x.id === tid; });
    if (!t) return;
    if (!canSeeTask(t)) {
      row.style.display = "none";
    }
  });

  // Hide edit controls on tasks not assigned to current user
  document.querySelectorAll(".task-row").forEach(function(row) {
    var tid = row.dataset.taskId;
    var gid = row.dataset.groupId;
    var g   = findGroup(gid);
    if (!g) return;
    var t   = g.tasks.find(function(x) { return x.id === tid; });
    if (!t || canEditTask(t)) return;

    var actions  = row.querySelector(".row-actions");
    var statusBtn = row.querySelector(".status-btn");
    if (actions)   actions.style.display  = "none";
    if (statusBtn) statusBtn.style.pointerEvents = "none";
  });

  // Hide group management buttons for operaio
  document.querySelectorAll(".group-actions").forEach(function(el) {
    el.style.display = "none";
  });

  // Hide add-group button
  var addGroupBtn = document.getElementById("btn-add-group");
  if (addGroupBtn) addGroupBtn.style.display = "none";

  // Hide add-task buttons
  document.querySelectorAll(".add-task-row").forEach(function(row) {
    row.style.display = "none";
  });
}

// ═══════════════════════════════════════════════════════════
// USER MANAGEMENT PANEL (capo_cantiere only)
// ═══════════════════════════════════════════════════════════

function initUserPanel() {
  if (!isCapoCantiere()) return;

  // Show admin section in side menu
  var adminSection = document.getElementById("menu-admin-section");
  if (adminSection) adminSection.style.display = "block";

  // Wire user panel button in side menu
  var btn = document.getElementById("btn-user-panel");
  btn && btn.addEventListener("click", function() {
    if (typeof closeMenu === "function") closeMenu();
    openUserPanel();
  });

  // Close panel
  var closeBtn = document.getElementById("btn-close-user-panel");
  closeBtn && closeBtn.addEventListener("click", closeUserPanel);

  var panel = document.getElementById("user-panel");
  panel && panel.addEventListener("click", function(e) {
    if (e.target === panel) closeUserPanel();
  });
}

function openUserPanel() {
  var panel = document.getElementById("user-panel");
  if (!panel) return;
  panel.style.display = "flex";
  renderUserList();
}

function closeUserPanel() {
  var panel = document.getElementById("user-panel");
  if (panel) panel.style.display = "none";
}

function renderUserList() {
  var list = document.getElementById("user-list");
  if (!list) return;
  list.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">Caricamento...</div>';

  firebase.database().ref("users").once("value")
    .then(function(snap) {
      allUsers = snap.val() || {};
      rebuildUserListHtml(list);
    })
    .catch(function(err) {
      list.innerHTML = '<div style="color:var(--danger);font-size:12px">Errore: ' + err.message + '</div>';
    });
}

function rebuildUserListHtml(list) {
  var uids = Object.keys(allUsers);

  // ── User rows ──────────────────────────────────────────────
  var rows = uids.map(function(uid) {
    var u    = allUsers[uid];
    var role = u.role || "operaio";
    var isPreregistered = !u.createdAt;   // pre-added by capo, never logged in
    return '<div class="user-list-item" data-uid="' + uid + '">' +
      '<div class="user-list-info">' +
        '<span class="user-list-name">' + escHtml(u.name || u.email) +
          (isPreregistered ? ' <span class="pre-reg-badge">In attesa</span>' : '') +
        '</span>' +
        '<span class="user-list-email">' + escHtml(u.email || "") + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<select class="user-role-select" data-uid="' + uid + '">' +
          '<option value="operaio"'       + (role === "operaio"       ? " selected" : "") + '>Operaio</option>' +
          '<option value="capo_cantiere"' + (role === "capo_cantiere" ? " selected" : "") + '>Capo Cantiere</option>' +
        '</select>' +
        '<button class="icon-btn danger" style="width:20px;height:20px;font-size:11px;flex-shrink:0" ' +
          'data-action="delete-user" data-uid="' + uid + '" title="Rimuovi utente">&#x2715;</button>' +
      '</div>' +
    '</div>';
  }).join("");

  if (!rows) rows = '<div style="color:var(--muted);font-size:13px;margin-bottom:16px">Nessun utente registrato.</div>';

  // ── Add user form ──────────────────────────────────────────
  var addForm =
    '<div class="add-user-form">' +
      '<div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Aggiungi utente</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input class="field-input" id="new-user-name"  placeholder="Nome" style="flex:1;min-width:100px;font-size:13px;padding:8px 10px" />' +
        '<input class="field-input" id="new-user-email" placeholder="email@fusaroimpianti.it" type="email" style="flex:2;min-width:160px;font-size:13px;padding:8px 10px" />' +
        '<select class="user-role-select" id="new-user-role" style="flex-shrink:0">' +
          '<option value="operaio">Operaio</option>' +
          '<option value="capo_cantiere">Capo Cantiere</option>' +
        '</select>' +
        '<button class="auth-btn" id="btn-add-user" style="padding:8px 14px;font-size:12px;margin:0;flex-shrink:0;width:auto">+ Aggiungi</button>' +
      '</div>' +
      '<div class="auth-error" id="add-user-error" style="text-align:left;margin-top:6px"></div>' +
    '</div>';

  list.innerHTML = rows + addForm;

  // ── Wire role dropdowns ────────────────────────────────────
  list.querySelectorAll(".user-role-select[data-uid]").forEach(function(sel) {
    sel.addEventListener("change", function() {
      var uid     = this.dataset.uid;
      var newRole = this.value;
      firebase.database().ref("users/" + uid + "/role").set(newRole)
        .then(function() {
          if (allUsers[uid]) allUsers[uid].role = newRole;
        })
        .catch(function(err) {
          alert("Errore aggiornamento ruolo: " + err.message);
          sel.value = allUsers[uid] ? allUsers[uid].role : "operaio";
        });
    });
  });

  // ── Wire delete buttons ────────────────────────────────────
  list.querySelectorAll('[data-action="delete-user"]').forEach(function(btn) {
    btn.addEventListener("click", function() {
      var uid  = this.dataset.uid;
      var name = allUsers[uid] ? (allUsers[uid].name || allUsers[uid].email) : uid;
      if (!confirm('Rimuovere ' + name + '?')) return;
      firebase.database().ref("users/" + uid).remove()
        .then(function() {
          delete allUsers[uid];
          renderUserList();
        })
        .catch(function(err) {
          alert("Errore rimozione: " + err.message);
        });
    });
  });

  // ── Wire add user form ─────────────────────────────────────
  document.getElementById("btn-add-user").addEventListener("click", function() {
    var name  = (document.getElementById("new-user-name").value  || "").trim();
    var email = (document.getElementById("new-user-email").value || "").trim().toLowerCase();
    var role  = document.getElementById("new-user-role").value;
    var errEl = document.getElementById("add-user-error");
    errEl.textContent = "";

    if (!name)  { errEl.textContent = "Inserisci il nome.";  return; }
    if (!email) { errEl.textContent = "Inserisci l'email.";  return; }
    if (!email.endsWith("@fusaroimpianti.it")) {
      errEl.textContent = "Email deve essere @fusaroimpianti.it";
      return;
    }

    // Check if email already exists
    var existingUid = Object.keys(allUsers).find(function(uid) {
      return allUsers[uid].email === email;
    });
    if (existingUid) {
      errEl.textContent = "Utente con questa email già registrato.";
      return;
    }

    // Use email as a stable key (sanitised) since we don't have their UID yet
    // When they first log in, registerUser() in index-auth.js will use their real UID.
    // We store the record keyed by a placeholder; on login we match by email.
    var placeholderKey = "pre_" + email.replace(/[.@]/g, "_");

    var record = {
      uid:    placeholderKey,
      email:  email,
      name:   name,
      role:   role,
      preRegistered: true
    };

    firebase.database().ref("users/" + placeholderKey).set(record)
      .then(function() {
        allUsers[placeholderKey] = record;
        document.getElementById("new-user-name").value  = "";
        document.getElementById("new-user-email").value = "";
        rebuildUserListHtml(list);
      })
      .catch(function(err) {
        errEl.textContent = "Errore: " + err.message;
      });
  });

  // Allow Enter on email field
  document.getElementById("new-user-email").addEventListener("keydown", function(e) {
    if (e.key === "Enter") document.getElementById("btn-add-user").click();
  });
}
