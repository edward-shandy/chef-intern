import { CLOSE_ROOM_FULL, type ClientMessage, type ServerMessage } from "../shared/protocol";

export type ConnectionState = "connecting" | "online" | "offline" | "full";

interface RoomHandlers {
  onState(state: ConnectionState): void;
  onMessage(message: ServerMessage): void;
}

export interface RoomConnection {
  send(message: ClientMessage): void;
}

const RETRY_MS = 2000;

// Opens the room socket and keeps retrying while the tab is open.
export function connectRoom(code: string, handlers: RoomHandlers): RoomConnection {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const url = `${scheme}://${location.host}/ws/${code}`;
  let socket: WebSocket | null = null;

  const open = () => {
    handlers.onState("connecting");
    const current = new WebSocket(url);
    socket = current;
    current.addEventListener("open", () => handlers.onState("online"));
    current.addEventListener("message", (event) => {
      handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    });
    current.addEventListener("close", (event) => {
      // A full room will not free up by hammering it, so stop retrying.
      if (event.code === CLOSE_ROOM_FULL) return handlers.onState("full");
      handlers.onState("offline");
      setTimeout(open, RETRY_MS);
    });
  };
  open();

  return {
    send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
  };
}
