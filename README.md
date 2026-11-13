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

Open http://localhost:5173. Without `?room=` in the URL you get the front door: create a kitchen (a random 4-character code) or join one by code. `npm run dev` starts Vite (5173) and `wrangler dev` (8787) together; Vite proxies `/ws/*` to the Worker. Join a specific room with `?room=CODE` (letters and digits, max 16).

**Controls:** `WASD` or arrow keys to move (the mouse never moves the chef), `Shift` to dash: a short burst straight ahead with a 0.8 s cooldown. `E`, `Space` or a left click uses a station: pick up, put down, combine. Hold `F` or the right mouse button to chop.

**Which station gets used:** by default the one the chef is facing, shown by the orange frame and arrow. Pointing the mouse at any station whose nearest edge is within 0.8 tiles of the chef moves that orange marker to it, so from one spot you can reach the counter in front and its neighbours on either side; the chef turns to face whatever it uses. A station under the mouse that is out of reach gets cyan corner brackets instead. Pressing a movement key hands targeting back to the facing direction until the mouse moves again, so a mouse left resting on a counter never hijacks keyboard play.

**How a round works:** a new room opens on its lobby screen, which covers the kitchen: it shows the room code, who has taken which of the four seats, a button to copy the invite link, and a way back to the front door. Anyone in the room starts the service with the button or `Enter`; a round then lasts 3 minutes. Joining a room whose round is already running drops you straight into the kitchen. The `Leave` button in the header returns to the front door at any time. Orders appear on the ticket rail and cost 10 points if they expire. Serve a matching plate at the green window for the recipe's points plus up to 10 for speed. Each kitchen has a target score, shown next to the score with a bar that fills towards it. When time is up the round is won if the score reached the target: `E` or a click (after a 3 second pause) then moves on to the next kitchen, and after the last one starts over from the first. A lost round replays the same kitchen.

Targets are written for one chef (`target` in `src/shared/level.ts`: 60 for Open Kitchen, 80 for The Pass) and multiplied by `TARGET_SCALE` in `sim.ts` for bigger crews (x1.8, x2.6, x3.3 for 2, 3, 4 chefs). The multiplier follows the largest crew seen during the round, so it never drops when someone leaves.

| Recipe | How | Points | Time limit, solo |
| --- | --- | --- | --- |
| Lettuce salad | chopped lettuce on a plate | 20 | 65 s |
| Garden salad | chopped lettuce + chopped tomato on a plate | 30 | 90 s |
| Tomato soup | 3 chopped tomatoes in a pot on the stove for 8 s, then pour onto a plate | 40 | 120 s |
| Onion soup | 3 chopped onions in a pot, cooked the same way | 45 | 120 s |

**Pacing scales with the crew.** The solo limits above come from timing each recipe (about 22 s, 40 s and 65 s for one person) and leaving room to finish one order while another waits. More chefs get shorter limits and faster orders:

| Chefs | New order every | Orders waiting at most | Time limit |
| --- | --- | --- | --- |
| 1 | 42 s | 2 | 100% |
| 2 | 24 s | 3 | 80% |
| 3 | 17 s | 4 | 70% |
| 4 | 13 s | 4 | 62% |

These live in `ORDER_TIME_SCALE`, `ORDER_INTERVAL` and `MAX_ORDERS` in `src/shared/sim.ts`, and each recipe's `seconds` in `src/shared/recipes.ts`.

A pot takes one kind of ingredient at a time. Chopped food you are carrying can go onto a plate that is resting on a counter, or straight onto a fresh one by using the plate stack. A pot shows `1/3`, `2/3` while filling, steam and an orange bar while cooking, then a green `READY!` badge with a bar that drains towards burning. Soup left on the stove 6 s past done burns; empty a burnt pot (or a wrong plate) at the bin. Plates are infinite, so there is no washing up yet.

**Kitchens:** clearing one layout in `LEVELS` unlocks the next; they are listed in `src/shared/level.ts`. "Open Kitchen" has a central island; "The Pass" splits prep (left) from cooking and serving (right) with a counter wall that has one gap, so teams hand food across it. Each layout lists which recipes can be ordered there. To add one, append a `parseLevel` call with a 13x9 text map.

Map letters: `.` floor, `S` spawn, `#` counter, `T` `L` `N` tomato, lettuce and onion crates, `B` board, `O` stove, `P` plates, `W` serving window, `X` bin, and the fixtures `K` sink, `F` fridge, `V` counter with a plant. Fixtures block movement like a counter but cannot be used or targeted, so nothing can be put down on them. Keep fridges on the back row: they are tall enough to hide whatever stands behind them anywhere else.

**How the code is split:** `src/shared/sim.ts` is the whole game rule set as pure functions over plain data, with levels as text maps in `src/shared/level.ts`. The `Room` Durable Object runs that simulation (60 Hz steps, 20 Hz snapshots) and is the only authority. Clients send movement and the chop button when they change, plus interact presses.

**Netcode:** every input message carries a sequence number, and each snapshot reports per player the last sequence applied and how many steps the server has run since. `src/client/world.ts` uses that to predict the local chef: it restarts from the server's position, replays the input the server has not seen yet, and fades any difference out over a few frames instead of jumping. Other chefs are drawn 100 ms in the past, blended between two snapshots. Pick-ups, chopping and scoring are not predicted, so those still take one round trip. The status pill shows the measured ping.

**Reconnects:** each tab keeps a random id in `sessionStorage` and sends it as `?cid=`. If the socket drops, the chef stays in place (holding its item) for 10 s and the same tab gets the seat back on reconnect; retries back off from 0.5 s to 5 s. A second connection with the same id takes the seat and the older tab shows "Opened in another tab".

**Visuals:** counters, stoves, pots, plates, crates, the chopping board, the dish rack, all food and the back wall are models from **KayKit Restaurant Bits 1.0** by Kay Lousberg (CC0, https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0). Only the 19 models the game uses are copied into `public/models`, next to the pack's `LICENSE.txt`; they share one small palette texture and one material. `src/client/assets.ts` loads them once before the kitchen is built, and `src/client/models.ts` places them. The four chefs are the Knight, Barbarian, Mage and Rogue from **KayKit Adventurers 1.0** (CC0, https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), one per seat, wearing a code-built toque; `src/client/chef.ts` loads them and mixes their animations (idle, run, a carry pose on the arms only, and a chop). Sinks, fridges and pot plants are original props generated for this project: the 14 source files are in `public/gpt-models`, and the game loads repacked copies from `public/props` (see the gotcha below). They are fixtures inside the kitchen, not loose decoration: a sink or fridge takes the place of one cabinet in a counter run, and a plant sits on a counter. Each kitchen picks its own set in `decor` (one sink, one fridge, a couple of plants), only those are downloaded, and a prop that fails to load falls back to a plain counter. Neither pack has a bin, so the trash chute, the serving pad, flames, steam, planters, lamps and the floor are still built in code. `src/client/scene.ts` owns the renderer, lights and per-frame syncing. The HUD is plain DOM in `index.html` + `style.css`.

**Music:** "Party and Gameover loop" by gilzoide (CC0, https://opengameart.org/content/party-and-gameover-loop), in `public/audio` with a `CREDITS.txt`. The cheerful theme loops at the front door, in the lobby and during a round; after a lost round it cross-fades to the sad theme. `Music on` in the header toggles it separately from sound effects.

**Sound:** `src/client/sound.ts` synthesises every effect with Web Audio (pick up, put down, chopping, dash, new order, delivery, expired order, soup ready, burnt, round start, win and lose), so there are no audio files. It works by comparing each snapshot with the previous one. The "Sound on" button in the header mutes it and the choice is remembered in `localStorage`.

**Phones and tablets:** on a touch device (or with `?touch=1` on a desktop) `src/client/touch.ts` adds a thumb stick that appears wherever the left thumb lands, plus Use, Chop and Dash buttons; tapping a station in reach also uses it. The score and timer move to the top so thumbs do not cover them. Phones render at a lower pixel ratio with a smaller shadow map.

**Inspecting models up close:** add `?zoom=3` to the URL to move the camera three times closer to the middle of the kitchen.

**Testing lag locally:** add `?lag=300` to the URL to delay every message so the round trip takes 300 ms.

**Playing with friends:** share the URL with the same `?room=CODE`. A room seats 4; the seat number picks the spawn corner and shirt colour. A fifth connection is closed with code 4000 and the client stops retrying. Once every seat has been empty past the 10 s reconnect grace, the room stops ticking and resets.

Other scripts: `npm run typecheck`, `npm run build`, `npm run deploy` (build + `wrangler deploy`, needs `npx wrangler login` once).

## Gotchas

- **Node version** — Wrangler is pinned to `4.76.0` (with `@cloudflare/workers-types` 4.x) because newer releases need Node 22.12+. After upgrading Node, both can be bumped to latest along with `compatibility_date` in `wrangler.jsonc`.
- **First socket attempt fails in dev** — Vite is ready before Wrangler, so the first `/ws` connect can be refused; the client retries every 2 s.
- **Durable Objects on the free plan** must be SQLite-backed, hence `new_sqlite_classes` in the migration.
- **Room ticking costs duration** — the 20 Hz timer keeps the Durable Object awake while anyone is connected, which counts against the free plan's daily duration quota; idle tabs left open in a room still burn it.
- **`wrangler dev` can crash on hot reload** — saving server or shared files while a browser tab is reconnecting sometimes kills the local Worker with a WebSocket 500; restart `npm run dev`.
- **Aim is validated on the server** — clients send the pointed-at tile with `interact` and with the chop input, and `targetTile` in `src/shared/sim.ts` ignores it unless `inReach` agrees, so a modified client cannot use far-away stations.
- **Tickets vs. the top counter** — the camera aims slightly behind the kitchen centre (`CAMERA_TARGET` in `scene.ts`) so order tickets sit over the back wall instead of covering the crates; re-check this when changing the level height or ticket size.
- **KayKit models are twice our tile size** — the pack uses a 2-unit grid, so everything is drawn at `MODEL_SCALE` 0.5. That makes counters 0.5 tall (`WORKTOP_Y`), and the characters are drawn at the same scale.
- **Character files are trimmed** — each KayKit character ships as a 3.5 MB GLB with 76 animations and all its weapons. `python scripts/trim_character.py <source.glb> public/models/chef_<name>.glb` keeps only the six clips in `KEEP_CLIPS` and the skinned body, which brings it to about 470 KB. To use another clip, add it there and re-run the script on the original file.
- **Bone names lose their dots** — the pack names bones `upperarm.l`, but three.js strips the dot on load, so code looks them up as `upperarml`, `handslotr` and so on.
- **The generated props needed repacking** — the GLBs in `public/gpt-models` interleave positions and normals using a second buffer view that starts 12 bytes into the first, which three.js rejects with "Invalid typed array length". `python scripts/repack_glb.py <source.glb> public/props/<name>.glb` gives every accessor its own packed view without changing the mesh. Re-run it for any new prop from the same generator.
- **Aiming reach is 0.8 tiles from the chef's centre** — standing in the middle of a tile only reaches the counter straight ahead; press against the counter to reach its neighbours.
- **Music is OGG Vorbis** — fine in Chrome, Firefox, Edge and recent Safari, but older iPhones cannot play it and will simply have no music; add an `.mp3` or `.m4a` copy if that matters.
- **Audio needs a key press or tap first** — browsers block sound until the user interacts, so the audio context is created on the first `keydown` or `pointerdown`; anything that happens before that is silent.
- **Adding a model** — copy its `.gltf` and `.bin` from the pack into `public/models` and add the name to `MODEL_NAMES` in `assets.ts`; a name missing from the folder makes the whole kitchen fail to load with "Could not load the kitchen".
- **All kitchens must be 13x9** — the camera and shadow frustum are framed once for that size, and `setLevel` in `scene.ts` only swaps the kitchen contents.
- **Dash is predicted like movement** — the dash press travels inside the input message and `dashTime` / `dashCooldown` are part of `PlayerState`, so the client replays it exactly instead of rubber-banding.
- **Asset routing** — requests matching a file in `dist/` are served directly; everything else (i.e. `/ws/*`) reaches the Worker.

## Roadmap

1. ~~Setup: scaffold, starter scene, room presence over WebSocket~~
2. ~~Greybox kitchen: movement, collision, pick up / put down~~
3. ~~Basic multiplayer: players see each other move and pass items~~
4. ~~Cooking loop: chop, cook, plate, serve, orders, timer, score~~
5. ~~Netcode polish: prediction, interpolation, reconnect~~
6. ~~Visual pass: models, lighting, animation, HUD~~
7. ~~Content: second kitchen, onion soup, dash, crew-scaled pacing~~ (hazards not done)
8. ~~Finishing: sound effects, front door and waiting room, touch controls, phone render settings~~
