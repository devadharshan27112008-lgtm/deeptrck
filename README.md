# DeepTrck — Setup Guide

Two steps: Firebase (free database + auth) and Netlify (free hosting). That's it.

---

## Step 1 — Firebase Setup

### 1a. Create a project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `deeptrck` → Create

### 1b. Enable Email/Password login
1. Left sidebar → **Build → Authentication → Get started**
2. Click **Email/Password** → Enable → Save

### 1c. Create a database
1. Left sidebar → **Build → Firestore Database → Create database**
2. Choose **Start in test mode** → pick any region → Enable

### 1d. Get your config
1. Click the ⚙️ gear → **Project settings**
2. Scroll to **Your apps** → click the **</>** web icon
3. Register your app (nickname: `deeptrck-web`)
4. Copy the `firebaseConfig` object — paste it into `app.js` at the top (replacing the placeholder)

Done. No billing card, no Cloud Functions, no SendGrid — just the free tier.

---

## Step 2 — Deploy on Netlify

1. Go to [netlify.com](https://netlify.com) → sign up free
2. Click **Add new site → Deploy manually**
3. Drag and drop your `deeptrck` folder into the box
4. You get a URL like `https://deeptrck-abc123.netlify.app` — done!

To update the site later, just drag the folder again.

---

## Notifications

Notifications work as **browser push notifications** — they fire even when the tab is closed, as long as you've given permission once.

To enable: go to **Settings → Push Notifications → Enable** inside the app.

No server needed. The included `sw.js` service worker handles everything locally.

---

## Files in this project

| File | Purpose |
|------|---------|
| `index.html` | App shell, all page layouts |
| `style.css` | All styling and animations |
| `app.js` | Firebase, auth, dashboard, tasks, focus, reports, XP, energy |
| `pet.js` | **Enhanced pet system** (see below) |
| `sw.js` | Service worker — offline + push notifications |
| `manifest.json` | PWA manifest — add to home screen |

---

## 🐾 Study Buddy (pet.js) — What's New

The pet system has been completely rebuilt with:

### Realistic SVG Avatars
All four pets are drawn as detailed SVG illustrations with full emotion expressions:
- 😄 **Happy** — bright eyes, open smile, rosy cheeks
- 🙂 **Okay** — neutral expression
- 😟 **Hungry** — droopy eyes, sad mouth, visible tears
- 😴 **Fading** — half-closed eyes, "Zzz" floating above

Equipped items (glasses, scarf, crown) are drawn directly onto the SVG avatar.

### Pet Animations
The pet is always alive:
- **Idle bob** — gentle continuous float up/down
- **Random actions** — every few seconds the pet spontaneously bounces, spins, or sits down
- **Tap to poke** — click/tap the avatar to make it bounce and chirp
- **Eating animation** — wiggles and tilts when fed
- **Tired sway** — slow side-to-side wobble when hunger is critical

### Pet Shop (2 tabs)
**Food tab** — 5 food items with costs in Sparks:
| Item | Cost | Hunger restored |
|------|------|----------------|
| Kibble 🥣 | 10 ⚡ | +10% |
| Berry 🍓 | 20 ⚡ | +15% |
| Fresh Fish 🐟 | 35 ⚡ | +28% |
| Focus Feast 🍱 | 50 ⚡ | +45% |
| Royal Cake 🎂 | 120 ⚡ | +80% |

**Accessories tab** — 3 wearable items (drawn on avatar):
| Item | Cost | Bonus |
|------|------|-------|
| Scholar Specs 🤓 | 120 ⚡ | +2 XP per task |
| Cozy Scarf 🧣 | 200 ⚡ | -20% hunger drain |
| Focus Crown 👑 | 500 ⚡ | +5% focus XP |

### Sad Mode
When hunger drops below 30%:
- The pet card pulses with an orange glow border
- A rain animation falls over the pet scene
- A thought bubble appears: *"I'm hungry... 🥺"*
- A header hint flashes: *"needs care!"*
- The website plays a soft descending whimper sound (Web Audio, no files needed)
- The pet avatar switches to its sad expression with visible tears

### Sounds (Web Audio API — no external files)
| Trigger | Sound |
|---------|-------|
| Hunger < 30% | Soft descending whimper (plays once every 30 s) |
| Tap avatar | Happy ascending chirp |
| Feed pet | Three short "nom" notes |

---

## That's it

Your app is live. Sign up, log in, and start tracking.

Features:
- Dashboard with daily goal ring, streak, and weekly chart
- Daily log → flows into weekly & monthly reports
- Task planner with due dates, times, and push reminders
- Course tracker with time logging
- Focus timer (Pomodoro, Deep Work, Long Block, Quick, Custom)
- Typing WPM tracker
- Weekly & monthly reports with badges
- Enhanced Study Buddy pet with SVG avatars and shop
- PWA — add to home screen on your phone
