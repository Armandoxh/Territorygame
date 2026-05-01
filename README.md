# Territory

Real-time territorial expansion game. Single-player vs AI now; multiplayer (Colyseus) next.

Live: https://armandoxh.github.io/Territorygame/

## Stack

- **Client** — TypeScript + [PixiJS 8](https://pixijs.com/) + [Vite](https://vitejs.dev/)
- **Shared** — pure-TypeScript game logic, consumed by client and (later) server
- **Server** — Node + [Colyseus](https://colyseus.io/) for multiplayer rooms (planned)

## Layout

```
/client            Browser app. Vite-built, deployed to /docs.
/shared            Game logic + types reused by client and server.
/server            (placeholder) Multiplayer server.
/docs              Built artifacts. GitHub Pages serves this.
/legacy            Original vanilla-JS prototype, preserved for reference.
```

## Develop

```sh
npm install         # install all workspaces
npm run dev         # vite dev server with HMR (http://localhost:5173)
npm run build       # production build → /docs
npm run typecheck   # check all workspaces
```

`npm run dev` exposes the dev server on the LAN (host: true), so you can also load it on a phone if you're on the same Wi-Fi.

## Deploy

GitHub Pages is configured to serve from this branch's `/docs` folder. Each `npm run build` regenerates `/docs`; commit and push to publish.

## URL flags (singleplayer)

| Flag        | Effect                                  |
|-------------|-----------------------------------------|
| `?ai=N`     | Number of AI opponents (1–254)          |
| `?seed=N`   | Fixed terrain seed                      |
| `?w=N&h=N`  | Map size (default 384×384)              |
