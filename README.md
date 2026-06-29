<p align="center">
  <img src="public/husky-logo.png" alt="Husky" width="120" />
</p>

<h1 align="center">Husky</h1>

<p align="center">
  A screen-aware AI coach that watches you work in Codex and guides your next step.
  <br/>Desktop overlay built on Electron + the OpenAI Realtime API.
</p>

---

This README is for **our team's local development**. macOS (Apple Silicon) only.

## Prerequisites

- **macOS** on Apple Silicon
- **Node ≥ 20** — `node -v`
- **Xcode Command Line Tools** — `xcode-select --install` (only needed if you rebuild the Swift helpers)
- An **OpenAI API key** with Realtime access (billed to your own account)

## Setup

```bash
gh repo clone RyanNg1403/husky      # or: git clone <repo-url>
cd husky
npm install
npx playwright install chromium     # used for browser-tab reading
```

Add your OpenAI key (pick one):

```bash
# Option A — key file (what the app reads by default)
echo '{"apiKey": "sk-..."}' > ~/.books-reader.json

# Option B — env var
export OPENAI_API_KEY="sk-..."
```

You can also paste the key into **Settings → API Key** after launching.

## Run

```bash
npm run electron:dev
```

This compiles the Electron main process, starts Vite, and launches the app with hot reload.

> The prebuilt Swift helper binaries are committed. If `record-audio` fails to run, rebuild it:
> ```bash
> swiftc -o helpers/record-audio helpers/record-audio.swift \
>   -framework ScreenCaptureKit -framework AVFoundation -framework CoreMedia
> ```

## First-run permissions

macOS will prompt the first time each capability is used. Grant them in **System Settings → Privacy & Security**:

- **Accessibility** — reading focused windows + positioning the overlay
- **Screen Recording** — seeing the screen you point Husky at
- **Microphone** — voice input (optional; you can run text-only)

## Hotkeys

- **⌥ Space** — show / hide the Husky overlay
- **⌃⌥ Space** — start / stop talking to Husky (works even when the panel is hidden)

The overlay floats over whatever app you're in (e.g. Codex) and lives in the menu bar; click the tray icon to toggle it too.

## Where things live

| Area | Path |
|------|------|
| Tools + agent prompts | `src/lib/samuel.ts` |
| Live session, context injection, SAY-DO guard | `src/hooks/useRealtime.ts` |
| Coach panel (overlay UI) | `src/components/CoachPanel.tsx` |
| Electron main + window/tray/hotkeys | `electron/main.ts` |
| Backend handlers (capture, AX, config) | `electron/handlers/` |
| Styles | `src/styles/app.css` |

## Common checks

```bash
# Typecheck the renderer
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json

# Typecheck / build the Electron main process
npm run electron:compile
```

## Troubleshooting

- **Window invisible / behind other apps** — it's a frameless always-on-top overlay; press **⌥Space** or click the menu-bar icon to summon it.
- **Port 5173 in use** — a previous Vite/Electron instance is still running: `pkill -f "dist-electron/main.js"` then `lsof -ti:5173 | xargs kill`.
- **No speech detected** — avoid Bluetooth headsets in HFP/handsfree mode (narrowband audio is unusable); use the built-in mic or an A2DP input.
- **`tsc` baseline errors** — three pre-existing upstream errors (`vitest` dep + `samuel.ts` history typing) are expected and don't block the app.
