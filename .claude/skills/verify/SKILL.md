---
name: verify
description: Build/launch/drive recipe for verifying Lunaria Cafe changes in a real browser
---

# Verifying Lunaria Cafe

Vite + React SPA. No test suite worth running for UI changes — drive the real app.

## Launch

```bash
npm run dev -- --port 5199 &   # ready in <1s, http://localhost:5199/
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --remote-debugging-port=9223 \
  --window-size=1440,900 --user-data-dir=<scratchpad>/chrome-profile about:blank &
```

## Drive over CDP

Node 24 has a global `WebSocket` — no deps needed. Get the page target from
`http://127.0.0.1:9223/json`, connect, then use `Runtime.evaluate` (with
`returnByValue: true`) to click and inspect, `Page.captureScreenshot` for
evidence. A working script template: query buttons by visible text with
`[...document.querySelectorAll('button')].find(b => b.textContent...)`.

## Gotchas

- **Guest login is two clicks**: "Play as Guest" then a "Continue" confirm
  dialog (~800ms apart).
- Routing is a `state.phase` switch in `src/App.jsx` (no URL routes) —
  reload always lands back on the main menu; phase is not persisted.
- Give the app ~3s after navigate before querying (framer-motion fade-ins).
- Audio elements: patch `window.Audio` via `Page.addScriptToEvaluateOnNewDocument`
  to record created elements, then read back `src`/`paused`/`volume`.
- Lint must stay at zero repo-wide: `npx eslint <files>`.
