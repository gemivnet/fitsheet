# fitsheet

A personal, mobile-first fitness companion — **calorie + weight tracking, workouts, walks, recipes,
notes, and a nerdy analytics tab.** Part of the `*sheet` family. Designed "Warm & encouraging"
(soft coral/peach, Nunito numerals, celebratory milestones). One user, no login.

> Built to be iterated on with Claude Code by a non-technical owner — see **[CLAUDE.md](CLAUDE.md)**.

## What it does

- **Calories** — log by gram under Breakfast/Lunch/Dinner/Snacks. Search **Open Food Facts**, **scan
  a barcode** with the camera, or snap a nutrition label and let **AI** fill in the numbers.
- **Weight** — log weigh-ins, see a smoothed **trend line**, goal progress %, progress photos, and a
  confetti **celebration** at every milestone.
- **Workouts** — plan them with a link to follow, mark complete, or log one ad-hoc.
- **Walks** — one-tap presets ("Regular walk") or a manual entry.
- **Notes** — a quick journal with a mood. · **Recipes** — a gallery of meal ideas with rough calories + cook time.
- **Analytics** — empirical **TDEE**, rate of loss, projected goal date, and adherence/streaks.

## How it works

It's a **single web app (PWA)** — open it in a browser and **Add to Home Screen** for a fullscreen
app icon. The same React UI (React Native + `react-native-web`) and the Express + SQLite API are
served from **one origin**, so the app calls the API with relative paths — it works over http or
https behind any reverse proxy. Everything ships as **one Docker image**.

> **Camera features (barcode scan, label photo) require HTTPS** — a browser rule. Put it behind a
> reverse proxy (Nginx Proxy Manager, etc.) with a cert. Everything else works over plain http too.

## Run on the home-lab (Docker / Portainer)

The image is published to **`ghcr.io/gemivnet/fitsheet:latest`** by GitHub Actions on every push to
`main`. Deploy with the stack in [`deploy/portainer-stack.yml`](deploy/portainer-stack.yml):

```yaml
services:
  fitsheet:
    image: ghcr.io/gemivnet/fitsheet:latest
    container_name: fitsheet
    restart: unless-stopped
    environment:
      TZ: America/Chicago
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-} # optional: enables AI label reading
    ports: ['3000:3000']
    volumes: ['fitsheet-data:/app/data'] # DB + photos — back this up
volumes:
  fitsheet-data:
```

Then front it with Nginx Proxy Manager (HTTPS) and open the URL. **First launch → onboarding**:
enter your name, units, goal weight, and calorie goal. Done. _(If the GHCR package is private,
either make it public in GitHub → Packages, or add your registry credentials in Portainer.)_

## Local development

```bash
npm run install:all
npm run dev:server     # API + serves the built web app at http://localhost:3000
npm run build:web      # build the PWA into app/dist (the server serves it)
# open http://localhost:3000
```
For live UI hot-reload in a browser during development: `npm --prefix app run web`.

## Tech

Server: Express 5 · `node:sqlite` · multer · `@anthropic-ai/sdk` · tsx.
Web: React Native 0.85 + `react-native-web` (Expo SDK 56 tooling) · React Navigation 7 ·
`react-native-svg` · `@tanstack/react-query` · ZXing (browser barcode) · Nunito.

License: AGPL-3.0-only.
