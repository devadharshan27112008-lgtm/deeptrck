// ==========================================================
// DEEPTRCK — app.js
// Phase 1: Foundation (auth, track select, navigation shell)
// Uses the existing DeepTrck Firebase project (carried over
// from the old build) — Web SDK 11.6.0, loaded from CDN.
// ==========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// ---------- Firebase config (carried over from the old DeepTrck project) ----------
const firebaseConfig = {
  apiKey: "AIzaSyDIAWe9kFYm6KoY5sy5e6Kd8HexN7Fzi84",
  authDomain: "deeptrck.firebaseapp.com",
  projectId: "deeptrck",
  storageBucket: "deeptrck.firebasestorage.app",
  messagingSenderId: "226593088738",
  appId: "1:226593088738:web:7baabd0c028a63d4eeaabb",
  measurementId: "G-7KNNPYSWJE"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ---------- Nav definitions per track (Section 2 of the blueprint) ----------
const NAV = {
  school: [
    { key: "home",     label: "Home",     icon: "🏠" },
    { key: "courses",  label: "Courses",  icon: "📚" },
    { key: "tasks",    label: "Tasks",    icon: "✅" },
    { key: "focus",    label: "Focus",    icon: "⏱" },
    { key: "progress", label: "Progress", icon: "📈" },
    { key: "rewards",  label: "Rewards",  icon: "◆" },
    { key: "profile",  label: "Profile",  icon: "👤" }
  ],
  college: [
    { key: "home",     label: "Home",     icon: "🏠" },
    { key: "courses",  label: "Courses",  icon: "📚" },
    { key: "tasks",    label: "Tasks",    icon: "✅" },
    { key: "focus",    label: "Focus",    icon: "⏱" },
    { key: "progress", label: "Progress", icon: "📈" },
    { key: "rewards",  label: "Rewards",  icon: "◆" },
    { key: "profile",  label: "Profile",  icon: "👤" }
  ]
};

// Mobile bottom nav shows a trimmed set (Home, Courses, Tasks, Focus, Profile)
// per the "four taps" UX rule — Progress/Rewards stay one tap away via Profile on small screens.
const BOTTOMNAV_KEYS = ["home", "courses", "tasks", "focus", "profile"];

// ---------- State ----------
let currentUser = null;
let currentProfile = null; // { name, track, xp, credits, streak, ... }

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $all = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(id) {
  $all(".screen").forEach((el) => el.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  $("#shell").classList.add("hidden");
}

function showShell() {
  $all(".screen").forEach((el) => el.classList.remove("active"));
  $("#shell").classList.remove("hidden");
}

function toast(message, type = "") {
  const el = $("#toast");
  el.textContent = message;
  el.className = "toast" + (type ? " is-" + type : "");
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3200);
}

function setError(id, message) {
  const el = document.getElementById(id);
  if (!message) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = message;
}

// Turn raw Firebase error codes into plain, direct messages (interface voice, no apologies).
function friendlyAuthError(err) {
  const code = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "That password doesn't match this account.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account already exists with that email. Try logging in instead.",
    "auth/weak-password": "Password needs to be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error — check your connection and try again."
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ==========================================================
// AUTH SCREEN
// ==========================================================
function initAuthScreen() {
  const toggleBtns = $all(".auth-toggle-btn");
  const loginForm = $("#form-login");
  const signupForm = $("#form-signup");

  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const mode = btn.dataset.authMode;
      loginForm.hidden = mode !== "login";
      signupForm.hidden = mode !== "signup";
      setError("login-error", "");
      setError("signup-error", "");
    });
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("login-error", "");
    const submitBtn = loginForm.querySelector("button[type=submit]");
    const fd = new FormData(loginForm);
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in…";
    try {
      await signInWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
      // onAuthStateChanged takes over from here
    } catch (err) {
      setError("login-error", friendlyAuthError(err));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log in";
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("signup-error", "");
    const submitBtn = signupForm.querySelector("button[type=submit]");
    const fd = new FormData(signupForm);
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account…";
    try {
      const cred = await createUserWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
      await updateProfile(cred.user, { displayName: fd.get("name") });
      await setDoc(doc(db, "users", cred.user.uid, "profile", "main"), {
        name: fd.get("name"),
        email: fd.get("email"),
        track: null,
        xp: 0,
        credits: 0,
        streak: 0,
        createdAt: serverTimestamp()
      });
      // onAuthStateChanged takes over from here
    } catch (err) {
      setError("signup-error", friendlyAuthError(err));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
    }
  });
}

// ==========================================================
// TRACK SELECT SCREEN
// ==========================================================
function initTrackScreen() {
  $all(".track-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const track = card.dataset.track;
      $all(".track-card").forEach((c) => c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      setError("track-error", "");
      try {
        await setDoc(
          doc(db, "users", currentUser.uid, "profile", "main"),
          { track },
          { merge: true }
        );
        currentProfile.track = track;
        enterApp();
      } catch (err) {
        setError("track-error", "Couldn't save your track. Check your connection and try again.");
      }
    });
  });
}

// ==========================================================
// APP SHELL (nav rendering + tab switching)
// ==========================================================
function buildNav() {
  const track = currentProfile.track === "college" ? "college" : "school";
  const items = NAV[track];

  const sidenav = $("#sidenav-links");
  sidenav.innerHTML = "";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "nav-link";
    btn.dataset.nav = item.key;
    btn.innerHTML = `<span class="nav-link-icon">${item.icon}</span><span>${item.label}</span>`;
    btn.addEventListener("click", () => goToTab(item.key));
    sidenav.appendChild(btn);
  });

  const bottomnav = $("#bottomnav");
  bottomnav.innerHTML = "";
  items
    .filter((i) => BOTTOMNAV_KEYS.includes(i.key))
    .forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "bn-link";
      btn.dataset.nav = item.key;
      btn.innerHTML = `<span class="bn-link-icon">${item.icon}</span><span>${item.label}</span>`;
      btn.addEventListener("click", () => goToTab(item.key));
      bottomnav.appendChild(btn);
    });

  // Also wire any [data-nav] shortcuts inside tab content (e.g. quick actions)
  $all("[data-nav]").forEach((el) => {
    if (el.classList.contains("nav-link") || el.classList.contains("bn-link")) return;
    el.addEventListener("click", () => goToTab(el.dataset.nav));
  });
}

const TAB_TITLES = {
  home:     ["Home", "Here's what's on today."],
  courses:  ["Courses", "Your long-term learning, broken into daily steps."],
  tasks:    ["Tasks", "Homework, assignments, and to-dos."],
  focus:    ["Focus", "Timed study sessions."],
  progress: ["Progress", "How your learning is trending."],
  rewards:  ["Rewards", "Spend Credits you've earned."],
  profile:  ["Profile", "Your account and settings."]
};

function goToTab(key) {
  $all(".tab").forEach((el) => el.classList.remove("active"));
  const tabEl = document.getElementById("tab-" + key);
  if (tabEl) tabEl.classList.add("active");

  $all(".nav-link, .bn-link").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.nav === key);
  });

  const [title, sub] = TAB_TITLES[key] || [key, ""];
  $("#topbar-heading").textContent = title;
  $("#topbar-sub").textContent = sub;
}

function renderTopStats() {
  $("#stat-streak").textContent = currentProfile.streak ?? 0;
  $("#stat-xp").textContent = currentProfile.xp ?? 0;
  $("#stat-credits").textContent = currentProfile.credits ?? 0;
}

function renderProfileTab() {
  const name = currentProfile.name || "Student";
  $("#profile-avatar").textContent = name.trim().charAt(0).toUpperCase() || "S";
  $("#profile-name").textContent = name;
  $("#profile-email").textContent = currentProfile.email || currentUser.email || "";
  $("#profile-track").textContent = currentProfile.track === "college" ? "College Mode" : "School Mode";
}

function renderTodayDate() {
  const el = $("#today-date");
  if (!el) return;
  el.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric"
  });
}

function enterApp() {
  buildNav();
  renderTopStats();
  renderProfileTab();
  renderTodayDate();
  goToTab("home");
  showShell();
}

// ==========================================================
// LOGOUT
// ==========================================================
function wireLogout() {
  const doLogout = async () => {
    try {
      await signOut(auth);
      toast("Logged out");
    } catch (err) {
      toast("Couldn't log out. Try again.", "error");
    }
  };
  $("#btn-logout").addEventListener("click", doLogout);
  $("#btn-logout-2").addEventListener("click", doLogout);
}

function wireProfileActions() {
  $("#btn-switch-track").addEventListener("click", () => {
    $all(".track-card").forEach((c) =>
      c.classList.toggle("is-selected", c.dataset.track === currentProfile.track)
    );
    showScreen("screen-track");
  });
}

// ==========================================================
// AUTH STATE — the single source of truth for which screen shows
// ==========================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    currentProfile = null;
    showScreen("screen-auth");
    return;
  }

  currentUser = user;

  try {
    const snap = await getDoc(doc(db, "users", user.uid, "profile", "main"));
    if (snap.exists()) {
      currentProfile = snap.data();
    } else {
      // Safety net: profile doc missing (e.g. older account) — create a minimal one.
      currentProfile = { name: user.displayName || "Student", email: user.email, track: null, xp: 0, credits: 0, streak: 0 };
      await setDoc(doc(db, "users", user.uid, "profile", "main"), currentProfile, { merge: true });
    }
  } catch (err) {
    toast("Couldn't load your profile. Check your connection.", "error");
    return;
  }

  if (!currentProfile.track) {
    showScreen("screen-track");
  } else {
    enterApp();
  }
});

// ==========================================================
// INIT
// ==========================================================
initAuthScreen();
initTrackScreen();
wireLogout();
wireProfileActions();
