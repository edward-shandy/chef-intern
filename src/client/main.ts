import { DEFAULT_ROOM, ROOM_CODE_PATTERN } from "../shared/constants";
import { KITCHEN_01 } from "../shared/level";
import { createGame, SIM_STEP, stepGame } from "../shared/sim";
import { createKeyboard } from "./input";
import { connectRoom, type ConnectionState } from "./net";
import { createKitchenView } from "./scene";
import "./style.css";

const requested = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
const room = ROOM_CODE_PATTERN.test(requested) ? requested : DEFAULT_ROOM;

const status = document.querySelector<HTMLElement>("#status")!;
let connection: ConnectionState = "connecting";
let online = 0;

const renderStatus = () => {
  status.dataset.state = connection;
  status.textContent =
    connection === "online"
      ? `Room ${room} · ${online} online`
      : connection === "connecting"
        ? "Connecting…"
        : "Offline, retrying…";
};

// The game still simulates locally; the room only reports presence until phase 3.
const level = KITCHEN_01;
const game = createGame(level, 1);
const keyboard = createKeyboard();
let pending = 0;

createKitchenView(document.querySelector<HTMLCanvasElement>("#game")!, level).start((dt) => {
  pending += dt;
  while (pending >= SIM_STEP) {
    stepGame(level, game, [keyboard.sample()], SIM_STEP);
    pending -= SIM_STEP;
  }
  return game;
});

connectRoom(room, {
  onState: (next) => {
    connection = next;
    renderStatus();
  },
  onMessage: (message) => {
    if (message.type === "presence") online = message.online;
    renderStatus();
  },
});
renderStatus();

if (import.meta.env.DEV) Object.assign(window, { __game: game });
