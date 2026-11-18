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

**How a round works:** a new room opens on its lobby screen, which covers the kitchen: it shows the room code, who has taken which of the four seats, a button to copy the invite link, and a way back to the front door. Anyone in the room starts the service with the button or `Enter`; a round then lasts 15 minutes (`ROUND_SECONDS` in `sim.ts`). Joining a room whose round is already running drops you straight into the kitchen. The `Leave` button in the header returns to the front door at any time. Orders appear on the ticket rail and cost 10 points if they expire. Serve a matching plate at the green window for the recipe's points plus up to 10 for speed. Each kitchen has a target score, shown next to the score with a bar that fills towards it. When time is up the round is won if the score reached the target: `E` or a click (after a 3 second pause) then moves on to the next kitchen, and after the last one starts over from the first. A lost round replays the same kitchen.

Targets are written for one chef (`target` in `src/shared/level.ts`: 320, 400, 360, 380, 420 and 400 for the six kitchens) and multiplied by `TARGET_SCALE` in `sim.ts` for bigger crews (x1.8, x2.6, x3.3 for 2, 3, 4 chefs). The target is charged by the second at the rate of the crew in the kitchen at that moment: every second played adds its share for the chefs present, and the time left is counted at the current crew's rate. A full round with one crew size gives exactly the numbers above; if a chef joins or leaves half way, the target lands between the two, and in the lobby it simply follows who is there. How the numbers were reached: a solo chef gets an order every 42 seconds, so about 21 arrive in 15 minutes; with the recipes' points plus an average tip that is worth roughly 730 to 820 points if every one is served. Targets sit at 45 to 50 percent of that, a little lower in kitchens where washing up or fires eat time. They are estimates and have not been tuned by play-testing.

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

**Dish washing (Rush Hour and Full House):** a kitchen with `plates` set owns that many plates. Taking one, or plating chopped food at the stack, uses one up; an empty stack gives nothing. Six seconds after an order is served its plate comes back dirty at the purple `DIRTY` hatch. Carry it to the `WASH` sink, then hold the chop button there for 2 seconds per plate (the chef scrubs with a sponge rather than the knife); clean plates pile up on the sink to be taken again, and an unused clean plate can be put back on the stack. A dirty plate cannot be served or thrown away. Kitchens without `plates` keep an endless rack.

**Names:** the room lobby has a name box. The name (up to 12 letters, digits and a few marks, cleaned by `renamePlayer` in `sim.ts`) is kept in `localStorage`, sent again each time the seat is taken, shown in the lobby list and floated over the chef in the kitchen. With no name the seat's character name is shown.

**Menus:** each kitchen lists its own recipes (`recipes` on the level; recipes live in `src/shared/recipes.ts`). `PREP` there says how each ingredient is made ready: chopped on a board, grilled, or both. A whole chicken goes on the grill as it is (10 seconds); a fish fillet or a meat patty is chopped first and then grilled (6 seconds); a bun needs nothing. `dishPart` in `sim.ts` turns a ready ingredient into what it adds to a plate. Burgers (bun, grilled patty, lettuce, tomato) are on the menu in Hot Line and Full House; Deep Sea Diner serves seaweed salad, clam chowder and, in Kelp Maze, grilled fish. Crate letters: `A` seaweed, `Y` clam, `H` fish, `U` bun, `M` meat (and `C` chicken). Those five ingredients and their crates are drawn in code in `src/client/food.ts`; the chicken is in `models.ts`.

**Themes:** kitchens are grouped into themes (`THEMES` and each level's `theme` in `level.ts`). "Town Bistro" holds the six street kitchens; "Deep Sea Diner" has two so far, Coral Cove and Kelp Maze. The room lobby has three steps (`lobbySteps.ts`): Theme, Kitchen, Your chef. The Theme step shows one card per theme with a small picture (`THEME_ART` in `hud.ts`); picking one moves the room to that theme's first kitchen and opens the Kitchen step, which lists only that theme's kitchens, numbered from 1. A win moves on inside the theme and wraps back to its first kitchen (`nextLevel`). `LEVELS` stays one flat list, so `?level=7` still opens the seventh entry. A theme's surroundings are code: the sea floor, glass wall, reef, bubble-helmet diners, fish, turtle, jellyfish and bubbles are in `src/client/sea.ts`, and `scene.ts` switches the background, fog and light colour for it. The sea's own furniture is in the same file: coral-based round tables with anemone seats, driftwood tables with scallop-backed chairs, jellyfish floor lamps, potted coral on the counters' plant spots, and a teal cabinet with brass portholes and a pearl worktop that replaces the KayKit counter in sea kitchens (`createSeaCounter`, drawn as instanced meshes like the KayKit one). To add a theme: add it to `THEMES`, give its levels `theme`, add a thumbnail, and build its surroundings the way `createSea` does.

**Orbit Diner (space theme):** a diner on a space station hanging above a blue planet. The scene is built in `src/client/space.ts`: stars, the planet with its atmosphere, a moon, a ringed planet, drifting rocks, and a hull slab with cyan edge lights under the deck. The galley gets its own instanced cabinet (`createSpaceCounter`). The view outside is built in poster-style cartoon art across `src/client/space.ts`, `spaceSky.ts`, `spaceArt.ts`, `spacePaint.ts`, `spaceRocks.ts` and `spaceStation.ts`. Everything outside shares one sun direction and a toon shader: a 4-step painted light ramp plus a soft rim on the shadow side, so dark sides are never black. Surface colours are capped under the bloom threshold, so nothing out there glares except the tiny blinking navigation lights.

- **Hero planet:** a warm gas giant striped like a layered dessert, with a storm swirl. Its tilted ring is made of icy rubble mixed with tiny tumbling donuts, pizza slices, macarons, cookies and cargo crates.
- **Further out:** a small blue home planet with drifting clouds, and a moon with shaded craters.
- **Rocks:** 84 instanced asteroids with baked ambient occlusion and a few pastel crystals.
- **The station's exterior:** a cross-braced boom, solar wings, radiator fins, turning dish antennas, capsule and labelled fuel tanks, and a docked cartoon shuttle.
- **The sky:** a navy-to-violet dome, stars in three sizes, layered paper-cut nebulae, a spiral galaxy, a comet with ion and dust tails, and shooting stars.

The backdrop lays itself out for wide and tall screens: the planet is upper left on a desktop and a low dome below the deck on a phone. Lighting in orbit (set in `applyMood`) is a warm white key, a soft violet fill and a stronger ambient, at exposure 0.94. Bloom uses threshold 1.05 and strength 0.36. Prop emissives are compressed in `make_space_props.mjs` so only small accents glow.

The dining room is dressed in a retro space-age diner style. Its props are GLBs made by `node scripts/make_space_props.mjs`:
- the structure and furniture: porthole and panel walls, floating tables and booths, and alien guests;
- the room dressing: hydroponic pods, rockets, beacons, a jukebox, a snack machine, planet lamps, starburst clocks and rugs, neon signs, a robot waiter, cargo crates, holo-menus, telescopes and dessert cases. It brings two mechanics:

- **Teleport pads** (`1`, `2`, `3` in a map; tile kind `warp`). A chef who steps on one appears on the other pad with the same number, keeping their speed, with coloured sparkles and a "bwoop". A pad only fires again once the chef has stepped off it (`onPad`). Remote chefs snap across rather than sliding.
- **Zero gravity** (`lowGravity` on a level). Acceleration drops from 16 to 3.2, so chefs drift and need to start every turn and stop early, and they float and bob above the floor.

Docking Bay (difficulty 2) is a module split by a bulkhead, with one pair of pads as the only way across. Zero-G Galley (difficulty 4) is three modules joined only by three pairs of pads, with no gravity and four plates to wash. The briefing's big pictures are keyed by kitchen name (`NEW_HERE` in `guide.ts`), and "new" is measured against the previous kitchen in the same theme.

**Polished render path (Orbit Diner):** `src/client/polish.ts` runs a post-processing chain for the space theme only. First come cartoon ink outlines found from the depth buffer the scene render already writes, plus a light colour grade. Then ambient occlusion (GTAO), bloom on anything brighter than white (light strips, pads, beacons), tone mapping, and SMAA anti-aliasing. Phones (coarse pointer) skip the ambient occlusion and SMAA and bloom at a lower resolution. The same theme adds "juice" in `scene.ts`: confetti and a small camera bump on every delivery, a stronger shake when a fire starts, a bump when you teleport, and scraps flying off the board while someone chops. To give another theme the same treatment, widen `polished()` in `scene.ts`.

**Choosing a kitchen:** the room lobby has one card per kitchen, built from `LEVELS` in `hud.ts`: a floor plan drawn from the level's tiles, difficulty dots (`difficulty` on the level), tags for its extra rules and the target for the crew that is in the room. The cards wrap and the grid scrolls, so adding a kitchen needs no layout work. Anyone in the lobby can pick, everyone sees the choice, and it locks once the service starts. A win still moves on to the next kitchen and a loss replays the current one.

**Trying a kitchen directly:** add `&level=3` (or 1, 2) to a room URL that nobody has joined yet and that room opens in the chosen kitchen. It only works on the first connection to a fresh room.

**Results screen:** the popup at the end of a round shows the whole crew in their chosen chefs. Each chef gets a title for the job they led and a line of their numbers. The simulation counts these per chef in `PlayerState.stats`: dishes served, items chopped, plates washed and fires put out.

- **Titles:** Head Chef, Knife Master, Dish Hero or Firefighter. Ties share a title. A chef who led nothing is Sous Chef after a win, or "Tried their best" after a loss.
- **After a win:** every chef cheers, using the rig's own Cheer animation. They hop on a warm spotlight under falling confetti.
- **After a loss:** every chef slumps with their head down and cartoon tears running down their face, under a little rain cloud of their own. Rain falls across the screen.
- **How the poses are drawn:** `posesOf` in `portraits.ts` renders the full-body pose frames from the real 3D models the first time they are needed, eight frames per chef. `results.ts` flips through them like a flip-book.
- **Short screens:** the card is compacted, and the controls hint is hidden while the results show.

**Kitchen briefing and ready-up:** pressing Start service (or clearing a kitchen, which leads straight to the next one) puts the round in a `ready` phase: the kitchen is on screen, but there are no orders and the clock waits. Every client opens a picture-first briefing. Big animated cartoons show what the kitchen adds: grab, chop, plate and serve in the first kitchen, then passing over the wall, washing up, the grill and fire, the chicken salad combo and the conveyor belt. Small pictures recall the jobs carried over from earlier kitchens, and the menu shows each dish as its ticket icons. Closing it ("Let's cook!", Enter or Esc) sends `ready`. A banner then shows which chefs are ready (✓) and which are still reading. When all of them are ready, a 3-2-1 count-down starts the clock. If someone is idle, the count-down starts anyway after 45 seconds (`READY_SECONDS`) and closes their briefing. After a loss the same kitchen restarts straight away without the briefing. The Guide button in the header reopens it at any time without pausing the clock. The scenes are inline SVG in `src/client/illustrations.ts`, animated by the `.ill-*` rules in `style.css`; the popup, banner and count-down are in `src/client/guide.ts`.

**Music on phones:** iPhone Safari ignores `audio.volume`, so the music keeps its own fade level per track and, once the first tap unlocks audio, plays through Web Audio gain nodes (`src/client/sound.ts`). "Music off" fades it out and pauses it, "Sound off" silences music as well as effects, and nothing plays while the page is in the background.

**Dashing and the hold button:** a dash pitches the chef forward with a little stretch and kicks up a burst of cartoon dust clouds, a trail of puffs behind the feet and a few speed streaks (`src/client/dash.ts`, pooled meshes). On touch screens the hold button's label and colour follow what holding it will do. It reads Spray (red) while you carry the extinguisher, Wash (blue) when you face the wash sink, and Chop otherwise.

**Settings menu and zoom:** the header shows only the room status and a menu button (`src/client/settings.ts`), whose three bars fold into a cross while the menu is open; tapping it again closes it. The menu holds the sound and music switches, a camera zoom slider, full screen, the kitchen guide and leaving the room. The zoom runs from 0.8x to 2x and is remembered on the device. Pinching the kitchen or scrolling over it also changes it. Past 1x the camera eases towards the local chef, clamped to the kitchen, so a close view keeps you in shot. iPhone Safari ignores `user-scalable=no`, so gesture events, `dblclick` and quick second taps on the page are blocked, and `touch-action: manipulation` is set, to stop it zooming the whole page. Text boxes stay at 16px so focusing one never zooms either. Short screens (a phone on its side) get their own layouts for the lobby steps, the chef picker, the briefing, the menu and the game-over card. Every overlay keeps clear of the notch, the Dynamic Island and the home bar with `env(safe-area-inset-*)`.

**Full screen:** the menu's Full screen item toggles the Fullscreen API where it exists (Android, iPad, desktop). iPhone Safari only allows full screen for videos, so on an iPhone the button shows how to add the game to the Home Screen. `public/manifest.webmanifest` and the Apple meta tags in `index.html` then open it as a full-screen app with no address bar or tabs. The layout keeps clear of the notch and home bar with `env(safe-area-inset-*)`. The icons in `public/` are drawn by `node scripts/make_icons.mjs`.

**Choosing a chef:** the room lobby has two steps. In step 1 the crew picks a kitchen together. In step 2 each player picks a chef and types a name, then anyone can start the service. There are thirteen chefs in `src/shared/characters.ts`. Icy, an original princess chef, leads the top row of the picker; she has long wavy hair, a jewelled tiara in front of the toque and a pink bell gown on the hips bone. Four are the KayKit adventurers each seat starts as. Eight are original animal chefs: Pip the mouse, Ginger the cat, Bruno the bear, Hopper the frog, Waddles the penguin, Rusty the fox, Truffle the pig and Peanut the elephant. Each animal chef borrows an adventurer's rig and animations (`src/client/chef.ts`). Its head mesh is hidden, an animal head is hung on the `head` bone and a tail on the `hips` bone, and the body is repainted as a white chef's jacket with furry arms. So the animal chefs run, chop, carry and scrub like everyone else. The heads and tails are GLBs in `public/props`, built from primitives by `node scripts/make_chef_heads.mjs`. The picker's portraits are rendered from the real models once they load (`src/client/portraits.ts`). The chosen chef is sent as a `character` message, kept in `PlayerState.character` and remembered on the device like the name.

**Kitchens:** clearing one layout in `LEVELS` unlocks the next; they are listed in `src/shared/level.ts`. "Open Kitchen" has a central island; "The Pass" splits prep (left) from cooking and serving (right) with a counter wall that has one gap, so teams hand food across it. "Rush Hour" is three rooms in a zigzag (pantry, stoves, pass) joined by one-tile doorways at opposite ends, with the chopping boards and the wash sink set into the dividing counters so both sides can reach them; it has only four plates, which brings in dish washing (below). Each layout lists which recipes can be ordered there. "Hot Line" lines its hobs up on one long island between the pantry and the pass and is the first kitchen that can catch fire; "Full House" is four rooms round a cross of counters with five plates to wash and three hobs that can burn. "Night Market" is an evening street-food kitchen split into two stalls by a loop of conveyor belt: veg crates, boards and the serving window on the left, hobs, grills, the chicken cool box and the wash sink on the right, with only the lane along the back joining them on foot. It has five plates, can burn, and is lit by lantern strings, food stalls and carts instead of daylight (`night` in the room decor). To add one, append a `parseLevel` call with a 13x9 text map and its rules (`plates`, `fire`, `difficulty`).

**Roast chicken (Hot Line onwards):** the `C` crate is a cool box of whole chickens. A chicken is never chopped; put it on a `G` grill and it roasts in 10 seconds, then burns on the same clock as a pot (and in a fire kitchen a charred chicken left on the coals sets the grill alight). A roasted chicken goes on a plate on its own for "Roast chicken", or with chopped lettuce and tomato for "Chicken salad". Later kitchens order more of the menu: Hot Line adds roast chicken, Full House and Night Market add the chicken salad too.

**Conveyor belts (Night Market):** `^ v < >` tiles are belts running in that direction. Anything put on one is carried a tile along every 0.6 seconds, as long as the tile ahead is free (a loop with no gap turns as a whole), so dishes can be sent across the kitchen and picked up on the other side. Belts never burn, and the client slides carried items between tiles by replaying `beltMoves` from `sim.ts`.

**Decoration props:** the Night Market's `market_stall`, `food_cart`, `lantern_post` and `lantern_string_*` GLBs in `public/props` are built from three.js primitives by `node scripts/make_market_props.mjs`; rerun it after changing them.

**Fire (Hot Line and Full House):** in a kitchen with `fire` set, a full pot left on its hob keeps heating after it burns (the badge turns to FIRE RISK and a red bar fills) and six seconds later the hob catches fire. Every 12 seconds (faster with more chefs) the fire jumps to one neighbouring counter, board or hob. A burning tile cannot be used, and food on it is lost. The extinguisher starts on its red mat (`E` in the map); carry it and hold the chop button to spray a cone about 2.4 tiles long, which puts a tile out in 1.5 seconds and can cover several at once. A burnt pot left on the hob flares up again, so take it off and bin it. The flames, the extinguisher and its spray are built in `src/client/fire.ts`.

**Town block (The Pass):** `street` in a kitchen's `decor.room` puts the restaurant on a block built in `src/client/street.ts`: shops and a two-lane road behind it, a park with a fountain on the left, a parking lot on the right and a terrace in front. Everything there is built in code, not loaded: the ground (lawn, pavements, road markings, parking bays, pavers and contact shadows) is one painted canvas, shop fronts are painted textures, and the props (cars, walkers, trees, lamps, benches, bus stop and so on) are small meshes merged per material by `bake`, so the whole block costs a few dozen draw calls. Only the cars, walkers and fountain jets move. Most of it lies outside a 16:9 view; it is there so taller or wider windows never show empty ground. Every kitchen now stands on this block, and `season` on `street` (spring, summer, autumn, winter) recolours the lawn and trees and starts the row of shops at a different one, so the five streets do not look alike.

Map letters: `.` floor, `S` spawn, `#` counter, `T` `L` `N` tomato, lettuce and onion crates, `B` board, `O` stove, `P` plates, `W` serving window, `X` bin, `R` dirty-plate return hatch, `Q` wash sink, and the fixtures `K` sink, `F` fridge, `V` counter with a plant. Fixtures block movement like a counter but cannot be used or targeted, so nothing can be put down on them. Keep fridges on the back row: they are tall enough to hide whatever stands behind them anywhere else.

**How the code is split:** `src/shared/sim.ts` is the whole game rule set as pure functions over plain data, with levels as text maps in `src/shared/level.ts`. The `Room` Durable Object runs that simulation (60 Hz steps, 20 Hz snapshots) and is the only authority. Clients send movement and the chop button when they change, plus interact presses.

**Netcode:** every input message carries a sequence number, and each snapshot reports per player the last sequence applied and how many steps the server has run since. `src/client/world.ts` uses that to predict the local chef: it restarts from the server's position, replays the input the server has not seen yet, and fades any difference out over a few frames instead of jumping. Other chefs are drawn 100 ms in the past, blended between two snapshots. Pick-ups, chopping and scoring are not predicted, so those still take one round trip. The status pill shows the measured ping.

**Reconnects:** each tab keeps a random id in `sessionStorage` and sends it as `?cid=`. If the socket drops, the chef stays in place (holding its item) for 10 s and the same tab gets the seat back on reconnect; retries back off from 0.5 s to 5 s. A second connection with the same id takes the seat and the older tab shows "Opened in another tab".

**Visuals:** counters, stoves, pots, plates, crates, the chopping board, the dish rack, all food and the back wall are models from **KayKit Restaurant Bits 1.0** by Kay Lousberg (CC0, https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0). Only the 19 models the game uses are copied into `public/models`, next to the pack's `LICENSE.txt`; they share one small palette texture and one material. `src/client/assets.ts` loads them once before the kitchen is built, and `src/client/models.ts` places them. The four chefs are the Knight, Barbarian, Mage and Rogue from **KayKit Adventurers 1.0** (CC0, https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), one per seat, wearing a code-built toque; `src/client/chef.ts` loads them and mixes their animations (idle, run, a carry pose on the arms only, and a chop). Sinks, fridges and pot plants are original props generated for this project: the 14 source files are in `public/gpt-models`, and the game loads repacked copies from `public/props` (see the gotcha below). They are fixtures inside the kitchen, not loose decoration: a sink or fridge takes the place of one cabinet in a counter run, and a plant sits on a counter. A kitchen can also have a restaurant around it (`decor.room`): Open Kitchen has a tiled dining room with six tables down both sides, guests seated at them who sway and hop when an order is delivered, wall panels with a teal backsplash and windows, and plants in the corners. It follows the mock-up in `public/gpt-models/restaurant-level-preview.png`. The Pass is dressed with four-seat gingham tables on a dark slate customer floor, cream/sage kitchen checker tiles, brick perimeter walls, alternating windows, wall decor, corner plants, menu/condiment details, plus a sidewalk and animated road behind the restaurant. Rush Hour uses a similar restaurant set with its own three-room kitchen layout. Each kitchen picks its own set in `decor` (one sink, one fridge, a couple of plants), only those are downloaded, and a prop that fails to load falls back to a plain counter. Neither pack has a bin, so the trash chute, the serving pad, flames, steam, planters, lamps and the floor are still built in code. `src/client/scene.ts` owns the renderer, lights and per-frame syncing. The HUD is plain DOM in `index.html` + `style.css`.

**Music:** "Party and Gameover loop" by gilzoide (CC0, https://opengameart.org/content/party-and-gameover-loop), in `public/audio` with a `CREDITS.txt`. The cheerful theme loops at the front door, in the lobby and during a round; after a lost round it cross-fades to the sad theme. `Music on` in the header toggles it separately from sound effects.

**Sound:** `src/client/sound.ts` synthesises every effect with Web Audio (pick up, put down, chopping, dash, new order, delivery, expired order, soup ready, burnt, round start, win and lose), so there are no audio files. It works by comparing each snapshot with the previous one. The "Sound on" button in the header mutes it and the choice is remembered in `localStorage`.

**Phones and tablets:** on a touch device (or with `?touch=1` on a desktop) `src/client/touch.ts` adds a thumb stick that appears wherever the left thumb lands, plus Use, Chop and Dash buttons; tapping a station in reach also uses it. The score and timer move to the top so thumbs do not cover them. Phones render at a lower pixel ratio with a smaller shadow map.

**Inspecting models up close:** add `?zoom=3` to the URL to move the camera three times closer to the middle of the kitchen.

**Testing lag locally:** add `?lag=300` to the URL to delay every message so the round trip takes 300 ms.

**Playing with friends:** share the URL with the same `?room=CODE`. A room seats 4; the seat number picks the spawn corner and shirt colour. A fifth connection is closed with code 4000 and the client stops retrying. Once every seat has been empty past the 10 s reconnect grace, the room stops ticking and resets.

**Voice chat:** players in the same room can talk to each other. The mic button in the header joins the call; once in, it mutes and unmutes the microphone (so does `M`, and the Microphone switch in the menu). The Voice chat switch in the menu leaves it. The choice is remembered on the device, so someone who had voice on rejoins in their next kitchen. Joining asks for the microphone; someone who refuses (or has none) still hears everyone ("listening only"). `src/client/voice.ts` links every chef with voice on directly to every other one over WebRTC (a mesh of at most three links each). The audio never passes through the game server. The room socket only relays the `rtc` messages (offers, answers and network candidates) the two browsers need to find each other, and the `voice` flag in `PlayerState` tells everyone who is in the call. The lower seat number always makes the offer, and each attempt carries an epoch so leftovers from an older link are ignored. A chef heard talking gets a green speech bubble over their head (`createTalkBubble` in `scene.ts`); loudness is measured locally with an `AnalyserNode` on each voice.

**Voice chat on mobile data (TURN):** a direct link works on most home Wi-Fi, but some mobile carriers and office firewalls block it, and those players then stay on "connecting…". A TURN relay fixes that. The Worker's `/turn` endpoint returns the servers browsers use: public STUN by default, plus short-lived Cloudflare TURN credentials when a key is set up. To enable it: in the Cloudflare dashboard open Realtime → TURN Server, create a TURN key, then store its id and API token as Worker secrets:

```bash
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
```

Cloudflare TURN includes a monthly free allowance (1,000 GB at the time of writing) and charges per GB after that; voice uses about 30 MB per player per hour, and only for players who actually need the relay. For local testing put the same two values in `.dev.vars`.

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
- **Phones:** the canvas uses `100dvh`, because `100vh` on a phone includes the area under the browser's address bar and cut the kitchen off. On screens under 460 px tall (a phone held sideways) `resize` in `scene.ts` pulls the camera back and shifts the picture down with `setViewOffset`, so the tickets and score do not sit on the back counters. Under 640 px wide the header drops the title so its buttons fit on one line.
- **Music is OGG Vorbis** — fine in Chrome, Firefox, Edge and recent Safari, but older iPhones cannot play it and will simply have no music; add an `.mp3` or `.m4a` copy if that matters.
- **Audio needs a key press or tap first** — browsers block sound until the user interacts, so the audio context is created on the first `keydown` or `pointerdown`; anything that happens before that is silent.
- **The dining room is decoration only** — tables, guests and walls live outside the 13x9 grid, are not in the simulation and cannot be walked to. Tables near the bottom corners end up behind the score and timer panels, so keep them above `z` 8.
- **Adding a model** — copy its `.gltf` and `.bin` from the pack into `public/models` and add the name to `MODEL_NAMES` in `assets.ts`; a name missing from the folder makes the whole kitchen fail to load with "Could not load the kitchen".
- **All kitchens must be 13x9** — the camera and shadow frustum are framed once for that size, and `setLevel` in `scene.ts` only swaps the kitchen contents.
- **Dash is predicted like movement** — the dash press travels inside the input message and `dashTime` / `dashCooldown` are part of `PlayerState`, so the client replays it exactly instead of rubber-banding.
- **Asset routing** — requests matching a file in `dist/` are served directly; everything else (i.e. `/ws/*` and `/turn`) reaches the Worker.
- **Voice chat needs HTTPS** — browsers only open the microphone on `https://` or `localhost`. Testing from a phone on the LAN (`http://192.168.x.x:5173`) is listen-only; use the deployed site or a tunnel.

## Roadmap

1. ~~Setup: scaffold, starter scene, room presence over WebSocket~~
2. ~~Greybox kitchen: movement, collision, pick up / put down~~
3. ~~Basic multiplayer: players see each other move and pass items~~
4. ~~Cooking loop: chop, cook, plate, serve, orders, timer, score~~
5. ~~Netcode polish: prediction, interpolation, reconnect~~
6. ~~Visual pass: models, lighting, animation, HUD~~
7. ~~Content: second kitchen, onion soup, dash, crew-scaled pacing~~ (fire added later, see above)
8. ~~Finishing: sound effects, front door and waiting room, touch controls, phone render settings~~
