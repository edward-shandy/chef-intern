import { MAX_PLAYERS, ROOM_CODE_PATTERN } from "../shared/constants";
import { LEVELS } from "../shared/level";
import { inReach, targetTile, type GameState, type PlayerInput } from "../shared/sim";
import { loadModels, loadProps } from "./assets";
import { CHEF_PROPS, loadChefs } from "./chef";
import { isCharacter } from "../shared/characters";
import { createChefPicker } from "./lobbySteps";
import { renderPortraits } from "./portraits";
import { wireFullscreen } from "./fullscreen";
import { preventPageZoom, wireCanvasZoom, wireMenu } from "./settings";
import { createGuide } from "./guide";
import { createResults } from "./results";
import { createHud } from "./hud";
import { createKeyboard } from "./input";
import { connectRoom, type ConnectionState } from "./net";
import { createKitchenView } from "./scene";
import { createSound } from "./sound";
import { createTouchControls, wantsTouchControls } from "./touch";
import { createClientWorld } from "./world";
import { createVoiceChat, type VoiceChat } from "./voice";
import { MAGIC_PROPS } from "./magic";
import "./style.css";

const PING_EVERY_MS = 4000;
// Letters and digits that are hard to mix up when read aloud or typed on a phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
// Sound exists on every screen, so music can already play at the front door.
const sound = createSound();

function wireAudioButtons(): void {
  const mute = element("#mute");
  const music = element("#music");
  const render = () => {
    mute.setAttribute("aria-checked", String(!sound.muted));
    music.setAttribute("aria-checked", String(sound.musicOn));
  };
  mute.addEventListener("click", () => {
    sound.toggleMute();
    render();
  });
  music.addEventListener("click", () => {
    sound.toggleMusic();
    render();
  });
  render();
}

// The header mic button and the two voice rows in the menu. The button joins the call when voice is off and
// mutes or unmutes once in; M does the same as the mute switch.
function wireVoice(voice: VoiceChat, localId: () => number | null): void {
  // Very old browsers have no WebRTC; the controls simply stay hidden there.
  if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) return;
  const button = element("#mic-button");
  const toggle = element("#voice");
  const micSwitch = element("#mic");
  const micRow = element("#mic-row");
  const note = element("#voice-state");
  button.hidden = false;
  element("#voice-row").hidden = false;

  const LABELS = {
    off: ["Join voice chat", ""],
    connecting: ["Connecting voice chat…", "connecting…"],
    live: ["Mute microphone (M)", "on"],
    muted: ["Unmute microphone (M)", "muted"],
    listening: ["Listening only: the microphone is blocked", "listening only"],
  } as const;
  const render = () => {
    const status = voice.status;
    const state = status === "off" || status === "listening" ? status : voice.muted ? "muted" : status === "connecting" && !voice.hasMic ? "connecting" : "live";
    const [label, text] = LABELS[state];
    button.dataset.state = state;
    button.setAttribute("aria-label", label);
    button.title = label;
    toggle.setAttribute("aria-checked", String(voice.on));
    micRow.hidden = !voice.on || status === "listening";
    micSwitch.setAttribute("aria-checked", String(!voice.muted));
    // While links are still being made the note says so, even with the mic already live.
    note.textContent = status === "connecting" ? "· connecting…" : text && `· ${text}`;
  };
  const toggleMute = () => voice.setMuted(!voice.muted);
  button.addEventListener("click", () => {
    if (!voice.on || voice.status === "listening") voice.setOn(!voice.on);
    else toggleMute();
    // Focus is let go, so Enter (start) or Space later in the game never presses this button by accident.
    button.blur();
  });
  toggle.addEventListener("click", () => {
    voice.setOn(!voice.on);
    toggle.blur();
  });
  micSwitch.addEventListener("click", () => {
    toggleMute();
    micSwitch.blur();
  });
  window.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.code === "KeyM" && !event.repeat && !typing && voice.on) toggleMute();
  });
  // The choice is remembered on this device: someone who had voice on rejoins the call in their next kitchen.
  const VOICE_KEY = "chef-intern-voice";
  voice.onChange(() => {
    render();
    try {
      localStorage.setItem(VOICE_KEY, voice.on ? "1" : "0");
    } catch {
      // Without storage the choice just lasts this visit.
    }
  });
  render();
  try {
    // Back in the call on entering a room, but muted: nobody is heard by surprise, and one tap on the mic talks.
    if (localStorage.getItem(VOICE_KEY) === "1") voice.setOn(true, true);
  } catch {
    // Nothing remembered: voice starts off.
  }
  // A green ring round the button while this chef is heard talking.
  window.setInterval(() => {
    const id = localId();
    button.dataset.talking = String(id !== null && voice.speaking().has(id));
  }, 120);
}

// Back to the front door, where a new kitchen can be created or another one joined.
function leaveRoom(): void {
  const url = new URL(location.href);
  url.searchParams.delete("room");
  location.href = url.toString();
}
const requested = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";

// Opens the room named in the URL, keeping any other parameters such as ?lag or ?touch.
function enterRoom(code: string): void {
  const url = new URL(location.href);
  url.searchParams.set("room", code);
  location.href = url.toString();
}

// Without a room in the URL there is nothing to join yet, so the front door is shown instead.
function showLobby(): void {
  document.body.classList.add("in-lobby");
  element("#lobby").hidden = false;
  element("#status").hidden = true;
  element("#leave").hidden = true;
  element("#create").addEventListener("click", () => {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
    enterRoom(code);
  });
  element<HTMLFormElement>("#join").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = element<HTMLInputElement>("#join-code");
    const code = input.value.trim().toUpperCase();
    if (ROOM_CODE_PATTERN.test(code)) return enterRoom(code);
    input.setCustomValidity("Use letters and digits only");
    input.reportValidity();
  });
  element<HTMLInputElement>("#join-code").addEventListener("input", (event) => {
    (event.target as HTMLInputElement).setCustomValidity("");
  });
}

function playRoom(roomCode: string): void {
  const status = element("#status");
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
  const hud = createHud((level) => room.send({ type: "level", level }));
  // Each kitchen's briefing pops up in its lobby, and the Guide button brings it back at any time.
  const results = createResults();
  const guide = createGuide(() => room.send({ type: "ready" }));
  element("#guide-button").hidden = false;
  element("#room-code").textContent = roomCode;
  element("#leave").addEventListener("click", leaveRoom);
  element("#leave-lobby").addEventListener("click", leaveRoom);
  const sent = { moveX: 0, moveZ: 0, use: false, aim: null as number | null, dash: false };
  // Room messages go through `room`, which is opened just below, before any voice message can be sent.
  const voice = createVoiceChat((message) => room.send(message));
  wireVoice(voice, () => world.localId);
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

  // The name is remembered on this device and sent again whenever the seat is taken.
  const nameInput = element<HTMLInputElement>("#chef-name");
  try {
    nameInput.value = localStorage.getItem("chef-intern-name") ?? "";
  } catch {
    // Private windows may refuse storage; the name then just starts empty.
  }
  nameInput.addEventListener("input", () => {
    room.send({ type: "name", name: nameInput.value });
    try {
      localStorage.setItem("chef-intern-name", nameInput.value);
    } catch {
      // Nothing to do: the name still works for this visit.
    }
  });

  const room = connectRoom(roomCode, {
    onState: (next) => {
      connection = next;
      if (next !== "online") {
        world.disconnect();
        ping = null;
        hud.update(null, null);
        voice.update(null, null);
      }
      renderStatus();
    },
    onMessage: (message) => {
      const now = performance.now();
      if (message.type === "welcome") {
        world.welcome(message.id, now);
        voice.onWelcome();
        if (nameInput.value.trim()) room.send({ type: "name", name: nameInput.value });
        if (savedCharacter) room.send({ type: "character", character: savedCharacter });
        // Forces whatever is held down right now to be sent again under the new session.
        Object.assign(sent, { moveX: 0, moveZ: 0, use: false, aim: null, dash: false });
      } else if (message.type === "rtc") {
        voice.onSignal(message.from, message.data);
      } else if (message.type === "pong") {
        ping = Math.round(now - message.t);
        renderStatus();
      } else if (message.type === "state") {
        const countChanged = message.players.length !== world.latest?.players.length;
        world.onSnapshot(message, message.acks, now);
        hud.update(message, world.localId);
        guide.update(message, world.localId);
        results.update(message, world.localId);
        picker.update(message, world.localId);
        sound.update(message, world.localId);
        voice.update(message, world.localId);
        if (countChanged) renderStatus();
      }
    },
  });
  renderStatus();
  setInterval(() => {
    if (connection === "online") room.send({ type: "ping", t: performance.now() });
  }, PING_EVERY_MS);

  // Lobby buttons: anyone in the room can start the service or copy the link for friends.
  const start = () => {
    if (world.latest?.phase === "waiting") room.send({ type: "start" });
  };
  element("#start").addEventListener("click", start);
  // Each player's chef is remembered on this device, like the name, and sent again whenever the seat is taken.
  let savedCharacter: string | null = null;
  try {
    const stored = localStorage.getItem("chef-intern-character");
    savedCharacter = isCharacter(stored) ? stored : null;
  } catch {
    // Without storage the seat's own chef is used.
  }
  const picker = createChefPicker((character) => {
    savedCharacter = character;
    room.send({ type: "character", character });
    try {
      localStorage.setItem("chef-intern-character", character);
    } catch {
      // The pick still holds for this visit.
    }
  }, start);
  window.addEventListener("keydown", (event) => {
    // Enter in the name box only confirms the name.
    if (event.target === nameInput) {
      if (event.code === "Enter" || event.code === "NumpadEnter") nameInput.blur();
      return;
    }
    if (event.code === "Enter" || event.code === "NumpadEnter") start();
  });
  const invite = element("#invite");
  invite.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      invite.textContent = "Link copied";
    } catch {
      invite.textContent = `Share code ${roomCode}`;
    }
  });
  // The kitchen is only built once its models have arrived; the room connection is already under way.
  const startGame = () => {
    const keyboard = createKeyboard();
    const touch = wantsTouchControls() ? createTouchControls() : null;
    const canvas = element<HTMLCanvasElement>("#game");
    const view = createKitchenView(canvas, currentLevel());
    wireCanvasZoom(canvas);
    menu.showZoom();

    // The pointer only ever picks stations; walking is keyboard or stick only.
    const pointer = { tile: null as number | null, movedAt: 0, chopping: false };
    const localPlayer = () => shown?.players.find((player) => player.id === world.localId);

    // The pointed-at station, if it is within reach and the pointer moved after the last movement input.
    const currentAim = (): number | null => {
      const me = localPlayer();
      const movedAt = Math.max(keyboard.movedAt(), touch?.movedAt() ?? 0);
      if (!me || pointer.tile === null || pointer.movedAt < movedAt) return null;
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
      // Left click or a tap uses the station; holding the right button chops on it.
      if (event.button === 0) room.send({ type: "interact", aim });
      else if (event.button === 2) pointer.chopping = true;
    });

    view.start(() => {
      const now = performance.now();
      const keys = keyboard.sample();
      const pad = touch?.sample();
      const aim = currentAim();
      const input: PlayerInput = {
        moveX: keys.moveX || pad?.moveX || 0,
        moveZ: keys.moveZ || pad?.moveZ || 0,
        use: keys.use || pointer.chopping || Boolean(pad?.use),
        dash: keys.dash || Boolean(pad?.dash),
        interact: keys.interact || Boolean(pad?.interact),
        aim,
      };

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
      const target = me && shown?.phase !== "over" ? targetTile(currentLevel(), me, aim) : null;
      // The touch hold button says what holding it will do: spray with the extinguisher in hand, scrub at the sink, else chop.
      // With food in hand the same button throws it, in the kitchens split by a stream.
      const throwing = me?.held?.type === "ingredient" && currentLevel().tiles.some((tile) => tile.kind === "chasm");
      touch?.setHoldAction(
        me?.held?.type === "extinguisher"
          ? "spray"
          : throwing
            ? "throw"
            : target !== null && currentLevel().tiles[target].kind === "wash"
              ? "wash"
              : "chop",
      );
      canvas.style.cursor = aim === null ? "default" : "pointer";
      // A pointed-at station that is not the active target is out of reach, and gets its own outline.
      return {
        state: shown,
        localId: world.localId,
        target,
        pointed: pointer.tile === target ? null : pointer.tile,
        speaking: voice.speaking(),
      };
    });

    if (import.meta.env.DEV) Object.assign(window, { __world: world, __view: view, __shown: () => shown, __hud: hud, __results: results, __voice: voice });
  };

  const decorNames = LEVELS.flatMap(({ decor }) => [
    decor.sink,
    decor.fridge,
    ...decor.plants,
    ...(decor.room
      ? [
          ...decor.room.backWall,
          decor.room.outerWall,
          ...decor.room.sideWalls,
          ...decor.room.tables.flatMap((table) => [table.model, ...table.guests]),
          ...decor.room.plants.map((plant) => plant.model),
          ...(decor.room.extras ?? []).map((extra) => extra.model),
          decor.room.halfWall ?? "",
        ]
      : []),
  ]).filter(Boolean);
  Promise.all([loadModels(), loadChefs(), loadProps([...new Set([...decorNames, ...CHEF_PROPS, ...MAGIC_PROPS])])]).then(() => {
    startGame();
    renderPortraits();
  }, (error) => {
    status.dataset.state = "offline";
    status.textContent = "Could not load the kitchen";
    console.error(error);
  });
}

preventPageZoom();
const menu = wireMenu();
wireAudioButtons();
wireFullscreen();
if (ROOM_CODE_PATTERN.test(requested)) playRoom(requested);
else showLobby();
