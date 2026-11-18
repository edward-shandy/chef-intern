import type { ClientMessage } from "../shared/protocol";
import type { GameState } from "../shared/sim";

// Voice chat for the crew. Every chef who turns it on talks straight to every other chef who did (a small mesh,
// at most three links for a four-chef kitchen), so the audio never goes through the game server: the room socket
// only carries the few messages two browsers need to find each other. Turning voice on asks for the microphone;
// a chef who refuses can still listen. The microphone mute flips the track off without renegotiating anything.

// What travels through the room socket between two chefs. `e` numbers each attempt at a link, so leftovers from
// an older attempt are ignored after a reconnect.
interface Signal {
  e: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  // Sent by the answering side when its link broke, asking the offering side to start a fresh one.
  restart?: true;
  // Sent by the answering side on joining: the other chef may still hold a stale link from before a quick
  // off-and-on, so it is asked outright for a fresh offer.
  hello?: true;
}

interface Peer {
  id: number;
  pc: RTCPeerConnection;
  epoch: number;
  // Candidates that arrived before the other side's description; they cannot be added until it is set.
  queued: RTCIceCandidateInit[];
  audio: HTMLAudioElement;
  meter: Meter | null;
  retry: number;
}

interface Meter {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  data: Uint8Array<ArrayBuffer>;
  // Smoothed loudness, so a speaker icon does not flicker between words.
  level: number;
}

export type VoiceStatus = "off" | "connecting" | "live" | "listening";

export interface VoiceChat {
  readonly on: boolean;
  readonly muted: boolean;
  readonly status: VoiceStatus;
  // Whether the mic could be opened; false means listen-only.
  readonly hasMic: boolean;
  setOn(on: boolean): Promise<void>;
  setMuted(muted: boolean): void;
  // Brings the links in line with who else has voice on.
  update(state: GameState | null, localId: number | null): void;
  onSignal(from: number, data: unknown): void;
  // A fresh room session: old links are gone, and the server is told again that voice is on.
  onWelcome(): void;
  // Chefs heard talking right now, this one included.
  speaking(): ReadonlySet<number>;
  onChange(listener: () => void): void;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
// Fresh TURN credentials are fetched again after this long; the Worker hands out day-long ones.
const ICE_REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = [1000, 2500, 5000, 10000];
// Loudness (0..1 RMS) above which a chef counts as talking, with a little hold so the icon does not blink.
const SPEAKING_LEVEL = 0.035;
const LEVEL_DECAY = 0.82;

const isSignal = (data: unknown): data is Signal =>
  typeof data === "object" && data !== null && typeof (data as Signal).e === "number";

export function createVoiceChat(send: (message: ClientMessage) => void): VoiceChat {
  // What the player asked for, and whether this chef has actually joined (mic asked for, servers fetched).
  let wanted = false;
  let on = false;
  // Bumped on every switch, so a slow microphone prompt from an earlier switch cannot win over a later one.
  let toggles = 0;
  let muted = false;
  let localId: number | null = null;
  let mic: MediaStream | null = null;
  let micMeter: Meter | null = null;
  let context: AudioContext | null = null;
  let ice: { servers: RTCIceServer[]; at: number } | null = null;
  let iceLoading: Promise<RTCIceServer[]> | null = null;
  let nextEpoch = 1;
  // Chefs other than this one whose voice is on, from the latest snapshot.
  let others = new Set<number>();
  const peers = new Map<number, Peer>();
  // Failed attempts at each link in a row, for backing off; cleared once it connects.
  const attempts = new Map<number, number>();
  const listeners: Array<() => void> = [];
  const talking = new Set<number>();

  const changed = () => listeners.forEach((listener) => listener());
  const micTrack = () => mic?.getAudioTracks()[0] ?? null;

  const iceServers = (): Promise<RTCIceServer[]> => {
    if (ice && performance.now() - ice.at < ICE_REFRESH_MS) return Promise.resolve(ice.servers);
    iceLoading ??= fetch("/turn")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { iceServers?: RTCIceServer[] } | null) => {
        const servers = body?.iceServers?.length ? body.iceServers : FALLBACK_ICE;
        ice = { servers, at: performance.now() };
        return servers;
      })
      .catch(() => FALLBACK_ICE)
      .finally(() => (iceLoading = null));
    return iceLoading;
  };

  const meterFor = (stream: MediaStream): Meter | null => {
    if (!context) return null;
    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      return { analyser, source, data: new Uint8Array(analyser.fftSize), level: 0 };
    } catch {
      return null;
    }
  };

  const loudness = (meter: Meter): number => {
    meter.analyser.getByteTimeDomainData(meter.data);
    let sum = 0;
    for (const value of meter.data) sum += ((value - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / meter.data.length);
    meter.level = Math.max(rms, meter.level * LEVEL_DECAY);
    return meter.level;
  };

  // A chef's link is offered by whichever of the two has the lower seat number, so both never offer at once.
  const offers = (id: number) => localId !== null && localId < id;

  const signal = (peer: Peer, data: Omit<Signal, "e">) => send({ type: "rtc", to: peer.id, data: { e: peer.epoch, ...data } });

  const closePeer = (id: number) => {
    const peer = peers.get(id);
    if (!peer) return;
    window.clearTimeout(peer.retry);
    peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.meter?.source.disconnect();
    peer.audio.srcObject = null;
    peer.audio.remove();
    peers.delete(id);
    talking.delete(id);
  };

  const closeAll = () => {
    for (const id of [...peers.keys()]) closePeer(id);
  };

  // Built synchronously, so candidates that arrive right behind an offer find their link already there.
  const createPeer = (id: number, epoch: number): Peer => {
    closePeer(id);
    const pc = new RTCPeerConnection({ iceServers: ice?.servers ?? FALLBACK_ICE });
    // Relay credentials last a day; stale ones are refreshed in the background for the next link.
    if (!ice || performance.now() - ice.at > ICE_REFRESH_MS) iceServers();
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.hidden = true;
    document.body.append(audio);
    const peer: Peer = { id, pc, epoch, queued: [], audio, meter: null, retry: 0 };
    peers.set(id, peer);

    pc.onicecandidate = (event) => {
      if (event.candidate) signal(peer, { candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      audio.srcObject = stream;
      audio.play().catch(() => undefined);
      peer.meter?.source.disconnect();
      peer.meter = meterFor(stream);
    };
    pc.onconnectionstatechange = () => {
      changed();
      if (pc.connectionState === "connected") attempts.delete(id);
      if (pc.connectionState !== "failed" || peers.get(id) !== peer) return;
      // A broken link is rebuilt by the side that offers it; the other side asks for that.
      if (offers(id)) scheduleOffer(id);
      else signal(peer, { restart: true });
    };
    return peer;
  };

  // Sends this chef's audio (or nothing, for a listener) on the link's single audio channel.
  const attachMic = (peer: Peer) => {
    const transceiver = peer.pc.getTransceivers()[0];
    if (!transceiver) return;
    transceiver.direction = "sendrecv";
    transceiver.sender.replaceTrack(micTrack()).catch(() => undefined);
  };

  const startOffer = async (id: number) => {
    if (!on || !others.has(id)) return;
    const peer = createPeer(id, nextEpoch++);
    peer.pc.addTransceiver("audio", { direction: "sendrecv" });
    attachMic(peer);
    await peer.pc.setLocalDescription();
    if (peers.get(id) === peer) signal(peer, { sdp: peer.pc.localDescription!.toJSON() });
  };

  // Tries a broken link again, waiting longer after each failure in a row.
  const scheduleOffer = (id: number) => {
    const peer = peers.get(id);
    const attempt = attempts.get(id) ?? 0;
    attempts.set(id, attempt + 1);
    if (!peer) return void startOffer(id).catch(() => undefined);
    window.clearTimeout(peer.retry);
    peer.retry = window.setTimeout(
      () => startOffer(id).catch(() => undefined),
      RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)],
    );
  };

  const addCandidate = (peer: Peer, candidate: RTCIceCandidateInit) => {
    if (peer.pc.remoteDescription) peer.pc.addIceCandidate(candidate).catch(() => undefined);
    else peer.queued.push(candidate);
  };

  const flushCandidates = (peer: Peer) => {
    for (const candidate of peer.queued.splice(0)) peer.pc.addIceCandidate(candidate).catch(() => undefined);
  };

  const handleSignal = async (from: number, data: Signal) => {
    if (!on) return;
    let peer = peers.get(from);
    if (data.hello) {
      if (offers(from)) startOffer(from).catch(() => undefined);
      return;
    }
    if (data.restart) {
      if (offers(from) && peer?.epoch === data.e) scheduleOffer(from);
      return;
    }
    if (data.sdp?.type === "offer") {
      if (offers(from)) return;
      // A new offer always replaces the old link: the offering side only sends one when starting afresh.
      peer = createPeer(from, data.e);
      await peer.pc.setRemoteDescription(data.sdp);
      attachMic(peer);
      flushCandidates(peer);
      await peer.pc.setLocalDescription();
      if (peers.get(from) === peer) signal(peer, { sdp: peer.pc.localDescription!.toJSON() });
      return;
    }
    if (!peer || peer.epoch !== data.e) return;
    if (data.sdp?.type === "answer" && peer.pc.signalingState === "have-local-offer") {
      await peer.pc.setRemoteDescription(data.sdp);
      flushCandidates(peer);
    } else if (data.candidate) {
      addCandidate(peer, data.candidate);
    }
  };

  // Checks who is talking a few times a second; the scene reads the result every frame.
  window.setInterval(() => {
    const before = talking.size;
    talking.clear();
    if (!on) {
      if (before) changed();
      return;
    }
    if (localId !== null && micMeter && !muted && loudness(micMeter) > SPEAKING_LEVEL) talking.add(localId);
    for (const peer of peers.values()) {
      if (peer.meter && loudness(peer.meter) > SPEAKING_LEVEL) talking.add(peer.id);
    }
  }, 90);

  // Phones only let audio start after a tap, so any paused voice is nudged again on the next one.
  window.addEventListener(
    "pointerdown",
    () => {
      context?.resume().catch(() => undefined);
      for (const peer of peers.values()) if (peer.audio.paused && peer.audio.srcObject) peer.audio.play().catch(() => undefined);
    },
    { capture: true },
  );

  const status = (): VoiceStatus => {
    if (!wanted) return "off";
    if (!on) return "connecting";
    const linked = [...peers.values()].some((peer) => peer.pc.connectionState === "connected");
    if (others.size && !linked) return "connecting";
    return mic ? "live" : "listening";
  };

  return {
    get on() {
      return wanted;
    },
    get muted() {
      return muted;
    },
    get status() {
      return status();
    },
    get hasMic() {
      return mic !== null;
    },

    async setOn(next) {
      if (next === wanted) return;
      wanted = next;
      const token = ++toggles;
      changed();
      if (!next) {
        on = false;
        send({ type: "voice", on: false });
        closeAll();
        attempts.clear();
        micMeter?.source.disconnect();
        micMeter = null;
        mic?.getTracks().forEach((track) => track.stop());
        mic = null;
        return changed();
      }
      // Created inside the click, which is what lets phones play the crew's voices.
      context ??= new AudioContext();
      context.resume().catch(() => undefined);
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        // No microphone, or permission refused: this chef can still hear everyone.
      }
      // The relay servers are in hand before anyone links up, so links are built without waiting.
      await iceServers();
      if (token !== toggles) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      mic = stream;
      const track = micTrack();
      if (track) track.enabled = !muted;
      micMeter = mic && meterFor(mic);
      on = true;
      send({ type: "voice", on: true });
      for (const id of others) {
        if (offers(id)) startOffer(id).catch(() => undefined);
        else send({ type: "rtc", to: id, data: { e: 0, hello: true } });
      }
      changed();
    },

    setMuted(next) {
      muted = next;
      const track = micTrack();
      if (track) track.enabled = !muted;
      changed();
    },

    update(state, nextLocalId) {
      if (nextLocalId !== localId) {
        closeAll();
        localId = nextLocalId;
      }
      const next = new Set(
        (state?.players ?? []).filter((player) => player.voice && player.id !== localId).map((player) => player.id),
      );
      const same = next.size === others.size && [...next].every((id) => others.has(id));
      others = next;
      if (!on) return;
      for (const id of [...peers.keys()]) if (!others.has(id)) closePeer(id);
      for (const id of others) if (!peers.has(id) && offers(id)) startOffer(id).catch(() => undefined);
      if (!same) changed();
    },

    onSignal(from, data) {
      if (isSignal(data)) handleSignal(from, data).catch(() => undefined);
    },

    onWelcome() {
      closeAll();
      attempts.clear();
      if (on) send({ type: "voice", on: true });
    },

    speaking() {
      return talking;
    },

    onChange(listener) {
      listeners.push(listener);
    },
  };
}
