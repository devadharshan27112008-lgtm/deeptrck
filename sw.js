// DeepTrck Service Worker
// Handles two independent jobs:
//   1. Task reminders  (SYNC_REMINDERS message)
//   2. Focus timer notifications (FOCUS_START / FOCUS_CANCEL messages)
//      The tab saves an exact phaseEndAt timestamp; the SW fires a notification
//      at that moment even when the tab is closed.

const DB_NAME = 'deeptrck-sw';
const STORE = 'reminders';

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror  = e => reject(e.target.error);
  });
}

async function saveReminders(tasks) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  store.clear();
  tasks.forEach(t => store.put(t));
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function loadReminders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Task reminder loop ─────────────────────────────────────────────────────────

self.addEventListener('message', async event => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'SYNC_REMINDERS') {
    await saveReminders(msg.tasks || []);
    scheduleTaskCheck();
  }

  if (msg.type === 'FOCUS_START') {
    scheduleFocusNotification(msg);
  }

  if (msg.type === 'FOCUS_CANCEL') {
    cancelFocusNotification();
  }
});

let _taskTimer = null;
function scheduleTaskCheck() {
  if (_taskTimer) clearTimeout(_taskTimer);
  _taskTimer = setTimeout(checkReminders, 30 * 1000);
}

async function checkReminders() {
  const now = Date.now();
  const tasks = await loadReminders();
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);

  for (const t of tasks) {
    if (!t.dueDate || !t.dueTime || !t.reminderMins) continue;
    const dueMs   = new Date(t.dueDate + 'T' + t.dueTime).getTime();
    const remindAt = dueMs - t.reminderMins * 60 * 1000;

    if (!t.fired && now >= remindAt - 30000 && now < remindAt + 30000) {
      const minsLeft = t.reminderMins >= 60
        ? (t.reminderMins / 60) + ' hour'
        : t.reminderMins + ' min';
      self.registration.showNotification(`⏰ Task Reminder: ${t.text}`, {
        body: `Due in ${minsLeft} · ${formatTime12(t.dueTime)}`,
        icon: swIcon(), tag: 'reminder-' + t.id, requireInteraction: true
      });
      store.put({ ...t, fired: true });
    }

    if (!t.firedDue && now >= dueMs - 30000 && now < dueMs + 60000) {
      self.registration.showNotification(`🚨 Task Due Now: ${t.text}`, {
        body: `Due at ${formatTime12(t.dueTime)}`,
        icon: swIcon(), tag: 'due-' + t.id, requireInteraction: true
      });
      store.put({ ...t, firedDue: true });
    }
  }

  scheduleTaskCheck();
}

// ── Focus timer notifications ──────────────────────────────────────────────────
// The tab sends us the exact Unix ms timestamp when the current phase ends.
// We set a single setTimeout for that moment and fire the right notification.
// When the phase ends we chain-schedule the next one automatically.

let _focusTimer    = null;
let _focusState    = null;   // last FOCUS_START payload

function scheduleFocusNotification(msg) {
  cancelFocusNotification();
  _focusState = msg;
  const delay = Math.max(0, msg.phaseEndAt - Date.now());
  _focusTimer = setTimeout(() => onFocusPhaseEnd(_focusState), delay);
}

function cancelFocusNotification() {
  if (_focusTimer) { clearTimeout(_focusTimer); _focusTimer = null; }
  _focusState = null;
}

function onFocusPhaseEnd(state) {
  const { isBreak, preset, breaksDone, session, task } = state;
  const totalBreaks = preset.breakCount || 3;

  if (!isBreak) {
    // Work phase just ended
    const nextBreaks = breaksDone;   // hasn't incremented yet
    if (nextBreaks < totalBreaks) {
      // Notify: break starting
      self.registration.showNotification(`☕ Break time! (${nextBreaks + 1}/${totalBreaks})`, {
        body: `${task || 'Focus session'} complete. ${preset.brk} min break starting now.`,
        icon: swIcon(), tag: 'focus-phase', requireInteraction: true
      });
      // Chain: schedule next phase (break → work)
      const nextState = {
        phaseEndAt: Date.now() + preset.brk * 60 * 1000,
        isBreak: true,
        preset,
        breaksDone: nextBreaks,
        session,
        task
      };
      scheduleFocusNotification(nextState);
    } else {
      // All sessions done
      self.registration.showNotification('🏆 All done!', {
        body: `Completed all ${totalBreaks} focus sessions. Great work!`,
        icon: swIcon(), tag: 'focus-phase', requireInteraction: true
      });
      cancelFocusNotification();
    }
  } else {
    // Break phase just ended — start next work session
    const nextSession = session + 1;
    self.registration.showNotification(`🎯 Back to focus! Session ${nextSession}`, {
      body: `Break over. Starting ${preset.work} min focus session.`,
      icon: swIcon(), tag: 'focus-phase', requireInteraction: true
    });
    const nextState = {
      phaseEndAt: Date.now() + preset.work * 60 * 1000,
      isBreak: false,
      preset,
      breaksDone: breaksDone + 1,
      session: nextSession,
      task
    };
    scheduleFocusNotification(nextState);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function swIcon() {
  return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%230f172a'/><text x='6' y='24' font-size='20'>📚</text></svg>";
}

function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => {
  e.waitUntil(self.clients.claim());
  scheduleTaskCheck();
});

// Passthrough fetch keeps SW alive
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => new Response('offline')));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
