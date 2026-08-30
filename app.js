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
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
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
    { key: "home", label: "Home", icon: "🏠" },
    { key: "courses", label: "Courses", icon: "📚" },
    { key: "tasks", label: "Tasks", icon: "✅" },
    { key: "focus", label: "Focus", icon: "⏱" },
    { key: "profile", label: "Profile", icon: "👤" }
  ],
  college: [
    { key: "home", label: "Home", icon: "🏠" },
    { key: "courses", label: "Courses", icon: "📚" },
    { key: "tasks", label: "Tasks", icon: "✅" },
    { key: "focus", label: "Focus", icon: "⏱" },
    { key: "profile", label: "Profile", icon: "👤" }
  ]
};

// Mobile bottom nav shows a trimmed set (Home, Courses, Tasks, Focus, Profile)
// per the "four taps" UX rule — Progress/Rewards stay one tap away via Profile on small screens.
const BOTTOMNAV_KEYS = ["home", "courses", "tasks", "focus", "profile"];

// ---------- State ----------
let currentUser = null;
let currentProfile = null; // { name, track, xp, credits, streak, ... }
let courses = [];          // loaded from users/{uid}/courses
let tasks = [];             // loaded from users/{uid}/tasks
let currentTaskFilter = "today";
let ownedRewardIds = new Set(); // loaded from users/{uid}/rewards
let ledgerEntries = [];         // loaded from users/{uid}/ledger
let focusSessions = [];         // loaded from users/{uid}/focusSessions
let selectedWeekdays = new Set(); // for the create-course form
let activeDrawerCourseId = null;

// Focus timer runtime state (not persisted — resets on reload, kept lite on purpose)
let focusMode = "pomodoro";
let focusMinutes = 25;
let focusRemainingSeconds = 25 * 60;
let focusElapsedSeconds = 0;
let focusRunning = false;
let focusIntervalId = null;
const FOCUS_RING_CIRCUMFERENCE = 2 * Math.PI * 88;

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_LABEL = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
const WEEKDAY_SHORT = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

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
      toggleBtns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
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
        lastActivityDate: null,
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
// GAMIFICATION — XP, Credits, Streak, Level (Phase 4)
// ==========================================================

// Fixed reward table (mirrors the blueprint's Credit System section).
const REWARDS = {
  courseDay: { credits: 10 },
  courseBonus: { credits: 100 }, // one-time on reaching 100%
  focusSession: { credits: 5 },
  task: {
    low: { credits: 5 },
    medium: { credits: 10 },
    high: { credits: 15 }
  }
};
const FOCUS_MIN_QUALIFYING_SECONDS = 300; // 5 min minimum before a session earns Credits

function clampZero(n) {
  return Math.max(0, n);
}

function bumpStreak() {
  const today = dateToStr(new Date());
  if (currentProfile.lastActivityDate === today) return; // already counted today

  const yesterday = dateToStr(new Date(Date.now() - 86400000));
  currentProfile.streak = currentProfile.lastActivityDate === yesterday
    ? (currentProfile.streak || 0) + 1
    : 1;
  currentProfile.lastActivityDate = today;
}

function grantReward(credits, label) {
  currentProfile.credits = clampZero((currentProfile.credits || 0) + credits);
  bumpStreak();
  if (credits) logLedgerEntry(credits, label);
}

function revokeReward(credits, label) {
  currentProfile.credits = clampZero((currentProfile.credits || 0) - credits);
  if (credits) logLedgerEntry(-credits, "Undo: " + label);
}

// Auditable, append-only earning/spending history (blueprint's CreditLedger entity).
function logLedgerEntry(amount, label) {
  const entry = { amount, label, timestamp: new Date().toISOString() };
  ledgerEntries.unshift(entry);
  renderLedger();
  const newDoc = doc(collection(db, "users", currentUser.uid, "ledger"));
  setDoc(newDoc, { amount, label, timestamp: serverTimestamp() }).catch(() => {
    /* non-critical — history entry will simply be missing on next load */
  });
}

async function saveProfile() {
  renderTopStats();
  renderProfileTab();
  renderRewardGrid();
  try {
    await updateDoc(doc(db, "users", currentUser.uid, "profile", "main"), {
      xp: currentProfile.xp,
      credits: currentProfile.credits,
      streak: currentProfile.streak,
      lastActivityDate: currentProfile.lastActivityDate
    });
  } catch (err) {
    toast("Progress saved locally — will sync once you're back online.", "error");
  }
}

// ==========================================================
// COURSES — Phase 2
// ==========================================================

function coursesCol() {
  return collection(db, "users", currentUser.uid, "courses");
}

function toDateOnly(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function strToDate(s) {
  // s = "YYYY-MM-DD" -> local date, avoids UTC off-by-one
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Build the Mon..Sun scheduled-day list between startDate and endDate (inclusive),
// keeping only the chosen weekdays. Rest days are simply never created.
function generateSchedule(startStr, endStr, studyDays, targetLines) {
  const start = toDateOnly(strToDate(startStr));
  const end = toDateOnly(strToDate(endStr));
  const today = toDateOnly(new Date());
  const days = [];
  let cursor = new Date(start);
  let scheduledIndex = 0;

  while (cursor <= end) {
    const wk = WEEKDAY_ORDER[cursor.getDay()];
    if (studyDays.has(wk)) {
      const target = (targetLines[scheduledIndex] && targetLines[scheduledIndex].trim())
        ? targetLines[scheduledIndex].trim()
        : `Day ${scheduledIndex + 1} session`;

      const dateStr = dateToStr(cursor);
      let status;
      if (dateStr === dateToStr(today)) status = "today";
      else if (cursor < today) status = "missed"; // no completion yet -> missed until checked
      else status = "upcoming";

      days.push({
        id: `d${scheduledIndex}_${dateStr}`,
        date: dateStr,
        weekday: wk,
        target,
        status,
        completedAt: null
      });
      scheduledIndex++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function courseProgress(course) {
  const total = course.days.length;
  if (!total) return 0;
  const completed = course.days.filter((d) => d.status === "completed").length;
  return Math.round((completed / total) * 100);
}

async function loadCourses() {
  const snap = await getDocs(coursesCol());
  courses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCourseGrid();
  renderHomeToday();
  renderContinueLearning();
  renderTrackMetrics();
}

let currentCourseCategoryFilter = "all";

function getFilteredCourses() {
  if (!currentProfile) return [];
  const currentTrack = currentProfile.track === "college" ? "college" : "school";
  return courses.filter((c) => {
    const courseTrack = c.track || (currentProfile ? currentProfile.track : "school");
    if (courseTrack !== currentTrack) return false;

    if (currentTrack === "college" && currentCourseCategoryFilter !== "all") {
      if (currentCourseCategoryFilter === "academic") {
        return c.enrollmentType !== "online";
      } else if (currentCourseCategoryFilter === "online") {
        return c.enrollmentType === "online";
      }
    }
    return true;
  });
}

function renderCourseGrid() {
  const grid = $("#course-grid");
  const empty = $("#courses-empty");
  const filtered = getFilteredCourses();

  if (!filtered.length) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.hidden = false;
  grid.innerHTML = "";

  filtered.forEach((course) => {
    const pct = courseProgress(course);
    const completedCount = course.days.filter((d) => d.status === "completed").length;
    const isComplete = pct >= 100;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "course-card";
    card.addEventListener("click", () => openCourseDrawer(course.id));

    const strip = course.days.slice(0, 42).map((d) => {
      const cls = d.status === "completed" ? "is-completed"
        : d.status === "today" ? "is-today"
          : d.status === "missed" ? "is-missed"
            : "is-upcoming";
      return `<span class="day-chip ${cls}"></span>`;
    }).join("");

    let badgeHtml = "";
    if (course.enrollmentType === "online") {
      const plat = (course.platform || "Online").toLowerCase();
      badgeHtml = `<span class="badge-tag badge-${plat.includes('nptel') ? 'nptel' : plat.includes('coursera') ? 'coursera' : 'online'}">${escapeHtml(course.platform || "Online")}</span>`;
    } else if (course.courseCode) {
      badgeHtml = `<span class="badge-tag badge-semester">${escapeHtml(course.courseCode)}</span>`;
    }

    card.innerHTML = `
      <div class="course-card-top">
        <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
          <span class="course-card-title">${escapeHtml(course.title)}</span>
          ${badgeHtml}
        </div>
        <span class="course-card-badge ${isComplete ? "is-complete" : ""}">${isComplete ? "Complete" : pct + "%"}</span>
      </div>
      <div class="course-progress-bar"><div class="course-progress-fill" style="width:${pct}%"></div></div>
      <div class="day-strip">${strip}</div>
      <div class="course-card-meta">
        <span><strong>${completedCount}</strong> / ${course.days.length} days</span>
        <span>${escapeHtml(WEEKDAY_LABEL[course.days.find(d => d.status !== "completed")?.weekday] || "")}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Create course modal ----------
function initCourseModal() {
  const overlay = $("#modal-course");
  const form = $("#form-course");

  const open = () => {
    form.reset();
    selectedWeekdays = new Set(["mon", "tue", "wed", "thu", "fri"]);
    syncWeekdayChips();
    setError("course-error", "");
    overlay.hidden = false;
  };
  const close = () => { overlay.hidden = true; };

  $("#btn-new-course").addEventListener("click", open);
  $("#btn-new-course-empty").addEventListener("click", open);
  $("#btn-add-course-empty").addEventListener("click", open);
  $("#modal-course-close").addEventListener("click", close);
  $("#modal-course-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  $all(".weekday-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const day = chip.dataset.day;
      if (selectedWeekdays.has(day)) selectedWeekdays.delete(day);
      else selectedWeekdays.add(day);
      syncWeekdayChips();
    });
  });

  $all("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      if (preset === "weekdays") selectedWeekdays = new Set(["mon", "tue", "wed", "thu", "fri"]);
      if (preset === "mon-sat") selectedWeekdays = new Set(["mon", "tue", "wed", "thu", "fri", "sat"]);
      if (preset === "all") selectedWeekdays = new Set(WEEKDAY_ORDER);
      syncWeekdayChips();
    });
  });

  const typeSel = $("#course-enrollment-type");
  if (typeSel) {
    typeSel.addEventListener("change", () => {
      const isOnline = typeSel.value === "online";
      const onlineFields = $("#subfields-online");
      if (onlineFields) onlineFields.hidden = !isOnline;
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("course-error", "");

    const fd = new FormData(form);
    const title = (fd.get("title") || "").trim();
    if (!title) {
      setError("course-error", "Course name cannot be empty.");
      return;
    }

    const currentTrack = currentProfile?.track || "school";
    const isDuplicate = courses.some((c) => (c.track || "school") === currentTrack && c.title.toLowerCase() === title.toLowerCase());
    if (isDuplicate) {
      setError("course-error", "A course with this name already exists.");
      return;
    }

    if (!selectedWeekdays.size) {
      setError("course-error", "Pick at least one study day.");
      return;
    }

    const startDate = fd.get("startDate");
    const endDate = fd.get("endDate");

    if (strToDate(endDate) < strToDate(startDate)) {
      setError("course-error", "End date needs to be on or after start date.");
      return;
    }

    const targetLines = (fd.get("targets") || "").split("\n").filter((l) => l.trim().length);
    const days = generateSchedule(startDate, endDate, selectedWeekdays, targetLines);

    if (!days.length) {
      setError("course-error", "No scheduled days fall in that date range with those study days.");
      return;
    }

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating…";

    try {
      const newDoc = doc(coursesCol());
      const courseData = {
        title,
        track: currentProfile?.track || "school",
        description: (fd.get("description") || "").trim(),
        enrollmentType: fd.get("enrollmentType") || "academic",
        platform: fd.get("platform") || "Coursera",
        platformUrl: (fd.get("platformUrl") || "").trim(),
        courseCode: (fd.get("courseCode") || "").trim(),
        creditHours: parseFloat(fd.get("creditHours") || "3.0") || 3.0,
        instructor: (fd.get("instructor") || "").trim(),
        subjectCategory: fd.get("subjectCategory") || "General",
        teacherName: (fd.get("teacherName") || "").trim(),
        startDate,
        endDate,
        studyDays: Array.from(selectedWeekdays),
        days,
        status: "active",
        createdAt: serverTimestamp()
      };
      await setDoc(newDoc, courseData);
      courses.unshift({ id: newDoc.id, ...courseData });
      renderCourseGrid();
      renderHomeToday();
      renderContinueLearning();
      renderTrackMetrics();
      $("#modal-course").hidden = true;
      toast("Course created", "success");
    } catch (err) {
      setError("course-error", "Couldn't create the course. Check your connection and try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create course";
    }
  });
}

function syncWeekdayChips() {
  $all(".weekday-chip").forEach((chip) => {
    const selected = selectedWeekdays.has(chip.dataset.day);
    chip.classList.toggle("is-selected", selected);
    chip.setAttribute("aria-pressed", String(selected));
  });
}

// ---------- Course detail drawer ----------
function initCourseDrawer() {
  const overlay = $("#drawer-course");
  $("#drawer-back").addEventListener("click", () => { overlay.hidden = true; activeDrawerCourseId = null; });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.hidden = true; activeDrawerCourseId = null; } });

  $all(".drawer-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $all(".drawer-tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const key = btn.dataset.drawerTab;
      ["overview", "schedule", "resources"].forEach((k) => {
        $("#drawer-" + k).hidden = k !== key;
      });
    });
  });

  $("#btn-delete-course").addEventListener("click", async () => {
    if (!activeDrawerCourseId) return;
    if (!confirm("Delete this course? This can't be undone.")) return;
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "courses", activeDrawerCourseId));
      courses = courses.filter((c) => c.id !== activeDrawerCourseId);
      $("#drawer-course").hidden = true;
      activeDrawerCourseId = null;
      renderCourseGrid();
      renderHomeToday();
      renderContinueLearning();
      renderProgressCourseList();
      renderTrackMetrics();
      toast("Course deleted");
    } catch (err) {
      toast("Couldn't delete the course. Try again.", "error");
    }
  });
}

function openCourseDrawer(courseId) {
  activeDrawerCourseId = courseId;
  renderDrawer();
  $("#drawer-course").hidden = false;
  // reset to Overview tab each time it opens
  $all(".drawer-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.drawerTab === "overview"));
  $("#drawer-overview").hidden = false;
  $("#drawer-schedule").hidden = true;
  $("#drawer-resources").hidden = true;
}

function renderDrawer() {
  const course = courses.find((c) => c.id === activeDrawerCourseId);
  if (!course) return;

  const pct = courseProgress(course);
  const completedCount = course.days.filter((d) => d.status === "completed").length;

  $("#drawer-course-title").textContent = course.title;
  $("#drawer-course-sub").textContent = course.description || `${course.startDate} → ${course.endDate}`;
  $("#drawer-progress-fill").style.width = pct + "%";
  $("#drawer-progress-label").textContent = pct + "%";
  $("#drawer-overview-desc").textContent = course.description || "No description added.";
  $("#drawer-stat-completed").textContent = completedCount;
  $("#drawer-stat-total").textContent = course.days.length;
  $("#drawer-stat-status").textContent = pct >= 100 ? "Done" : "Active";

  const list = $("#schedule-list");
  list.innerHTML = "";
  let lastWeekLabel = "";
  course.days.forEach((day, idx) => {
    const weekLabel = `Week ${Math.floor(idx / 7) + 1}`;
    if (weekLabel !== lastWeekLabel) {
      const h = document.createElement("div");
      h.className = "schedule-week-label";
      h.textContent = weekLabel;
      list.appendChild(h);
      lastWeekLabel = weekLabel;
    }

    const row = document.createElement("div");
    row.className = "schedule-row" + (day.status === "today" ? " is-today" : "") + (day.status === "missed" ? " is-missed" : "");

    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.className = "schedule-checkbox" + (day.status === "completed" ? " is-checked" : "");
    checkbox.textContent = day.status === "completed" ? "✓" : "";
    checkbox.setAttribute("role", "checkbox");
    checkbox.setAttribute("aria-checked", String(day.status === "completed"));
    checkbox.setAttribute("aria-label", `Mark ${WEEKDAY_LABEL[day.weekday]} — ${day.target} as ${day.status === "completed" ? "not done" : "done"}`);
    checkbox.addEventListener("click", () => toggleDayCompletion(course.id, day.id));

    const main = document.createElement("div");
    main.className = "schedule-row-main";
    main.innerHTML = `
      <div class="schedule-row-day">${WEEKDAY_LABEL[day.weekday]} · ${formatShortDate(day.date)}</div>
      <div class="schedule-row-target">${escapeHtml(day.target)}</div>
    `;

    const statusEl = document.createElement("span");
    statusEl.className = "schedule-row-status status-" + day.status;
    statusEl.textContent = day.status;

    row.appendChild(checkbox);
    row.appendChild(main);
    row.appendChild(statusEl);
    list.appendChild(row);
  });
}

function formatShortDate(dateStr) {
  return strToDate(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Idempotent toggle: completing an already-completed day does nothing extra;
// unchecking reverts it to upcoming/missed based on today's date and refunds
// exactly the XP/Credits that were awarded for it (never a re-roll of amounts).
async function toggleDayCompletion(courseId, dayId) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return;
  const day = course.days.find((d) => d.id === dayId);
  if (!day) return;

  const today = toDateOnly(new Date());
  const dayDate = toDateOnly(strToDate(day.date));
  const wasComplete = day.status === "completed";

  if (wasComplete) {
    day.status = dateToStr(dayDate) === dateToStr(today) ? "today" : (dayDate < today ? "missed" : "upcoming");
    day.completedAt = null;
    const prevCredits = day.creditsAwarded || REWARDS.courseDay.credits;
    revokeReward(prevCredits, `${course.title} / ${WEEKDAY_LABEL[day.weekday]}`);
    day.creditsAwarded = 0;
    if (course.status === "completed") course.status = "active";
  } else {
    day.status = "completed";
    day.completedAt = new Date().toISOString();
    day.creditsAwarded = REWARDS.courseDay.credits;
    grantReward(day.creditsAwarded, `Completed ${course.title} / ${WEEKDAY_LABEL[day.weekday]}`);

    const pctNow = courseProgress(course);
    if (pctNow >= 100 && !course.completionBonusAwarded) {
      course.completionBonusAwarded = true;
      course.status = "completed";
      grantReward(REWARDS.courseBonus.credits, `Course completed: ${course.title}`);
      toast(`Course complete! +${REWARDS.courseBonus.credits} Credits`, "success");
    } else {
      toast(`+${day.creditsAwarded} Credits`, "success");
    }
  }

  renderDrawer();
  renderCourseGrid();
  renderHomeToday();
  renderContinueLearning();
  saveProfile();

  try {
    await updateDoc(doc(db, "users", currentUser.uid, "courses", courseId), {
      days: course.days,
      status: course.status,
      completionBonusAwarded: course.completionBonusAwarded || false
    });
  } catch (err) {
    toast("Couldn't save that — check your connection.", "error");
  }
}

  // ==========================================================
  // TASKS — Phase 3
  // ==========================================================

  function tasksCol() {
    return collection(db, "users", currentUser.uid, "tasks");
  }

  async function loadTasks() {
    const snap = await getDocs(tasksCol());
    tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTasksList(currentTaskFilter);
    renderHomeToday();
  }

  function taskBucket(task) {
    if (task.status === "completed") return "completed";
    if (!task.dueDate) return "upcoming";
    const due = toDateOnly(strToDate(task.dueDate));
    const today = toDateOnly(new Date());
    if (due.getTime() === today.getTime()) return "today";
    if (due < today) return "overdue";
    return "upcoming";
  }

  function renderTasksList(filter) {
    currentTaskFilter = filter;
    const list = $("#task-list");
    const empty = $("#task-empty");
    const filtered = tasks
      .filter((t) => taskBucket(t) === filter)
      .sort((a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99"));

    list.innerHTML = "";
    if (!filtered.length) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;

    filtered.forEach((task) => {
      const bucket = taskBucket(task);
      const course = courses.find((c) => c.id === task.courseId);

      const row = document.createElement("div");
      row.className = "task-row" + (bucket === "overdue" ? " is-overdue" : "");

      const checkbox = document.createElement("button");
      checkbox.type = "button";
      checkbox.className = "task-checkbox" + (task.status === "completed" ? " is-checked" : "");
      checkbox.textContent = task.status === "completed" ? "✓" : "";
      checkbox.setAttribute("role", "checkbox");
      checkbox.setAttribute("aria-checked", String(task.status === "completed"));
      checkbox.setAttribute("aria-label", `Mark task "${task.title}" as ${task.status === "completed" ? "not done" : "done"}`);
      checkbox.addEventListener("click", () => toggleTaskComplete(task.id));

      const main = document.createElement("div");
      main.className = "task-row-main";
      main.innerHTML = `
      <div class="task-row-title ${task.status === "completed" ? "is-done" : ""}">${escapeHtml(task.title)}</div>
      <div class="task-row-meta">
        ${task.dueDate ? `<span class="task-row-due ${bucket === "overdue" ? "is-overdue" : ""}">${formatShortDate(task.dueDate)}</span>` : ""}
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        ${course ? `<span class="task-course-tag">${escapeHtml(course.title)}</span>` : ""}
      </div>
    `;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "task-row-delete";
      del.innerHTML = "✕";
      del.setAttribute("aria-label", "Delete task");
      del.addEventListener("click", () => deleteTask(task.id));

      row.appendChild(checkbox);
      row.appendChild(main);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  function initTaskFilters() {
    $all(".task-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        $all(".task-filter").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        renderTasksList(btn.dataset.filter);
      });
    });
  }

  async function toggleTaskComplete(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const isCompleted = task.status !== "completed";

    if (isCompleted) {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
      const reward = REWARDS.task[task.priority] || REWARDS.task.medium;
      task.creditsAwarded = reward.credits;
      grantReward(task.creditsAwarded, `Completed ${task.title}`);
      toast(`+${task.creditsAwarded} Credits`, "success");
    } else {
      task.status = "pending";
      task.completedAt = null;
      const prevCredits = task.creditsAwarded || (REWARDS.task[task.priority] || REWARDS.task.medium).credits;
      revokeReward(prevCredits, task.title);
      task.creditsAwarded = 0;
    }

    renderTasksList(currentTaskFilter);
    renderHomeToday();
    saveProfile();

    try {
      await updateDoc(doc(db, "users", currentUser.uid, "tasks", taskId), {
        status: task.status,
        completedAt: task.completedAt || null,
        xpAwarded: task.xpAwarded || 0,
        creditsAwarded: task.creditsAwarded || 0
      });
    } catch (err) {
      toast("Couldn't save that — check your connection.", "error");
    }
  }

  async function deleteTask(taskId) {
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "tasks", taskId));
      tasks = tasks.filter((t) => t.id !== taskId);
      renderTasksList(currentTaskFilter);
      renderHomeToday();
    } catch (err) {
      toast("Couldn't delete the task. Try again.", "error");
    }
  }

  function populateTaskCourseSelect() {
    const sel = $("#task-course-select");
    sel.innerHTML = `<option value="">No course</option>`;
    courses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.title;
      sel.appendChild(opt);
    });
  }

  function initTaskModal() {
    const overlay = $("#modal-task");
    const form = $("#form-task");

    const open = () => {
      form.reset();
      populateTaskCourseSelect();
      setError("task-error", "");
      overlay.hidden = false;
    };
    const close = () => { overlay.hidden = true; };

    $("#btn-new-task").addEventListener("click", open);
    $("#modal-task-close").addEventListener("click", close);
    $("#modal-task-cancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("task-error", "");
      const fd = new FormData(form);
      const title = (fd.get("title") || "").trim();
      if (!title) {
        setError("task-error", "Task title cannot be empty.");
        return;
      }

      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      submitBtn.textContent = "Adding…";
      try {
        const newDoc = doc(tasksCol());
        const taskData = {
          title,
          dueDate: fd.get("dueDate") || null,
          priority: fd.get("priority"),
          courseId: fd.get("courseId") || null,
          status: "pending",
          createdAt: serverTimestamp()
        };
        await setDoc(newDoc, taskData);
        tasks.unshift({ id: newDoc.id, ...taskData });
        renderTasksList(currentTaskFilter);
        renderHomeToday();
        overlay.hidden = true;
        toast("Task added", "success");
      } catch (err) {
        setError("task-error", "Couldn't add the task. Check your connection and try again.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Add task";
      }
    });
  }

  // ==========================================================
  // HOME — Today panel + Continue learning (Phase 3)
  // ==========================================================

  function renderHomeToday() {
    const listEl = $("#today-list");
    const emptyEl = $("#today-empty");
    if (!listEl || !emptyEl) return; // Home not in DOM yet

    const todayStr = dateToStr(new Date());
    const items = [];
    const activeTrackCourses = getFilteredCourses();

    activeTrackCourses.forEach((course) => {
      const day = course.days.find((d) => d.date === todayStr);
      if (day) {
        items.push({
          type: "course",
          courseId: course.id,
          dayId: day.id,
          title: course.title,
          sub: day.target,
          done: day.status === "completed"
        });
      }
    });

    tasks.forEach((task) => {
      if (task.dueDate === todayStr) {
        items.push({
          type: "task",
          taskId: task.id,
          title: task.title,
          sub: task.priority.charAt(0).toUpperCase() + task.priority.slice(1) + " priority",
          done: task.status === "completed"
        });
      }
    });

    if (!items.length) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;
    listEl.innerHTML = "";

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "today-item";

      const check = document.createElement("button");
      check.type = "button";
      check.className = "today-check" + (item.done ? " is-checked" : "");
      check.textContent = item.done ? "✓" : "";
      check.setAttribute("role", "checkbox");
      check.setAttribute("aria-checked", String(item.done));
      check.setAttribute("aria-label", `Mark "${item.title}" as ${item.done ? "not done" : "done"}`);
      check.addEventListener("click", () => {
        if (item.type === "course") toggleDayCompletion(item.courseId, item.dayId);
        else toggleTaskComplete(item.taskId);
      });

      const main = document.createElement("button");
      main.type = "button";
      main.className = "today-item-main";
      main.innerHTML = `
      <div class="today-item-title ${item.done ? "is-done" : ""}">${escapeHtml(item.title)}</div>
      <div class="today-item-sub">${escapeHtml(item.sub)}</div>
    `;
      main.addEventListener("click", () => {
        if (item.type === "course") openCourseDrawer(item.courseId);
        else goToTab("tasks");
      });

      const tag = document.createElement("span");
      tag.className = "today-item-tag " + (item.type === "course" ? "tag-course" : "tag-task");
      tag.textContent = item.type === "course" ? "Course" : "Task";

      row.appendChild(check);
      row.appendChild(main);
      row.appendChild(tag);
      listEl.appendChild(row);
    });
  }

  function renderContinueLearning() {
    const listEl = $("#continue-list");
    const emptyEl = $("#continue-empty");
    if (!listEl || !emptyEl) return;

    const active = getFilteredCourses().filter((c) => courseProgress(c) < 100);
    if (!active.length) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;
    listEl.innerHTML = "";

    active.slice(0, 4).forEach((course) => {
      const pct = courseProgress(course);
      const next = course.days.find((d) => d.status === "today") || course.days.find((d) => d.status === "upcoming");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "continue-card";
      btn.addEventListener("click", () => openCourseDrawer(course.id));
      btn.innerHTML = `
      <div class="continue-card-main">
        <div class="continue-card-title">${escapeHtml(course.title)}</div>
        <div class="continue-card-sub">${next ? "Next: " + escapeHtml(next.target) : "All caught up"}</div>
      </div>
      <div class="continue-card-pct">${pct}%</div>
    `;
      listEl.appendChild(btn);
    });
  }

  // ==========================================================
  // REWARDS — Phase 5
  // ==========================================================

  // Fixed-price starter catalog, straight from the blueprint's Section 6/7 suggestion.
  const REWARD_CATALOG = [
    { id: "profile-frame", name: "Profile frame", type: "Cosmetic", price: 50, icon: "🖼️" },
    { id: "dashboard-theme", name: "Dashboard theme", type: "Cosmetic", price: 150, icon: "🎨" },
    { id: "pet-accessory", name: "Pet accessory", type: "Cosmetic", price: 100, icon: "🐾" },
    { id: "pet-skin", name: "Pet skin", type: "Cosmetic", price: 250, icon: "✨" },
    { id: "achievement-badge", name: "Special achievement badge", type: "Recognition", price: 300, icon: "🏅" }
  ];

  function rewardsCol() {
    return collection(db, "users", currentUser.uid, "rewards");
  }
  function ledgerCol() {
    return collection(db, "users", currentUser.uid, "ledger");
  }

  async function loadRewardsData() {
    try {
      const [ownedSnap, ledgerSnap] = await Promise.all([
        getDocs(rewardsCol()),
        getDocs(query(ledgerCol(), orderBy("timestamp", "desc"), limit(40)))
      ]);
      ownedRewardIds = new Set(ownedSnap.docs.map((d) => d.id));
      ledgerEntries = ledgerSnap.docs.map((d) => d.data());
    } catch (err) {
      // Ledger/rewards are supplementary — a load failure shouldn't block the rest of the app.
    }
    renderRewardGrid();
    renderLedger();
  }

  function renderRewardGrid() {
    const grid = $("#reward-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const credits = currentProfile.credits || 0;

    REWARD_CATALOG.forEach((item) => {
      const owned = ownedRewardIds.has(item.id);
      const card = document.createElement("div");
      card.className = "reward-card";
      card.innerHTML = `
      <div class="reward-card-icon">${item.icon}</div>
      <div>
        <div class="reward-card-name">${escapeHtml(item.name)}</div>
        <div class="reward-card-type">${escapeHtml(item.type)}</div>
      </div>
      <div class="reward-card-price">◆ ${item.price} Credits</div>
    `;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary reward-card-buy" + (owned ? " is-owned" : "");
      if (owned) {
        btn.textContent = "Owned";
        btn.disabled = true;
      } else {
        btn.textContent = "Buy";
        btn.disabled = credits < item.price;
        btn.addEventListener("click", () => purchaseReward(item.id));
      }
      card.appendChild(btn);
      grid.appendChild(card);
    });

    $("#rewards-balance").textContent = credits;
  }

  async function purchaseReward(rewardId) {
    const item = REWARD_CATALOG.find((r) => r.id === rewardId);
    if (!item || ownedRewardIds.has(rewardId)) return;
    const credits = currentProfile.credits || 0;
    if (credits < item.price) {
      toast("Not enough Credits yet.", "error");
      return;
    }
    if (!confirm(`Buy ${item.name} for ${item.price} Credits?`)) return;

    currentProfile.credits = clampZero(credits - item.price);
    ownedRewardIds.add(rewardId);
    logLedgerEntry(-item.price, `Purchased ${item.name}`);
    saveProfile();
    renderRewardGrid();
    toast(`${item.name} unlocked`, "success");

    try {
      await setDoc(doc(rewardsCol(), rewardId), {
        name: item.name,
        price: item.price,
        purchasedAt: serverTimestamp()
      });
    } catch (err) {
      toast("Purchase saved locally — will sync once you're back online.", "error");
    }
  }

  function renderLedger() {
    const list = $("#ledger-list");
    const empty = $("#ledger-empty");
    if (!list || !empty) return;

    if (!ledgerEntries.length) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = "";

    ledgerEntries.slice(0, 40).forEach((entry) => {
      const row = document.createElement("div");
      row.className = "ledger-row";
      const isPositive = entry.amount > 0;
      row.innerHTML = `
      <span class="ledger-label">${escapeHtml(entry.label || "")}</span>
      <span class="ledger-amount ${isPositive ? "is-positive" : "is-negative"}">${isPositive ? "+" : ""}${entry.amount} Credits</span>
    `;
      list.appendChild(row);
    });
  }

  // ==========================================================
  // FOCUS — Pomodoro / Flowtime timer + session history (Phase 6)
  // ==========================================================

  function focusSessionsCol() {
    return collection(db, "users", currentUser.uid, "focusSessions");
  }

  async function loadFocusSessions() {
    try {
      const snap = await getDocs(query(focusSessionsCol(), orderBy("createdAtClient", "desc"), limit(30)));
      focusSessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      // Session history is supplementary — don't block the rest of the app on a read failure.
    }
    renderFocusHistory();
  }

  function populateFocusSelects() {
    const courseSel = $("#focus-course-select");
    const taskSel = $("#focus-task-select");
    const cCurrent = courseSel.value;
    const tCurrent = taskSel.value;

    courseSel.innerHTML = `<option value="">No course</option>`;
    courses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id; opt.textContent = c.title;
      courseSel.appendChild(opt);
    });
    courseSel.value = cCurrent;

    taskSel.innerHTML = `<option value="">No task</option>`;
    tasks.filter((t) => t.status !== "completed").forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id; opt.textContent = t.title;
      taskSel.appendChild(opt);
    });
    taskSel.value = tCurrent;
  }

  function formatMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateFocusDisplay() {
    const timeEl = $("#focus-time");
    const ringFill = $("#focus-ring-fill");
    const modeLabel = $("#focus-mode-label");

    if (focusMode === "pomodoro") {
      timeEl.textContent = formatMMSS(focusRemainingSeconds);
      const total = focusMinutes * 60;
      const fraction = total > 0 ? focusRemainingSeconds / total : 0;
      ringFill.style.strokeDashoffset = FOCUS_RING_CIRCUMFERENCE * (1 - fraction);
      modeLabel.textContent = focusRunning ? "Focusing…" : "Pomodoro";
    } else {
      timeEl.textContent = formatMMSS(focusElapsedSeconds);
      ringFill.style.strokeDashoffset = 0; // flowtime has no fixed target — ring stays full while active
      modeLabel.textContent = focusRunning ? "Flowing…" : "Flowtime";
    }

    $("#btn-focus-finish").hidden = !(focusMode === "flowtime" && focusElapsedSeconds > 0);
  }

  function setFocusMode(mode) {
    if (focusRunning) stopFocusInterval();
    focusMode = mode;
    focusElapsedSeconds = 0;
    focusRemainingSeconds = focusMinutes * 60;
    focusRunning = false;

    $all(".mode-toggle-btn").forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    $("#pomodoro-presets").hidden = mode !== "pomodoro";
    $("#btn-focus-toggle").textContent = "Start";
    updateFocusDisplay();
  }

  function setFocusPreset(minutes) {
    focusMinutes = minutes;
    $all(".preset-pill").forEach((b) => b.classList.toggle("is-active", Number(b.dataset.minutes) === minutes));
    if (!focusRunning) {
      focusRemainingSeconds = minutes * 60;
      updateFocusDisplay();
    }
  }

  function stopFocusInterval() {
    clearInterval(focusIntervalId);
    focusIntervalId = null;
    focusRunning = false;
  }

  function tickFocusTimer() {
    if (focusMode === "pomodoro") {
      focusRemainingSeconds -= 1;
      if (focusRemainingSeconds <= 0) {
        focusRemainingSeconds = 0;
        updateFocusDisplay();
        finishFocusSession(focusMinutes * 60, true);
        return;
      }
    } else {
      focusElapsedSeconds += 1;
    }
    updateFocusDisplay();
  }

  function startFocusTimer() {
    if (focusRunning) return;
    focusRunning = true;
    focusIntervalId = setInterval(tickFocusTimer, 1000);
    $("#btn-focus-toggle").textContent = "Pause";
    updateFocusDisplay();
  }

  function pauseFocusTimer() {
    stopFocusInterval();
    $("#btn-focus-toggle").textContent = "Resume";
    updateFocusDisplay();
  }

  function resetFocusTimer() {
    stopFocusInterval();
    focusElapsedSeconds = 0;
    focusRemainingSeconds = focusMinutes * 60;
    $("#btn-focus-toggle").textContent = "Start";
    updateFocusDisplay();
  }

  async function finishFocusSession(durationSecondsOverride, natural) {
    const durationSeconds = durationSecondsOverride != null
      ? durationSecondsOverride
      : (focusMode === "pomodoro" ? (focusMinutes * 60 - focusRemainingSeconds) : focusElapsedSeconds);

    stopFocusInterval();

    const courseId = $("#focus-course-select").value || null;
    const taskId = $("#focus-task-select").value || null;
    const course = courses.find((c) => c.id === courseId);
    const task = tasks.find((t) => t.id === taskId);

    const qualifies = durationSeconds >= FOCUS_MIN_QUALIFYING_SECONDS;
    const session = {
      mode: focusMode,
      durationSeconds,
      courseId,
      taskId,
      label: course ? course.title : (task ? task.title : null),
      qualified: qualifies,
      date: dateToStr(new Date()),
      createdAtClient: new Date().toISOString()
    };

    if (qualifies) {
      grantReward(REWARDS.focusSession.credits, "Focus session" + (session.label ? ` · ${session.label}` : ""));
      saveProfile();
      toast(`+${REWARDS.focusSession.credits} Credits — nice focus`, "success");
    } else if (durationSeconds > 0) {
      toast(natural ? "Session complete" : `Session ended at ${formatMMSS(durationSeconds)} — under 5 min, no reward this time`, "");
    }

    focusSessions.unshift(session);
    renderFocusHistory();

    resetFocusTimer();

    try {
      const newDoc = doc(focusSessionsCol());
      await setDoc(newDoc, { ...session, createdAt: serverTimestamp() });
    } catch (err) {
      toast("Session saved locally — will sync once you're back online.", "error");
    }
  }

  function renderFocusHistory() {
    const list = $("#focus-history-list");
    const empty = $("#focus-history-empty");
    if (!list || !empty) return;

    if (!focusSessions.length) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = "";

    focusSessions.slice(0, 20).forEach((s) => {
      const row = document.createElement("div");
      row.className = "focus-history-row";
      const modeLabel = s.mode === "pomodoro" ? "Pomodoro" : "Flowtime";
      row.innerHTML = `
      <div>
        <div class="focus-history-main">${modeLabel}${s.label ? " · " + escapeHtml(s.label) : ""}</div>
        <div class="focus-history-sub">${formatShortDate(s.date)}${s.qualified ? "" : " · no reward"}</div>
      </div>
      <div class="focus-history-duration">${formatMMSS(s.durationSeconds)}</div>
    `;
      list.appendChild(row);
    });
  }

  function initFocusTab() {
    $all(".mode-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => setFocusMode(btn.dataset.mode));
    });
    $all(".preset-pill").forEach((btn) => {
      btn.addEventListener("click", () => setFocusPreset(Number(btn.dataset.minutes)));
    });
    $("#btn-focus-toggle").addEventListener("click", () => {
      if (focusRunning) pauseFocusTimer();
      else startFocusTimer();
    });
    $("#btn-focus-reset").addEventListener("click", resetFocusTimer);
    $("#btn-focus-finish").addEventListener("click", () => finishFocusSession(null, false));
    updateFocusDisplay();
  }

  // ==========================================================
  // PROGRESS — analytics dashboard (Phase 6)
  // ==========================================================

  function renderProgressTab() {
    $("#pg-streak").textContent = currentProfile.streak || 0;
    $("#pg-credits").textContent = currentProfile.credits || 0;

    let earned = 0, spent = 0;
    ledgerEntries.forEach((e) => { if (e.amount > 0) earned += e.amount; else spent += Math.abs(e.amount); });
    $("#pg-earned").textContent = earned;
    $("#pg-spent").textContent = spent;

    $("#pg-courses-done").textContent = courses.filter((c) => courseProgress(c) >= 100).length;

    const totalFocusSeconds = focusSessions.reduce((sum, s) => sum + (s.qualified ? s.durationSeconds : 0), 0);
    const totalFocusMinutes = Math.round(totalFocusSeconds / 60);
    $("#pg-focus-time").textContent = totalFocusMinutes >= 60
      ? `${Math.floor(totalFocusMinutes / 60)}h ${totalFocusMinutes % 60}m`
      : `${totalFocusMinutes}m`;

    renderActivityStrip();
    renderProgressCourseList();
  }

  function renderActivityStrip() {
    const strip = $("#activity-strip");
    if (!strip) return;
    strip.innerHTML = "";

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(toDateOnly(d));
    }

    const counts = days.map((d) => {
      const dStr = dateToStr(d);
      let count = 0;
      courses.forEach((c) => c.days.forEach((day) => { if (day.status === "completed" && day.date === dStr) count++; }));
      tasks.forEach((t) => { if (t.status === "completed" && t.completedAt && t.completedAt.slice(0, 10) === dStr) count++; });
      focusSessions.forEach((s) => { if (s.qualified && s.date === dStr) count++; });
      return { dStr, count, dayObj: d };
    });

    const maxCount = Math.max(1, ...counts.map((c) => c.count));

    counts.forEach(({ count, dayObj }) => {
      const col = document.createElement("div");
      col.className = "activity-day";
      const pct = Math.round((count / maxCount) * 100);
      col.innerHTML = `
      <span class="activity-day-count">${count || ""}</span>
      <div class="activity-bar-track"><div class="activity-bar-fill" style="height:${count ? Math.max(pct, 10) : 0}%"></div></div>
      <span class="activity-day-label">${dayObj.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}</span>
    `;
      strip.appendChild(col);
    });
  }

  function renderProgressCourseList() {
    const list = $("#progress-course-list");
    const empty = $("#progress-courses-empty");
    if (!list || !empty) return;

    const activeTrackCourses = getFilteredCourses();

    if (!activeTrackCourses.length) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = "";

    activeTrackCourses.forEach((course) => {
      const pct = courseProgress(course);
      const row = document.createElement("div");
      row.className = "progress-course-row";
      row.innerHTML = `
      <span class="progress-course-name">${escapeHtml(course.title)}</span>
      <div class="progress-course-bar"><div class="progress-course-fill" style="width:${pct}%"></div></div>
      <span class="progress-course-pct">${pct}%</span>
    `;
      list.appendChild(row);
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
    home: ["Home", "Here's what's on today."],
    courses: ["Courses", "Your long-term learning, broken into daily steps."],
    tasks: ["Tasks", "Homework, assignments, and to-dos."],
    focus: ["Focus", "Timed study sessions."],
    progress: ["Progress", "How your learning is trending."],
    rewards: ["Rewards", "Spend Credits you've earned."],
    profile: ["Profile", "Your account and settings."]
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

    if (key === "progress") renderProgressTab();
    if (key === "focus") populateFocusSelects();
  }

  function renderTopStats() {
    $("#stat-streak").textContent = currentProfile.streak ?? 0;
    if ($("#stat-credits")) $("#stat-credits").textContent = currentProfile.credits ?? 0;
  }

  function renderProfileTab() {
    const name = currentProfile.name || "Student";
    $("#profile-avatar").textContent = name.trim().charAt(0).toUpperCase() || "S";
    $("#profile-name").textContent = name;
    $("#profile-email").textContent = currentProfile.email || currentUser.email || "";
    $("#profile-track").textContent = currentProfile.track === "college" ? "College Mode" : "School Mode";
    $("#profile-streak").textContent = currentProfile.streak || 0;
    if ($("#profile-credits")) $("#profile-credits").textContent = currentProfile.credits || 0;
  }

  function initProfileSubnav() {
    const subnavBtns = $all("#profile-subnav .task-filter");
    subnavBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        subnavBtns.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const key = btn.dataset.profileTab;
        ["account", "progress", "rewards"].forEach((k) => {
          const el = $("#profile-subtab-" + k);
          if (el) el.hidden = k !== key;
        });
        if (key === "progress") renderProgressTab();
        if (key === "rewards") renderRewardGrid();
      });
    });
  }

  function renderTodayDate() {
    const el = $("#today-date");
    if (!el) return;
    el.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric"
    });
  }

  function applyTrackTheme() {
    if (!currentProfile) return;
    const track = currentProfile.track === "college" ? "college" : "school";
    document.body.dataset.track = track;

    const collegeFields = $("#course-college-fields");
    const schoolFields = $("#course-school-fields");
    const titleLabel = $("#course-title-label");

    if (collegeFields) collegeFields.hidden = track !== "college";
    if (schoolFields) schoolFields.hidden = track !== "school";
    if (titleLabel) {
      titleLabel.textContent = track === "college" ? "Course Code & Name" : "Subject Name";
    }

    const collegeHomeWidget = $("#home-college-widget");
    const schoolHomeWidget = $("#home-school-widget");
    if (collegeHomeWidget) collegeHomeWidget.hidden = track !== "college";
    if (schoolHomeWidget) schoolHomeWidget.hidden = track !== "school";

    const collegeProg = $("#college-progress-block");
    const schoolProg = $("#school-progress-block");
    if (collegeProg) collegeProg.hidden = track !== "college";
    if (schoolProg) schoolProg.hidden = track !== "school";

    renderTrackMetrics();
  }

  function renderTrackMetrics() {
    if (!currentProfile) return;
    const track = currentProfile.track === "college" ? "college" : "school";

    if (track === "college") {
      const activeCollegeCourses = getFilteredCourses();
      let totalCredits = 0;

      activeCollegeCourses.forEach((c) => {
        totalCredits += parseFloat(c.creditHours || 3.0);
      });

      const homeCredits = $("#home-credits-val");
      const homeCourses = $("#home-courses-val");
      const pgCredits = $("#pg-completed-credits");

      if (homeCredits) homeCredits.textContent = totalCredits.toFixed(1);
      if (homeCourses) homeCourses.textContent = activeCollegeCourses.length;
      if (pgCredits) pgCredits.textContent = totalCredits.toFixed(1) + " hrs";
    } else {
      const schoolCourses = getFilteredCourses();
      const petTitle = $("#pet-mood-title");
      const petSub = $("#pet-mood-sub");
      const streak = currentProfile.streak || 0;
      if (petTitle) petTitle.textContent = streak > 0 ? `🐾 Pet Happy (${streak}d Streak!)` : "🐾 Pet Resting";
      if (petSub) petSub.textContent = streak > 0 ? "Your study companion is energized by your progress!" : "Complete a study session today to energize your pet.";

      const pgRate = $("#pg-subject-rate");
      if (pgRate) {
        const totalDays = schoolCourses.reduce((acc, c) => acc + c.days.length, 0);
        const doneDays = schoolCourses.reduce((acc, c) => acc + c.days.filter((d) => d.status === "completed").length, 0);
        const rate = totalDays > 0 ? Math.round((doneDays / totalDays) * 100) : 100;
        pgRate.textContent = `${rate}%`;
      }
    }
  }

  async function seedSampleDataIfNeeded() {
    if (!currentUser || !currentProfile) return;
    const currentTrack = currentProfile.track || "school";
    const trackCourses = courses.filter((c) => (c.track || "school") === currentTrack);
    if (trackCourses.length > 0) return; // already has courses

    const today = new Date();
    const startStr = dateToStr(today);
    const endDateObj = new Date(today.getTime() + 14 * 86400000);
    const endStr = dateToStr(endDateObj);

    const sampleCourseData = {
      title: "🚀 Welcome to DeepTrck",
      track: currentTrack,
      description: "Your starter course — check off daily sessions to build your study streak!",
      enrollmentType: "academic",
      startDate: startStr,
      endDate: endStr,
      studyDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      days: generateSchedule(startStr, endStr, new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), ["Welcome & Setup", "First Study Session", "Building Consistency"]),
      status: "active",
      createdAt: serverTimestamp()
    };

    try {
      const newDoc = doc(coursesCol());
      await setDoc(newDoc, sampleCourseData);
      courses.unshift({ id: newDoc.id, ...sampleCourseData });

      const newTaskId = doc(tasksCol());
      const sampleTaskData = {
        title: "Check off your first study session!",
        dueDate: startStr,
        priority: "medium",
        courseId: newDoc.id,
        status: "pending",
        createdAt: serverTimestamp()
      };
      await setDoc(newTaskId, sampleTaskData);
      tasks.unshift({ id: newTaskId.id, ...sampleTaskData });

      renderCourseGrid();
      renderHomeToday();
      renderContinueLearning();
      renderTasksList(currentTaskFilter);
    } catch (err) {
      /* non-critical sample seed */
    }
  }

  function enterApp() {
    applyTrackTheme();
    buildNav();
    renderTopStats();
    renderProfileTab();
    renderTodayDate();
    goToTab("home");
    showShell();
    loadCourses()
      .then(() => loadTasks())
      .then(() => seedSampleDataIfNeeded())
      .then(() => loadRewardsData())
      .then(() => loadFocusSessions())
      .catch(() => toast("Couldn't load your data.", "error"));
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
        currentProfile = { name: user.displayName || "Student", email: user.email, track: null, xp: 0, credits: 0, streak: 0, lastActivityDate: null };
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
  // ACCESSIBILITY: Escape closes any open modal/drawer
  // ==========================================================
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const courseModal = $("#modal-course");
    const taskModal = $("#modal-task");
    const drawer = $("#drawer-course");
    if (courseModal && !courseModal.hidden) courseModal.hidden = true;
    else if (taskModal && !taskModal.hidden) taskModal.hidden = true;
    else if (drawer && !drawer.hidden) { drawer.hidden = true; activeDrawerCourseId = null; }
  });

  function initOfflineDetection() {
    const banner = $("#offline-banner");
    const updateStatus = () => {
      if (banner) banner.hidden = navigator.onLine;
    };
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    updateStatus();
  }

  window.addEventListener("beforeunload", (e) => {
    if (focusRunning) {
      e.preventDefault();
      e.returnValue = "You have an active focus session running!";
    }
  });

  function initCourseFilters() {
    const filterBtns = $all("#course-category-filters .task-filter");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBtns.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        currentCourseCategoryFilter = btn.dataset.courseFilter;
        renderCourseGrid();
      });
    });
  }

  // ==========================================================
  // INIT
  // ==========================================================
  initAuthScreen();
  initTrackScreen();
  wireLogout();
  wireProfileActions();
  initCourseModal();
  initCourseFilters();
  initCourseDrawer();
  initTaskModal();
  initTaskFilters();
  initFocusTab();
  initProfileSubnav();
  initOfflineDetection();

  // ==========================================================
  // PWA: register the app-shell service worker (offline shell only —
  // Firebase data still requires a connection).
  // ==========================================================
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* non-critical — app still works fully online without it */
      });
    });
  }