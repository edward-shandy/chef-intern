import { DEFAULT_ROOM, MAX_PLAYERS, ROOM_CODE_PATTERN } from "../shared/constants";
import { KITCHEN_01 } from "../shared/level";
import type { GameState } from "../shared/sim";
import { createAutopilot } from "./autopilot";
import { createHud } from "./hud";
import { createKeyboard } from "./input";
import { connectRoom, type ConnectionState } from "./net";
import { createKitchenView } from "./scene";
import "./style.css";

const requested = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
const roomCode = ROOM_CODE_PATTERN.test(requested) ? requested : DEFAULT_ROOM;

const status = document.querySelector<HTMLElement>("#status")!;
const STATUS_TEXT: Record<Exclude<ConnectionState, "online">, string> = {
  connecting: "Connecting…",
  offline: "Offline, retrying…",
  full: `Room ${roomCode} is full`,
};

// The server owns the game; this client only sends input and draws the latest snapshot.
const net = {
  connection: "connecting" as ConnectionState,
  state: null as GameState | null,
  localId: null as number | null,
};
const sent = { moveX: 0, moveZ: 0, use: false };
const hud = createHud();

const renderStatus = () => {
  status.dataset.state = net.connection;
  status.textContent =
    net.connection === "online"
      ? `Room ${roomCode} · ${net.state?.players.length ?? 0}/${MAX_PLAYERS} chefs`
      : STATUS_TEXT[net.connection];
};

const room = connectRoom(roomCode, {
  onState: (next) => {
    net.connection = next;
    if (next !== "online") net.state = null;
    sent.moveX = sent.moveZ = 0;
    sent.use = false;
    hud.update(net.state);
    renderStatus();
  },
  onMessage: (message) => {
    if (message.type === "welcome") {
      net.localId = message.id;
      return;
    }
    const countChanged = message.players.length !== net.state?.players.length;
    net.state = message;
    hud.update(message);
    if (countChanged) renderStatus();
  },
});
renderStatus();

const keyboard = createKeyboard();
const autopilot = createAutopilot(KITCHEN_01);
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const view = createKitchenView(canvas, KITCHEN_01);

canvas.addEventListener("pointermove", (event) => view.setHover(view.pick(event.clientX, event.clientY)));
canvas.addEventListener("pointerleave", () => view.setHover(null));
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !net.state) return;
  // After the round a click anywhere asks for a rematch, like pressing E.
  if (net.state.phase === "over") return room.send({ type: "interact" });
  const tile = view.pick(event.clientX, event.clientY);
  if (tile !== null) autopilot.goTo(tile, net.state, net.localId);
});

view.start(() => {
  // Any keyboard input takes over from a click-to-walk in progress.
  const keys = keyboard.sample();
  if (keys.moveX || keys.moveZ || keys.use || keys.interact) autopilot.cancel();
  const input = autopilot.step(net.state, net.localId) ?? keys;
  // Movement is only sent when it changes, which keeps message volume tiny.
  if (input.moveX !== sent.moveX || input.moveZ !== sent.moveZ || input.use !== sent.use) {
    Object.assign(sent, { moveX: input.moveX, moveZ: input.moveZ, use: input.use });
    room.send({ type: "input", ...sent });
  }
  if (input.interact) room.send({ type: "interact" });
  return net;
});

if (import.meta.env.DEV) Object.assign(window, { __net: net, __view: view });
