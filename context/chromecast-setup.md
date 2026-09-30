# Chromecast: run and test the lobby dashboard

The existing **Display on TV** action at `/lobby-monitor` is now **View on TV**. It starts a URL-based W3C `PresentationRequest` for that same route. Chrome supplies the device picker and page streaming. No Cast SDK, paid service, app registration, or custom receiver ID is required.

## Run locally on Windows

1. Use desktop Google Chrome on the laptop. Turn on the Sharp TV, switch it to the Chromecast's HDMI input, and connect the Chromecast and laptop to the same Wi-Fi. Keep the laptop awake and plugged in while displaying the dashboard.
2. Open two PowerShell terminals. In the first, run:

   ```powershell
   Set-Location 'C:\Users\Jian\OneDrive\Desktop\Capstone Project\the-riverview\BackEnd'
   npm.cmd ci
   npm.cmd start
   ```

   `npm.cmd ci` is only needed for the initial dependency installation or after dependency changes. The existing `BackEnd/.env` must contain working `MONGO_URI` and `SESSION_SECRET` values, `NODE_ENV=development`, and `APP_BASE_URL` must include `http://localhost:5501`. The current local configuration already includes that origin. Keep your existing secrets private.
3. In the second terminal, run:

   ```powershell
   Set-Location 'C:\Users\Jian\OneDrive\Desktop\Capstone Project\the-riverview\FrontEnd'
   npm.cmd ci
   npm.cmd run dev
   ```

   For local development, leave `VITE_API_URL=` empty in `FrontEnd/.env`. Vite listens on port **5501** and proxies `/api` to the backend on port **3000**. Restart Vite after changing its environment file. `npm.cmd` also avoids PowerShell execution-policy errors from `npm.ps1`.
4. Open [the local site](http://localhost:5501) **in Chrome on the laptop** and sign in with an existing staff, supervisor, or owner account that has `room:view`. Open **Live Monitor → Lobby display**, or go directly to [the lobby display](http://localhost:5501/lobby-monitor) after signing in.
5. Select **All** for Facilities and Room Types to show the whole availability dashboard. Choose **Grid** or **Table**, sorting, and theme as desired.
6. Click **View on TV**. Chrome opens its device picker. Select your Chromecast. The TV should load the existing dashboard automatically, including the selected filters and layout. The laptop should report that the dashboard is synced after the receiver acknowledges its first snapshot.
7. Keep the lobby tab, Chrome, both servers, and the laptop running. Changes to the filters, view, sorting, and theme sync during the session. Room and session data continue through the existing approximately two-second polling; countdowns tick locally on the TV page.
8. Click **Stop casting** to end the presentation. Starting another session opens the device picker again. If the connection closes, **Reconnect to TV** first attempts to resume that session; if it has ended, a further click opens the picker for a new one. Reloading, closing, or leaving the controlling lobby page requests termination.

For a deployed build, use the site's **HTTPS** address and its existing deployment process instead of starting local servers. An ordinary `http://192.168.x.x` LAN address is not a secure origin; use HTTPS or localhost. Chrome renders the URL on the laptop and streams it to the Chromecast, so localhost refers to the laptop in this mode. If a Chrome/device combination rejects local URL streaming, test the deployed HTTPS site or use the fallback below.

## Fallback and troubleshooting

- **Fullscreen** sits beside **View on TV** until a TV session starts. Use it with HDMI, or choose Chrome's manual **Cast → Sources → Cast tab** option and select the Chromecast. Manual tab casting is controlled and stopped through Chrome's Cast menu.
- **Cancelled / permission denied:** click View on TV again when ready. A new session always needs a device selection.
- **No compatible TV:** check Chromecast power, the TV's HDMI input, and the Wi-Fi network. Guest-network isolation, VPN routing, or managed-network rules can prevent discovery. Try Chrome's own Cast menu to check whether it detects the device.
- **Unsupported browser / blocked origin:** open the dashboard directly in desktop Chrome over HTTPS or localhost. The app feature-detects `PresentationRequest`, `navigator.presentation`, and `isSecureContext`; availability detection is advisory and does not prevent a new picker attempt.
- **Connected, but dashboard did not load:** stop casting, confirm the dashboard works on the laptop, and try again. Test the HTTPS deployment if localhost streaming is rejected. No separate login should be needed on the TV.
- **Updates paused:** check that the controlling tab and backend are still running and that the laptop has a network connection. Stale availability is marked unavailable instead of advertising idle rooms as ready.
- **Fullscreen cannot open:** use Chrome's fullscreen control or F11. Browser fullscreen shortcuts display the current tab; the page's fallback button activates the compact TV layout when the Fullscreen API succeeds.

## Architecture and verification

The TV page loads its own React view at `/lobby-monitor?presentation=1`. A genuine `navigator.presentation.receiver` allows that view to render without assuming shared cookies, storage, an opener, or an admin login on the receiving page. A query parameter alone does **not** bypass the normal `room:view` route guard.

The authenticated controller keeps the existing `useRoomMonitorData` polling. An allowlisted snapshot contains display fields for rooms and active sessions, refresh health, and selections. It is delivered over the browser-managed presentation connection, with a ready/ack handshake to recover from late page loading. The receiver renders the existing grid/table components and does not poll protected monitoring endpoints. Backend permissions and session handling remain in force. The laptop and controlling tab are therefore required for live updates.

Software checks:

```powershell
Set-Location 'C:\Users\Jian\OneDrive\Desktop\Capstone Project\the-riverview\FrontEnd'
node --test tests/*.test.js
npm.cmd run build
```

The 23 casting regression tests cover synchronous activation, pending/active reuse, cancellation, errors, availability, reconnect, termination, cleanup, data projection, and receiver messaging. These are simulated browser APIs, not a physical Chromecast test.

For the isolated browser fixture, run `node tests/fixtures/lobbyPresentationPreview.mjs` from `FrontEnd`, then open `http://127.0.0.1:5502/lobby-monitor?qa=sender` and its **receiver** link in separate tabs. This fixture uses simulated API responses and simulated devices only. It never connects to the real backend or a Chromecast. It offers unsupported/insecure/cancelled/no-device/API-failure scenarios, an availability update, and a disconnect control.

Hardware acceptance still requires the laptop and Chromecast: choose a device, confirm the TV renders the whole selected dashboard, change filters and live data, check reconnect after a network interruption, and confirm Stop casting removes the presentation. Software checks cannot establish actual device discovery, Wi-Fi reliability, or TV image quality.

Changed files:

- `FrontEnd/src/App.jsx`: scoped receiver route and initial session wait.
- `FrontEnd/src/pages/Admin/LobbyMonitor.jsx`: shared controller/receiver view, casting controls, fallback, live health, and selection sync.
- `FrontEnd/src/hooks/useLobbyPresentation.js`: React connection lifecycle and receiver state.
- `FrontEnd/src/services/lobbyPresentation.js`: request, connection, availability, and receiver messaging.
- `FrontEnd/src/utils/lobbyPresentation.js`: URL, feature detection, messages, and display snapshot format.
- `FrontEnd/src/styles/admin/lobby-monitor.css`: casting controls and status styles.
- `FrontEnd/tests/lobbyPresentation.test.js`: focused regression checks.
- `FrontEnd/tests/fixtures/lobbyPresentationPreview.mjs`: isolated browser verification fixture.
- `context/ARCHITECTURE.md` and this guide: architecture and running instructions.

References: [W3C Presentation API](https://www.w3.org/TR/presentation-api/), [Chrome's Presentation API example](https://developer.chrome.com/blog/present-web-pages-to-secondary-attached-displays), [Chrome's manual casting instructions](https://support.google.com/chrome/answer/3228332).
