import { CLOSE_REPLACED, CLOSE_ROOM_FULL, type ClientMessage, type ServerMessage } from "../shared/protocol";

export type ConnectionState = "connecting" | "online" | "offline" | "full" | "replaced";

interface RoomHandlers {
  onState(state: ConnectionState): void;
  onMessage(message: ServerMessage): void;
}

export interface RoomConnection {
  send(message: ClientMessage): void;
}

const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 5000;
const CID_KEY = "chef-intern-cid";

// One id per tab, kept across reloads, so the server can hand this tab its old seat back.
function clientId(): string {
  try {
    const saved = sessionStorage.getItem(CID_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    sessionStorage.setItem(CID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

// Opens the room socket and keeps retrying, backing off, while the tab is open.
export function connectRoom(code: string, handlers: RoomHandlers): RoomConnection {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const url = `${scheme}://${location.host}/ws/${code}?cid=${clientId()}`;
  // `?lag=200` adds that many ms of fake round-trip delay, for testing netcode locally.
  const lag = Math.max(0, Number(new URLSearchParams(location.search).get("lag")) || 0) / 2;
  const delayed = (run: () => void) => (lag > 0 ? setTimeout(run, lag) : run());
  let socket: WebSocket | null = null;
  let attempt = 0;
  let replaced = false;

  const open = () => {
    handlers.onState("connecting");
    const current = new WebSocket(url);
    socket = current;
    current.addEventListener("open", () => {
      attempt = 0;
      handlers.onState("online");
    });
    current.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "replaced") {
        replaced = true;
        handlers.onState("replaced");
        return current.close();
      }
      delayed(() => handlers.onMessage(message));
    });
    current.addEventListener("close", (event) => {
      // Neither a full room nor a seat claimed by another tab is fixed by retrying.
      if (event.code === CLOSE_ROOM_FULL) return handlers.onState("full");
      if (replaced || event.code === CLOSE_REPLACED) return handlers.onState("replaced");
      handlers.onState("offline");
      setTimeout(open, Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt++));
    });
  };
  open();

  return {
    send(message) {
      const payload = JSON.stringify(message);
      delayed(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(payload);
      });
    },
  };
}
