import type { ServerMessage } from "../shared/protocol";

export type ConnectionState = "connecting" | "online" | "offline";

interface RoomHandlers {
  onState(state: ConnectionState): void;
  onMessage(message: ServerMessage): void;
}

const RETRY_MS = 2000;

// Opens the room socket and keeps retrying while the tab is open.
export function connectRoom(code: string, handlers: RoomHandlers): void {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const url = `${scheme}://${location.host}/ws/${code}`;

  const open = () => {
    handlers.onState("connecting");
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => handlers.onState("online"));
    socket.addEventListener("message", (event) => {
      handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    });
    socket.addEventListener("close", () => {
      handlers.onState("offline");
      setTimeout(open, RETRY_MS);
    });
  };

  open();
}
