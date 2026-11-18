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
  fires: number;
  // The number showing in the 3-2-1 before a round, or 0.
  count: number;
  // The teleport pad the local chef is standing on, or -1.
  pad: number;
  // Food in the air, by id.
  flying: Set<number>;
}

const describe = (item: Item | null): string => (item ? JSON.stringify(item, (key, value) => (key === "chop" || key === "cook" ? undefined : value)) : "");
// How far along a pot or a chicken on the grill is, so the moment it is ready or burnt can chime.
const potStage = (item: Item): string => {
  const cook = item.type === "pot" && item.contents > 0 ? item.cook : item.type === "ingredient" ? item.cook : undefined;
  if (cook === undefined) return "";
  return cook >= BURN_AT ? "burnt" : cook >= 1 ? "ready" : "raw";
};

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
  // Each track's volume is kept here rather than read back from the element: iPhone Safari ignores
  // `audio.volume` (it always stays 1), so a fade read from it never reached zero and the music never paused.
  const levels: Record<Track, number> = { happy: 0, sad: 0 };
  // Once audio is unlocked the music runs through Web Audio gains, the one volume control iOS honours.
  const gains: Partial<Record<Track, GainNode>> = {};
  for (const track of Object.values(tracks)) {
    track.loop = true;
    track.volume = 0;
    track.preload = "auto";
  }
  // The sad theme only plays after a lost round, so it is not downloaded up front (about 750 KB saved on every
  // visit that never loses); playing it starts the download.
  tracks.sad.preload = "none";
  const setLevel = (name: Track, level: number) => {
    levels[name] = level;
    const gain = gains[name];
    if (gain) gain.gain.value = level;
    else tracks[name].volume = level;
  };
  // Volumes ease towards their targets, which cross-fades the two tracks and softens every toggle.
  // "Sound off" silences the music too, and nothing plays while the page is in the background.
  const fadeMusic = () => {
    for (const name of Object.keys(tracks) as Track[]) {
      const track = tracks[name];
      const target = unlocked && musicOn && !muted && !document.hidden && name === wanted ? MUSIC_VOLUME : 0;
      const level = target === 0 && document.hidden ? 0 : levels[name] + (target - levels[name]) * 0.15;
      setLevel(name, Math.max(0, Math.min(1, level)));
      if (target > 0 && track.paused) void track.play().catch(() => {});
      if (target === 0 && levels[name] < 0.01 && !track.paused) {
        setLevel(name, 0);
        track.pause();
      }
    }
  };
  setInterval(fadeMusic, FADE_MS);
  document.addEventListener("visibilitychange", fadeMusic);

  // Browsers only allow audio after a key press or tap, so the context is created on the first one.
  const unlock = () => {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    if (!gains.happy) {
      for (const name of Object.keys(tracks) as Track[]) {
        try {
          const gain = context.createGain();
          gain.gain.value = levels[name];
          context.createMediaElementSource(tracks[name]).connect(gain).connect(context.destination);
          tracks[name].volume = 1;
          gains[name] = gain;
        } catch {
          // Without Web Audio routing the element's own volume is used, which works everywhere but iOS.
        }
      }
    }
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
        fires: Object.keys(state.fires ?? {}).length,
        count: state.phase === "ready" && state.countdown != null ? Math.ceil(state.countdown) : 0,
        pad: me?.onPad ?? -1,
        flying: new Set((state.flying ?? []).map((piece) => piece.id)),
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
      // Scrubbing at the sink is a soft, low swish rather than the knife's sharp knock.
      if (me?.washing && performance.now() - lastChop > CHOP_EVERY_MS * 1.6) {
        lastChop = performance.now();
        noise(0.14, 0.12, 1100);
      }
      if (now.dashing && !before.dashing) noise(0.16, 0.14, 900);
      // A magic whoosh for each throw: an airy swish and a quick rising shimmer.
      if ([...now.flying].some((id) => !before.flying.has(id))) {
        noise(0.18, 0.12, 2200);
        tone(700, 1500, 0.16, "sine", 0.06);
      }
      // A rising "bwoop" as the local chef beams across on a teleport pad.
      if (now.pad >= 0 && now.pad !== before.pad) tone(300, 1400, 0.22, "sine", 0.1);
      // A two-tone alarm for each new fire, a hiss while spraying and a soft chime when the last one is out.
      if (now.fires > before.fires) notes([740, 554, 740, 554], 0.13, "square", 0.07);
      else if (now.fires === 0 && before.fires > 0) notes([523, 659, 784], 0.09, "sine", 0.08);
      if (me?.spraying && performance.now() - lastChop > CHOP_EVERY_MS) {
        lastChop = performance.now();
        noise(0.2, 0.16, 5200);
      }

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

      if (now.count > 0 && now.count !== before.count) tone(660, 660, 0.12, "square", 0.08);
      if (now.phase !== before.phase) {
        if (now.phase === "playing") notes([523, 784], 0.12);
        else if (now.phase === "over" && state.won) notes([523, 659, 784, 1047], 0.13, "triangle", 0.14);
        else if (now.phase === "over") notes([392, 330, 262], 0.2, "triangle", 0.12);
      }
    },
  };
}
