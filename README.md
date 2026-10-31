# CurioSprite v0.1

Initial web and Raspberry Pi touchscreen UI prototype. React + TypeScript + Vite.

## Start

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually http://localhost:5173).

## Features
- Handheld-style 800 × 480 layout
- Create/delete projects and browse game library
- 16 × 16 sprite editor with pencil, eraser, undo and clear
- Automatic local browser storage
- Export/import versioned `.curio.json` project files
- Play test: move sprite with arrow keys, WASD, USB gamepad D-pad/left stick, or on-screen controls

## Raspberry Pi
Use a recent Raspberry Pi OS with Chromium; run the dev server for testing or build with `npm run build` and serve the `dist` folder from a static HTTP server. The same app runs in Chromium in kiosk/fullscreen mode. Performance and touch behavior must be validated on the Pi 3B+.

## Known limits
This is a UI and movement-test prototype, **not a full game engine**. No jump, physics, level editor, visual logic, cloud sync, authentication, or direct USB transfer yet. Browser localStorage is not durable backup: export your projects. The `.curio.json` format is experimental and will evolve. The play area is 800 px wide but 300 px tall in this first layout.
