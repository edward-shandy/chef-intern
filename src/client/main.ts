import { DEFAULT_ROOM, MAX_PLAYERS, ROOM_CODE_PATTERN } from "../shared/constants";
import { LEVELS } from "../shared/level";
import { inReach, targetTile, type GameState, type PlayerInput } from "../shared/sim";
import { loadModels, loadProps } from "./assets";
import { loadChefs } from "./chef";
import { createHud } from "./hud";
import { createKeyboard } from "./input";
import { connectRoom, type ConnectionState } from "./net";
import { createKitchenView } from "./scene";
import { createClientWorld } from "./world";
import "./style.css";

const PING_EVERY_MS = 4000;

const requested = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
const roomCode = ROOM_CODE_PATTERN.test(requested) ? requested : DEFAULT_ROOM;

const status = document.querySelector<HTMLElement>("#status")!;
const STATUS_TEXT: Record<Exclude<ConnectionState, "online">, string> = {
  connecting: "Connecting…",
  offline: "Reconnecting…",
  full: `Room ${roomCode} is full`,
  replaced: "Opened in another tab",
};

// The server owns the game; the world predicts our own chef and smooths everyone else.
const world = createClientWorld();
// The kitchen changes between rounds, so the layout is always read from the latest snapshot.
const currentLevel = () => LEVELS[world.latest?.level ?? 0];
const hud = createHud();
const sent = { moveX: 0, moveZ: 0, use: false, aim: null as number | null, dash: false };
let connection: ConnectionState = "connecting";
let ping: number | null = null;
let shown: GameState | null = null;

const renderStatus = () => {
  status.dataset.state = connection;
  const chefs = `${world.latest?.players.length ?? 0}/${MAX_PLAYERS} chefs`;
  status.textContent =
    connection === "online"
      ? `Room ${roomCode} · ${chefs}${ping === null ? "" : ` · ${ping} ms`}`
      : STATUS_TEXT[connection];
};

const room = connectRoom(roomCode, {
  onState: (next) => {
    connection = next;
    if (next !== "online") {
      world.disconnect();
      ping = null;
      hud.update(null);
    }
    renderStatus();
  },
  onMessage: (message) => {
    const now = performance.now();
    if (message.type === "welcome") {
      world.welcome(message.id, now);
      // Forces whatever is held down right now to be sent again under the new session.
      Object.assign(sent, { moveX: 0, moveZ: 0, use: false, aim: null, dash: false });
    } else if (message.type === "pong") {
      ping = Math.round(now - message.t);
      renderStatus();
    } else if (message.type === "state") {
      const countChanged = message.players.length !== world.latest?.players.length;
      world.onSnapshot(message, message.acks, now);
      hud.update(message);
      if (countChanged) renderStatus();
    }
  },
});
renderStatus();
setInterval(() => {
  if (connection === "online") room.send({ type: "ping", t: performance.now() });
}, PING_EVERY_MS);

// The kitchen is only built once its models have arrived; the room connection is already under way.
function startGame(): void {
  const keyboard = createKeyboard();
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const view = createKitchenView(canvas, currentLevel());

  // The mouse only ever points at stations; walking is keyboard-only.
  const pointer = { tile: null as number | null, movedAt: 0, chopping: false };
  const localPlayer = () => shown?.players.find((player) => player.id === world.localId);

  // The pointed-at station, if it is within reach and the mouse moved after the last movement key.
  const currentAim = (): number | null => {
    const me = localPlayer();
    if (!me || pointer.tile === null || pointer.movedAt < keyboard.movedAt()) return null;
    return inReach(currentLevel(), me, pointer.tile) ? pointer.tile : null;
  };

  const track = (event: PointerEvent) => {
    pointer.tile = view.pick(event.clientX, event.clientY);
    pointer.movedAt = performance.now();
  };
  canvas.addEventListener("pointermove", track);
  canvas.addEventListener("pointerleave", () => {
    pointer.tile = null;
    pointer.chopping = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerup", () => (pointer.chopping = false));
  canvas.addEventListener("pointercancel", () => (pointer.chopping = false));
  canvas.addEventListener("pointerdown", (event) => {
    if (!shown) return;
    track(event);
    // After the round a click anywhere asks for a rematch, like pressing E.
    if (shown.phase === "over") return room.send({ type: "interact", aim: null });
    const aim = currentAim();
    if (aim === null) return;
    // Left click uses the station; holding the right button chops on it.
    if (event.button === 0) room.send({ type: "interact", aim });
    else if (event.button === 2) pointer.chopping = true;
  });

  view.start(() => {
    const now = performance.now();
    const keys = keyboard.sample();
    const aim = currentAim();
    const input: PlayerInput = { ...keys, use: keys.use || pointer.chopping, aim };

    // Input is only sent when it changes, which keeps message volume tiny.
    if (connection === "online" && world.localId !== null) {
      const moved =
        input.moveX !== sent.moveX || input.moveZ !== sent.moveZ || input.use !== sent.use || input.dash !== sent.dash;
      if (moved || (input.use && input.aim !== sent.aim)) {
        Object.assign(sent, { moveX: input.moveX, moveZ: input.moveZ, use: input.use, aim: input.aim, dash: input.dash });
        room.send({ type: "input", seq: world.pushInput(input, now), ...sent });
      }
      if (input.interact) room.send({ type: "interact", aim });
    }

    shown = world.frame(now);
    view.setLevel(currentLevel());
    const me = localPlayer();
    const target = me && shown?.phase === "playing" ? targetTile(currentLevel(), me, aim) : null;
    canvas.style.cursor = aim === null ? "default" : "pointer";
    // A pointed-at station that is not the active target is out of reach, and gets its own outline.
    return { state: shown, localId: world.localId, target, pointed: pointer.tile === target ? null : pointer.tile };
  });

  if (import.meta.env.DEV) Object.assign(window, { __world: world, __view: view, __shown: () => shown });
}

const decorNames = LEVELS.flatMap(({ decor }) => [decor.sink, decor.fridge, ...decor.plants]);
Promise.all([loadModels(), loadChefs(), loadProps([...new Set(decorNames)])]).then(startGame, (error) => {
  status.dataset.state = "offline";
  status.textContent = "Could not load the kitchen";
  console.error(error);
});
