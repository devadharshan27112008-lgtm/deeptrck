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
| 1. Foundation | Auth (login/signup/logout), School/College track switcher, full nav shell (Home built, other 6 tabs as placeholders) | **Done — this build** |
| 2. Courses MVP | Create course (name, start date, duration, study days), auto-generated Mon–Sun `CourseDay` schedule, daily checkbox, auto progress % | Next |
| 3. Home + Tasks | Today panel pulling real scheduled days, Tasks tab (create/filter/complete) | Planned |
| 4. XP + Streak | XP events on completion, streak engine, badges | Planned |
| 5. Credits + Rewards | Credit ledger, reward catalog, purchase flow, transaction history | Planned |
| 6. Focus + Progress | Pomodoro/Flowtime timer, session history, Progress analytics | Planned |
| 7. Polish | Full responsiveness pass, accessibility audit, offline/PWA | Planned |

## What Phase 1 already gives you
- Email/password sign up & log in against the existing `deeptrck` Firebase project
- A `users/{uid}/profile/main` document created on signup (`name`, `email`, `track`, `xp`, `credits`, `streak`)
- A one-time School/College track picker that's remembered on future logins
- The full 7-tab navigation (sidebar on desktop, bottom nav on mobile) — Home is real,
  the rest are labeled placeholders so Phase 2+ has somewhere to plug in
- Idempotency groundwork: profile stats (XP/Credits/streak) live in one Firestore doc,
  ready for the transaction logic described in the blueprint's Phase 2 data model

## Say the word for Phase 2
Next step is the Courses tab: create-course form → generated daily schedule →
checkbox completion → progress bar, all backed by `users/{uid}/courses` and a
`courseDays` sub-structure, matching the data model in the blueprint (Section 9).
