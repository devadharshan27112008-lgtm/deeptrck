# DeepTrck — Build Log

Plain HTML/CSS/JS, no build step, no framework. Firebase (Auth + Firestore) reused from
the old DeepTrck project so no new setup is required.

## Files
- `index.html` — all screens/tabs (auth, track select, app shell with 7 tabs)
- `style.css` — full design system (colors, type, layout, responsive nav)
- `app.js` — Firebase init, auth, track selection, nav/tab logic

## Run it
Just open `index.html` in a browser, or serve the folder with any static server
(`npx serve .`). No build tools needed — Firebase is loaded straight from the CDN
as ES modules.

## One-time Firebase console check
These should already be true from the old project, but confirm:
1. **Authentication → Sign-in method → Email/Password** is enabled.
2. **Firestore → Rules** allow a signed-in user to read/write only their own
   `users/{uid}/**` documents, e.g.:
   ```
   match /users/{uid}/{document=**} {
     allow read, write: if request.auth != null && request.auth.uid == uid;
   }
   ```

## Phase status
| Phase | Scope | Status |
|---|---|---|
| 1. Foundation | Auth (login/signup/logout), School/College track switcher, full nav shell (Home built, other 6 tabs as placeholders) | **Done** |
| 2. Courses MVP | Create course, auto-generated Mon–Sun daily schedule, daily checkbox, auto progress % | **Done** |
| 3. Home + Tasks | Today panel pulling real scheduled days + tasks, Tasks tab (create/filter/complete/delete) | **Done** |
| 4. XP + Streak | XP/Credits on completion, streak engine, levels | **Done** |
| 5. Credits + Rewards | Reward catalog, purchase flow, transaction ledger | **Done** |
| 6. Focus + Progress | Pomodoro/Flowtime timer, session history, Progress analytics | **Done** |
| 7. Polish | Accessibility, offline app-shell (PWA), responsiveness | **Done** |
| 8. Track Differentiation & Validation | Custom School/College themes, track widgets, course metadata, date/duplicate checks, offline status, focus session guard | **Done** |
| 9. Academic & Online Course Engine | Course deletion fix, strict track isolation, Academic & Online Certifications (Coursera / NPTEL), credit hours tracking | **Done** |
| 10. Student UX Simplification | 4 primary tabs (Home, Courses, Tasks, Focus), single currency (Credits), course form accordion, starter sample seed | **Done — latest build** |

**All 10 core phases are complete.** The blueprint's learning loop — daily course tracking, tasks, Credits & streak gamification, a reward shop, focus timing, progress analytics, track isolation, streamlined onboarding, and starter sample seeding — is fully built in plain HTML/CSS/JS against your existing Firebase project.

## What Phase 10 adds (Student UX Simplification)
- **Cut Course Form to Essentials**: Modal shows Course Name, Start Date, End Date, and "How many days a week?". Optional fields collapsed behind "More options (optional)" toggle.
- **Single Currency (Credits + Streak)**: Dropped XP clutter. All completion rewards award clean spendable Credits.
- **4 Primary Tabs Navigation**: Primary navigation simplified to **Home** · **Courses** · **Tasks** · **Focus**.
- **Profile Sub-tabs Hub**: Folded **Progress & Analytics** and **Rewards Shop** into Profile as sub-sections.
- **Simplified Onboarding**: Track select screen replaced with single-line crisp cards.
- **Starter Course Seeding**: Automatically seeds a starter course ("🚀 Welcome to DeepTrck") and task on first login.


## Files
- `index.html` / `style.css` / `app.js` — the main application
- `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` — PWA support (installable, offline app shell)
- `README.md` — this build log & documentation

## What Phase 1 gives you
- Email/password sign up & log in against the existing `deeptrck` Firebase project
- A `users/{uid}/profile/main` document created on signup (`name`, `email`, `track`, `xp`, `credits`, `streak`)
- A one-time School/College track picker that's remembered on future logins
- The full 7-tab navigation (sidebar on desktop, bottom nav on mobile)

## What Phase 2 adds
- **Create Course** modal: name, description, start/end date, a study-days picker (with Mon–Fri / Mon–Sat / All 7 presets), and optional per-day target labels
- **Auto-generated schedule**: every date between start and end that falls on a chosen weekday becomes a scheduled day — non-study days are simply never created, so they're never counted as "missed"
- **Course cards** with a live progress bar and a mission-control day-strip (one chip per scheduled day, colored by status) for an at-a-glance read
- **Course detail drawer**: Overview (stats + delete) and Schedule (full Monday–Sunday checklist grouped by week, with Today/Upcoming/Completed/Missed status badges)
- **Checkbox completion** that recalculates progress instantly and is idempotent — tapping an already-completed day's checkbox undoes it cleanly, it never double-counts
- Data lives at `users/{uid}/courses/{courseId}`, with the day schedule stored as a `days` array on the course document

## What Phase 3 adds
- **Real Tasks tab**: create tasks with a title, optional due date, priority (Low/Medium/High), and an optional link to a course; Today / Upcoming / Completed / Overdue filters; checkbox to complete, ✕ to delete
- **Real Home "Today" panel**: pulls every course's day scheduled for *today* across all courses, plus every task due today, into one unified list — checking an item off (course day or task) updates it in place, the same idempotent logic as the Courses tab. Tapping a course item opens its drawer; tapping a task jumps to the Tasks tab
- **Real "Continue learning"**: up to 4 active (not-yet-100%) courses with live progress % and their next scheduled day, tap to open the drawer
- Tasks live at `users/{uid}/tasks/{taskId}` — `title`, `dueDate`, `priority`, `courseId` (optional), `status` (`pending`/`completed`)

## What Phase 4 adds
- **Fixed reward table** (mirrors the blueprint's Credit System): course day = +50 XP / +10 Credits; task = +10/+20/+30 XP and +5/+10/+15 Credits by priority (Low/Medium/High); first time a course hits 100% = one-time +200 XP / +100 Credits bonus
- **Top bar stats are live**: 🔥 streak, ✦ XP, ◆ Credits update immediately on completion, with a small toast confirming exactly what was earned
- **Idempotent by design**: every completed day/task stores exactly how much XP/Credits it was awarded (`xpAwarded`/`creditsAwarded`). Re-checking an already-completed item does nothing; unchecking refunds precisely what was granted — never a re-roll, never a double-award, matching the blueprint's anti-duplication rule
- **Streak engine**: increments once per calendar day on the first qualifying completion (course day or task); resets to 1 if a full day was skipped. Unchecking an item does *not* reduce the streak — intentional, in line with the blueprint's "no shame-based penalty" principle for daily tracking
- **Level**: a transparent `floor(xp / 200) + 1` curve, shown in Profile with a progress bar toward the next level — no hidden thresholds
- Course completion bonus is also idempotent: `completionBonusAwarded` is set once and never re-granted, even if the course later drops below 100% and is re-completed

## What Phase 5 adds
- **Real Rewards tab**: the blueprint's starter catalog — Profile frame (50), Dashboard theme (150), Pet accessory (100), Pet skin (250), Special achievement badge (300) — every price fixed and shown upfront, no chance mechanics
- **Purchase flow**: a confirm step, then Credits deduct instantly; owned items show "Owned" and can't be re-bought; the Buy button disables itself automatically if you're short on Credits — no negative balances possible
- **Transaction ledger**: every earn *and* spend writes an entry (`+10 Credits — Completed Embedded C / Tuesday`, `-150 Credits — Purchased Dashboard theme`), shown newest-first in Rewards — exactly the auditable history the blueprint calls for
- Data lives at `users/{uid}/rewards/{rewardId}` (ownership) and `users/{uid}/ledger/{entryId}` (append-only history, capped to the most recent 40 entries on load for a lite footprint)

## What Phase 6 adds
- **Real Focus tab**: Pomodoro (15/25/45 min presets) or Flowtime (count-up) timer, with a circular progress ring, optional course/task link, Start/Pause/Resume/Reset, and a "Finish" action for flowtime sessions
- Sessions of **5+ minutes** earn +15 XP / +5 Credits (the blueprint's "minimum configured session duration" rule); shorter sessions are still logged but don't earn a reward
- **Session history** list (mode, linked course/task, duration, date)
- **Real Progress tab**: a stat dashboard (Level, XP, streak, Credits balance, Credits earned/spent, courses completed, total focus time), a **last-7-days activity strip** (course days + tasks + focus sessions per day, at a glance), and a course-completion list across everything you're tracking
- Data lives at `users/{uid}/focusSessions/{sessionId}` — `mode`, `durationSeconds`, `courseId`/`taskId` (optional), `qualified`, `date`

## What Phase 7 adds (Polish)
- **Accessibility pass**: `aria-live` on toasts so screen readers hear confirmations; `role="checkbox"` + `aria-checked` + descriptive `aria-label`s on every custom checkbox (course days, tasks, Home's Today items); `aria-pressed` kept in sync on toggle-style buttons (auth mode, weekday picker); Escape closes any open modal or drawer; existing `:focus-visible` outlines and `prefers-reduced-motion` support kept from Phase 1
- **Offline app shell (PWA)**: `manifest.json` + a lightweight `sw.js` service worker cache the static shell (HTML/CSS/JS/icons) so DeepTrck still opens without a connection — Firebase reads/writes still need one, this is shell-only by design to stay lite. Installable to a home screen/desktop with the included `icon-192.png` / `icon-512.png`, drawn to match your brand mark
- **Responsiveness**: every new grid (Rewards catalog, Focus panel, Progress stats) collapses cleanly on narrow screens using the same breakpoints as the rest of the app

## What Phase 8 adds (Track Differentiation & Validation Suite)
- **School vs. College Visual Differentiation**: `body[data-track="school"]` applies an emerald glow and friendly subject layout; `body[data-track="college"]` applies a sleek academic indigo/slate dark theme.
- **College Mode Features**: Home tab displays an **Academic Standing Widget** (Enrolled Credit Hours, Active Courses, Estimated Term GPA). Progress tab displays total credit hours & term GPA estimation. Course creation form includes **Course Code** (e.g. *CS-101*), **Credit Hours**, and **Instructor / Professor**.
- **School Mode Features**: Home tab displays a **Study Companion & Pet Status Widget** tied to user streak. Progress tab displays Subject Study Consistency Rate. Course creation form includes **Subject Category** and **Teacher Name**.
- **Validation Checks Suite**:
  - **Date Validation**: Ensures `End Date` is on or after `Start Date`.
  - **Study Day Check**: Requires at least one weekday to be selected before creating a course.
  - **Duplicate Course Prevention**: Rejects duplicate course names to prevent schedule collisions.
  - **Empty Title Validation**: Rejects empty trimmed titles on courses and tasks.
  - **Offline Status Banner**: Listens to `online`/`offline` window events and renders a top warning banner when network connection drops.
  - **Focus Session Protection**: Uses `beforeunload` event handler to warn users if they attempt to navigate away or close the browser tab during an active Pomodoro or Flowtime timer.

## Pending & Planned Future Updates (Roadmap)
- [ ] **Offline Firestore Queue**: Store course checkbox completions and task toggles in `localStorage` when offline and flush to Firestore upon reconnecting.
- [ ] **College Syllabus Parser**: Import course schedules directly from syllabus text or PDF upload.
- [ ] **School Parent/Teacher Export**: One-click printable PDF study progress summary for parents or tutors.
- [ ] **Custom Pet Accessories Engine**: Equip purchased pet skins and accessories from the Rewards store onto the live Home tab pet avatar.

## Known simplifications (intentional, for a lite build)
- Streak state doesn't retroactively decrement on undo — see Phase 4 notes
- Focus timer state lives in memory only; refreshing mid-session loses progress (finished/qualifying sessions are already saved by that point)
- Service worker caches the shell only, not Firestore data — there's no offline read/write queue

## Running it
Open `index.html` directly, or serve the folder (`npx serve .`) for the service worker to register properly (service workers require `http(s)://` or `localhost`, not `file://`).


