# Whiteout Alley

Browser FPS: two squads fight over capture points A, B and C in sunny, snowed-in rooftop alleys. Bots fill both squads to 4v4.

## Play

- **As a claude.ai artifact:** everyone who opens the page joins the same match through the artifact's live room (presence only, so view-only viewers can play too).
- **Standalone / LAN:** `node whiteout/server.js` (no dependencies), then open `http://localhost:8080` (or the host machine's LAN address) in each browser. The server relays presence over WebSocket exactly like the artifact room.
- Opened any other way, it runs offline against bots.

Controls: WASD, Shift sprint, C crouch, Space jump / vault / climb, mouse fire, right mouse aim, V holo or 3.5× scope, R reload, Tab scoreboard, Esc menu. Touch screens get on-screen controls.

## How the netcode works

- Every client publishes one presence object ~30×/s: its position (client-authoritative), a ring of recent shot events, and, for the host, the world snapshot.
- The earliest-joined visible client is the host. It simulates bots, capture points and damage. If it leaves, the next client continues from its last snapshot.
- Hits are detected on the shooter's screen against the interpolated positions it was showing. The host rewinds the target to that render time and re-traces the shot (with small hitbox tolerance and a wall check) before applying damage.

## Checks

`node whiteout/test.mjs` covers collision, vaulting, hitboxes, interpolation, lag-compensated hit validation, friendly fire, and a 4-minute bot Domination soak.
