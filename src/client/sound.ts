import { BURN_AT, type GameState, type Item } from "../shared/sim";

const MUTE_KEY = "chef-intern-muted";
const MUSIC_KEY = "chef-intern-music-off";
const MUSIC_VOLUME = 0.32;
const FADE_MS = 50;

type Track = "happy" | "sad";
const CHOP_EVERY_MS = 190;

type Wave = OscillatorType;

// What a snapshot sounded like last time, so only changes make noise.
interface Heard {
  held: string;
  delivered: number;
  score: number;
  orders: Set<number>;
  phase: GameState["phase"];
  pots: Map<number, string>;
  dashing: boolean;
}

const describe = (item: Item | null): string => (item ? JSON.stringify(item, (key, value) => (key === "chop" || key === "cook" ? undefined : value)) : "");
const potStage = (item: Item): string =>
  item.type !== "pot" || item.contents === 0 ? "" : item.cook >= BURN_AT ? "burnt" : item.cook >= 1 ? "ready" : "raw";

export interface Sound {
  // Compares a snapshot with the previous one and plays whatever changed.
  update(state: GameState, localId: number | null): void;
  readonly muted: boolean;
  toggleMute(): boolean;
  readonly musicOn: boolean;
  toggleMusic(): boolean;
}

// Every effect is synthesised with Web Audio, so there are no sound files to download.
export function createSound(): Sound {
  let context: AudioContext | null = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Storage can be blocked; sound then simply starts unmuted.
  }
  let heard: Heard | null = null;
  let lastChop = 0;

  // Background music: a cheerful loop, swapped for its sad twin after a lost round.
  let musicOn = true;
  try {
    musicOn = localStorage.getItem(MUSIC_KEY) !== "1";
  } catch {
    // Storage can be blocked; music then simply starts on.
  }
  let wanted: Track = "happy";
  let unlocked = false;
  const tracks: Record<Track, HTMLAudioElement> = {
    happy: new Audio("/audio/happy_theme.ogg"),
    sad: new Audio("/audio/sad_theme.ogg"),
  };
  for (const track of Object.values(tracks)) {
    track.loop = true;
    track.volume = 0;
    track.preload = "auto";
  }
  // Volumes ease towards their targets, which cross-fades the two tracks and softens every toggle.
  setInterval(() => {
    for (const [name, track] of Object.entries(tracks)) {
      const target = unlocked && musicOn && name === wanted ? MUSIC_VOLUME : 0;
      track.volume = Math.max(0, Math.min(1, track.volume + (target - track.volume) * 0.15));
      if (target > 0 && track.paused) void track.play().catch(() => {});
      if (target === 0 && track.volume < 0.01 && !track.paused) track.pause();
    }
  }, FADE_MS);

  // Browsers only allow audio after a key press or tap, so the context is created on the first one.
  const unlock = () => {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    unlocked = true;
  };
  window.addEventListener("keydown", unlock);
  window.addEventListener("pointerdown", unlock);

  const tone = (from: number, to: number, seconds: number, wave: Wave = "sine", volume = 0.12, delay = 0) => {
    if (!context || muted || context.state !== "running") return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  };

  const noise = (seconds: number, volume: number, cutoff: number) => {
    if (!context || muted || context.state !== "running") return;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  };

  const notes = (frequencies: number[], gap: number, wave: Wave = "triangle", volume = 0.12) =>
    frequencies.forEach((frequency, i) => tone(frequency, frequency, 0.16, wave, volume, i * gap));

  return {
    get muted() {
      return muted;
    },

    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      } catch {
        // The choice just will not be remembered.
      }
      return muted;
    },

    get musicOn() {
      return musicOn;
    },

    toggleMusic() {
      musicOn = !musicOn;
      try {
        localStorage.setItem(MUSIC_KEY, musicOn ? "0" : "1");
      } catch {
        // The choice just will not be remembered.
      }
      return musicOn;
    },

    update(state, localId) {
      wanted = state.phase === "over" && !state.won ? "sad" : "happy";
      const me = state.players.find((player) => player.id === localId);
      const now: Heard = {
        held: describe(me?.held ?? null),
        delivered: state.delivered,
        score: state.score,
        orders: new Set(state.orders.map((order) => order.id)),
        phase: state.phase,
        pots: new Map(Object.entries(state.tileItems).map(([index, item]) => [Number(index), potStage(item)])),
        dashing: (me?.dashTime ?? 0) > 0,
      };
      const before = heard;
      heard = now;
      // The first snapshot only sets the baseline, so joining a busy kitchen is not a burst of noise.
      if (!before) return;

      if (now.held !== before.held) {
        if (now.held && !before.held) tone(520, 820, 0.08, "triangle");
        else tone(430, 300, 0.09, "triangle");
      }
      if (me?.chopping && performance.now() - lastChop > CHOP_EVERY_MS) {
        lastChop = performance.now();
        noise(0.05, 0.25, 2600);
        tone(210, 150, 0.05, "square", 0.05);
      }
      if (now.dashing && !before.dashing) noise(0.16, 0.14, 900);

      if (now.delivered > before.delivered) notes([660, 880, 1320], 0.07);
      else if (now.score < before.score && now.phase === "playing") tone(240, 130, 0.32, "sawtooth", 0.08);
      for (const id of now.orders) {
        if (!before.orders.has(id)) notes([880, 1175], 0.09, "sine", 0.08);
      }
      for (const [index, stage] of now.pots) {
        if (stage === before.pots.get(index)) continue;
        if (stage === "ready") notes([988, 1319, 988, 1319], 0.11, "sine", 0.1);
        if (stage === "burnt") tone(130, 70, 0.5, "square", 0.08);
      }

      if (now.phase !== before.phase) {
        if (now.phase === "playing") notes([523, 784], 0.12);
        else if (now.phase === "over" && state.won) notes([523, 659, 784, 1047], 0.13, "triangle", 0.14);
        else if (now.phase === "over") notes([392, 330, 262], 0.2, "triangle", 0.12);
      }
    },
  };
}
