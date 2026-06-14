# fitsheet — guide for Claude Code

A personal fitness companion: calories, weight, workouts, walks, recipes, notes, and an analytics
tab. One user, no login. Designed "Warm & encouraging." **This app is meant to be changed over time
by a non-technical owner working with you (Claude Code).** Be friendly, explain what you're doing in
plain language, and make small, safe changes.

## 🔒 NO PERSONAL DATA IN THE REPO — read this first

This app stores sensitive health data. Every file committed to git must be **generic enough to share
with a stranger on the internet**. NEVER commit, anywhere (code, comments, commit messages, examples):

- The owner's or anyone's **real name** (the code says "there" / "Robin" as placeholders — keep it that way).
- Real **weights, calorie numbers, body measurements, photos, journal entries, or moods**.
- The **home-lab's private IP / hostname**, any Tailscale names, or the real domain it's served at.
  Use `127.0.0.1` or `http://your-server:3000` in examples. (The web app calls the API with relative
  paths, so no address is hardcoded anyway.)
- **Location** (home city/state) or anything that narrows down who this is.
- Anything under `server/data/` (the database + uploaded photos), `.env`, or real config.

These are already git-ignored (see `.gitignore`). If you ever describe a bug, describe it
*structurally* ("off-by-one in the streak counter"), never with real numbers.

## What's here

```
fitsheet/
├── app/      → the web app (React Native + react-native-web → a PWA). Open in a browser, Add to Home Screen.
├── server/   → the brain (Express API + SQLite). Serves the built app AND the API. Runs in Docker.
└── Dockerfile, docker-compose.yml, deploy/portainer-stack.yml
```

- **app/src/screens/** — one file per screen (Home, Food, Weight, Activity, More → Notes/Recipes/Analytics/Settings).
- **app/src/components/** — shared UI (buttons, cards, the calorie ring, the weight chart…). Colors/fonts live in **app/src/theme.ts**.
- **app/src/lib/api.ts** — the ONE place the app talks to the server. Add new endpoints here.
- **server/src/routes/** — one file per thing (foods, weight, workouts…). 
- **server/src/db/migrations/** — the database shape, as numbered `.sql` files.
- **server/src/analytics.ts** — the trend/TDEE/projection math.

## How to run it

**Home-lab (Docker):** the image builds automatically and publishes to `ghcr.io/gemivnet/fitsheet`
on every push. Deploy `deploy/portainer-stack.yml` (or `docker compose up -d`) and front it with
**HTTPS** (Nginx Proxy Manager) — HTTPS is required for the camera. First open → onboarding.

**On your computer (to develop):**
```bash
npm run install:all          # one time
npm run dev:server           # API + serves the web app at http://localhost:3000
npm run build:web            # build the PWA into app/dist (the server serves it)
# open http://localhost:3000   (live UI reload during dev: `npm --prefix app run web`)
```
Back up everything by copying the `server/data/` folder (or the Docker `fitsheet-data` volume).

## How to make changes safely (the important part)

**To change your goal, units, reminder day, or your name:** just use the **Settings** screen in the
app. No code needed. (Settings → Data → *Erase everything & start over* gives a clean slate.)

**To add a new thing to track** (say, "water intake"), tell Claude Code: *"add water tracking."* The
safe pattern is always:
1. Add a **new** migration file `server/src/db/migrations/0002_add_water.sql` — **never edit an old
   migration**, always add a new numbered one. It runs automatically next time the server starts.
2. Add a route in `server/src/routes/` (copy an existing one like `notes.ts`).
3. Add it to `app/src/lib/api.ts`.
4. Add or update a screen in `app/src/screens/`.

**Rules that keep things working:**
- Never edit or delete a migration that already ran — only add a new one.
- Never hardcode the server address — the web app uses relative `/api` paths (same origin).
- Never commit anything from `server/data/`, `.env`, or with real personal data in it.
- The daily calorie goal is **the owner's to set**. A calculator may *suggest* a number, but she can always type her own — never silently overwrite it.
- Prefer libraries that work in the **web build** (react-native-web). Camera features need HTTPS.

**If something breaks:** read the server's terminal output for the error. To wipe and restart the
data in development, POST to `/api/dev/reset` (or use Settings → Start fresh). Restore a backup by
copying a saved `server/data/` folder back.

## Tech notes

- **Stream anything that makes the user wait.** Any AI/generation that takes more than a moment
  should show progress as it arrives, not a spinner — meals/items pop in as they're generated, text
  types out, etc. Mirror the SSE pattern in `server/src/routes/ai.ts` (`*-stream` endpoints with
  `claudeStream`) + the client reader in `app/src/screens/MealPlanScreen.tsx` / `DiningOutScreen.tsx`.
  New AI features should stream by default and keep a non-streaming fallback.
- Server uses Node's **built-in `node:sqlite`** (no native build needed; requires Node ≥ 22.5, and
  it's already what the Docker image uses). Run with `tsx` — no compile step.
- The app is React Native rendered to the web via **`react-native-web`** (Expo SDK 56 tooling),
  React Navigation, `react-native-svg`, `@tanstack/react-query`. Barcode scanning uses **ZXing** in
  the browser (`app/src/components/BarcodeScanner.web.tsx`); label/progress photos use the file picker.
- Motion uses **Reanimated 4 + Moti** (springs, the draggable companion, swipe-to-delete). This needs
  `app/babel.config.js` with the `react-native-worklets/plugin` listed **last**, and `babel-preset-expo`
  as an explicit dep — don't delete either or the web build breaks. If Metro caches go stale, rebuild.
- The calorie ring is drawn with **`@shopify/react-native-skia`** on web (gradient + glow); the SVG ring
  is the always-safe fallback. `scripts/pwa.mjs` copies `canvaskit.wasm` to the site root and the ring's
  `locateFile` points there. Other resilient libs: **fuse.js** (fuzzy food search), **date-fns** (all the
  date helpers), **react-query persistence** (offline cache in localStorage + the offline banner).
- **Voice logging** (Speak mode in Add food) uses the browser Web Speech API (`lib/speech.ts`); it's a
  web-only no-op seam like notifications and hides itself where unsupported (e.g. iOS Safari).
- On web, `expo-notifications` is a no-op (`lib/notifications.ts` guards it). The `/api/settings/reminders`
  payload + seam stay for a future native build / web-push.
- No auth: protect it by serving it only behind your reverse proxy / private network. The DB seeds a
  single implicit user so a login can be added later as a purely additive change.

## Commits

Keep commit messages free of personal data. Small, focused commits are best. A gitmoji prefix
(`✨ feature`, `🐛 fix`, `📝 docs`) matches the other `*sheet` projects but isn't required.
