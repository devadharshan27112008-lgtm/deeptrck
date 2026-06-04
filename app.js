// ===== FIREBASE SETUP =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  fetchSignInMethodsForEmail
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

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

// ===== APP STATE =====
const App = {
  user: null,
  uid: null,
  currentPage: 'dashboard',
  currentReportTab: 'weekly',
  focusInterval: null,
  focusSeconds: 0,
  focusTotalSeconds: 0,
  focusRunning: false,
  focusIsBreak: false,
  focusSession: 1,
  focusBreaksDone: 0,
  focusSegmentIndex: 0,
  focusSegments: [],
  focusPreset: { name: 'Pomodoro', work: 25, brk: 5 },
  // User preferences loaded from Firestore
  prefs: {
    modules: { daily: true, tasks: true, courses: true, focus: true, typing: false, reports: true },
    goalMins: 240,
    studyGoal: '',
    accent: 'blue'
  },
  cache: {}
};

// ===== FIRESTORE HELPERS =====
function userCol(col) { return collection(db, 'users', App.uid, col); }
function userDoc(col, id) { return doc(db, 'users', App.uid, col, id); }

async function fsGet(col) {
  if (App.cache[col] !== undefined) return App.cache[col];
  try {
    const snap = await getDocs(userCol(col));
    const items = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    App.cache[col] = items;
    return items;
  } catch (e) { console.error('fsGet error', col, e); return []; }
}

async function fsAdd(col, data) {
  try {
    const ref = await addDoc(userCol(col), { ...data, createdAt: serverTimestamp() });
    const newItem = { _id: ref.id, ...data };
    if (App.cache[col]) App.cache[col].unshift(newItem);
    else App.cache[col] = [newItem];
    return newItem;
  } catch (e) { console.error('fsAdd error', col, e); }
}

async function fsDelete(col, id) {
  try {
    await deleteDoc(userDoc(col, id));
    if (App.cache[col]) App.cache[col] = App.cache[col].filter(i => i._id !== id);
  } catch (e) { console.error('fsDelete error', col, e); }
}

async function fsUpdate(col, id, data) {
  try {
    await updateDoc(userDoc(col, id), data);
    if (App.cache[col]) {
      const idx = App.cache[col].findIndex(i => i._id === id);
      if (idx !== -1) App.cache[col][idx] = { ...App.cache[col][idx], ...data };
    }
  } catch (e) { console.error('fsUpdate error', col, e); }
}

function clearCache(...cols) {
  if (cols.length === 0) App.cache = {};
  else cols.forEach(c => delete App.cache[c]);
}

// ===== PREFS / MODULES =====
async function loadPrefs() {
  try {
    const snap = await getDoc(doc(db, 'users', App.uid, 'profile', 'prefs'));
    if (snap.exists()) {
      const data = snap.data();
      App.prefs.modules = data.modules || App.prefs.modules;
      App.prefs.goalMins = data.goalMins || 240;
      App.prefs.studyGoal = data.studyGoal || '';
      App.prefs.accent = data.accent || 'blue';
      applyAccent(App.prefs.accent);
    }
  } catch (e) { console.error('loadPrefs error', e); }
}

function applyAccent(accentName) {
  document.body.dataset.accent = accentName;
  App.prefs.accent = accentName;
  document.querySelectorAll('.accent-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.pick === accentName);
  });
}

async function selectAccent(accentName) {
  applyAccent(accentName);
  await savePrefs();
}
window.selectAccent = selectAccent;

async function savePrefs() {
  try {
    await setDoc(doc(db, 'users', App.uid, 'profile', 'prefs'), App.prefs);
  } catch (e) { console.error('savePrefs error', e); }
}

function applyModules() {
  const m = App.prefs.modules;
  // Sidebar nav items
  document.querySelectorAll('.mod-nav').forEach(el => {
    const mod = el.dataset.module;
    el.style.display = m[mod] ? '' : 'none';
  });
  // Dashboard cards
  document.querySelectorAll('.mod-card').forEach(el => {
    const mod = el.dataset.module;
    el.style.display = m[mod] ? '' : 'none';
  });
  // Dashboard WPM hero stat
  document.querySelectorAll('.mod-hero-stat').forEach(el => {
    el.style.display = m[el.dataset.module] ? '' : 'none';
  });
  // Settings toggles
  ['daily','tasks','courses','focus','typing','reports'].forEach(mod => {
    const el = document.getElementById('toggle-' + mod);
    if (el) el.checked = !!m[mod];
  });
  // Update goal display in settings
  const gd = document.getElementById('settings-goal-display');
  if (gd) {
    const hrs = Math.floor(App.prefs.goalMins / 60);
    const mins = App.prefs.goalMins % 60;
    const timeStr = hrs > 0 ? (hrs + 'h' + (mins ? ' ' + mins + 'm' : '')) : mins + 'm';
    gd.textContent = (App.prefs.studyGoal || 'Not set') + ' · ' + timeStr + '/day target';
  }
}

function toggleModule(mod, enabled) {
  App.prefs.modules[mod] = enabled;
  savePrefs();
  applyModules();
}

// ===== ONBOARDING =====
let _obGoalMins = 240;
let _obModules = { daily: true, tasks: true, courses: true, focus: true, typing: false, reports: true };

async function checkOnboarding() {
  try {
    const snap = await getDoc(doc(db, 'users', App.uid, 'profile', 'prefs'));
    if (!snap.exists()) {
      // First time — show onboarding
      document.getElementById('onboarding-overlay').style.display = 'flex';
    }
  } catch (e) { /* skip if error */ }
}

function obNext(step) {
  if (step === 1) {
    const goal = document.getElementById('ob-goal').value.trim();
    App.prefs.studyGoal = goal;
  }
  if (step === 2) {
    if (!_obGoalMins) { alert('Please pick a daily target.'); return; }
    App.prefs.goalMins = _obGoalMins;
  }
  document.getElementById('ob-step-' + step).style.display = 'none';
  document.getElementById('ob-step-' + (step + 1)).style.display = '';
  document.querySelectorAll('.ob-dot').forEach((d, i) => {
    d.classList.toggle('active', i === step);
  });
}

function obSelectGoal(btn, mins) {
  _obGoalMins = mins;
  document.querySelectorAll('.ob-goal-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function obToggleModule(el, mod) {
  if (mod === 'daily' || mod === 'tasks' || mod === 'courses') {
    // Core modules stay on by default but can be toggled
  }
  _obModules[mod] = !_obModules[mod];
  const check = document.getElementById('mod-' + mod);
  if (check) {
    check.classList.toggle('active', _obModules[mod]);
    check.textContent = _obModules[mod] ? '✓' : '';
  }
  el.classList.toggle('ob-module-off', !_obModules[mod]);
}

async function obFinish() {
  App.prefs.modules = _obModules;
  App.prefs.goalMins = _obGoalMins || 240;
  await savePrefs();
  document.getElementById('onboarding-overlay').style.display = 'none';
  applyModules();
  renderDashboard();
}

// ===== SETTINGS PAGE =====
function openGoalEdit() {
  const panel = document.getElementById('goal-edit-panel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
  document.getElementById('settings-study-goal').value = App.prefs.studyGoal || '';
  document.getElementById('settings-daily-mins').value = App.prefs.goalMins || 240;
}

async function saveGoalEdit() {
  App.prefs.studyGoal = document.getElementById('settings-study-goal').value.trim();
  App.prefs.goalMins = parseInt(document.getElementById('settings-daily-mins').value) || 240;
  document.getElementById('goal-edit-panel').style.display = 'none';
  await savePrefs();
  applyModules();
}

// ===== QUICK LOG MODAL =====
function openQuickLog() {
  document.getElementById('quicklog-modal').style.display = 'flex';
  document.getElementById('ql-activity').focus();
}

function closeQuickLog() {
  document.getElementById('quicklog-modal').style.display = 'none';
  document.getElementById('ql-activity').value = '';
  document.getElementById('ql-duration').value = '';
  document.getElementById('ql-error').textContent = '';
}

function qlSetMins(m, e) {
  document.getElementById('ql-duration').value = m;
  document.querySelectorAll('.ql-min-btn').forEach(b => b.classList.remove('active'));
  if (e?.target) e.target.classList.add('active');
}

async function submitQuickLog() {
  const activity = document.getElementById('ql-activity').value.trim();
  const category = document.getElementById('ql-category').value;
  const duration = parseInt(document.getElementById('ql-duration').value) || 0;
  const err = document.getElementById('ql-error');
  if (!activity) { err.textContent = 'Please enter what you studied.'; return; }
  if (!duration) { err.textContent = 'Please enter a duration.'; return; }
  await fsAdd('daily_logs', { date: todayStr(), activity, category, duration, notes: '' });
  clearCache('daily_logs');
  closeQuickLog();
  if (App.currentPage === 'dashboard') renderDashboard();
  if (App.currentPage === 'daily') renderDailyLog();
}

// ===== AUTH =====
function switchTab(tab, e) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  const target = e?.target || window.event?.target;
  if (target) target.classList.add('active');
  document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? '' : 'none';
}

async function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  const err = document.getElementById('signup-error');
  err.style.color = 'var(--red)';
  if (!name || !email || !pass) { err.textContent = 'All fields required.'; return; }
  if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
  try {
    err.style.color = 'var(--text3)';
    err.textContent = 'Creating account…';
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid, 'profile', 'info'), { name, email });
    await sendEmailVerification(cred.user);
    await signOut(auth);
    err.style.color = 'var(--green)';
    err.textContent = '✅ Verification email sent to ' + email + '. Click the link in the email, then sign in here. (Check your spam/junk folder if you don\'t see it.)';
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
  } catch (e) {
    err.style.color = 'var(--red)';
    err.textContent = firebaseErrMsg(e.code);
  }
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.style.color = 'var(--red)';
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  try {
    err.style.color = 'var(--text3)';
    err.textContent = 'Signing in…';
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (!cred.user.emailVerified) {
      await signOut(auth);
      err.style.color = 'var(--red)';
      window._pendingResendEmail = email;
      window._pendingResendPass = pass;
      err.innerHTML = 'Email not verified. <a href="#" onclick="resendVerification(window._pendingResendEmail, window._pendingResendPass)" style="color:var(--accent)">Resend verification email</a>';
      return;
    }
  } catch (e) {
    err.style.color = 'var(--red)';
    if (e.code === 'auth/invalid-credential') {
      const methods = await fetchSignInMethodsForEmail(auth, email).catch(() => []);
      if (!methods || methods.length === 0) {
        err.innerHTML = 'No account found for this email. <a href="#" onclick="switchTabByName(event, \'signup\')" style="color:var(--accent)">Sign up instead?</a>';
      } else {
        err.textContent = 'Incorrect password. Please try again.';
      }
    } else {
      err.textContent = firebaseErrMsg(e.code);
    }
  }
}

async function resendVerification(email, pass) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(cred.user);
    await signOut(auth);
    const err = document.getElementById('login-error');
    err.style.color = 'var(--green)';
    err.textContent = '✅ Verification email resent to ' + email + '. Check your inbox (and spam folder).';
  } catch (e) { alert('Could not resend: ' + e.message); }
}
window.resendVerification = resendVerification;

function switchTabByName(e, tab) {
  e.preventDefault();
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  const target = document.querySelector(`.auth-tab[onclick*="'${tab}'"]`);
  if (target) target.classList.add('active');
  document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? '' : 'none';
}
window.switchTabByName = switchTabByName;

function firebaseErrMsg(code) {
  const map = {
    'auth/email-already-in-use': 'Email already registered. Sign in instead.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/weak-password': 'Password too weak (min 6 chars).',
    'auth/user-not-found': 'No account found. Sign up first.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/too-many-requests': 'Too many attempts. Try again later.'
  };
  return map[code] || 'Something went wrong. Try again.';
}

async function handleLogout() {
  clearCache();
  App.uid = null;
  App.user = null;
  await signOut(auth);
}

onAuthStateChanged(auth, async (user) => {
  // Hide loading splash once Firebase resolves (fast when already logged in)
  const splash = document.getElementById('loading-splash');
  if (splash) { splash.style.opacity = '0'; splash.style.transition = 'opacity .2s'; setTimeout(() => splash.style.display = 'none', 200); }

  if (user) {
    App.user = user;
    App.uid = user.uid;
    clearCache();
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const name = user.displayName || user.email.split('@')[0];
    document.getElementById('user-chip').textContent = '👤 ' + name;
    await loadPrefs();
    initApp();
    await checkOnboarding();
  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('onboarding-overlay').style.display = 'none';
  }
});

// ===== INIT =====
function initApp() {
  setDateDefaults();
  updateTopbarDate();
  setGreeting();
  initTheme();
  applyModules();
  // Restore sidebar collapsed state across reloads
  if (localStorage.getItem('sidebar-collapsed') === '1') {
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.add('collapsed');
    const btn = document.getElementById('sidebar-collapse-btn');
    if (btn) btn.textContent = '‹';
  }
  showPage('dashboard');
  // Auto-restore focus timer if a session was running when tab closed
  _autoRestoreFocusOnInit();
  registerSW().then(() => {
    requestNotificationsAuto();
    startDueTimePoller();
    setTimeout(rescheduleAllReminders, 2000);
  });
  // Update trash badge on load
  setTimeout(updateTrashBadge, 1500);
  // New feature inits
  updateSparksDisplay();
  updateEnergyBar();
  updateCoinsDisplay();
  setTimeout(() => checkAchievementsAfterAction(), 2000);
  setInterval(() => {
    const pet = getPetState();
    if (pet) {
      const hunger = getPetHunger(pet);
      if (hunger < 20) showToast('🐾 ' + pet.name + ' is hungry and fatigued! Feed it to restore XP rewards.', 'info', 5000);
      renderPetCard();
    }
  }, 10 * 60 * 1000);
}

// ===== THEME =====
function initTheme() {
  const saved = localStorage.getItem('deeptrck-theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.innerHTML = '☀️ Light Mode';
  } else {
    document.body.classList.remove('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.innerHTML = '🌙 Dark Mode';
  }
  localStorage.setItem('deeptrck-theme', theme);
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}

// ===== DELETE ACCOUNT =====
async function confirmDeleteAccount() {
  const first = confirm('Delete your account permanently?\n\nThis will erase ALL your data — logs, tasks, courses, WPM records, and focus sessions. This cannot be undone.');
  if (!first) return;
  try {
    const cols = ['daily_logs','tasks','courses','wpm_records','focus_sessions','profile','trash'];
    for (const col of cols) {
      const snap = await getDocs(collection(db, 'users', App.uid, col));
      for (const d of snap.docs) await deleteDoc(d.ref);
    }
    await App.user.delete();
    alert('Account deleted. Goodbye!');
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      alert('For security, please sign out and sign back in, then try deleting again.');
    } else {
      alert('Error deleting account: ' + e.message);
    }
  }
}

function setDateDefaults() {
  const today = todayStr();
  ['log-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = today; });
  const rwd = document.getElementById('report-week-date'); if (rwd) rwd.value = today;
  const rm = document.getElementById('report-month'); if (rm) rm.value = today.slice(0, 7);
  const lf = document.getElementById('log-filter-month'); if (lf) lf.value = today.slice(0, 7);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function updateTopbarDate() {
  const d = new Date();
  document.getElementById('topbar-date').textContent =
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = App.user ? (App.user.displayName || App.user.email.split('@')[0]) : 'Scholar';
  const subs = [
    'Stay consistent, stay ahead.',
    'Every session counts.',
    'You show up. That\'s the hardest part.',
    'Progress, not perfection.',
    'Locked in. 🔒',
    'Deep work = deep results.',
    'The timer runs. So do you.',
    'Small steps, big results.',
    "You're building something great."
  ];
  document.getElementById('greeting').textContent = g + ', ' + name + ' 👋';
  document.getElementById('greeting-sub').textContent =
    App.prefs.studyGoal ? 'Goal: ' + App.prefs.studyGoal : subs[new Date().getDay() % subs.length];
}

// ===== PAGE NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  const nav = document.querySelector(`[data-page="${name}"]`);
  if (nav) nav.classList.add('active');
  // Update mobile bottom nav
  document.querySelectorAll('.mob-nav-btn[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  App.currentPage = name;
  document.getElementById('topbar-title').textContent = {
    dashboard: 'Dashboard', daily: 'Daily Log', tasks: 'Tasks',
    courses: 'Courses', focus: 'Focus', typing: 'Typing WPM',
    reports: 'Reports', settings: 'Settings', trash: 'Trash',
    pet: 'My Pet', petworld: 'Pet World', achievements: 'Achievements'
  }[name] || name;
  if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
  renderPage(name);
}

function renderPage(name) {
  if (name === 'dashboard') renderDashboard();
  if (name === 'daily') renderDailyLog();
  if (name === 'tasks') renderTasks();
  if (name === 'courses') renderCourses();
  if (name === 'focus') { restoreFocusState(); renderFocusLog(); renderFocusTaskList(); renderFocusDailyProgress(); _syncAutoBreaks(); }
  if (name === 'typing') renderTyping();
  if (name === 'reports') switchReportTab(App.currentReportTab);
  if (name === 'settings') { renderSettings(); renderTrash(); }
  if (name === 'trash') renderTrash();
  if (name === 'pet') {
    setTimeout(() => {
      if (typeof window.renderEnhancedPetCard === 'function') {
        window.renderEnhancedPetCard('pet-page-content');
      }
      renderPetPageDiary();
    }, 100);
  }
  if (name === 'petworld') {
    setTimeout(() => {
      renderPetWorld();
    }, 100);
  }
  if (name === 'achievements') {
    setTimeout(() => renderAchievementsPage(), 100);
  }
  // New feature renders
  if (name === 'dashboard') {
    setTimeout(() => {
      if (typeof window.renderEnhancedPetCard === 'function') {
        window.renderEnhancedPetCard('pet-card-content');
      } else {
        renderPetCard();
      }
    }, 150);
    setTimeout(updateEnergyBar, 100);
    setTimeout(updateSparksDisplay, 100);
  }
  if (name === 'focus') {
    setTimeout(renderBrainDump, 100);
    setTimeout(updateEnergyBar, 100);
  }
}

function renderSettings() {
  applyModules();
  const gd = document.getElementById('settings-goal-display');
  if (gd) {
    const hrs = Math.floor(App.prefs.goalMins / 60);
    const mins = App.prefs.goalMins % 60;
    const timeStr = hrs > 0 ? (hrs + 'h' + (mins ? ' ' + mins + 'm' : '')) : mins + 'm';
    gd.textContent = (App.prefs.studyGoal || 'Not set') + ' · ' + timeStr + '/day target';
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function toggleSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const isNowCollapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebar-collapsed', isNowCollapsed ? '1' : '0');
  // Arrow rotation is handled by CSS (.sidebar.collapsed .sidebar-collapse-btn { transform: rotate(180deg) })
}

// ===== DASHBOARD =====
async function renderDashboard() {
  const [logs, tasks, wpmRecs, courses] = await Promise.all([
    fsGet('daily_logs'), fsGet('tasks'), fsGet('wpm_records'), fsGet('courses')
  ]);

  const today = todayStr();
  const todayLogs = logs.filter(l => l.date === today);
  const totalMin = todayLogs.reduce((s, l) => s + (l.duration || 0), 0);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  document.getElementById('stat-study').textContent = h + 'h ' + m + 'm';

  const goalMins = App.prefs.goalMins || 240;
  const goalHrs = Math.floor(goalMins / 60);
  const goalMinsRem = goalMins % 60;
  document.getElementById('stat-goal').textContent = '/ ' + goalHrs + 'h' + (goalMinsRem ? ' ' + goalMinsRem + 'm' : '') + ' goal';

  // Update progress ring (r=46, circumference=2*PI*46≈289)
  const pct = Math.min(1, totalMin / goalMins);
  const circumference = 289;
  const ring = document.getElementById('dash-ring');
  if (ring) ring.style.strokeDashoffset = circumference * (1 - pct);
  const pctEl = document.getElementById('db-ring-pct');
  if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%';

  const streak = calcStreak(logs);
  document.getElementById('stat-streak').textContent = streak;
  celebrateStreak(streak);

  const now = new Date();
  const pendingTasks = sortTasks(tasks.filter(t => !t.done));
  const doneTasks = tasks.filter(t => t.done);
  const top10 = [...pendingTasks, ...doneTasks].slice(0, 10);

  const totalDone = tasks.filter(t => t.done).length;
  document.getElementById('stat-tasks').textContent = totalDone + '/' + tasks.length;

  const best = wpmRecs.length ? Math.max(...wpmRecs.map(w => w.wpm)) : null;
  document.getElementById('stat-wpm').textContent = best ? best + ' WPM' : '—';

  const overdue = pendingTasks.filter(t => t.dueDate && t.dueDate < today).length;
  const dueToday = pendingTasks.filter(t => t.dueDate === today).length;
  const urgEl = document.getElementById('dash-tasks-urgency');
  if (urgEl) {
    const parts = [];
    if (overdue) parts.push(`<span style="color:var(--red)">${overdue} overdue</span>`);
    if (dueToday) parts.push(`<span style="color:var(--amber)">${dueToday} due today</span>`);
    urgEl.innerHTML = parts.join(' · ');
  }

  const dashTasksEl = document.getElementById('dash-tasks-list');
  dashTasksEl.innerHTML = top10.length ? top10.map(t => {
    const dueBadge = taskDueBadgeHTML(t, today, now);
    const priBadge = priorityBadgeHTML(t.priority || 'medium');
    return `<div class="dash-task-item ${t.done ? 'done' : ''}">
      <input type="checkbox" class="dash-task-check" ${t.done ? 'checked' : ''}
        onchange="toggleTask('${t._id}', ${t.done})">
      <div class="dash-task-body">
        <span class="task-name ${t.done ? 'done' : ''}">${t.text}</span>
        <div class="dash-task-due">${priBadge}${dueBadge}</div>
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">No tasks yet. Add some in Tasks →</div>';

  const dashCourses = document.getElementById('dash-courses-list');
  dashCourses.innerHTML = courses.slice(0, 5).map(c => `
    <div style="margin-bottom:.65rem">
      <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.3rem">
        <span>${c.name}</span>
        <span style="color:var(--text2)">${(c.totalMin / 60).toFixed(1)}h</span>
      </div>
      <div class="course-prog-bar-wrap">
        <div class="course-prog-bar" style="width:${Math.min(100, (c.totalMin / (c.goalHrs * 60)) * 100)}%"></div>
      </div>
    </div>`).join('') || '<div class="empty-state">No courses added yet.</div>';

  renderWeeklyChart(logs);
  renderStreakGrid(logs);

  // Gamification
  updateXpBar();
  fsGet("focus_logs").then(fl => {
    renderMissions(logs, tasks, fl, App.prefs.goalMins || 240);
    checkAndAwardMissions(logs, tasks, fl, App.prefs.goalMins || 240);
  });
  const state = getXpState();
  const todayKey = "goal_" + today;
  if (pct >= 1 && !(state.todayBonuses || {})[todayKey]) {
    state.todayBonuses = state.todayBonuses || {};
    state.todayBonuses[todayKey] = true;
    saveXpState(state);
    addXp(XP_DAILY_GOAL, "Daily goal hit!", null);
    addCoins(20); // daily goal = 20 coins
    showToast('🎯 Daily goal hit! +' + XP_DAILY_GOAL + ' XP  +20 🪙', 'success', 3500);
  }
  checkAchievementsAfterAction();
  setTimeout(renderDashboardAchievements, 200);

}
function calcStreak(logs) {
  const days = [...new Set(logs.map(l => l.date))].sort();
  if (!days.length) return 0;
  let streak = 0;
  const check = new Date();
  while (true) {
    const d = check.toISOString().slice(0, 10);
    if (days.includes(d)) { streak++; check.setDate(check.getDate() - 1); }
    else break;
  }
  return streak;
}

function renderWeeklyChart(logs) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  const goalMins = App.prefs.goalMins || 240;

  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const mins = logs.filter(l => l.date === ds).reduce((s, l) => s + (l.duration || 0), 0);
    return { day: days[i], mins, ds };
  });

  const maxMins = Math.max(...weekData.map(d => d.mins), goalMins, 1);
  const chart = document.getElementById('weekly-chart');
  if (!chart) return;
  chart.innerHTML = weekData.map(d => {
    // Use percentage of container height so bars always fit
    const pct = d.mins > 0 ? Math.max(6, (d.mins / maxMins) * 100) : 4;
    const cls = d.mins >= goalMins ? 'full' : d.mins > 0 ? 'partial' : 'missed';
    const isToday = d.ds === todayStr();
    const hours = Math.floor(d.mins / 60);
    const mins = d.mins % 60;
    const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return `<div class="week-bar-wrap">
      <div class="week-bar-inner">
        <div class="week-bar ${cls}" style="height:${pct}%" title="${label}"></div>
      </div>
      <span class="week-label" style="${isToday ? 'color:var(--accent);font-weight:700' : ''}">${d.day}</span>
    </div>`;
  }).join('');
}

function renderStreakGrid(logs) {
  const days = new Set(logs.map(l => l.date));
  const today = new Date();
  const grid = document.getElementById('streak-grid');
  grid.innerHTML = '';
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const cell = document.createElement('div');
    cell.className = 'streak-cell' + (days.has(ds) ? ' done' : '') + (ds === todayStr() ? ' today' : '');
    cell.title = ds;
    grid.appendChild(cell);
  }
}

// ===== DAILY LOG =====
async function addDailyLog() {
  const date = document.getElementById('log-date').value;
  const activity = document.getElementById('log-activity').value.trim();
  const category = document.getElementById('log-category').value;
  const duration = parseInt(document.getElementById('log-duration').value) || 0;
  const notes = document.getElementById('log-notes').value.trim();
  if (!date || !activity) { alert('Please fill in date and activity.'); return; }
  await fsAdd('daily_logs', { date, activity, category, duration, notes });
  document.getElementById('log-activity').value = '';
  document.getElementById('log-duration').value = '';
  document.getElementById('log-notes').value = '';
  renderDailyLog();
}

async function deleteDailyLog(id) {
  const logs = App.cache['daily_logs'] || await fsGet('daily_logs');
  const l = logs.find(l => l._id === id);
  if (!l) return;
  // Optimistic: remove from cache instantly
  App.cache['daily_logs'] = (App.cache['daily_logs'] || []).filter(i => i._id !== id);
  const trashItem = { ...l, originalCol: 'daily_logs', deletedAt: Date.now() };
  if (!App.cache['trash']) App.cache['trash'] = [];
  App.cache['trash'].unshift(trashItem);
  // If this log was linked to a course, deduct the duration
  if (l.courseId && l.duration) {
    const courses = App.cache['courses'] || await fsGet('courses');
    const c = courses.find(c => c._id === l.courseId);
    if (c) {
      const newTotal = Math.max(0, (c.totalMin || 0) - l.duration);
      if (App.cache['courses']) {
        const ci = App.cache['courses'].findIndex(x => x._id === l.courseId);
        if (ci !== -1) App.cache['courses'][ci].totalMin = newTotal;
      }
      updateDoc(userDoc('courses', l.courseId), { totalMin: newTotal })
        .catch(e => console.error('course deduct error', e));
    }
  }
  renderDailyLog();
  if (App.currentPage === 'courses') renderCourses();
  if (App.currentPage === 'dashboard') renderDashboard();
  updateTrashBadge();
  // Persist both writes; write back the new Firestore trash doc ID into cache
  Promise.all([
    addDoc(userCol('trash'), { ...trashItem, createdAt: serverTimestamp() }),
    deleteDoc(userDoc('daily_logs', id))
  ]).then(([trashRef]) => {
    if (App.cache['trash']) {
      const entry = App.cache['trash'].find(i => i.deletedAt === trashItem.deletedAt && i.originalCol === 'daily_logs');
      if (entry) entry._id = trashRef.id;
    }
  }).catch(e => {
    console.error('deleteDailyLog persist error', e);
    clearCache('daily_logs', 'trash');
    renderDailyLog();
  });
}

const CAT_COLORS = {
  Study: '#38bdf8', Project: '#a78bfa', Typing: '#34d399',
  Exercise: '#fbbf24', Reading: '#f87171', Other: '#64748b'
};

const CAT_OPTIONS = ['Study','Project','Typing','Exercise','Reading','Other'];

// Track which log entry is currently being edited
let _editingLogId = null;

function openEditLog(id) {
  _editingLogId = id;
  // Re-render so the inline form appears
  renderDailyLog();
  // Also re-render past logs in case it's a past entry
  filterLogs();
}

function cancelEditLog() {
  _editingLogId = null;
  renderDailyLog();
  filterLogs();
}

async function saveEditLog(id) {
  const activity = document.getElementById('edit-log-activity-' + id)?.value.trim();
  const category = document.getElementById('edit-log-category-' + id)?.value;
  const duration = parseInt(document.getElementById('edit-log-duration-' + id)?.value) || 0;
  const notes    = document.getElementById('edit-log-notes-' + id)?.value.trim();
  if (!activity) { alert('Activity cannot be empty.'); return; }
  await fsUpdate('daily_logs', id, { activity, category, duration, notes });
  clearCache('daily_logs');
  _editingLogId = null;
  renderDailyLog();
  filterLogs();
  if (App.currentPage === 'dashboard') renderDashboard();
}

async function renderDailyLog() {
  const logs = await fsGet('daily_logs');
  const today = todayStr();
  const todayLogs = logs.filter(l => l.date === today);
  const el = document.getElementById('today-logs');
  document.getElementById('today-log-count').textContent = todayLogs.length;
  el.innerHTML = todayLogs.length ? todayLogs.map(l => logEntryHTML(l)).join('') :
    '<div class="empty-state">No entries yet today. Use ⚡ Quick Log or add one above.</div>';
  filterLogs(logs);
}

async function filterLogs(logs) {
  if (!logs) logs = await fsGet('daily_logs');
  const month = document.getElementById('log-filter-month').value;
  const today = todayStr();
  const filtered = logs.filter(l => l.date !== today && (!month || l.date.startsWith(month)));
  const byDay = {};
  filtered.forEach(l => { if (!byDay[l.date]) byDay[l.date] = []; byDay[l.date].push(l); });
  const el = document.getElementById('past-logs');
  const sortedDays = Object.keys(byDay).sort().reverse();
  el.innerHTML = sortedDays.length ? sortedDays.map(d => `
    <div class="day-group">
      <div class="day-group-header">${formatDate(d)} — ${byDay[d].reduce((s, l) => s + (l.duration||0), 0)} min total</div>
      ${byDay[d].map(l => logEntryHTML(l)).join('')}
    </div>`).join('') : '<div class="empty-state">No past logs found.</div>';
}

function logEntryHTML(l) {
  const color = CAT_COLORS[l.category] || '#64748b';
  if (_editingLogId === l._id) {
    // Inline edit form
    const catOptions = CAT_OPTIONS.map(c =>
      `<option value="${c}" ${l.category === c ? 'selected' : ''}>${c}</option>`).join('');
    return `<div class="log-entry log-entry-editing">
      <div class="log-cat-dot" style="background:${color}"></div>
      <div class="log-entry-edit-form">
        <div class="log-edit-row">
          <input type="text" id="edit-log-activity-${l._id}" class="input" value="${l.activity.replace(/"/g,'&quot;')}" placeholder="Activity" style="flex:2">
          <select id="edit-log-category-${l._id}" class="input" style="max-width:140px">${catOptions}</select>
        </div>
        <div class="log-edit-row">
          <input type="number" id="edit-log-duration-${l._id}" class="input" value="${l.duration || ''}" placeholder="Duration (mins)" style="max-width:150px" min="1">
          <input type="text" id="edit-log-notes-${l._id}" class="input" value="${(l.notes||'').replace(/"/g,'&quot;')}" placeholder="Notes (optional)" style="flex:1">
        </div>
        <div class="log-edit-actions">
          <button class="btn-primary" style="font-size:.8rem;padding:.35rem .9rem" onclick="saveEditLog('${l._id}')">Save</button>
          <button class="btn-outline" style="font-size:.8rem;padding:.35rem .9rem" onclick="cancelEditLog()">Cancel</button>
        </div>
      </div>
    </div>`;
  }
  return `<div class="log-entry">
    <div class="log-cat-dot" style="background:${color}"></div>
    <div class="log-entry-main">
      <div class="log-entry-title">${l.activity}</div>
      <div class="log-entry-meta">${l.category} · ${l.duration ? l.duration + ' min' : 'no duration'}${l.notes ? ' · ' + l.notes : ''}</div>
    </div>
    <div class="log-entry-actions">
      <button class="log-entry-edit" onclick="openEditLog('${l._id}')" title="Edit">✎</button>
      <button class="log-entry-delete" onclick="deleteDailyLog('${l._id}')" title="Delete">✕</button>
    </div>
  </div>`;
}

function formatDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ===== TASKS =====

// Priority sort weight: lower = higher priority
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };

async function addTask() {
  const text = document.getElementById('task-input').value.trim();
  const priority = document.getElementById('task-priority').value || 'medium';
  const dueDate = document.getElementById('task-due-date').value || '';
  const dueTime = document.getElementById('task-due-time').value || '';
  const reminderMins = parseInt(document.getElementById('task-reminder').value) || 0;
  const repeatType = document.getElementById('task-repeat').value || 'none'; // 'none','daily','every-n'
  const repeatDays = parseInt(document.getElementById('task-repeat-days').value) || 2;
  if (!text) return;
  const taskData = {
    text, priority, done: false, dueDate, dueTime, reminderMins,
    repeat: repeatType === 'none' ? '' : repeatType,
    repeatDays: repeatType === 'every-n' ? repeatDays : 0,
    // completedDates: array of date strings when this recurring task was ticked
    completedDates: []
  };
  const task = await fsAdd('tasks', taskData);
  document.getElementById('task-input').value = '';
  document.getElementById('task-due-date').value = '';
  document.getElementById('task-due-time').value = '';
  document.getElementById('task-reminder').value = '';
  document.getElementById('task-repeat').value = 'none';
  document.getElementById('task-repeat-days').value = '2';
  document.getElementById('task-repeat-days-row').style.display = 'none';
  if (task && dueDate && dueTime && reminderMins) scheduleTaskReminder(task);
  renderTasks();
  if (App.currentPage === 'dashboard') renderDashboard();
}

function onRepeatChange() {
  const val = document.getElementById('task-repeat').value;
  const row = document.getElementById('task-repeat-days-row');
  if (row) row.style.display = val === 'every-n' ? '' : 'none';
}

// For repeat tasks: check if task should appear today as pending
function isRepeatDueToday(t, today) {
  if (!t.repeat) return false;
  const completed = t.completedDates || [];
  if (completed.includes(today)) return false; // already done today
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'every-n') {
    const n = t.repeatDays || 2;
    // Use task creation date or due date as anchor
    const anchor = t.dueDate || (t.createdAt ? new Date(t.createdAt.seconds * 1000).toISOString().slice(0,10) : today);
    const anchorDate = new Date(anchor + 'T12:00:00');
    const todayDate  = new Date(today + 'T12:00:00');
    const diffDays   = Math.round((todayDate - anchorDate) / 86400000);
    return diffDays >= 0 && diffDays % n === 0;
  }
  return false;
}

// Toggle for repeat tasks: marks today as done (doesn't permanently set done=true)
async function toggleRepeatToday(id, today) {
  const tasks = await fsGet('tasks');
  const t = tasks.find(t => t._id === id);
  if (!t) return;
  const completed = [...(t.completedDates || [])];
  const idx = completed.indexOf(today);
  if (idx === -1) {
    completed.push(today);
  } else {
    completed.splice(idx, 1);
  }
  await fsUpdate('tasks', id, { completedDates: completed });
  clearCache('tasks');
  if (App.currentPage === 'dashboard') renderDashboard();
  else renderTasks();
}

// Permanently complete a repeat task (stops it from recurring)
async function completeRepeatTask(id) {
  if (!confirm('Mark this recurring task as permanently completed? It will stop repeating.')) return;
  await fsUpdate('tasks', id, { done: true });
  clearCache('tasks');
  renderTasks();
  if (App.currentPage === 'dashboard') renderDashboard();
}

async function toggleTask(id, currentDone) {
  const tasks = App.cache['tasks'] || await fsGet('tasks');
  const t = tasks.find(t => t._id === id);
  // If it's a repeat task and not being un-done, use daily completion instead
  if (t && t.repeat && !currentDone) {
    await toggleRepeatToday(id, todayStr());
    return;
  }
  const nowDone = !currentDone;
  // Optimistic cache update
  if (App.cache['tasks']) {
    const ti = App.cache['tasks'].findIndex(x => x._id === id);
    if (ti !== -1) App.cache['tasks'][ti].done = nowDone;
  }
  // XP: award on completion, deduct on un-completion
  const xpState = getXpState();
  xpState.taskXp = xpState.taskXp || {};
  if (nowDone) {
    // Award XP and record it against this task id
    xpState.taskXp[id] = XP_TASK;
    saveXpState(xpState);
    addXp(XP_TASK, 'Task complete', null);
    addCoins(2); // 2 coins per task
    showToast('Task done! ✅  +' + XP_TASK + ' XP  +2 🪙', 'success');
    if (typeof window.petOnTaskComplete === 'function') window.petOnTaskComplete();
    checkAchievementsAfterAction();
  } else {
    // Deduct previously awarded XP
    const awarded = xpState.taskXp[id] || 0;
    if (awarded > 0) {
      delete xpState.taskXp[id];
      xpState.total = Math.max(0, (xpState.total || 0) - awarded);
      saveXpState(xpState);
      updateXpBar();
      showToast('Task unmarked — ' + awarded + ' XP removed', 'info');
    }
  }
  fsUpdate('tasks', id, { done: nowDone }).catch(e => {
    console.error('toggleTask error', e);
    clearCache('tasks');
  });
  if (App.currentPage === 'dashboard') renderDashboard();
  else renderTasks();
}

async function deleteTask(id) {
  const tasks = App.cache['tasks'] || await fsGet('tasks');
  const t = tasks.find(t => t._id === id);
  if (!t) return;
  // If task was done, deduct its XP
  if (t.done) {
    const xpState = getXpState();
    xpState.taskXp = xpState.taskXp || {};
    const awarded = xpState.taskXp[id] || XP_TASK;
    delete xpState.taskXp[id];
    xpState.total = Math.max(0, (xpState.total || 0) - awarded);
    saveXpState(xpState);
    updateXpBar();
    showToast('Task deleted — ' + awarded + ' XP removed', 'info');
  }
  // Optimistic: remove from cache and re-render instantly
  App.cache['tasks'] = (App.cache['tasks'] || []).filter(i => i._id !== id);
  const trashItem = { ...t, originalCol: 'tasks', deletedAt: Date.now() };
  if (!App.cache['trash']) App.cache['trash'] = [];
  App.cache['trash'].unshift(trashItem);
  renderTasks();
  if (App.currentPage === 'dashboard') renderDashboard();
  updateTrashBadge();
  // Persist both writes; write back the new Firestore trash doc ID into cache
  Promise.all([
    addDoc(userCol('trash'), { ...trashItem, createdAt: serverTimestamp() }),
    deleteDoc(userDoc('tasks', id))
  ]).then(([trashRef]) => {
    if (App.cache['trash']) {
      const entry = App.cache['trash'].find(i => i.deletedAt === trashItem.deletedAt && i.originalCol === 'tasks');
      if (entry) entry._id = trashRef.id;
    }
  }).catch(e => {
    console.error('deleteTask persist error', e);
    clearCache('tasks', 'trash');
    renderTasks();
  });
}

// Sort: overdue → due today → future → no due date → done
// Within same bucket: high priority before medium before low, then by due time
function sortTasks(tasks) {
  const today = todayStr();
  const now = new Date();
  return [...tasks].sort((a, b) => {
    const urgA = taskUrgency(a, today, now);
    const urgB = taskUrgency(b, today, now);
    if (urgA !== urgB) return urgA - urgB;
    const pA = PRIORITY_WEIGHT[a.priority] ?? 1;
    const pB = PRIORITY_WEIGHT[b.priority] ?? 1;
    if (pA !== pB) return pA - pB;
    if (a.dueDate && b.dueDate) {
      const da = a.dueDate + (a.dueTime ? 'T' + a.dueTime : 'T23:59');
      const db = b.dueDate + (b.dueTime ? 'T' + b.dueTime : 'T23:59');
      return da.localeCompare(db);
    }
    return 0;
  });
}

async function renderTasks() {
  const allTasks = await fsGet('tasks');
  const today = todayStr();
  const now = new Date();

  // Separate repeat vs non-repeat
  const repeatTasks = allTasks.filter(t => !t.done && t.repeat);
  const regularTasks = allTasks.filter(t => !t.done && !t.repeat);
  const done = allTasks.filter(t => t.done);

  // Repeat tasks due today go into today bucket
  const repeatDueToday = repeatTasks.filter(t => isRepeatDueToday(t, today));
  const repeatNotDue   = repeatTasks.filter(t => !isRepeatDueToday(t, today));

  const pending = sortTasks(regularTasks);
  const todayItems    = [...sortTasks(repeatDueToday), ...pending.filter(t => t.dueDate && t.dueDate <= today)];
  const upcomingItems = [...sortTasks(repeatNotDue), ...pending.filter(t => t.dueDate && t.dueDate > today)];
  const somedayItems  = pending.filter(t => !t.dueDate);

  function fillSection(sectionId, listId, countId, items) {
    const sec = document.getElementById(sectionId);
    const lst = document.getElementById(listId);
    const cnt = document.getElementById(countId);
    if (!sec || !lst) return;
    if (items.length === 0) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    lst.innerHTML = items.map(t => taskItemHTML(t, today, now)).join('');
    if (cnt) cnt.textContent = items.length;
  }

  fillSection('tasks-today-section',    'tasks-today-list',    'tasks-today-count',    todayItems);
  fillSection('tasks-upcoming-section', 'tasks-upcoming-list', 'tasks-upcoming-count', upcomingItems);
  fillSection('tasks-someday-section',  'tasks-someday-list',  'tasks-someday-count',  somedayItems);

  const doneSec = document.getElementById('tasks-done-section');
  const doneLst = document.getElementById('tasks-done-list');
  const doneCnt = document.getElementById('tasks-done-count');
  if (doneSec) doneSec.style.display = done.length ? '' : 'none';
  if (doneCnt) doneCnt.textContent = done.length;
  if (doneLst && doneLst.style.display !== 'none') {
    doneLst.innerHTML = done.map(t => taskItemHTML(t, today, now)).join('');
  }

  const emptyEl = document.getElementById('tasks-empty-state');
  if (emptyEl) emptyEl.style.display = (allTasks.length === 0) ? '' : 'none';

  const progressRow = document.getElementById('task-progress-row');
  if (progressRow) progressRow.style.display = allTasks.length ? '' : 'none';
  const nonRepeatTotal = allTasks.filter(t => !t.repeat).length;
  const pct = nonRepeatTotal ? Math.round((done.length / nonRepeatTotal) * 100) : 0;
  const bar = document.getElementById('completion-bar');
  const lbl = document.getElementById('completion-label');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = nonRepeatTotal ? `${done.length} of ${nonRepeatTotal} done (${pct}%)` : '';
}

function toggleAddTaskForm() {
  const card = document.getElementById('task-add-card');
  if (!card) return;
  const isHidden = card.style.display === 'none';
  card.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    card.style.animation = 'fadeSlideIn .2s ease both';
    setTimeout(() => document.getElementById('task-input')?.focus(), 50);
  }
}

function toggleDoneSection() {
  const lst = document.getElementById('tasks-done-list');
  const chev = document.getElementById('done-chevron');
  if (!lst) return;
  const isHidden = lst.style.display === 'none';
  lst.style.display = isHidden ? '' : 'none';
  if (chev) chev.textContent = isHidden ? '▾' : '▸';
  if (isHidden) {
    // Populate done list when opened
    const today = todayStr();
    const now = new Date();
    fsGet('tasks').then(tasks => {
      const done = tasks.filter(t => t.done);
      lst.innerHTML = done.map(t => taskItemHTML(t, today, now)).join('');
    });
  }
}

// Returns urgency sort key: 0=overdue, 1=due today, 2=future, 3=no due date, 4=done
function taskUrgency(t, today, now) {
  if (t.done) return 4;
  if (!t.dueDate) return 3;
  if (t.dueDate < today) return 0;
  if (t.dueDate === today) return 1;
  return 2;
}

function priorityBadgeHTML(priority) {
  const map = {
    high:   { label: 'High',   color: 'var(--red)',   dot: '#ef4444' },
    medium: { label: 'Medium', color: 'var(--amber)', dot: '#f59e0b' },
    low:    { label: 'Low',    color: 'var(--text3)', dot: '#64748b' }
  };
  const p = map[priority] || map.medium;
  return `<span class="priority-badge" style="color:${p.color}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${p.dot};margin-right:4px;vertical-align:middle"></span>${p.label}</span>`;
}

function taskDueBadgeHTML(t, today, now) {
  if (!t.dueDate) return '';
  const isOverdue = !t.done && t.dueDate < today;
  const isToday = t.dueDate === today;
  let color = 'var(--text3)';
  let icon = '📅';
  if (isOverdue) { color = 'var(--red)'; icon = '🚨'; }
  else if (isToday) { color = 'var(--amber)'; icon = '⏳'; }
  const timeStr = t.dueTime ? ' · ' + formatTime12(t.dueTime) : '';
  const label = isOverdue ? 'Overdue' : isToday ? 'Today' : formatDate(t.dueDate);
  return `<span class="task-due-badge" style="color:${color}">${icon} ${label}${timeStr}</span>`;
}

function taskItemHTML(t, today, now) {
  const dueBadge = taskDueBadgeHTML(t, today, now);
  const priBadge = priorityBadgeHTML(t.priority || 'medium');
  const reminderText = (t.reminderMins && t.dueTime && !t.done)
    ? `<span class="task-reminder-badge">🔔 ${t.reminderMins >= 60 ? (t.reminderMins/60) + 'h' : t.reminderMins + 'm'} before</span>` : '';

  if (t.repeat && !t.done) {
    // Repeat task — show daily tick + permanent complete button
    const doneToday = (t.completedDates || []).includes(today);
    const repeatLabel = t.repeat === 'daily' ? '🔁 Daily'
      : `🔁 Every ${t.repeatDays} days`;
    return `<div class="task-item task-repeat-item ${doneToday ? 'task-repeat-done-today' : ''}">
      <div class="task-repeat-checks">
        <label class="task-repeat-today-check" title="${doneToday ? 'Done today ✓' : 'Mark done for today'}">
          <input type="checkbox" ${doneToday ? 'checked' : ''} onchange="toggleRepeatToday('${t._id}', '${today}')">
          <span class="task-repeat-check-label">${doneToday ? '✓ Today' : 'Today'}</span>
        </label>
      </div>
      <div class="task-main">
        <span class="task-name ${doneToday ? 'task-repeat-striked' : ''}">${t.text}</span>
        <div class="task-meta-row">
          ${priBadge}
          <span class="task-repeat-badge">${repeatLabel}</span>
          ${dueBadge}${reminderText}
        </div>
      </div>
      <button class="task-repeat-complete-btn" onclick="completeRepeatTask('${t._id}')" title="Mark as permanently completed">✔ Done forever</button>
      <button class="task-delete" onclick="deleteTask('${t._id}')">✕</button>
    </div>`;
  }

  return `<div class="task-item ${t.done ? 'task-done-row' : ''}">
    <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask('${t._id}', ${t.done})">
    <div class="task-main">
      <span class="task-name ${t.done ? 'done' : ''}">${t.text}</span>
      <div class="task-meta-row">${priBadge}${dueBadge}${reminderText}</div>
    </div>
    <button class="task-delete" onclick="deleteTask('${t._id}')">✕</button>
  </div>`;
}

// ===== COURSES =====
async function addCourse() {
  const name = document.getElementById('course-name').value.trim();
  const goalHrsDaily = parseFloat(document.getElementById('course-goal').value) || 1;
  if (!name) return;
  await fsAdd('courses', { name, goalHrsDaily, totalMin: 0 });
  document.getElementById('course-name').value = '';
  document.getElementById('course-goal').value = '';
  renderCourses();
}

async function logCourseTime(id, mins) {
  const courses = App.cache['courses'] || await fsGet('courses');
  const c = courses.find(c => c._id === id);
  if (!c) return;
  const newTotal = (c.totalMin || 0) + mins;
  // Update course total optimistically
  if (App.cache['courses']) {
    const ci = App.cache['courses'].findIndex(x => x._id === id);
    if (ci !== -1) App.cache['courses'][ci].totalMin = newTotal;
  }
  // Add tagged daily log entry
  const tempId = '_tmp_' + Date.now();
  const logEntry = { date: todayStr(), activity: 'Studied ' + c.name, category: 'Study', duration: mins, notes: '', courseId: id };
  if (!App.cache['daily_logs']) App.cache['daily_logs'] = [];
  App.cache['daily_logs'].unshift({ _id: tempId, ...logEntry });
  renderCourses();
  if (App.currentPage === 'daily') renderDailyLog();
  if (App.currentPage === 'dashboard') renderDashboard();
  // Persist in parallel
  Promise.all([
    updateDoc(userDoc('courses', id), { totalMin: newTotal }),
    addDoc(userCol('daily_logs'), { ...logEntry, createdAt: serverTimestamp() }).then(ref => {
      const idx = App.cache['daily_logs'] ? App.cache['daily_logs'].findIndex(i => i._id === tempId) : -1;
      if (idx !== -1) App.cache['daily_logs'][idx]._id = ref.id;
    })
  ]).catch(e => { console.error('logCourseTime error', e); clearCache('courses','daily_logs'); renderCourses(); });
}

async function deleteCourse(id) {
  await fsDelete('courses', id);
  renderCourses();
}

async function renderCourses() {
  const courses = await fsGet('courses');
  const el = document.getElementById('courses-list');
  el.innerHTML = courses.length ? courses.map(c => {
    const goalMin = (c.goalHrsDaily || c.goalHrs || 1) * 60;
    const pct = Math.min(100, Math.round((c.totalMin / goalMin) * 100));
    const h = (c.totalMin / 60).toFixed(1);
    return `<div class="course-card">
      <div class="course-header">
        <div>
          <div class="course-name-text">${c.name}</div>
          <div class="course-meta">${h}h logged · Goal: ${c.goalHrsDaily || c.goalHrs || 1}h/day · ${pct}%</div>
        </div>
        <button class="course-delete" onclick="deleteCourse('${c._id}')">✕</button>
      </div>
      <div class="course-prog-bar-wrap"><div class="course-prog-bar" style="width:${pct}%"></div></div>
      <div class="course-log-btns">
        <span style="font-size:.78rem;color:var(--text3);margin-right:.3rem">Log time:</span>
        <button class="log-btn" onclick="logCourseTime('${c._id}',30)">+30m</button>
        <button class="log-btn" onclick="logCourseTime('${c._id}',60)">+1h</button>
        <button class="log-btn" onclick="logCourseTime('${c._id}',90)">+1.5h</button>
        <button class="log-btn" onclick="logCourseTime('${c._id}',120)">+2h</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">No courses added yet.</div>';
}

// ===== FOCUS =====
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  const toggle = document.getElementById('sound-toggle');
  if (!toggle || !toggle.checked) return;
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    if (type === 'bell') {
      // Three-tone bell — two full repeats for ~5s total
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, now + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.22 + 3.5);
        osc.start(now + i * 0.22); osc.stop(now + i * 0.22 + 3.5);
      });
      // Second wave after short gap
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, now + 1.5 + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5 + i * 0.22 + 3.0);
        osc.start(now + 1.5 + i * 0.22); osc.stop(now + 1.5 + i * 0.22 + 3.0);
      });
    } else if (type === 'chime') {
      // Extended chime sequence — two passes for ~5s
      const freqs = [880, 1100, 1320, 1760, 1320, 1100, 880, 1100, 1320, 1760];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, now + i * 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.28 + 2.2);
        osc.start(now + i * 0.28); osc.stop(now + i * 0.28 + 2.2);
      });
    } else if (type === 'beep') {
      // Extended beep pattern — 5s worth of pulses
      const pattern = [440, 440, 880, 880, 440, 440, 880, 880, 440, 880];
      pattern.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.28, now + i * 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.28 + 0.38);
        osc.start(now + i * 0.28); osc.stop(now + i * 0.28 + 0.40);
      });
    } else if (type === 'digital') {
      // Extended digital sweep — 5s
      const freqs = [600, 800, 1000, 1200, 1000, 800, 600, 800, 1000, 1200, 1000, 800, 600];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, now + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.25);
        osc.start(now + i * 0.2); osc.stop(now + i * 0.2 + 0.28);
      });
    }
  } catch(e) { console.log('Audio error:', e); }
}

function getCurrentSound() { return document.getElementById('sound-type')?.value || 'bell'; }

// Spinner controls for new focus UI
let _focusWorkMins = 25;

// Returns the auto-break count based on duration
// ≤30 → 0 breaks, >30 → 1 break (mid-session), more for longer sessions
function autoBreakCount(mins) {
  if (mins <= 30)  return 0;
  if (mins <= 90)  return 1;
  if (mins <= 110) return 2;
  if (mins <= 155) return 3;
  if (mins <= 200) return 4;
  return 5;
}

// Default break duration per slot
function autoBreakMins(mins) {
  if (mins <= 30)  return 5;
  if (mins <= 60)  return 5;
  if (mins <= 90)  return 10;
  if (mins <= 110) return 10;
  if (mins <= 155) return 15;
  return 20;
}

function focusAdjustMins(delta) {
  _focusWorkMins = Math.max(5, Math.min(240, _focusWorkMins + delta));
  const el = document.getElementById('focus-spin-display');
  if (el) el.textContent = _focusWorkMins;
  _syncAutoBreaks();
  _applySpinnerPreset();
}

function _syncAutoBreaks() {
  const count = autoBreakCount(_focusWorkMins);
  const brk   = autoBreakMins(_focusWorkMins);
  const cntEl = document.getElementById('custom-count');
  const brkEl = document.getElementById('custom-brk');
  if (cntEl) cntEl.value = count;
  if (brkEl) brkEl.value = brk;
  const lbl = document.getElementById('break-auto-label');
  if (lbl) {
    if (count === 0) {
      lbl.textContent = 'No breaks';
    } else {
      lbl.textContent = count + (count === 1 ? ' break' : ' breaks') + ' · ' + brk + ' min each · at midpoint';
    }
  }
}

function focusAdjustBreak(delta) {
  const el = document.getElementById('custom-brk');
  if (!el) return;
  el.value = Math.max(1, Math.min(60, (parseInt(el.value) || 5) + delta));
  _applySpinnerPreset();
}

function focusAdjustCount(delta) {
  const el = document.getElementById('custom-count');
  if (!el) return;
  el.value = Math.max(1, Math.min(20, (parseInt(el.value) || 3) + delta));
  _applySpinnerPreset();
}

function _applySpinnerPreset() {
  if (App.focusRunning) return; // FIX: guard clause stops layout over-writes on tab swap
  const work = _focusWorkMins;
  const brk = parseInt(document.getElementById('custom-brk')?.value) || 5;
  const count = parseInt(document.getElementById('custom-count')?.value) || 0;
  App.focusPreset = { name: 'Focus', work, brk, breakCount: count };
  focusReset();
}

// skip-breaks removed
function toggleSkipBreaks() {}  // stub - feature removed

// Legacy stubs so old callers don't break
function showCustomTimer() {}
function applyCustomTimer() { _applySpinnerPreset(); }
function setPreset(work, brk, breakCount, name) {
  _focusWorkMins = work;
  const spinEl = document.getElementById('focus-spin-display');
  if (spinEl) spinEl.textContent = work;
  _syncAutoBreaks();
  if (breakCount !== -1) {
    const cntEl = document.getElementById('custom-count');
    if (cntEl) cntEl.value = breakCount;
    const brkEl = document.getElementById('custom-brk');
    if (brkEl) brkEl.value = brk;
  }
  const finalBrk = parseInt(document.getElementById('custom-brk')?.value) || brk;
  const finalCount = parseInt(document.getElementById('custom-count')?.value) || breakCount;
  App.focusPreset = { name: 'Focus', work, brk: finalBrk, breakCount: finalCount };
  focusReset();
}

// Task picker for focus page
let _focusSelectedTaskId = null;

async function renderFocusTaskList() {
  const tasks = await fsGet('tasks');
  const pending = tasks.filter(t => !t.done);
  const el = document.getElementById('focus-task-list');
  if (!el) return;
  if (!pending.length) {
    el.innerHTML = '<div class="empty-state" style="font-size:.82rem">No pending tasks. Add tasks in the Tasks page.</div>';
    return;
  }
  el.innerHTML = pending.slice(0, 10).map(t => {
    const sel = _focusSelectedTaskId === t._id;
    return `<div class="focus-task-option ${sel ? 'selected' : ''}"
      onclick="selectFocusTask('${t._id}', this.dataset.text)" data-text="${t.text.replace(/"/g,'&quot;')}">
      <span class="focus-task-radio ${sel ? 'checked' : ''}"></span>
      <span class="focus-task-text">${t.text}</span>
    </div>`;
  }).join('');
}

function selectFocusTask(id, text) {
  _focusSelectedTaskId = id;
  const input = document.getElementById('focus-task-input');
  if (input) input.value = text;
  renderFocusTaskList();
}

async function renderFocusDailyProgress() {
  const logs = await fsGet('daily_logs');
  const today = todayStr();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  const todayMins = logs.filter(l => l.date === today).reduce((s, l) => s + (l.duration || 0), 0);
  const yestMins = logs.filter(l => l.date === yStr).reduce((s, l) => s + (l.duration || 0), 0);
  const goalMins = App.prefs.goalMins || 240;
  const goalHrs = Math.floor(goalMins / 60);
  const goalMinsRem = goalMins % 60;

  const ydEl = document.getElementById('focus-dp-yesterday');
  if (ydEl) ydEl.textContent = yestMins + 'm';
  const goalEl = document.getElementById('focus-dp-goal');
  if (goalEl) goalEl.textContent = goalHrs + (goalMinsRem ? '.' + Math.round(goalMinsRem/60*10) : '');
  const completedEl = document.getElementById('focus-dp-completed');
  if (completedEl) {
    const h = Math.floor(todayMins / 60), m = todayMins % 60;
    const pct = Math.min(100, Math.round(todayMins / goalMins * 100));
    completedEl.textContent = 'Today: ' + (h ? h + 'h ' : '') + m + 'm studied  (' + pct + '% of goal)';
  }
  const streakEl = document.getElementById('focus-dp-streak');
  if (streakEl) streakEl.textContent = calcStreak(logs);

  // SVG ring: circumference = 2 * π * 40 ≈ 251.3 (r=40 from viewBox)
  const ring = document.getElementById('focus-dp-ring');
  if (ring) {
    const pct = Math.min(1, todayMins / goalMins);
    ring.style.strokeDashoffset = 251 * (1 - pct);
    ring.setAttribute('stroke', pct >= 1 ? 'var(--green)' : 'var(--accent)');
  }

  // Pre-fill edit input with current goal
  const inp = document.getElementById('focus-goal-mins-input');
  if (inp && !inp._focused) inp.value = goalMins;
}

function toggleFocusGoalEdit() {
  const panel = document.getElementById('focus-goal-edit-panel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : '';
  if (!open) {
    const inp = document.getElementById('focus-goal-mins-input');
    if (inp) { inp.value = App.prefs.goalMins || 240; inp.focus(); inp.select(); }
    // Highlight current preset
    document.querySelectorAll('.focus-goal-preset-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.textContent) * 60 === (App.prefs.goalMins || 240) ||
        (b.textContent === (Math.floor((App.prefs.goalMins||240)/60) + 'h') && (App.prefs.goalMins||240) % 60 === 0));
    });
  }
}

function setFocusGoalPreset(mins, e) {
  const inp = document.getElementById('focus-goal-mins-input');
  if (inp) inp.value = mins;
  document.querySelectorAll('.focus-goal-preset-btn').forEach(b => b.classList.remove('active'));
  if (e?.target) e.target.classList.add('active');
}

async function saveFocusGoal() {
  const inp = document.getElementById('focus-goal-mins-input');
  const mins = parseInt(inp ? inp.value : 240) || 240;
  App.prefs.goalMins = Math.max(30, Math.min(1440, mins));
  await savePrefs();
  document.getElementById('focus-goal-edit-panel').style.display = 'none';
  renderFocusDailyProgress();
  showToast('Daily goal updated to ' + App.prefs.goalMins + ' min ✓', 'success', 2500);
}

function updateBreakDots() {
  const total = App.focusPreset.breakCount || 0;
  const completed = App.focusBreaksDone || 0;
  const isCurrent = App.focusIsBreak;
  const dots = document.getElementById('break-dots');
  const label = document.getElementById('break-count-label');
  if (!dots) return;
  let html = '';
  for (let i = 0; i < total; i++) {
    if (i < completed) html += '<span class="break-dot done"></span>';
    else if (i === completed && isCurrent) html += '<span class="break-dot current"></span>';
    else html += '<span class="break-dot"></span>';
  }
  dots.innerHTML = html;
  if (label) label.textContent = total > 0 ? `${completed}/${total} breaks` : '';
}

// ── Mid-session break scheduling ───────────────────────────────────────────────
// For a session with N breaks, we split the work time into (N+1) equal segments.
// Each segment is followed by a break, except after the last segment.
// e.g. 40 min work, 1 break, 5 min break:
//   Segment 1: 20 min work → 5 min break → Segment 2: 20 min work → DONE
//   Total time displayed = 40 + 5 = 45 min
//
// App.focusSegmentIndex  = which work segment we're currently in (0-based)
// App.focusSegmentCount  = total number of work segments = breakCount + 1
// App.focusTotalSessionMs = full session ms including all break time (for total display)

function _buildSegments(preset) {
  // Returns array of {type:'work'|'break', seconds} in order
  const breakCount = preset.breakCount || 0;
  const workTotalSecs = preset.work * 60;
  const brkSecs = preset.brk * 60;
  const segments = [];
  if (breakCount === 0) {
    segments.push({ type: 'work', seconds: workTotalSecs });
  } else {
    // Distribute work time evenly across (breakCount+1) segments
    const segCount = breakCount + 1;
    const baseSeg = Math.floor(workTotalSecs / segCount);
    const remainder = workTotalSecs - baseSeg * segCount;
    for (let i = 0; i < segCount; i++) {
      const segSecs = baseSeg + (i === 0 ? remainder : 0); // put remainder in first segment
      segments.push({ type: 'work', seconds: segSecs });
      if (i < segCount - 1) {
        segments.push({ type: 'break', seconds: brkSecs });
      }
    }
  }
  return segments;
}

// ── Persistent timer state (survives tab close) ────────────────────────────────
const LS_FOCUS = 'deeptrck-focus-state';

function _autoRestoreFocusOnInit() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(LS_FOCUS)); } catch(e) { raw = null; }
  if (!raw || !raw.running || !raw.phaseStartedAt) return;

  App.focusPreset       = raw.preset;
  App.focusIsBreak      = raw.isBreak;
  App.focusBreaksDone   = raw.breaksDone;
  App.focusSession      = raw.session;
  App.focusTotalSeconds = raw.phaseTotalSeconds;
  App.focusPhaseStartedAt = raw.phaseStartedAt;
  App.focusSegmentIndex = raw.segmentIndex || 0;
  App.focusSegments     = raw.segments || _buildSegments(raw.preset);

  _focusWorkMins = raw.preset.work;

  const elapsed   = Math.floor((Date.now() - raw.phaseStartedAt) / 1000);
  const remaining = Math.max(0, raw.phaseTotalSeconds - elapsed);

  if (remaining <= 0) {
    App.focusSeconds = 0;
    _onPhaseEnd();
  } else {
    App.focusSeconds = remaining;
    App.focusRunning = true; // FIX: set true immediately to prevent parallel race condition
    _resumeInterval();
  }
}

function saveFocusStateLS() {
  const state = {
    running: App.focusRunning,
    phaseStartedAt: App.focusPhaseStartedAt,
    phaseTotalSeconds: App.focusTotalSeconds,
    pausedSecondsLeft: App.focusRunning ? null : App.focusSeconds,
    isBreak: App.focusIsBreak,
    breaksDone: App.focusBreaksDone || 0,
    session: App.focusSession || 1,
    segmentIndex: App.focusSegmentIndex || 0,
    segments: App.focusSegments || [],
    preset: App.focusPreset,
    task: document.getElementById('focus-task-input')?.value || ''
  };
  localStorage.setItem(LS_FOCUS, JSON.stringify(state));
}

function clearFocusStateLS() {
  localStorage.removeItem(LS_FOCUS);
}

// Called when navigating to the focus page.
// Reconstructs UI from App state (already running) or from localStorage.
function restoreFocusState() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(LS_FOCUS)); } catch(e) { raw = null; }
  if (!raw) return;

  App.focusPreset       = raw.preset;
  App.focusIsBreak      = raw.isBreak;
  App.focusBreaksDone   = raw.breaksDone;
  App.focusSession      = raw.session;
  App.focusSegmentIndex = raw.segmentIndex || 0;
  App.focusSegments     = raw.segments || _buildSegments(raw.preset);

  _focusWorkMins = raw.preset.work;
  const spinEl = document.getElementById('focus-spin-display');
  if (spinEl) spinEl.textContent = raw.preset.work;
  const brkEl = document.getElementById('custom-brk');
  if (brkEl) brkEl.value = raw.preset.brk;
  const cntEl = document.getElementById('custom-count');
  if (cntEl) cntEl.value = raw.preset.breakCount;

  const taskEl = document.getElementById('focus-task-input');
  if (taskEl && raw.task) taskEl.value = raw.task;

  if (raw.running && raw.phaseStartedAt) {
    // Recompute remaining from wall-clock — fixes tab-switch flicker and reopen blank
    const elapsed   = Math.floor((Date.now() - raw.phaseStartedAt) / 1000);
    const remaining = Math.max(0, raw.phaseTotalSeconds - elapsed);
    App.focusTotalSeconds   = raw.phaseTotalSeconds;
    App.focusPhaseStartedAt = raw.phaseStartedAt;

    // Set seconds immediately before starting interval — no blank/wrong flash
    App.focusSeconds = remaining;

    if (remaining <= 0) {
      _updateFocusUI();
      updateClock();
      _onPhaseEnd();
    } else {
      // If interval already running (background restore), just re-sync UI
      if (App.focusRunning && App.focusInterval) {
        _updateFocusUI();
        updateClock();
        updateBreakDots();
      } else {
        _updateFocusUI();
        updateClock(); // FIX: instantly force vector calculations before interval cycles activate
        if (!App.focusInterval) {
          _resumeInterval();
        }
      }
    }
  } else {
    // Paused — restore exact paused position immediately
    App.focusTotalSeconds = raw.phaseTotalSeconds;
    App.focusSeconds      = raw.pausedSecondsLeft ?? raw.phaseTotalSeconds;
    App.focusRunning      = false;
    _updateFocusUI();
    updateClock();
    updateBreakDots();
  }
}

// Set UI chrome (mode label, ring colour, buttons) from App state
function _updateFocusUI() {
  const modeEl   = document.getElementById('clock-mode');
  const ringEl   = document.getElementById('ring-progress');
  const sessEl   = document.getElementById('clock-session');
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  if (modeEl)   modeEl.textContent   = App.focusIsBreak ? 'BREAK' : 'FOCUS';
  if (ringEl)   ringEl.style.stroke  = App.focusIsBreak ? '#34d399' : '#38bdf8';
  if (sessEl)   sessEl.textContent   = '';
  if (btnStart) btnStart.style.display = App.focusRunning ? 'none' : '';
  if (btnPause) btnPause.style.display = App.focusRunning ? '' : 'none';
}

function _resumeInterval() {
  if (App.focusRunning && App.focusInterval) return; // already ticking
  App.focusRunning = true;
  _updateFocusUI();
  updateClock();
  updateBreakDots();
  App.focusInterval = setInterval(() => {
    // Always recompute from wall-clock timestamp — immune to tab switching
    const elapsed = Math.floor((Date.now() - App.focusPhaseStartedAt) / 1000);
    App.focusSeconds = Math.max(0, App.focusTotalSeconds - elapsed);
    updateClock();
    if (App.focusSeconds <= 0) {
      clearInterval(App.focusInterval);
      App.focusInterval = null;
      App.focusRunning  = false;
      _onPhaseEnd();
    }
  }, 500);
}

function _onPhaseEnd() {
  const segments    = App.focusSegments || _buildSegments(App.focusPreset);
  const segIdx      = App.focusSegmentIndex || 0;
  const nextSegIdx  = segIdx + 1;

  if (!App.focusIsBreak) {
    // Work segment just ended — log it
    saveFocusSession();
  }

  if (nextSegIdx >= segments.length) {
    // All segments complete — session done!
    playSound(getCurrentSound());
    showNotif('All done! 🏆', 'Session complete. Great work!');
    celebrateFocusDone();
    if (document.getElementById('clock-mode'))    document.getElementById('clock-mode').textContent    = 'DONE';
    if (document.getElementById('clock-display')) document.getElementById('clock-display').textContent = '00:00';
    if (!App.focusIsBreak) App.focusBreaksDone = (App.focusPreset.breakCount || 0);
    updateBreakDots();
    clearFocusStateLS();
    App.focusRunning = false;
    _updateFocusUI();
    return;
  }

  // Move to next segment
  const nextSeg = segments[nextSegIdx];
  App.focusSegmentIndex = nextSegIdx;
  App.focusSegments     = segments;
  App.focusIsBreak      = (nextSeg.type === 'break');
  App.focusTotalSeconds = nextSeg.seconds;
  App.focusSeconds      = nextSeg.seconds;
  App.focusPhaseStartedAt = Date.now();

  if (App.focusIsBreak) {
    const breakNum = App.focusBreaksDone + 1;
    const totalBreaks = App.focusPreset.breakCount || 0;
    playSound(getCurrentSound());
    showNotif('Break time! ☕', `${App.focusPreset.brk} min break. (${breakNum}/${totalBreaks})`);
  } else {
    App.focusBreaksDone = (App.focusBreaksDone || 0) + 1;
    App.focusSession++;
    playSound(getCurrentSound());
    showNotif('Back to focus! 🎯', 'Break over. Keep going!');
  }

  saveFocusStateLS();
  _updateFocusUI();
  updateBreakDots();
  _resumeInterval();
}

// ── Public timer controls ──────────────────────────────────────────────────────

function focusStart() {
  if (App.focusRunning) return;
  getAudioCtx();

  const segments = _buildSegments(App.focusPreset);
  App.focusSegments     = segments;
  App.focusSegmentIndex = App.focusSegmentIndex || 0;

  if (App.focusSeconds === 0 || App.focusSeconds === undefined) {
    // Fresh start — begin from first segment
    App.focusSegmentIndex = 0;
    App.focusIsBreak      = (segments[0].type === 'break');
    App.focusSeconds      = segments[0].seconds;
    App.focusTotalSeconds = segments[0].seconds;
  }

  // Adjust phaseStartedAt to account for any already-elapsed paused time
  App.focusPhaseStartedAt = Date.now() - ((App.focusTotalSeconds - App.focusSeconds) * 1000);
  playSound(getCurrentSound());
  saveFocusStateLS();
  syncFocusToSW();
  _resumeInterval();
}

function focusPause() {
  clearInterval(App.focusInterval);
  App.focusInterval = null;
  App.focusRunning  = false;
  // Snapshot the exact remaining seconds at pause time
  if (App.focusPhaseStartedAt) {
    const elapsed = Math.floor((Date.now() - App.focusPhaseStartedAt) / 1000);
    App.focusSeconds = Math.max(0, App.focusTotalSeconds - elapsed);
  }
  _updateFocusUI();
  saveFocusStateLS();
  syncFocusToSW();
}

function focusReset() {
  clearInterval(App.focusInterval);
  App.focusInterval     = null;
  App.focusRunning      = false;
  App.focusIsBreak      = false;
  App.focusBreaksDone   = 0;
  App.focusSession      = 1;
  App.focusPhaseStartedAt = null;
  App.focusSegmentIndex = 0;
  App.focusSegments     = _buildSegments(App.focusPreset);
  App.focusSeconds      = App.focusPreset.work * 60;
  App.focusTotalSeconds = App.focusPreset.work * 60;
  clearFocusStateLS();
  syncFocusToSW();
  _updateFocusUI();
  updateClock();
  updateBreakDots();
}

function skipPhase() {
  // Kept as stub — skip button removed from UI
}

// Tell SW about upcoming phase-end times so it can fire notifications
// even if the tab is closed.
function syncFocusToSW() {
  if (!navigator.serviceWorker?.controller) return;
  if (!App.focusRunning || !App.focusPhaseStartedAt) {
    navigator.serviceWorker.controller.postMessage({ type: 'FOCUS_CANCEL' });
    return;
  }
  const phaseEndAt = App.focusPhaseStartedAt + App.focusTotalSeconds * 1000;
  navigator.serviceWorker.controller.postMessage({
    type: 'FOCUS_START',
    phaseEndAt,
    isBreak: App.focusIsBreak,
    preset: App.focusPreset,
    breaksDone: App.focusBreaksDone || 0,
    session: App.focusSession || 1,
    task: document.getElementById('focus-task-input')?.value || ''
  });
}

async function saveFocusSession() {
  const task = document.getElementById('focus-task-input')?.value.trim() || 'Focus session';
  // Calculate actual work minutes for this segment
  const segments = App.focusSegments || _buildSegments(App.focusPreset);
  const segIdx   = App.focusSegmentIndex || 0;
  const segSecs  = segments[segIdx]?.seconds || App.focusPreset.work * 60;
  const segMins  = Math.round(segSecs / 60);
  await fsAdd('focus_sessions', { date: todayStr(), mins: segMins, task });
  await fsAdd('daily_logs', { date: todayStr(), activity: task, category: 'Study', duration: segMins, notes: '' });
  clearCache('focus_sessions', 'daily_logs');
  renderFocusLog();
  // Drain energy after focus session
  if (typeof drainEnergy === 'function') drainEnergy(segMins);
}

function updateClock() {
  const s   = App.focusSeconds || 0;
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  const display = String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  const clockEl = document.getElementById('clock-display');
  if (clockEl) clockEl.textContent = display;
  const pct    = App.focusTotalSeconds > 0 ? s / App.focusTotalSeconds : 1;
  const ringEl = document.getElementById('ring-progress');
  if (ringEl) ringEl.style.strokeDashoffset = 654 * (1 - pct);
  if (typeof updateClockFullscreen === 'function') updateClockFullscreen();
}

async function deleteFocusSession(id) {
  await fsDelete('focus_sessions', id);
  renderFocusLog();
}

async function renderFocusLog() {
  const sessions = await fsGet('focus_sessions');
  const todaySessions = sessions.filter(s => s.date === todayStr());
  const el = document.getElementById('focus-log');
  el.innerHTML = todaySessions.length ? todaySessions.map(s => `
    <div class="focus-log-item">
      <span>🎯 ${s.task}</span>
      <span style="display:flex;align-items:center;gap:.75rem">
        <span style="color:var(--text2);font-size:.8rem">${s.mins} min</span>
        <button class="task-delete" onclick="deleteFocusSession('${s._id}')" title="Delete">✕</button>
      </span>
    </div>`).join('') : '<div class="empty-state">No sessions today yet.</div>';
}

// ===== TYPING WPM =====
async function addWpmRecord() {
  const wpm = parseInt(document.getElementById('wpm-value').value);
  const acc = parseInt(document.getElementById('wpm-accuracy').value);
  const src = document.getElementById('wpm-source').value.trim() || 'Unknown';
  if (!wpm || wpm < 1) { alert('Please enter a valid WPM score.'); return; }
  await fsAdd('wpm_records', { wpm, acc, src, date: todayStr() });
  await fsAdd('daily_logs', { date: todayStr(), activity: 'Typing test: ' + wpm + ' WPM' + (acc ? ', ' + acc + '% accuracy' : ''), category: 'Typing', duration: 5, notes: src });
  clearCache('wpm_records', 'daily_logs');
  document.getElementById('wpm-value').value = '';
  document.getElementById('wpm-accuracy').value = '';
  document.getElementById('wpm-source').value = '';
  renderTyping();
}

async function renderTyping() {
  const records = (await fsGet('wpm_records')).sort((a, b) => a.date.localeCompare(b.date));
  if (!records.length) {
    document.getElementById('wpm-list').innerHTML = '<div class="empty-state">No records yet. Log your first WPM above!</div>';
    document.getElementById('wpm-chart').innerHTML = '';
    ['wpm-best','wpm-latest','wpm-avg'].forEach(id => document.getElementById(id).textContent = '—');
    document.getElementById('wpm-count').textContent = '0';
    return;
  }
  const best = Math.max(...records.map(r => r.wpm));
  const latest = records[records.length - 1].wpm;
  const avg = Math.round(records.reduce((s, r) => s + r.wpm, 0) / records.length);
  document.getElementById('wpm-best').textContent = best;
  document.getElementById('wpm-latest').textContent = latest;
  document.getElementById('wpm-avg').textContent = avg;
  document.getElementById('wpm-count').textContent = records.length;
  const maxWpm = Math.max(...records.map(r => r.wpm));
  document.getElementById('wpm-chart').innerHTML = records.slice(-20).map(r => {
    const h = Math.max(8, (r.wpm / maxWpm) * 70);
    return `<div class="wpm-bar-item ${r.wpm === best ? 'best' : ''}" style="height:${h}px" title="${r.wpm} WPM · ${r.date}"></div>`;
  }).join('');
  document.getElementById('wpm-list').innerHTML = [...records].reverse().slice(0, 20).map(r => `
    <div class="wpm-record">
      <span class="wpm-num">${r.wpm}</span>
      ${r.acc ? '<span class="wpm-acc">' + r.acc + '%</span>' : ''}
      <span class="wpm-src">${r.src}</span>
      <span class="wpm-date-small">${r.date}</span>
    </div>`).join('');
}

// ===== REPORTS =====
function switchReportTab(tab) {
  App.currentReportTab = tab;
  document.getElementById('report-weekly').style.display = tab === 'weekly' ? '' : 'none';
  document.getElementById('report-monthly').style.display = tab === 'monthly' ? '' : 'none';
  document.querySelectorAll('#page-reports .tab').forEach(t => t.classList.remove('active'));
  const tabs = document.querySelectorAll('#page-reports .tab');
  if (tab === 'weekly' && tabs[0]) tabs[0].classList.add('active');
  if (tab === 'monthly' && tabs[1]) tabs[1].classList.add('active');
  if (tab === 'weekly') generateWeeklyReport();
  if (tab === 'monthly') generateMonthlyReport();
}

async function generateWeeklyReport() {
  const dateStr = document.getElementById('report-week-date').value || todayStr();
  const base = new Date(dateStr + 'T12:00:00');
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const [logs, tasks, wpm, courses, focus] = await Promise.all([
    fsGet('daily_logs'), fsGet('tasks'), fsGet('wpm_records'), fsGet('courses'), fsGet('focus_sessions')
  ]);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const weekLogs = logs.filter(l => weekDays.includes(l.date));
  const totalMin = weekLogs.reduce((s, l) => s + (l.duration || 0), 0);
  const studyDays = new Set(weekLogs.map(l => l.date)).size;
  const weekTasks = tasks;
  const doneTasks = weekTasks.filter(t => t.done).length;
  const weekWpm = wpm.filter(w => weekDays.includes(w.date));
  const weekFocus = focus.filter(f => weekDays.includes(f.date));
  const catBreakdown = {};
  weekLogs.forEach(l => { catBreakdown[l.category] = (catBreakdown[l.category] || 0) + (l.duration || 0); });

  const badges = [];
  if (studyDays >= 7) badges.push('🏆 Perfect Week');
  if (studyDays >= 5) badges.push('🔥 5-Day Streak');
  if (totalMin >= 240 * 5) badges.push('📚 Study Marathon');
  if (weekWpm.length >= 3) badges.push('⌨️ Typing Pro');
  if (weekFocus.length >= 5) badges.push('🎯 Focus Master');
  if (!badges.length) badges.push('📈 Keep Going!');

  document.getElementById('weekly-report-content').innerHTML = `
    <div class="report-highlight">
      <h3>Week of ${formatDate(monday.toISOString().slice(0,10))} — ${formatDate(sunday.toISOString().slice(0,10))}</h3>
      <div class="badge-grid">${badges.map(b => '<span class="achieve-badge">' + b + '</span>').join('')}</div>
    </div>
    <div class="stats-grid" style="margin-bottom:1rem">
      <div class="stat-card"><div class="stat-label">Study Time</div><div class="stat-value" style="font-size:1.5rem">${Math.floor(totalMin/60)}h ${totalMin%60}m</div></div>
      <div class="stat-card"><div class="stat-label">Active Days</div><div class="stat-value" style="font-size:1.5rem">${studyDays}/7</div></div>
      <div class="stat-card"><div class="stat-label">Tasks Done</div><div class="stat-value" style="font-size:1.5rem">${doneTasks}/${weekTasks.length}</div></div>
      <div class="stat-card"><div class="stat-label">Focus Sessions</div><div class="stat-value" style="font-size:1.5rem">${weekFocus.length}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Time by Category</div>
      ${Object.entries(catBreakdown).length ? Object.entries(catBreakdown).map(([cat, mins]) => `
        <div class="report-course-bar">
          <div class="report-course-label"><span>${cat}</span><span>${Math.floor(mins/60)}h ${mins%60}m</span></div>
          <div class="report-course-bar-wrap"><div class="report-course-fill" style="width:${Math.round((mins/totalMin)*100)}%;background:${CAT_COLORS[cat]||'var(--accent)'}"></div></div>
        </div>`).join('') : '<div class="empty-state">No activity this week.</div>'}
    </div>
    <details class="report-details">
      <summary>All Activities This Week</summary>
      ${weekLogs.length ? '<table class="report-activities-table"><tr><th>Date</th><th>Activity</th><th>Category</th><th>Duration</th></tr>' +
        weekLogs.map(l => '<tr><td style="color:var(--text3);font-family:var(--mono);font-size:.78rem">' + l.date + '</td><td>' + l.activity + '</td><td><span class="cat-badge">' + l.category + '</span></td><td style="font-family:var(--mono)">' + (l.duration ? l.duration + 'm' : '—') + '</td></tr>').join('') +
        '</table>' : '<div class="empty-state">No activities logged this week.</div>'}
    </details>`;
}

async function generateMonthlyReport() {
  const month = document.getElementById('report-month').value || todayStr().slice(0, 7);
  const [logs, tasks, wpm, courses, focus] = await Promise.all([
    fsGet('daily_logs'), fsGet('tasks'), fsGet('wpm_records'), fsGet('courses'), fsGet('focus_sessions')
  ]);
  const monthLogs = logs.filter(l => l.date.startsWith(month));
  const totalMin = monthLogs.reduce((s, l) => s + (l.duration || 0), 0);
  const studyDays = new Set(monthLogs.map(l => l.date)).size;
  const monthWpm = wpm.filter(w => w.date.startsWith(month));
  const monthFocus = focus.filter(f => f.date.startsWith(month));
  const catBreakdown = {};
  monthLogs.forEach(l => { catBreakdown[l.category] = (catBreakdown[l.category] || 0) + (l.duration || 0); });
  const daysInMonth = new Date(month.slice(0,4), month.slice(5,7), 0).getDate();
  const consistency = Math.round((studyDays / daysInMonth) * 100);
  const badges = [];
  if (studyDays >= 25) badges.push('🏆 Month Champion');
  if (studyDays >= 15) badges.push('🔥 Half Month');
  if (totalMin >= 3000) badges.push('📚 50h Club');
  if (monthFocus.length >= 20) badges.push('🎯 Focus King');
  if (monthWpm.length >= 10) badges.push('⌨️ Speed Typist');
  if (!badges.length) badges.push('📈 Building Momentum!');

  document.getElementById('monthly-report-content').innerHTML = `
    <div class="report-highlight">
      <h3>${new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — Summary</h3>
      <div class="badge-grid">${badges.map(b => '<span class="achieve-badge">' + b + '</span>').join('')}</div>
    </div>
    <div class="stats-grid" style="margin-bottom:1rem">
      <div class="stat-card"><div class="stat-label">Study Hours</div><div class="stat-value" style="font-size:1.5rem">${(totalMin/60).toFixed(1)}h</div></div>
      <div class="stat-card"><div class="stat-label">Active Days</div><div class="stat-value" style="font-size:1.5rem">${studyDays}</div></div>
      <div class="stat-card"><div class="stat-label">Consistency</div><div class="stat-value" style="font-size:1.5rem">${consistency}%</div></div>
      <div class="stat-card"><div class="stat-label">Focus Sessions</div><div class="stat-value" style="font-size:1.5rem">${monthFocus.length}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Time Breakdown by Category</div>
      ${Object.entries(catBreakdown).sort((a,b)=>b[1]-a[1]).map(([cat, mins]) => `
        <div class="report-course-bar">
          <div class="report-course-label"><span>${cat}</span><span>${Math.floor(mins/60)}h ${mins%60}m (${Math.round((mins/totalMin)*100)}%)</span></div>
          <div class="report-course-bar-wrap"><div class="report-course-fill" style="width:${Math.round((mins/totalMin)*100)}%;background:${CAT_COLORS[cat]||'var(--accent)'}"></div></div>
        </div>`).join('') || '<div class="empty-state">No data this month.</div>'}
    </div>
    <details class="report-details">
      <summary>All Activities This Month</summary>
      ${monthLogs.length ? '<table class="report-activities-table"><tr><th>Date</th><th>Activity</th><th>Category</th><th>Duration</th></tr>' +
        monthLogs.map(l => '<tr><td style="color:var(--text3);font-family:var(--mono);font-size:.78rem">' + l.date + '</td><td>' + l.activity + '</td><td><span class="cat-badge">' + l.category + '</span></td><td style="font-family:var(--mono)">' + (l.duration ? l.duration + 'm' : '—') + '</td></tr>').join('') +
        '</table>' : '<div class="empty-state">No activities this month.</div>'}
    </details>`;
}

function metric(label, val) {
  return '<div class="report-metric"><span>' + label + '</span><span class="report-metric-val">' + val + '</span></div>';
}

function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

// ===== NOTIFICATIONS + SERVICE WORKER =====

// Register service worker for background notifications (works even when tab is closed)
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
  } catch (e) { console.warn('SW register failed', e); }
}

function requestNotificationsAuto() {
  if ('Notification' in window && Notification.permission === 'granted') {
    registerSW();
    syncRemindersToSW();
  }
}

async function requestNotifications() {
  if (!('Notification' in window)) { alert('Notifications not supported in this browser.'); return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') {
    await registerSW();
    showNotif('DeepTrck Notifications Enabled! 🎉', "You'll get task reminders even when the tab is closed.");
    syncRemindersToSW();
  } else {
    alert('Notifications blocked. Please allow them in your browser settings.');
  }
}


// ── Toast / micro-animation helpers ──────────────────────────────────────────

function showToast(msg, type = 'info', duration = 2800) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-show'));
  setTimeout(() => {
    t.classList.remove('toast-show');
    setTimeout(() => t.remove(), 350);
  }, duration);
}

function burstConfetti(x, y) {
  const colors = ['#38bdf8','#34d399','#fbbf24','#a78bfa','#f472b6'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i%colors.length]};--dx:${(Math.random()-0.5)*120}px;--dy:${-(Math.random()*80+40)}px`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

function celebrateTask(checkboxEl) {
  // XP is now awarded/deducted directly in toggleTask — just do confetti here
  if (checkboxEl) {
    const r = checkboxEl.getBoundingClientRect();
    burstConfetti(r.left + r.width/2, r.top + r.height/2);
  }
}

function celebrateFocusDone() {
  burstConfetti(window.innerWidth/2, window.innerHeight/2);
  const mins = Math.round((App.focusTotalSeconds || 0) / 60);
  const xp = Math.max(10, mins * XP_FOCUS_MIN);
  showToast('Focus session complete! 🎯  +' + xp + ' XP  +5 🪙', 'success', 3500);
  addXp(xp, 'Focus session', null);
  addCoins(5); // focus session = 5 coins
  checkAchievementsAfterAction();
}

function celebrateStreak(n) {
  if (n > 0 && n % 7 === 0) {
    burstConfetti(window.innerWidth/2, 120);
    showToast('🔥 ' + n + '-day streak! +' + XP_7DAY_STREAK + ' XP BONUS! Keep it up!', 'fire', 4000);
    // Award 7-day streak bonus XP
    const state = getXpState();
    const streakKey = 'streak7_' + Math.floor(n / 7) + '_' + todayStr().slice(0,7);
    if (!(state.streakBonuses || {})[streakKey]) {
      state.streakBonuses = state.streakBonuses || {};
      state.streakBonuses[streakKey] = true;
      saveXpState(state);
      addXp(XP_7DAY_STREAK, '7-day streak!', null);
      addCoins(100); // weekly streak = 100 coins
    }
  } else if (n >= 3) {
    showToast('🔥 ' + n + ' days in a row!', 'fire', 2800);
  }
}

function showNotif(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
}

// Send all pending task reminders to the service worker so it can fire them
// even when the tab is closed
async function syncRemindersToSW() {
  if (!navigator.serviceWorker?.controller) return;
  const allTasks = await fsGet('tasks');
  const today = todayStr();
  const pending = allTasks
    .filter(t => !t.done && t.dueDate && t.dueDate >= today && t.dueTime && t.reminderMins)
    .map(t => ({
      id: t._id,
      text: t.text,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      reminderMins: parseInt(t.reminderMins)
    }));
  navigator.serviceWorker.controller.postMessage({ type: 'SYNC_REMINDERS', tasks: pending });
}

async function rescheduleAllReminders() {
  if (Notification.permission !== 'granted') return;
  await syncRemindersToSW();
}

function startDueTimePoller() {
  // Poll every minute for due-now notifications (while tab is open)
  setInterval(async () => {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const today = todayStr();
    const allTasks = await fsGet('tasks');
    allTasks.forEach(t => {
      if (t.done || !t.dueDate || !t.dueTime) return;
      const dueMs = new Date(t.dueDate + 'T' + t.dueTime).getTime();
      const diff = dueMs - now.getTime();
      if (diff >= -30000 && diff < 30000 && !t._notifiedDue) {
        showNotif(`🚨 Task Due Now: ${t.text}`, `Due: ${formatTime12(t.dueTime)} · ${t.cat}`);
        t._notifiedDue = true;
      }
    });
  }, 60 * 1000);
}

function scheduleTaskReminder(task) {
  // After adding a task, re-sync all reminders to SW
  syncRemindersToSW();
}

function testSound() { playSound(getCurrentSound()); }

// ===== TRASH / BIN =====
const TRASH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let _trashTab = 'tasks';

async function getTrashItems() {
  const items = await fsGet('trash');
  // Auto-purge anything older than 7 days
  const now = Date.now();
  const expired = items.filter(i => now - (i.deletedAt || 0) > TRASH_EXPIRY_MS);
  for (const item of expired) {
    await fsDelete('trash', item._id);
  }
  if (expired.length) clearCache('trash');
  return items.filter(i => now - (i.deletedAt || 0) <= TRASH_EXPIRY_MS);
}

async function updateTrashBadge() {
  const items = await getTrashItems();
  const badge = document.getElementById('trash-count-badge');
  if (!badge) return;
  if (items.length > 0) {
    badge.textContent = items.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function switchTrashTab(tab) {
  _trashTab = tab;
  document.getElementById('trash-tasks-panel').style.display = tab === 'tasks' ? '' : 'none';
  document.getElementById('trash-logs-panel').style.display = tab === 'logs' ? '' : 'none';
  document.getElementById('trash-tab-tasks').classList.toggle('active', tab === 'tasks');
  document.getElementById('trash-tab-logs').classList.toggle('active', tab === 'logs');
}

async function renderTrash() {
  const items = await getTrashItems();
  const taskItems = items.filter(i => i.originalCol === 'tasks');
  const logItems  = items.filter(i => i.originalCol === 'daily_logs');

  // Render tasks
  const tasksEl = document.getElementById('trash-tasks-list');
  if (taskItems.length === 0) {
    tasksEl.innerHTML = '<div class="empty-state">No deleted tasks. Trash is empty.</div>';
  } else {
    tasksEl.innerHTML = taskItems.map(t => {
      const daysLeft = Math.ceil((TRASH_EXPIRY_MS - (Date.now() - (t.deletedAt || 0))) / 86400000);
      const priBadge = priorityBadgeHTML(t.priority || 'medium');
      return `<div class="trash-item">
        <div class="trash-item-icon">✓</div>
        <div class="trash-item-body">
          <div class="trash-item-name">${t.text}</div>
          <div class="trash-item-meta">${priBadge} ${t.dueDate ? '📅 ' + t.dueDate : ''}</div>
          <div class="trash-item-expiry">Deletes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</div>
        </div>
        <div class="trash-item-actions">
          <button class="btn-outline trash-restore-btn" onclick="restoreTrashItem('${t._id}')">↩ Restore</button>
          <button class="task-delete" onclick="permanentlyDelete('${t._id}')" title="Delete permanently">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  // Render logs
  const logsEl = document.getElementById('trash-logs-list');
  if (logItems.length === 0) {
    logsEl.innerHTML = '<div class="empty-state">No deleted log entries. Trash is empty.</div>';
  } else {
    logsEl.innerHTML = logItems.map(l => {
      const daysLeft = Math.ceil((TRASH_EXPIRY_MS - (Date.now() - (l.deletedAt || 0))) / 86400000);
      const color = CAT_COLORS[l.category] || '#64748b';
      return `<div class="trash-item">
        <div class="log-cat-dot" style="background:${color};margin-top:4px;flex-shrink:0"></div>
        <div class="trash-item-body">
          <div class="trash-item-name">${l.activity}</div>
          <div class="trash-item-meta" style="color:var(--text3);font-size:.75rem">${l.category} · ${l.duration ? l.duration + ' min' : 'no duration'} · ${l.date}</div>
          <div class="trash-item-expiry">Deletes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</div>
        </div>
        <div class="trash-item-actions">
          <button class="btn-outline trash-restore-btn" onclick="restoreTrashItem('${l._id}')">↩ Restore</button>
          <button class="task-delete" onclick="permanentlyDelete('${l._id}')" title="Delete permanently">✕</button>
        </div>
      </div>`;
    }).join('');
  }

  updateTrashBadge();
}

async function restoreTrashItem(trashId) {
  const items = await getTrashItems();
  const item = items.find(i => i._id === trashId);
  if (!item) return;
  const { _id, originalCol, deletedAt, ...restored } = item;
  await fsAdd(originalCol, restored);
  await fsDelete('trash', trashId);
  clearCache(originalCol, 'trash');
  showToast('Item restored! ↩', 'success');
  renderTrash();
  if (originalCol === 'tasks') { clearCache('tasks'); }
  if (originalCol === 'daily_logs') { clearCache('daily_logs'); }
}

async function permanentlyDelete(trashId) {
  if (!confirm('Permanently delete this item? This cannot be undone.')) return;
  await fsDelete('trash', trashId);
  clearCache('trash');
  renderTrash();
}

async function emptyTrash() {
  const items = await getTrashItems();
  if (!items.length) { showToast('Trash is already empty.', 'info'); return; }
  if (!confirm(`Permanently delete all ${items.length} item(s)? This cannot be undone.`)) return;
  for (const item of items) await fsDelete('trash', item._id);
  clearCache('trash');
  renderTrash();
  showToast('Trash emptied.', 'info');
}

// ===== GLOBAL EXPORTS =====
window.switchTab = switchTab;
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.showPage = showPage;
window.toggleSidebar = toggleSidebar;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.openFocusFullscreen = openFocusFullscreen;
window.closeFocusFullscreen = closeFocusFullscreen;
window.addDailyLog = addDailyLog;
window.deleteDailyLog = deleteDailyLog;
window.filterLogs = filterLogs;
window.openEditLog = openEditLog;
window.cancelEditLog = cancelEditLog;
window.saveEditLog = saveEditLog;
window.addTask = addTask;
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.onRepeatChange = onRepeatChange;
window.toggleRepeatToday = toggleRepeatToday;
window.completeRepeatTask = completeRepeatTask;
window.taskUrgency = taskUrgency;
window.taskDueBadgeHTML = taskDueBadgeHTML;
window.priorityBadgeHTML = priorityBadgeHTML;
window.addCourse = addCourse;
window.logCourseTime = logCourseTime;
window.deleteCourse = deleteCourse;
window.focusAdjustMins = focusAdjustMins;
window.focusAdjustBreak = focusAdjustBreak;
window.focusAdjustCount = focusAdjustCount;
window.selectFocusTask = selectFocusTask;
window.restoreFocusState = restoreFocusState;
window.setPreset = setPreset;
window.focusStart = focusStart;
window.focusPause = focusPause;
window.focusReset = focusReset;
window.skipPhase = skipPhase;
window.addWpmRecord = addWpmRecord;
window.switchReportTab = switchReportTab;
window.generateWeeklyReport = generateWeeklyReport;
window.generateMonthlyReport = generateMonthlyReport;
window.requestNotifications = requestNotifications;
window.showCustomTimer = showCustomTimer;
window.applyCustomTimer = applyCustomTimer;
window.deleteFocusSession = deleteFocusSession;
window.testSound = testSound;
window.toggleTheme = toggleTheme;
window.confirmDeleteAccount = confirmDeleteAccount;
window.openQuickLog = openQuickLog;
window.closeQuickLog = closeQuickLog;
window.qlSetMins = qlSetMins;
window.submitQuickLog = submitQuickLog;
window.obNext = obNext;
window.obSelectGoal = obSelectGoal;
window.obToggleModule = obToggleModule;
window.obFinish = obFinish;
window.toggleModule = toggleModule;
window.openGoalEdit = openGoalEdit;
window.toggleAddTaskForm = toggleAddTaskForm;
window.toggleDoneSection = toggleDoneSection;
window.saveGoalEdit = saveGoalEdit;
window.toggleFocusGoalEdit = toggleFocusGoalEdit;
window.setFocusGoalPreset = setFocusGoalPreset;
window.saveFocusGoal = saveFocusGoal;
// Trash
window.switchTrashTab = switchTrashTab;
window.restoreTrashItem = restoreTrashItem;
window.permanentlyDelete = permanentlyDelete;
window.emptyTrash = emptyTrash;

// ── Fullscreen focus mode (PDF 07) ─────────────────────────────────
function openFocusFullscreen() {
  document.body.classList.add('focus-fs');
  const taskLabel = document.getElementById('focus-task-input')?.value || 'Focus session';
  const fsLabel = document.getElementById('fs-task-label');
  if (fsLabel) fsLabel.textContent = taskLabel;
  updateClockFullscreen();
}
function closeFocusFullscreen() {
  document.body.classList.remove('focus-fs');
}
function updateClockFullscreen() {
  const s = App.focusSeconds || 0;
  const m = Math.floor(s / 60), sec = s % 60;
  const timeStr = String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  const fsTime = document.getElementById('fs-clock-time');
  if (fsTime) fsTime.textContent = timeStr;
  const fsRing = document.getElementById('fs-ring-progress');
  const pct = App.focusTotalSeconds > 0 ? s / App.focusTotalSeconds : 1;
  if (fsRing) fsRing.style.strokeDashoffset = 993 * (1 - pct);
  const fsMode = document.getElementById('fs-clock-mode');
  const mainMode = document.getElementById('clock-mode');
  if (fsMode && mainMode) fsMode.textContent = mainMode.textContent;
  const fsSession = document.getElementById('fs-clock-session');
  if (fsSession) fsSession.textContent = '';
  const fsStart = document.getElementById('fs-btn-start');
  const fsPause = document.getElementById('fs-btn-pause');
  if (fsStart && fsPause) {
    fsStart.style.display = App.focusRunning ? 'none' : '';
    fsPause.style.display = App.focusRunning ? '' : 'none';
  }
}

// ===== GAMIFICATION SYSTEM =====
// XP Formula per PDF blueprint:
// 1 minute study = 1 XP | Task = 50 XP | Daily goal = 200 XP | 7-day streak = 500 XP
const XP_TASK = 50;
const XP_FOCUS_MIN = 1;   // 1 XP per minute
const XP_DAILY_GOAL = 200;
const XP_STREAK_DAY = 10;
const XP_LOG = 5;
const XP_7DAY_STREAK = 500;

const LEVELS = [
  { level: 1,  xp: 0,     name: 'Beginner',     next: 'Apprentice' },
  { level: 2,  xp: 283,   name: 'Apprentice',   next: 'Scholar' },
  { level: 3,  xp: 520,   name: 'Scholar',      next: 'Seeker' },
  { level: 4,  xp: 800,   name: 'Seeker',       next: 'Focused Mind' },
  { level: 5,  xp: 1118,  name: 'Focused Mind', next: 'Deep Thinker' },
  { level: 6,  xp: 1470,  name: 'Deep Thinker', next: 'Focus Master' },
  { level: 7,  xp: 1852,  name: 'Focus Master', next: 'Sage' },
  { level: 8,  xp: 2263,  name: 'Sage',         next: 'Luminary' },
  { level: 9,  xp: 2700,  name: 'Luminary',     next: 'Deep Scholar' },
  { level: 10, xp: 3162,  name: 'Deep Scholar', next: 'Virtuoso' },
  { level: 11, xp: 3647,  name: 'Virtuoso',     next: 'Maestro' },
  { level: 12, xp: 4157,  name: 'Maestro',      next: 'Grandmaster' },
  { level: 13, xp: 4688,  name: 'Grandmaster',  next: 'Ascendant' },
  { level: 14, xp: 5243,  name: 'Ascendant',    next: 'Legend' },
  { level: 15, xp: 5820,  name: 'Legend',       next: 'Eternal Scholar' },
  { level: 16, xp: 6400,  name: 'Eternal Scholar', next: 'Transcendent' },
  { level: 17, xp: 7000,  name: 'Transcendent', next: 'Mythic Mind' },
  { level: 18, xp: 7630,  name: 'Mythic Mind',  next: 'Cosmic Scholar' },
  { level: 19, xp: 8280,  name: 'Cosmic Scholar', next: 'Godlike' },
  { level: 20, xp: 8944,  name: 'Godlike',      next: '???' },
];

const LS_XP = 'deeptrck-xp';

function getXpState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_XP));
    if (raw && typeof raw.total === 'number') return raw;
  } catch(e) {}
  return { total: 0, todayBonuses: {} };
}

function saveXpState(state) {
  localStorage.setItem(LS_XP, JSON.stringify(state));
}

function getLevelInfo(totalXp) {
  let current = LEVELS[0];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].xp) { current = LEVELS[i]; break; }
  }
  const nextLvl = LEVELS.find(l => l.level === current.level + 1);
  const nextXp = nextLvl ? nextLvl.xp : current.xp + 9999;
  const prevXp = current.xp;
  const progress = Math.min(1, (totalXp - prevXp) / (nextXp - prevXp));
  return { ...current, nextXp, prevXp, progress, currentXp: totalXp };
}

function addXp(amount, label, sourceEl) {
  if (!amount || amount <= 0) return;
  const state = getXpState();
  const oldLevel = getLevelInfo(state.total).level;
  state.total = (state.total || 0) + amount;
  saveXpState(state);
  const newLvlInfo = getLevelInfo(state.total);
  showXpPopup(amount, sourceEl);
  if (newLvlInfo.level > oldLevel) {
    setTimeout(() => showLevelUpPopup(newLvlInfo), 600);
  }
  updateXpBar();
}

function showXpPopup(amount, nearEl) {
  const popup = document.createElement('div');
  popup.className = 'xp-popup';
  popup.textContent = '+' + amount + ' XP';
  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  if (nearEl) {
    const r = nearEl.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top;
  }
  popup.style.left = (x - 30) + 'px';
  popup.style.top = (y - 10) + 'px';
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1400);
}

function showLevelUpPopup(info) {
  if (typeof burstConfetti === 'function') burstConfetti(window.innerWidth/2, window.innerHeight/2);
  const popup = document.createElement('div');
  popup.className = 'levelup-popup';
  popup.innerHTML = `
    <div class="levelup-title">🎉 LEVEL UP!</div>
    <div class="levelup-level">${info.level}</div>
    <div class="levelup-name">${info.name}</div>
  `;
  // Style inline so it works without extra HTML
  Object.assign(popup.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%,-50%) scale(1)',
    background: 'var(--card)', border: '1px solid rgba(77,184,255,.35)',
    borderRadius: '24px', padding: '2.5rem 2rem',
    textAlign: 'center', zIndex: '9995',
    boxShadow: '0 0 60px rgba(77,184,255,.2)',
    animation: 'levelUpPop .5s cubic-bezier(.34,1.56,.64,1) both'
  });
  document.body.appendChild(popup);
  setTimeout(() => {
    popup.style.transition = 'opacity .4s';
    popup.style.opacity = '0';
    setTimeout(() => popup.remove(), 500);
  }, 3000);
}

function updateXpBar() {
  const state = getXpState();
  const info = getLevelInfo(state.total);
  const levelEl = document.getElementById('xp-level');
  const nameEl  = document.getElementById('xp-level-name');
  const currEl  = document.getElementById('xp-current');
  const nextEl  = document.getElementById('xp-next');
  const barEl   = document.getElementById('xp-bar');
  const nextNameEl = document.getElementById('xp-next-name');
  if (levelEl)   levelEl.textContent   = info.level;
  if (nameEl)    nameEl.textContent    = info.name;
  if (currEl)    currEl.textContent    = info.currentXp - info.prevXp;
  if (nextEl)    nextEl.textContent    = info.nextXp - info.prevXp;
  if (barEl)     barEl.style.width     = (info.progress * 100) + '%';
  if (nextNameEl) nextNameEl.textContent = info.next;

  // Sync topbar XP elements
  const tbLevel = document.getElementById('topbar-xp-level');
  const tbName  = document.getElementById('topbar-xp-level-name');
  const tbCurr  = document.getElementById('topbar-xp-current');
  const tbNext  = document.getElementById('topbar-xp-next');
  const tbFill  = document.getElementById('topbar-xp-fill');
  if (tbLevel) tbLevel.textContent = info.level;
  if (tbName)  tbName.textContent  = info.name;
  if (tbCurr)  tbCurr.textContent  = info.currentXp - info.prevXp;
  if (tbNext)  tbNext.textContent  = info.nextXp - info.prevXp;
  if (tbFill)  tbFill.style.width  = (info.progress * 100) + '%';
}

// ===== DAILY MISSIONS =====
function getMissions(logs, tasks, focusSessions, goalMins) {
  const today = todayStr();
  const todayLogs = (logs || []).filter(l => l.date === today);
  const todayMin = todayLogs.reduce((s, l) => s + (l.duration || 0), 0);
  const doneTasks = (tasks || []).filter(t => t.done).length;
  const todayFocus = (focusSessions || []).filter(s => s.date === today).length;
  const streak = typeof calcStreak === 'function' ? calcStreak(logs) : 0;
  return [
    { id: 'log_today',       icon: '✏️', text: 'Log a study session',     xp: XP_LOG * 3,        done: todayLogs.length >= 1 },
    { id: 'complete_3_tasks',icon: '☑️', text: 'Complete 3 tasks',        xp: XP_TASK,            done: doneTasks >= 3 },
    { id: 'focus_session',   icon: '⏳', text: 'Finish a focus session',   xp: 30,                done: todayFocus >= 1 },
    { id: 'hit_goal',        icon: '🎯', text: 'Hit your daily goal',      xp: XP_DAILY_GOAL,     done: todayMin >= goalMins },
  ];
}

function renderMissions(logs, tasks, focusSessions, goalMins) {
  const missions = getMissions(logs, tasks, focusSessions, goalMins);
  const done = missions.filter(m => m.done).length;
  const totalEl = document.getElementById('missions-total');
  const listEl  = document.getElementById('missions-list');
  if (totalEl) totalEl.textContent = done + ' / ' + missions.length + ' done';
  // Update topbar badge
  const badge = document.getElementById('missions-badge');
  if (badge) {
    badge.textContent = done + '/' + missions.length;
    badge.classList.toggle('done', done === missions.length);
  }
  if (!listEl) return;
  listEl.innerHTML = missions.map(m => `
    <div class="mission-item ${m.done ? 'done' : ''}">
      <span class="mission-icon">${m.icon}</span>
      <span class="mission-text">${m.text}</span>
      <span class="mission-xp">+${m.xp} XP</span>
      <div class="mission-check">${m.done ? '✓' : ''}</div>
    </div>`).join('');
}

// ── Toggle Missions Panel ──────────────────────────────────────────────────
function toggleMissionsPanel() {
  const panel = document.getElementById('missions-panel');
  const backdrop = document.getElementById('missions-backdrop');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (backdrop) backdrop.style.display = isOpen ? 'none' : 'block';
}
window.toggleMissionsPanel = toggleMissionsPanel;

const LS_MISSIONS = 'deeptrck-missions-done';
function getMissionsDone() {
  try { return JSON.parse(localStorage.getItem(LS_MISSIONS)) || {}; } catch(e) { return {}; }
}
function saveMissionsDone(d) { localStorage.setItem(LS_MISSIONS, JSON.stringify(d)); }

function checkAndAwardMissions(logs, tasks, focusSessions, goalMins) {
  const missions = getMissions(logs, tasks, focusSessions, goalMins);
  const done = getMissionsDone();
  const today = todayStr();
  if (done._date !== today) {
    saveMissionsDone({ _date: today });
    Object.keys(done).forEach(k => delete done[k]);
    done._date = today;
  }
  missions.forEach(m => {
    if (m.done && !done[m.id]) {
      done[m.id] = true;
      saveMissionsDone(done);
      addXp(m.xp, m.text, null);
      if (typeof showToast === 'function') showToast('Mission done! ' + m.icon + ' +' + m.xp + ' XP', 'xp', 3000);
    }
  });
}

// ===== HOOK: award XP on task completion =====
// Wraps existing celebrateTask — call addXp from there
const _origCelebrate = typeof celebrateTask !== 'undefined' ? celebrateTask : null;
if (_origCelebrate) {
  window._xpCelebratePatched = true;
}

// Auto-run updateXpBar when dashboard loads
document.addEventListener('DOMContentLoaded', () => {
  updateXpBar();
});

// ===== PDF-3 FIXES: AMBIENT NOISE + MINIMAL FULLSCREEN =====

App.ambientNode = null;
App.isMinimalFS = false;

function toggleAmbientNoise(enabled) {
  const ctx = getAudioCtx();
  if (!enabled) {
    if (App.ambientNode) {
      try { App.ambientNode.stop(); } catch(e){}
      App.ambientNode = null;
    }
    return;
  }
  if (App.ambientNode) return;
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    output[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = output[i];
    output[i] *= 3.5;
  }
  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
  whiteNoise.connect(gainNode);
  gainNode.connect(ctx.destination);
  whiteNoise.start();
  App.ambientNode = whiteNoise;
}

function toggleMinimalFullscreen() {
  App.isMinimalFS = !App.isMinimalFS;
  const overlay = document.getElementById('focus-fullscreen-overlay');
  if (overlay) overlay.classList.toggle('minimal-mode', App.isMinimalFS);
  const btn = document.getElementById('fs-minimal-btn');
  if (btn) btn.textContent = App.isMinimalFS ? '⊙ Show Controls' : '🧘 Minimal View';
}

window.toggleAmbientNoise = toggleAmbientNoise;
window.toggleMinimalFullscreen = toggleMinimalFullscreen;

// ===== PDF-4 + PDF-5: DUAL XP ECONOMY =====
// xpTotal = lifetime score (never decreases, drives level)
// xpCurrency = spendable sparks (used to buy pet items)

const LS_CURRENCY = 'deeptrck-currency';

function getCurrencyState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CURRENCY));
    if (raw && typeof raw.sparks === 'number') return raw;
  } catch(e) {}
  return { sparks: 0 };
}

function saveCurrencyState(state) {
  localStorage.setItem(LS_CURRENCY, JSON.stringify(state));
}

function addSparks(amount) {
  if (!amount || amount <= 0) return;
  const state = getCurrencyState();
  state.sparks = (state.sparks || 0) + amount;
  saveCurrencyState(state);
  updateSparksDisplay();
}

function spendSparks(amount) {
  const state = getCurrencyState();
  if ((state.sparks || 0) < amount) return false;
  state.sparks -= amount;
  saveCurrencyState(state);
  updateSparksDisplay();
  return true;
}

function updateSparksDisplay() {
  const state = getCurrencyState();
  document.querySelectorAll('.sparks-display').forEach(el => {
    el.textContent = '⚡ ' + (state.sparks || 0) + ' Sparks';
  });
  const petEl = document.getElementById('pet-sparks');
  if (petEl) petEl.textContent = state.sparks || 0;
}

// Override addXp to also award sparks (1 spark per 2 XP)
const _origAddXp = addXp;
function addXpWithSparks(amount, label, sourceEl) {
  _origAddXp(amount, label, sourceEl);
  addSparks(Math.floor(amount / 2));
}
window.addXp = addXpWithSparks; // replace global

// ===== VIRTUAL PET SYSTEM (PDF-4) =====
const LS_PET = 'deeptrck-pet';
const PET_ARCHETYPES = {
  kitten: { name: 'Focus Kitten', emoji: '🐱', icon: '🐱' },
  owl:    { name: 'Study Owl',    emoji: '🦉', icon: '🦉' },
  fox:    { name: 'Swift Fox',    emoji: '🦊', icon: '🦊' },
  bear:   { name: 'Cozy Bear',    emoji: '🐻', icon: '🐻' },
};

const PET_WARDROBE = [
  { id: 'scholar_specs', name: 'Scholar Specs',  icon: '🤓', cost: 120, bonus: '+2 XP per task',   desc: 'Tasks yield +2 bonus XP' },
  { id: 'cozy_scarf',    name: 'Cozy Scarf',     icon: '🧣', cost: 200, bonus: '-20% hunger drain', desc: 'Reduces hunger decay rate by 20%' },
  { id: 'focus_crown',   name: 'Focus Crown',    icon: '👑', cost: 500, bonus: '+5% focus XP',     desc: '+5% XP during fullscreen focus sessions' },
];

// PET_FOOD is extended by pet.js (PET_SHOP.food) — keep a small fallback for compatibility
const PET_FOOD = [
  { id: 'kibble',        name: 'Kibble',        icon: '🥣', cost: 10,  hunger: 10, desc: 'Small snack' },
  { id: 'healthy_berry', name: 'Berry',          icon: '🍓', cost: 20,  hunger: 15, desc: 'Quick snack — restores 15% hunger' },
  { id: 'fish',          name: 'Fresh Fish',     icon: '🐟', cost: 35,  hunger: 28, desc: 'A tasty treat' },
  { id: 'focus_feast',   name: 'Focus Feast',    icon: '🍱', cost: 50,  hunger: 45, desc: 'Full meal — restores 45% hunger' },
  { id: 'royal_cake',    name: 'Royal Cake',     icon: '🎂', cost: 120, hunger: 80, desc: 'Full recovery' },
];

function getPetState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PET));
    if (raw && raw.archetype) return raw;
  } catch(e) {}
  return null;
}

function savePetState(state) {
  localStorage.setItem(LS_PET, JSON.stringify(state));
}

function getPetHunger(pet) {
  if (!pet || !pet.lastFed) return 100;
  const msSinceFed = Date.now() - pet.lastFed;
  const hoursElapsed = msSinceFed / (1000 * 60 * 60);
  const decayRate = pet.equippedItems?.includes('cozy_scarf') ? 4 : 5; // % per 4 hours base
  const drainPer4h = decayRate;
  const drain = (hoursElapsed / 4) * drainPer4h;
  return Math.max(0, (pet.hunger || 100) - drain);
}

function feedPet(foodId) {
  const food = PET_FOOD.find(f => f.id === foodId);
  if (!food) return;
  const pet = getPetState();
  if (!pet) { showToast('Hatch your pet first! 🥚', 'info'); return; }
  if (!spendSparks(food.cost)) {
    showToast('Not enough Sparks! Need ' + food.cost + ' ⚡', 'info');
    return;
  }
  const currentHunger = getPetHunger(pet);
  pet.hunger = Math.min(100, currentHunger + food.hunger);
  pet.lastFed = Date.now();
  savePetState(pet);
  showToast(food.icon + ' ' + pet.name + ' enjoyed the ' + food.name + '! (' + food.hunger + '% hunger restored)', 'success');
  renderPetCard();
}

function buyWardrobeItem(itemId) {
  const item = PET_WARDROBE.find(w => w.id === itemId);
  if (!item) return;
  const pet = getPetState();
  if (!pet) { showToast('Hatch your pet first! 🥚', 'info'); return; }
  if ((pet.equippedItems || []).includes(itemId)) {
    showToast('Already equipped! ' + item.icon, 'info');
    return;
  }
  if (!spendSparks(item.cost)) {
    showToast('Not enough Sparks! Need ' + item.cost + ' ⚡', 'info');
    return;
  }
  pet.equippedItems = pet.equippedItems || [];
  pet.equippedItems.push(itemId);
  savePetState(pet);
  showToast(item.icon + ' Equipped ' + item.name + '! ' + item.bonus, 'success');
  renderPetCard();
}

function hatchPet(archetype, name) {
  if (!name.trim()) { showToast('Give your pet a name! 🐾', 'info'); return; }
  const pet = {
    archetype,
    name: name.trim(),
    hunger: 100,
    lastFed: Date.now(),
    equippedItems: [],
    createdAt: Date.now(),
  };
  savePetState(pet);
  const panel = document.getElementById('pet-hatch-panel');
  if (panel) panel.style.display = 'none';
  renderPetCard();
  showToast('🎉 ' + pet.name + ' has hatched! Say hello to your new study buddy!', 'success', 4000);
}

function getPetMood(hunger) {
  if (hunger >= 80) return { mood: 'Happy', emoji: '😄', color: '#34d399' };
  if (hunger >= 50) return { mood: 'Okay',  emoji: '🙂', color: '#fbbf24' };
  if (hunger >= 20) return { mood: 'Hungry', emoji: '😟', color: '#f97316' };
  return { mood: 'Fatigued', emoji: '😴', color: '#ef4444' };
}

function renderPetPage() {
  if (typeof window.renderEnhancedPetCard === 'function') {
    window.renderEnhancedPetCard('pet-page-content');
  }
  renderPetPageDiary();
}

function renderPetPageDiary() {
  const diary = document.getElementById('pet-diary-content');
  if (!diary) return;
  const pet = getPetState();
  if (!pet) return;
  const hunger  = getPetHunger(pet);
  const created = pet.createdAt ? new Date(pet.createdAt) : new Date();
  const days    = Math.floor((Date.now() - created.getTime()) / 86400000);
  const xp      = getXpState();
  const sparks  = getCurrencyState().sparks || 0;

  diary.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem">
      <div class="stat-card"><div class="stat-label">Days Together</div><div class="stat-value">${days}</div></div>
      <div class="stat-card"><div class="stat-label">Level</div><div class="stat-value">${xp.level || 1}</div></div>
      <div class="stat-card"><div class="stat-label">⚡ Sparks</div><div class="stat-value">${sparks}</div></div>
      <div class="stat-card"><div class="stat-label">Hunger</div><div class="stat-value">${hunger.toFixed(0)}%</div></div>
    </div>
    <div style="font-size:.8rem;color:var(--text2);line-height:1.7">
      <div>🐾 <strong>${pet.name}</strong> has been your study buddy for <strong>${days} day${days !== 1 ? 's' : ''}</strong>.</div>
      <div>🥚 Hatched on ${created.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
      ${pet.equippedItems && pet.equippedItems.length ? `<div>👗 Wearing: ${pet.equippedItems.join(', ')}</div>` : '<div>👗 No accessories yet</div>'}
      <div>🌟 Total XP earned: <strong>${(xp.total || 0).toLocaleString()}</strong></div>
    </div>
    <div style="margin-top:.75rem;font-size:.75rem;color:var(--text3);background:var(--bg3);border-radius:8px;padding:.5rem .7rem;border:1px solid var(--border)">
      💡 <em>Keep studying to keep ${pet.name} happy! Every task earns Sparks to buy food.</em>
    </div>
  `;
}

function renderPetCard() {
  // Delegate to 3D renderer in pet.js
  if (typeof window.renderEnhancedPetCard === 'function') {
    window.renderEnhancedPetCard('pet-card-content');
    return;
  }
  // Fallback: basic emoji render
  const container = document.getElementById('pet-card-content');
  if (!container) return;
  const pet = getPetState();
  if (!pet) {
    container.innerHTML = `<div id="pet-hatch-panel" class="pet-hatch-panel">
      <div class="pet-hatch-title">🥚 Hatch Your Study Buddy</div>
      <p class="pet-hatch-sub">Feed it, care for it, level it up.</p>
      <div class="pet-archetype-grid-new" style="display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem;margin-bottom:.75rem">
        ${Object.entries(PET_ARCHETYPES).map(([k,v]) => `
          <label class="pet-archetype-option-new" style="display:flex;flex-direction:column;align-items:center;gap:.3rem;padding:.6rem;border-radius:10px;border:2px solid var(--border);background:var(--bg3);cursor:pointer">
            <input type="radio" name="pet-archetype" value="${k}" ${k==='kitten'?'checked':''} style="display:none">
            <span style="font-size:2rem">${v.emoji}</span>
            <span style="font-size:.72rem;color:var(--text2);font-weight:600">${v.name}</span>
          </label>`).join('')}
      </div>
      <input type="text" id="pet-name-input" class="input" placeholder="Name your pet..." style="margin:.75rem 0;text-align:center">
      <button class="btn-primary" onclick="hatchPetFromUI()">🥚 Hatch!</button>
    </div>`;
    return;
  }
  const hunger = getPetHunger(pet);
  const { emoji: moodEmoji, color: moodColor } = getPetMood(hunger);
  const archetype = PET_ARCHETYPES[pet.archetype] || PET_ARCHETYPES.kitten;
  container.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0">
    <span style="font-size:3rem">${archetype.emoji}</span>
    <div>
      <div style="font-weight:700">${pet.name} <span style="color:${moodColor};font-size:.78rem">${moodEmoji}</span></div>
      <div style="font-size:.75rem;color:var(--text3)">${archetype.name}</div>
    </div>
  </div>`;
}

function hatchPetFromUI() {
  const archetype = document.querySelector('input[name="pet-archetype"]:checked')?.value || 'kitten';
  const name = document.getElementById('pet-name-input')?.value || '';
  hatchPet(archetype, name);
}
window.hatchPetFromUI = hatchPetFromUI;
window.buyWardrobeItem = buyWardrobeItem;
// Expose internals for pet.js
window.getPetState = getPetState;
window.savePetState = savePetState;
window.getPetHunger = getPetHunger;
window.getPetMood = getPetMood;
window.spendSparks = spendSparks;
window.getCurrencyState = getCurrencyState;
window.getXpState = getXpState;
window.getLevelInfo = getLevelInfo;
window.hatchPet = hatchPet;
window.showToast = showToast;
// Install enhanced feed + re-render now that internals are available
if (typeof window.installEnhancedFeedPet === 'function') {
  window.installEnhancedFeedPet();
} else {
  window.feedPet = feedPet; // fallback if pet.js not loaded
}
// Render pet card on load — pet.js SVG renderer takes priority
if (typeof window.renderEnhancedPetCard === 'function') {
  setTimeout(() => window.renderEnhancedPetCard('pet-card-content'), 400);
}

// Pet hunger check — apply debuff if fatigued
function getPetDebuff() {
  const pet = getPetState();
  if (!pet) return 1;
  const hunger = getPetHunger(pet);
  return hunger < 20 ? 0.5 : 1;
}

// ===== ENERGY BAR / BURNOUT PREVENTION (PDF-5) =====
const LS_ENERGY = 'deeptrck-energy';
const ENERGY_DRAIN_PER_FOCUS_MIN = 1.2; // % per focus minute
const ENERGY_REGEN_PER_BREAK_MIN = 3;   // % per break minute

function getEnergyState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ENERGY));
    if (raw && typeof raw.energy === 'number') {
      // Regen naturally over real time (1% per 6 min of real time)
      const msSince = Date.now() - (raw.lastUpdate || Date.now());
      const regenPct = (msSince / (1000 * 60 * 6)) * 1;
      raw.energy = Math.min(100, raw.energy + regenPct);
      raw.lastUpdate = Date.now();
      return raw;
    }
  } catch(e) {}
  return { energy: 100, lastUpdate: Date.now() };
}

function saveEnergyState(state) {
  state.lastUpdate = Date.now();
  localStorage.setItem(LS_ENERGY, JSON.stringify(state));
}

function drainEnergy(mins) {
  const state = getEnergyState();
  state.energy = Math.max(0, state.energy - mins * ENERGY_DRAIN_PER_FOCUS_MIN);
  saveEnergyState(state);
  updateEnergyBar();
  if (state.energy <= 0) triggerWellnessIntercept();
}

function regenEnergy(mins) {
  const state = getEnergyState();
  state.energy = Math.min(100, state.energy + mins * ENERGY_REGEN_PER_BREAK_MIN);
  saveEnergyState(state);
  updateEnergyBar();
}

function updateEnergyBar() {
  const state = getEnergyState();
  const pct = state.energy;
  const color = pct > 60 ? '#34d399' : pct > 30 ? '#fbbf24' : '#ef4444';
  document.querySelectorAll('.energy-bar-fill').forEach(el => {
    el.style.width = pct + '%';
    el.style.background = color;
  });
  document.querySelectorAll('.energy-pct').forEach(el => {
    el.textContent = Math.round(pct) + '%';
  });
  // Sync topbar energy bar
  const tbFill = document.getElementById('topbar-energy-fill');
  const tbPct  = document.getElementById('topbar-energy-pct');
  if (tbFill) { tbFill.style.width = pct + '%'; tbFill.style.background = color; }
  if (tbPct)  tbPct.textContent = Math.round(pct) + '%';
}

function triggerWellnessIntercept() {
  const overlay = document.getElementById('wellness-intercept');
  if (overlay) {
    overlay.style.display = 'flex';
    startBreathingAnimation();
    // Auto-close after 2 min + restore 30% energy
    setTimeout(() => {
      closeWellnessIntercept();
    }, 2 * 60 * 1000);
  }
}

function closeWellnessIntercept() {
  const overlay = document.getElementById('wellness-intercept');
  if (overlay) overlay.style.display = 'none';
  regenEnergy(25); // reward for taking the break
  showToast('Energy restored! Ready to focus again. 💪', 'success');
}
window.closeWellnessIntercept = closeWellnessIntercept;

function startBreathingAnimation() {
  const ring = document.getElementById('breathing-ring');
  if (!ring) return;
  let phase = 0;
  const phases = ['Breathe In...', 'Hold...', 'Breathe Out...', 'Rest...'];
  const durations = [4000, 2000, 4000, 2000];
  function nextPhase() {
    const label = document.getElementById('breathing-label');
    if (label) label.textContent = phases[phase];
    ring.style.transform = phase === 0 ? 'scale(1.3)' : phase === 2 ? 'scale(1)' : '';
    ring.style.transition = 'transform ' + durations[phase]/1000 + 's ease-in-out';
    phase = (phase + 1) % 4;
  }
  nextPhase();
  const interval = setInterval(nextPhase, 0);
  let elapsed = 0;
  const ticker = setInterval(() => {
    elapsed += durations[phase % 4];
    nextPhase();
  }, durations[0]);
  // Staggered ticker
  clearInterval(interval);
  let cur = 0;
  function tick() {
    nextPhase();
    cur = (cur + 1) % 4;
    setTimeout(tick, durations[cur]);
  }
  setTimeout(tick, durations[0]);
}

// Energy drain is now handled directly in saveFocusSession above

// ===== AGE-ADAPTIVE FOCUS PRESETS (PDF-5) =====
function setAdaptivePreset(mode) {
  const presets = {
    sprint:   { work: 15, brk: 3, breakCount: 2, name: 'Sprint Quest 🎮' },
    exam:     { work: 45, brk: 15, breakCount: 1, name: 'Exam Crunch 📚' },
    deepwork: { work: 90, brk: 20, breakCount: 1, name: 'Deep Work 🌊' },
    pomodoro: { work: 25, brk: 5, breakCount: 1, name: 'Pomodoro 🍅' },
    power:    { work: 120, brk: 20, breakCount: 2, name: 'Power Block ⚡' },
  };
  const p = presets[mode];
  if (!p) return;
  setPreset(p.work, p.brk, p.breakCount, p.name);
  showToast('Preset: ' + p.name + ' (' + p.work + ' min work · ' + p.brk + ' min break)', 'info', 2500);
}
window.setAdaptivePreset = setAdaptivePreset;

// ===== BRAIN DUMP PANEL (PDF-5) =====
const LS_BRAINDUMP = 'deeptrck-braindump';

function getBrainDumpItems() {
  try { return JSON.parse(localStorage.getItem(LS_BRAINDUMP)) || []; } catch(e) { return []; }
}

function saveBrainDumpItems(items) {
  localStorage.setItem(LS_BRAINDUMP, JSON.stringify(items));
}

function addBrainDumpItem() {
  const input = document.getElementById('brain-dump-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const items = getBrainDumpItems();
  items.unshift({ id: Date.now(), text, createdAt: Date.now() });
  saveBrainDumpItems(items);
  input.value = '';
  renderBrainDump();
}

function clearBrainDump() {
  saveBrainDumpItems([]);
  renderBrainDump();
}

function renderBrainDump() {
  const el = document.getElementById('brain-dump-list');
  if (!el) return;
  const items = getBrainDumpItems();
  el.innerHTML = items.length
    ? items.map(i => `<div class="brain-dump-item"><span>${i.text}</span><button onclick="removeBrainDumpItem(${i.id})">✕</button></div>`).join('')
    : '<div class="empty-state" style="font-size:.78rem">Nothing parked yet. Use this to offload distracting thoughts during focus.</div>';
}

function removeBrainDumpItem(id) {
  const items = getBrainDumpItems().filter(i => i.id !== id);
  saveBrainDumpItems(items);
  renderBrainDump();
}

window.addBrainDumpItem = addBrainDumpItem;
window.clearBrainDump = clearBrainDump;
window.removeBrainDumpItem = removeBrainDumpItem;
window.renderBrainDump = renderBrainDump;

// ===== COIN SYSTEM (PDF Blueprint §5) =====
// Coins: focus session = 5, daily goal = 20, weekly goal = 100
const LS_COINS = 'deeptrck-coins';

function getCoinsState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_COINS));
    if (raw && typeof raw.coins === 'number') return raw;
  } catch(e) {}
  return { coins: 0 };
}

function saveCoinsState(state) {
  localStorage.setItem(LS_COINS, JSON.stringify(state));
}

function addCoins(amount) {
  if (!amount || amount <= 0) return;
  const state = getCoinsState();
  state.coins = (state.coins || 0) + amount;
  saveCoinsState(state);
  updateCoinsDisplay();
}

function spendCoins(amount) {
  const state = getCoinsState();
  if ((state.coins || 0) < amount) return false;
  state.coins -= amount;
  saveCoinsState(state);
  updateCoinsDisplay();
  return true;
}

function updateCoinsDisplay() {
  const state = getCoinsState();
  const c = state.coins || 0;
  ['topbar-coins-val','sidebar-coins','petworld-coins'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = c;
  });
}

window.addCoins = addCoins;
window.spendCoins = spendCoins;
window.getCoinsState = getCoinsState;

// ===== ACHIEVEMENTS SYSTEM (PDF Blueprint §7) =====
const ACHIEVEMENTS = [
  // Bronze
  { id: 'first_session',    tier: 'bronze',    icon: '📚', name: 'First Step',      desc: 'Complete your first study session',         check: (d) => d.totalLogs >= 1 },
  { id: 'first_task',       tier: 'bronze',    icon: '☑️', name: 'Task Master Jr',  desc: 'Complete your first task',                  check: (d) => d.tasksDone >= 1 },
  { id: 'first_focus',      tier: 'bronze',    icon: '⏱',  name: 'Deep Diver',      desc: 'Complete your first focus session',          check: (d) => d.focusSessions >= 1 },
  { id: '3_day_streak',     tier: 'bronze',    icon: '🔥', name: 'On A Roll',       desc: 'Achieve a 3-day study streak',               check: (d) => d.streak >= 3 },
  // Silver
  { id: '7_day_streak',     tier: 'silver',    icon: '🔥', name: 'Streak Hero',     desc: 'Achieve a 7-day study streak',               check: (d) => d.streak >= 7 },
  { id: '10_tasks_done',    tier: 'silver',    icon: '✅', name: 'Getting It Done', desc: 'Complete 10 tasks total',                    check: (d) => d.tasksDone >= 10 },
  { id: '10_hours_studied', tier: 'silver',    icon: '⏰', name: '10 Hours Club',   desc: 'Study for 10 hours total',                   check: (d) => d.totalHours >= 10 },
  { id: '30_day_streak',    tier: 'silver',    icon: '📅', name: 'Month Warrior',   desc: 'Achieve a 30-day study streak',              check: (d) => d.streak >= 30 },
  // Gold
  { id: '100_hours',        tier: 'gold',      icon: '🏆', name: '100 Hours',       desc: 'Study for 100 hours total',                  check: (d) => d.totalHours >= 100 },
  { id: '50_tasks_done',    tier: 'gold',      icon: '⚡', name: 'Task Champion',   desc: 'Complete 50 tasks total',                    check: (d) => d.tasksDone >= 50 },
  { id: 'level_10',         tier: 'gold',      icon: '🌟', name: 'Level 10',        desc: 'Reach Level 10',                             check: (d) => d.level >= 10 },
  { id: '50_focus',         tier: 'gold',      icon: '🎯', name: 'Focus God',       desc: 'Complete 50 focus sessions',                 check: (d) => d.focusSessions >= 50 },
  // Legendary
  { id: '1000_hours',       tier: 'legendary', icon: '👑', name: '1000 Hours',      desc: 'Study for 1000 hours total',                 check: (d) => d.totalHours >= 1000 },
  { id: '200_tasks_done',   tier: 'legendary', icon: '💎', name: 'Unstoppable',     desc: 'Complete 200 tasks total',                   check: (d) => d.tasksDone >= 200 },
  { id: 'level_20',         tier: 'legendary', icon: '🔮', name: 'Mythic Scholar',  desc: 'Reach Level 20 — the highest level',         check: (d) => d.level >= 20 },
  { id: '365_day_streak',   tier: 'legendary', icon: '🌈', name: 'Year Warrior',    desc: 'Maintain a 365-day study streak',            check: (d) => d.streak >= 365 },
];

const LS_ACHIEVEMENTS = 'deeptrck-achievements';

function getAchievementsState() {
  try { return JSON.parse(localStorage.getItem(LS_ACHIEVEMENTS)) || {}; } catch(e) { return {}; }
}
function saveAchievementsState(s) { localStorage.setItem(LS_ACHIEVEMENTS, JSON.stringify(s)); }

async function checkAchievementsAfterAction() {
  const [logs, tasks, focusSessions] = await Promise.all([
    fsGet('daily_logs'), fsGet('tasks'), fsGet('focus_sessions')
  ]);
  const totalMins = logs.reduce((s, l) => s + (l.duration || 0), 0);
  const streak = calcStreak(logs);
  const xpState = getXpState();
  const lvlInfo = getLevelInfo(xpState.total || 0);
  const data = {
    totalLogs: logs.length,
    tasksDone: tasks.filter(t => t.done).length,
    focusSessions: focusSessions.length,
    totalHours: totalMins / 60,
    streak,
    level: lvlInfo.level,
  };
  const unlocked = getAchievementsState();
  let newlyUnlocked = false;
  ACHIEVEMENTS.forEach(a => {
    if (!unlocked[a.id] && a.check(data)) {
      unlocked[a.id] = { unlockedAt: Date.now() };
      saveAchievementsState(unlocked);
      newlyUnlocked = true;
      burstConfetti(window.innerWidth / 2, window.innerHeight / 2);
      const tierEmoji = { bronze: '🥉', silver: '🥈', gold: '🥇', legendary: '👑' }[a.tier] || '🏆';
      showToast(tierEmoji + ' Achievement unlocked: ' + a.name + '!', 'success', 4500);
      addCoins({ bronze: 10, silver: 50, gold: 150, legendary: 500 }[a.tier] || 10);
    }
  });
  if (newlyUnlocked && App.currentPage === 'achievements') renderAchievementsPage();
}

async function renderAchievementsPage() {
  const [logs, tasks, focusSessions] = await Promise.all([
    fsGet('daily_logs'), fsGet('tasks'), fsGet('focus_sessions')
  ]);
  const unlocked = getAchievementsState();
  const unlockedCount = Object.keys(unlocked).length;
  const total = ACHIEVEMENTS.length;
  const el = id => document.getElementById(id);
  if (el('ach-unlocked-count')) el('ach-unlocked-count').textContent = unlockedCount;
  if (el('ach-total-count')) el('ach-total-count').textContent = total;
  if (el('ach-completion-pct')) el('ach-completion-pct').textContent = Math.round((unlockedCount / total) * 100) + '%';
  const grid = el('achievements-grid');
  if (!grid) return;
  const tierOrder = ['legendary', 'gold', 'silver', 'bronze'];
  const tierLabel = { bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold', legendary: '👑 Legendary' };
  let html = '';
  tierOrder.forEach(tier => {
    const tierAchs = ACHIEVEMENTS.filter(a => a.tier === tier);
    html += `<div class="ach-tier-section"><div class="ach-tier-label">${tierLabel[tier]}</div>
    <div class="ach-tier-grid">`;
    tierAchs.forEach(a => {
      const isUnlocked = !!unlocked[a.id];
      const unlockedDate = unlocked[a.id]?.unlockedAt ? new Date(unlocked[a.id].unlockedAt).toLocaleDateString() : '';
      html += `<div class="ach-card ${isUnlocked ? 'ach-unlocked' : 'ach-locked'} ach-${tier}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
        ${isUnlocked ? `<div class="ach-date">✓ ${unlockedDate}</div>` : '<div class="ach-locked-label">Locked</div>'}
      </div>`;
    });
    html += '</div></div>';
  });
  grid.innerHTML = html;
}

window.checkAchievementsAfterAction = checkAchievementsAfterAction;
window.renderAchievementsPage = renderAchievementsPage;

function renderDashboardAchievements() {
  const unlocked = getAchievementsState();
  const unlockedCount = Object.keys(unlocked).length;
  const total = ACHIEVEMENTS.length;
  const pct = Math.round((unlockedCount / total) * 100);

  const elU = document.getElementById('db-ach-unlocked');
  const elT = document.getElementById('db-ach-total');
  const elP = document.getElementById('db-ach-pct');
  const elFill = document.getElementById('db-ach-progress-fill');
  if (elU) elU.textContent = unlockedCount;
  if (elT) elT.textContent = total;
  if (elP) elP.textContent = pct + '%';
  if (elFill) elFill.style.width = pct + '%';

  // Colour-code progress fill by completion
  if (elFill) {
    elFill.style.background = pct >= 80 ? '#34d399' : pct >= 40 ? 'var(--accent)' : '#fbbf24';
  }

  // Show up to 5 most-recently unlocked achievements as pill badges
  const recentRow = document.getElementById('db-ach-recent-row');
  if (recentRow) {
    const recentList = ACHIEVEMENTS
      .filter(a => unlocked[a.id])
      .sort((a, b) => (unlocked[b.id].unlockedAt || 0) - (unlocked[a.id].unlockedAt || 0))
      .slice(0, 5);
    const tierColor = { bronze: '#cd7f32', silver: '#9ca3af', gold: '#fbbf24', legendary: '#a78bfa' };
    recentRow.innerHTML = recentList.length
      ? recentList.map(a => `
        <span class="db-ach-recent-pill" style="border-color:${tierColor[a.tier]}33;color:${tierColor[a.tier]}">
          ${a.icon} ${a.name}
        </span>`).join('')
      : `<span style="font-size:.72rem;color:var(--text3);padding:.2rem 0">Complete study sessions to unlock your first achievement!</span>`;
  }
}
window.renderDashboardAchievements = renderDashboardAchievements;

// ===== PET WORLD PAGE RENDERER (PDF Blueprint §3) =====
// Pet evolution: Egg -> Baby -> Teen -> Adult -> Legendary
// Pet earns XP only when: focus session completed, task completed, study log added
// Pet loses hunger every hour

function getPetEvolutionStage(xpTotal) {
  if (xpTotal < 100)  return { stage: 'egg',       label: 'Egg',       emoji: '🥚', next: 100 };
  if (xpTotal < 500)  return { stage: 'baby',      label: 'Baby',      emoji: '🐣', next: 500 };
  if (xpTotal < 2000) return { stage: 'teen',      label: 'Teen',      emoji: '🐾', next: 2000 };
  if (xpTotal < 6000) return { stage: 'adult',     label: 'Adult',     emoji: '⭐', next: 6000 };
  return               { stage: 'legendary', label: 'Legendary', emoji: '👑', next: Infinity };
}

function renderPetWorld() {
  const pet = getPetState();
  const xpState = getXpState();
  const xpTotal = xpState.total || 0;
  const evo = getPetEvolutionStage(xpTotal);
  const coinsState = getCoinsState();

  // Update evolution banner
  const stages = ['egg', 'baby', 'teen', 'adult', 'legendary'];
  document.querySelectorAll('.evo-stage').forEach(el => {
    el.classList.toggle('active', el.dataset.stage === evo.stage);
    el.classList.toggle('unlocked', stages.indexOf(el.dataset.stage) <= stages.indexOf(evo.stage));
  });
  const evoPct = evo.next === Infinity ? 100 : Math.min(100, Math.round((xpTotal / evo.next) * 100));
  const evoPbar = document.getElementById('evo-progress-fill');
  if (evoPbar) evoPbar.style.width = evoPct + '%';
  const evoLabel = document.getElementById('evo-stage-label');
  if (evoLabel) evoLabel.textContent = evo.next === Infinity ? `👑 Legendary — Maximum evolution!` : `${evo.label} · ${evoPct}% to ${stages[stages.indexOf(evo.stage)+1] || 'max'} (${xpTotal}/${evo.next} XP)`;

  // Update coins/sparks display
  const sparksState = getCurrencyState();
  ['petworld-sparks'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = sparksState.sparks || 0; });
  ['petworld-coins'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = coinsState.coins || 0; });

  const mainContent = document.getElementById('petworld-main-content');
  const metersEl = document.getElementById('pet-meters');
  const actionsEl = document.getElementById('petworld-actions');

  if (!pet) {
    // Use SVG-based hatch panel from pet.js if available
    if (mainContent) {
      mainContent.innerHTML = '<div id="pet-page-content" style="padding:.5rem 0"></div>';
      if (typeof window.renderEnhancedPetCard === 'function') {
        setTimeout(() => window.renderEnhancedPetCard('pet-page-content'), 0);
      }
    }
    if (metersEl) metersEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';
  } else {
    const hunger = getPetHunger(pet);
    const { mood, color: moodColor } = getPetMood(hunger);
    const petNameLabel = evo.emoji + ' ' + pet.name;
    const petNameEl = document.getElementById('petworld-pet-name');
    if (petNameEl) petNameEl.textContent = petNameLabel;

    // Use SVG renderer from pet.js
    if (mainContent) {
      // Only rebuild if container doesn't already have the SVG pet content
      if (!document.getElementById('pet-page-content')) {
        mainContent.innerHTML = '<div id="pet-page-content" style="padding:.5rem 0"></div>';
      }
      if (typeof window.renderEnhancedPetCard === 'function') {
        setTimeout(() => window.renderEnhancedPetCard('pet-page-content'), 0);
      }
    }

    // Update meters
    const happiness = Math.min(100, Math.round(hunger * 0.8 + (xpTotal > 0 ? 20 : 0)));
    const energy = Math.min(100, Math.round(hunger));
    [['pw-hunger-fill', 'pw-hunger-val', hunger, '#f97316'],
     ['pw-happiness-fill', 'pw-happiness-val', happiness, '#34d399'],
     ['pw-energy-fill', 'pw-energy-val', energy, '#38bdf8']].forEach(([fillId, valId, pct, color]) => {
      const fillEl = document.getElementById(fillId);
      const valEl = document.getElementById(valId);
      if (fillEl) { fillEl.style.width = Math.round(pct) + '%'; fillEl.style.background = color; }
      if (valEl) valEl.textContent = Math.round(pct) + '%';
    });
    if (metersEl) metersEl.style.display = '';
    if (actionsEl) actionsEl.style.display = '';
  }

  // Render diary
  renderPetWorldDiary();
  // Render wardrobe
  renderPetWorldWardrobe();
}

function renderPetWorldDiary() {
  const diary = document.getElementById('petworld-diary-content');
  if (!diary) return;
  const pet = getPetState();
  if (!pet) { diary.innerHTML = '<div class="empty-state">Hatch a pet to begin!</div>'; return; }
  const xpState = getXpState();
  const sparks = getCurrencyState().sparks || 0;
  const coins = getCoinsState().coins || 0;
  const created = pet.createdAt ? new Date(pet.createdAt) : new Date();
  const days = Math.floor((Date.now() - created.getTime()) / 86400000);
  const hunger = Math.round(getPetHunger(pet));
  diary.innerHTML = `
    <div class="diary-stats-grid">
      <div class="stat-card"><div class="stat-label">Days Together</div><div class="stat-value">${days}</div></div>
      <div class="stat-card"><div class="stat-label">Total XP</div><div class="stat-value">${(xpState.total||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">⚡ Sparks</div><div class="stat-value">${sparks}</div></div>
      <div class="stat-card"><div class="stat-label">🪙 Coins</div><div class="stat-value">${coins}</div></div>
      <div class="stat-card"><div class="stat-label">Hunger</div><div class="stat-value" style="color:${hunger>50?'#34d399':hunger>20?'#fbbf24':'#ef4444'}">${hunger}%</div></div>
      <div class="stat-card"><div class="stat-label">Level</div><div class="stat-value">${getLevelInfo(xpState.total||0).level}</div></div>
    </div>
    <div style="font-size:.8rem;color:var(--text2);line-height:1.8;margin-top:.75rem">
      <div>🐾 <strong>${pet.name}</strong> has been your buddy for <strong>${days} day${days!==1?'s':''}</strong>.</div>
      <div>🥚 Hatched on ${created.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
      <div>🌟 XP earned: <strong>${(xpState.total||0).toLocaleString()}</strong></div>
      <div>👗 Accessories: ${pet.equippedItems?.length ? pet.equippedItems.map(id=>PET_WARDROBE.find(w=>w.id===id)?.name||id).join(', ') : 'None yet'}</div>
    </div>
    <div class="diary-tip">💡 Keep studying to evolve your pet! Feed it with Sparks so it stays happy.</div>
  `;
}

function renderPetWorldWardrobe() {
  const el = document.getElementById('petworld-wardrobe');
  if (!el) return;
  const pet = getPetState();
  el.innerHTML = PET_WARDROBE.map(item => {
    const owned = pet?.equippedItems?.includes(item.id);
    return `<div class="wardrobe-item ${owned?'owned':''}">
      <span class="wardrobe-icon">${item.icon}</span>
      <div class="wardrobe-info">
        <div class="wardrobe-name">${item.name}</div>
        <div class="wardrobe-bonus">${item.bonus}</div>
      </div>
      <button class="${owned?'btn-outline':'btn-primary'} wardrobe-btn" onclick="buyWardrobeItem('${item.id}')" style="font-size:.75rem;padding:.35rem .7rem">
        ${owned ? '✓ Equipped' : '⚡ ' + item.cost}
      </button>
    </div>`;
  }).join('');
}

function openFeedModal() {
  const modal = document.getElementById('feed-modal');
  if (!modal) return;
  const sparks = getCurrencyState().sparks || 0;
  const grid = document.getElementById('feed-food-grid');
  if (grid) grid.innerHTML = PET_FOOD.map(f => `
    <div class="feed-food-item">
      <span class="feed-food-icon">${f.icon}</span>
      <div class="feed-food-info">
        <div class="feed-food-name">${f.name}</div>
        <div class="feed-food-desc">${f.desc} (+${f.hunger}% hunger)</div>
      </div>
      <button class="btn-primary" onclick="feedPet('${f.id}');closeFeedModal();renderPetWorld()" style="font-size:.75rem;padding:.35rem .8rem;${sparks<f.cost?'opacity:.4;cursor:not-allowed':''}">
        ⚡${f.cost}
      </button>
    </div>`).join('');
  modal.style.display = 'flex';
}

function closeFeedModal() {
  const modal = document.getElementById('feed-modal');
  if (modal) modal.style.display = 'none';
}

function hatchPetFromWorld() {
  const archetype = document.querySelector('input[name="pet-archetype-world"]:checked')?.value || 'kitten';
  const name = document.getElementById('pet-name-world-input')?.value || '';
  hatchPet(archetype, name);
  setTimeout(() => renderPetWorld(), 100);
}

window.renderPetWorld = renderPetWorld;
window.openFeedModal = openFeedModal;
window.closeFeedModal = closeFeedModal;
window.hatchPetFromWorld = hatchPetFromWorld;
window.renderPetWorldDiary = renderPetWorldDiary;

// ===== PRODUCTIVITY SCORE (PDF Blueprint §9) =====
// Formula: Productivity = (study hours + tasks completed + streak bonus)

function calcProductivityScore(logs, tasks, streak) {
  const today = todayStr();
  const week = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10);
  });
  const weekLogs = logs.filter(l => week.includes(l.date));
  const weekMins = weekLogs.reduce((s,l) => s+(l.duration||0), 0);
  const weekHours = weekMins / 60;
  const doneTasks = tasks.filter(t => t.done).length;
  const streakBonus = Math.min(50, streak * 2);
  const score = Math.min(100, Math.round(weekHours * 3 + doneTasks * 0.5 + streakBonus));
  return score;
}

function getBestStudyTime(logs) {
  const hourCounts = {};
  logs.forEach(l => {
    if (l.createdAt?.seconds) {
      const h = new Date(l.createdAt.seconds * 1000).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + (l.duration || 0);
    }
  });
  const best = Object.entries(hourCounts).sort((a,b) => b[1]-a[1])[0];
  if (!best) return 'Not enough data';
  const h = parseInt(best[0]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return h12 + ':00 ' + ampm;
}

// Inject productivity score into reports page
const _origGenWeekly = generateWeeklyReport;
async function generateWeeklyReportEnhanced() {
  await _origGenWeekly();
  // Append productivity score
  const [logs, tasks] = await Promise.all([fsGet('daily_logs'), fsGet('tasks')]);
  const streak = calcStreak(logs);
  const score = calcProductivityScore(logs, tasks, streak);
  const bestTime = getBestStudyTime(logs);
  const scoreColor = score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171';
  const existing = document.getElementById('weekly-report-content');
  if (existing) {
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'card';
    scoreDiv.style.marginTop = '1rem';
    scoreDiv.innerHTML = `
      <div class="card-title">📊 Productivity Insights</div>
      <div class="productivity-score-wrap">
        <div class="productivity-score-circle" style="border-color:${scoreColor}">
          <div class="productivity-score-num" style="color:${scoreColor}">${score}</div>
          <div class="productivity-score-label">Score</div>
        </div>
        <div class="productivity-insights">
          <div class="insight-row">⏰ Best study time: <strong>${bestTime}</strong></div>
          <div class="insight-row">🔥 Current streak: <strong>${streak} days</strong></div>
          <div class="insight-row">📈 Score formula: study hours + tasks + streak bonus</div>
          ${score >= 80 ? '<div class="insight-row insight-positive">🌟 Excellent week! You\'re in peak productivity mode.</div>' :
            score >= 50 ? '<div class="insight-row">💪 Good work. Keep pushing toward your daily goals.</div>' :
            '<div class="insight-row insight-warn">📌 Room to grow. Try shorter, more consistent sessions.</div>'}
        </div>
      </div>`;
    existing.appendChild(scoreDiv);
  }
}
window.generateWeeklyReport = generateWeeklyReportEnhanced;

// ===== SOUNDSCAPE SYSTEM UPGRADE (PDF Blueprint §8) =====
// Adds rain, forest, café, ocean synthetic audio

function changeAmbientType(type) {
  const toggle = document.getElementById('ambient-noise-toggle');
  if (toggle?.checked) {
    // Restart with new type
    toggleAmbientNoise(false);
    setTimeout(() => toggleAmbientNoise(true), 50);
  }
  localStorage.setItem('deeptrck-ambient-type', type);
}

// Override toggleAmbientNoise to use selected soundscape type
const _origAmbient = toggleAmbientNoise;
function toggleAmbientNoiseTyped(enabled) {
  if (!enabled) { _origAmbient(false); return; }
  const type = document.getElementById('ambient-type')?.value || localStorage.getItem('deeptrck-ambient-type') || 'brown';
  const ctx = getAudioCtx();
  if (!ctx) { _origAmbient(true); return; }
  if (App.ambientNode) { try { App.ambientNode.stop(); } catch(e){} App.ambientNode = null; }

  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  const gainNode = ctx.createGain();

  if (type === 'brown' || type === 'rain') {
    // Brown/rain noise
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + (type === 'rain' ? 0.04 : 0.02) * white) / (type === 'rain' ? 1.04 : 1.02);
        data[i] = last * (type === 'rain' ? 4.5 : 3.5);
      }
    }
    gainNode.gain.value = type === 'rain' ? 0.3 : 0.2;
  } else if (type === 'forest') {
    // Forest: filtered white noise + periodic chirps
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.005 * white) / 1.005;
        const chirp = i % Math.round(ctx.sampleRate * 0.8) < 100 ? Math.sin(i * 0.05) * 0.08 : 0;
        data[i] = last * 2 + chirp;
      }
    }
    gainNode.gain.value = 0.18;
  } else if (type === 'cafe') {
    // Café: low murmur noise
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.03 * white) / 1.03;
        const clink = i % Math.round(ctx.sampleRate * 3.2) < 30 ? Math.sin(i * 0.2) * 0.05 : 0;
        data[i] = last * 3 + clink;
      }
    }
    gainNode.gain.value = 0.22;
  } else if (type === 'ocean') {
    // Ocean waves: slow modulated noise
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        const wave = Math.sin(i / (ctx.sampleRate * 2)) * 0.3 + 0.7;
        last = (last + 0.03 * white) / 1.03;
        data[i] = last * 4 * wave;
      }
    }
    gainNode.gain.value = 0.25;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gainNode);
  gainNode.connect(ctx.destination);
  src.start();
  App.ambientNode = src;
}
window.toggleAmbientNoise = toggleAmbientNoiseTyped;
window.changeAmbientType = changeAmbientType;

// ===== COINS DISPLAY INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateCoinsDisplay();
});

// Expose to window
window.updateCoinsDisplay = updateCoinsDisplay;
window.renderPetWorldWardrobe = renderPetWorldWardrobe;

