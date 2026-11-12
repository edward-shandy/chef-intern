import { DEFAULT_ROOM, ROOM_CODE_PATTERN } from "../shared/constants";
import { connectRoom, type ConnectionState } from "./net";
import { startScene } from "./scene";
import "./style.css";

const requested = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
const room = ROOM_CODE_PATTERN.test(requested) ? requested : DEFAULT_ROOM;

const status = document.querySelector<HTMLElement>("#status")!;
let state: ConnectionState = "connecting";
let online = 0;

const render = () => {
  status.dataset.state = state;
  status.textContent =
    state === "online" ? `Room ${room} · ${online} online` : state === "connecting" ? "Connecting…" : "Offline, retrying…";
};

startScene(document.querySelector<HTMLCanvasElement>("#game")!);
connectRoom(room, {
  onState: (next) => {
    state = next;
    render();
  },
  onMessage: (message) => {
    if (message.type === "presence") online = message.online;
    render();
  },
});
render();
