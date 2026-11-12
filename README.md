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

**Controls:** `WASD` or arrow keys to move, `E` or `Space` to pick up, put down and combine, hold `F` (or left `Shift`) to chop. Or click: a floor tile walks there, a station walks to it and uses it, and a board holding unchopped food gets chopped. Any key press cancels a click in progress.

**How a round works:** a round lasts 3 minutes and starts when the first chef joins. Orders appear on the ticket rail (up to 4) and expire after 60 seconds for a 10 point penalty. Serve a matching plate at the green window for the recipe's points plus up to 10 for speed. When time is up, `E` or a click starts a new round after a 3 second pause.

| Recipe | How | Points |
| --- | --- | --- |
| Lettuce salad | chopped lettuce on a plate | 20 |
| Garden salad | chopped lettuce + chopped tomato on a plate | 30 |
| Tomato soup | 3 chopped tomatoes in a pot on the stove for 8 s, then pour onto a plate | 40 |

Chopped food you are carrying can go onto a plate that is resting on a counter, or straight onto a fresh one by using the plate stack. A pot shows `1/3`, `2/3` while filling, steam and an orange bar while cooking, then a green `READY!` badge with a bar that drains towards burning. Soup left on the stove 6 s past done burns; empty a burnt pot (or a wrong plate) at the bin. Plates come from the blue tray and are infinite, so there is no washing up yet.

**How the code is split:** `src/shared/sim.ts` is the whole game rule set as pure functions over plain data, with levels as text maps in `src/shared/level.ts`. The `Room` Durable Object runs that simulation (60 Hz steps, 20 Hz snapshots) and is the only authority. Clients send movement and the chop button when they change, plus interact presses, then ease their chefs towards the latest snapshot; there is no client-side prediction yet, so input lag equals your ping until phase 5.

**Playing with friends:** share the URL with the same `?room=CODE`. A room seats 4; the seat number picks the spawn corner and shirt colour. A fifth connection is closed with code 4000 and the client stops retrying. When the last chef leaves, the room stops ticking and resets.

Other scripts: `npm run typecheck`, `npm run build`, `npm run deploy` (build + `wrangler deploy`, needs `npx wrangler login` once).

## Gotchas

- **Node version** — Wrangler is pinned to `4.76.0` (with `@cloudflare/workers-types` 4.x) because newer releases need Node 22.12+. After upgrading Node, both can be bumped to latest along with `compatibility_date` in `wrangler.jsonc`.
- **First socket attempt fails in dev** — Vite is ready before Wrangler, so the first `/ws` connect can be refused; the client retries every 2 s.
- **Durable Objects on the free plan** must be SQLite-backed, hence `new_sqlite_classes` in the migration.
- **Room ticking costs duration** — the 20 Hz timer keeps the Durable Object awake while anyone is connected, which counts against the free plan's daily duration quota; idle tabs left open in a room still burn it.
- **`wrangler dev` can crash on hot reload** — saving server or shared files while a browser tab is reconnecting sometimes kills the local Worker with a WebSocket 500; restart `npm run dev`.
- **Click-to-walk lives in the client** — `src/client/autopilot.ts` turns a clicked tile into the same input messages the keyboard sends, so the server needs no pathfinding and cannot tell the two apart.
- **Asset routing** — requests matching a file in `dist/` are served directly; everything else (i.e. `/ws/*`) reaches the Worker.

## Roadmap

1. ~~Setup: scaffold, starter scene, room presence over WebSocket~~
2. ~~Greybox kitchen: movement, collision, pick up / put down~~
3. ~~Basic multiplayer: players see each other move and pass items~~
4. ~~Cooking loop: chop, cook, plate, serve, orders, timer, score~~
5. Netcode polish: prediction, interpolation, reconnect
6. Visual pass: models, lighting, animation, HUD
7. Content: levels, recipes, dash, hazards
8. Finishing: audio, lobby and results screens, performance, touch controls
