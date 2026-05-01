// Shared game logic + types live here, consumed by both client (singleplayer
// + multiplayer mirror) and the server (authoritative simulation).
//
// Empty for the skeleton commit. The next session ports:
//   - Territory (Uint8Array grid + frontier sets + centroids)
//   - Terrain   (procedural land/water generation)
//   - Game      (per-tick simulation: gold, expansion, combat, capitals,
//                buildings, AI)
//   - protocol  (client↔server message types, once multiplayer lands)
export const VERSION = '0.1.0';
