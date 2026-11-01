# JARVIS — Android-first development baseline

## Confirmed design decisions

- Target device: Android phone.
- Initial budget: zero; optional paid services are excluded from the first milestone.
- Assistant identity: custom name to be chosen later (keep the internal project label JARVIS for now).
- Personality: hybrid — calm, precise, professional and witty, with strategic/analytical initiative.
- Voice: feminine. The browser speech engine now ranks available feminine English voices first. Actual voice quality and availability depend on Android's installed speech services.
- UI: preserve the supplied Iron Man-inspired React/Three.js interface and adapt it for mobile.

## What this patch changes

1. Adds a web-app manifest and SVG mark so a deployed HTTPS build can be installed from Android Chrome.
2. Adds a conservative service worker that caches the app shell and same-origin build assets. It does not claim that the AI works offline.
3. Changes native speech-synthesis voice ranking to prefer feminine English voices. If Android does not expose a suitable voice, the browser's default English voice is used.
4. Keeps the original interface, camera, voice activity and bridge code intact.

## Critical findings from the supplied source

The upstream README explicitly requires Node.js 20+, a desktop Chrome/Edge browser and a Claude Code login/subscription. The backend is `bridge/server.mjs`, and it launches `@anthropic-ai/claude-agent-sdk`; the frontend communicates with it over WebSocket. Local MCP servers (including Android, Playwright and filesystem tools) are launched by that bridge. This is not an Android-native app and cannot run its full local bridge on an Android browser tab.

The upstream frontend also supports direct mode, but that mode expects a provider key in browser configuration and documents that configured credentials can be exposed in the client bundle. Do not deploy real provider secrets in `VITE_*` variables or commit `.env.local`.

## Android/free migration plan

### Milestone 1 — installable mobile shell

- Deploy the Vite frontend to an HTTPS static host.
- Install it through Chrome's menu: Add to Home screen / Install app.
- Verify WebGL performance, touch layout, microphone permission, speech recognition and female speech voice on the actual phone.
- Treat wake-word recognition as foreground-only initially. Android browsers may suspend microphone capture in the background.

### Milestone 2 — secure AI gateway

- Replace the Claude Agent SDK bridge with a small server-side provider adapter.
- Keep provider credentials only in server-side environment variables; never in the Vite bundle.
- Add a provider abstraction so the model can be changed without rewriting the interface.
- Investigate a free model API tier, but enforce its published quotas and graceful fallback. Free-tier availability and limits can change.

### Milestone 3 — tool execution

- Build a typed tool registry with explicit schemas, capability checks, audit logs and action results.
- Start with safe read-only tools: web search, time/date, user-approved files and status checks.
- Add write actions only with previews and user confirmation (messages, purchases, file deletion, device settings).
- Add adapters per supported system: Android intents/deep links, Android Accessibility Service in a native companion app, Home Assistant/MQTT, Bluetooth GATT, local network APIs and vendor APIs.

### Milestone 4 — adaptive device intelligence

For each device/task: identify device and ownership/authorization; inspect documented interfaces; discover only locally visible/authorized services; select an available protocol; request pairing or permissions where required; run a harmless capability test; execute the requested action; verify the observed result; store the adapter and outcome. Never bypass pairing, authentication, access controls or safety interlocks.

### Milestone 5 — native Android companion

A true Android APK will be needed for deeper OS integration, background services, notifications, intents and Accessibility Service functionality. An Accessibility Service must be user-enabled in Android settings and must only automate actions the user authorizes. Hardware control may also require a compatible USB/Bluetooth/IR accessory or a network bridge.

## Current limitations / not yet implemented

- This patch does not replace the Claude backend or provide an AI model endpoint.
- It does not provide Android Accessibility automation or unrestricted phone control.
- It does not make arbitrary disconnected gadgets remotely controllable.
- It does not guarantee offline AI, continuous background wake-word listening, or a specific feminine voice on every Android device.
- The project has not been dependency-installed or production-built in this environment; run the checks below in a Node.js 20+ environment before deployment.

## Build checks

```bash
npm install
npm run build
```

If the TypeScript/Vite build succeeds, deploy the generated `dist/` directory to an HTTPS static host. A separate secure backend is still required for model reasoning and privileged tools.

## v6 persistent conversation sync

When configured for `VITE_BACKEND=gateway`, the browser restores up to 16 recent text conversation turns from the gateway before starting the voice session and saves updated turns after a successful answer. The gateway persists these records in its local data directory. This is not encrypted cloud memory and should not contain secrets. The browser retains localStorage history as a fallback. The frontend build and a real model conversation still need to be tested on a host with dependencies and a reachable model runtime.
