# Chef Intern

An original online co-op cooking game for 2–4 players, inspired by the chaotic-kitchen genre. Runs entirely on Cloudflare: the client is served as static assets and every room is a Durable Object holding the players' WebSockets.

## Stack

- **Client** — Vite + TypeScript + Three.js (`src/client`)
- **Server** — Cloudflare Worker + one `Room` Durable Object per room code (`src/server`)
- **Shared** — constants, protocol types and (later) the game simulation used by both sides (`src/shared`)

## Run locally

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. `npm run dev` starts Vite (5173) and `wrangler dev` (8787) together; Vite proxies `/ws/*` to the Worker. Join a specific room with `?room=CODE` (letters and digits, max 16).

Other scripts: `npm run typecheck`, `npm run build`, `npm run deploy` (build + `wrangler deploy`, needs `npx wrangler login` once).

## Gotchas

- **Node version** — Wrangler is pinned to `4.76.0` (with `@cloudflare/workers-types` 4.x) because newer releases need Node 22.12+. After upgrading Node, both can be bumped to latest along with `compatibility_date` in `wrangler.jsonc`.
- **First socket attempt fails in dev** — Vite is ready before Wrangler, so the first `/ws` connect can be refused; the client retries every 2 s.
- **Durable Objects on the free plan** must be SQLite-backed, hence `new_sqlite_classes` in the migration.
- **Asset routing** — requests matching a file in `dist/` are served directly; everything else (i.e. `/ws/*`) reaches the Worker.

## Roadmap

1. ~~Setup: scaffold, starter scene, room presence over WebSocket~~
2. Greybox kitchen: movement, collision, pick up / put down
3. Basic multiplayer: players see each other move and pass items
4. Cooking loop: chop, cook, plate, serve, orders, timer, score
5. Netcode polish: prediction, interpolation, reconnect
6. Visual pass: models, lighting, animation, HUD
7. Content: levels, recipes, dash, hazards
8. Finishing: audio, lobby and results screens, performance, touch controls
