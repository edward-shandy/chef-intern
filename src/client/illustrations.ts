// Small animated scenes for the kitchen briefing: a cartoon chef doing each job, so it reads at a glance.
// Every scene is a 200 x 140 SVG; its motion comes from the .ill-* animations in style.css.

const INK = "#241d30";
const SKIN = "#f2c29b";
const SHIRTS = ["#e4573d", "#3d8fe4", "#4fb86a", "#e4b03d"];

export type Scene = "grab" | "chop" | "plate" | "serve" | "soup" | "pass" | "wash" | "grill" | "fire" | "combo" | "belt";

const svg = (body: string) =>
  `<svg viewBox="0 0 200 140" aria-hidden="true"><rect width="200" height="140" fill="#fbe6cb"/><path d="M0 34h200M0 68h200" stroke="#f3d6b0" stroke-width="2"/>${body}</svg>`;

// The worktop running along the bottom of every scene.
const counter = (from = 0, to = 200, top = 96) =>
  `<rect x="${from}" y="${top + 4}" width="${to - from}" height="${140 - top}" fill="#d9844f"/><rect x="${from}" y="${top}" width="${to - from}" height="9" rx="3" fill="#f0a46c" stroke="${INK}" stroke-width="2"/>`;

// A chef standing behind the counter, centred on cx; scale shrinks them for scenes with two chefs.
function chef(cx: number, shirt = SHIRTS[0], scale = 1): string {
  return `<g transform="translate(${cx} 112) scale(${scale}) translate(0 -112)">
    <path d="M-23 116v-32a23 23 0 0 1 46 0v32z" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    <path d="M-9 64h18l-9 11z" fill="${shirt}"/>
    <circle cy="50" r="15" fill="${SKIN}" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="-5" cy="49" r="2" fill="${INK}"/><circle cx="5" cy="49" r="2" fill="${INK}"/>
    <path d="M-4 55q4 3 8 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="-9" cy="54" r="2.600" fill="#f09a8a" opacity=".7"/><circle cx="9" cy="54" r="2.600" fill="#f09a8a" opacity=".7"/>
    <path d="M-12 32c-11-1-11-16 0-15 0-10 13-12 15-3 5-7 16-3 12 6 10 0 9 13-3 12z" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    <rect x="-12" y="29" width="24" height="9" rx="2" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
  </g>`;
}

// An arm in a white sleeve from the shoulder to a hand.
const arm = (x1: number, y1: number, x2: number, y2: number, width = 1) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${INK}" stroke-width="${13 * width}" stroke-linecap="round"/><path d="M${x1} ${y1}L${x2} ${y2}" stroke="#fff" stroke-width="${8 * width}" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="${5.5 * width}" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>`;

const tomato = (x: number, y: number, r = 9) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#e23b2e" stroke="${INK}" stroke-width="2"/><path d="M${x - 4} ${y - r + 1}l4 3 4-3" fill="none" stroke="#3f9b46" stroke-width="2.500" stroke-linecap="round"/>`;
const lettuce = (x: number, y: number, r = 10) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#7ccf4f" stroke="${INK}" stroke-width="2"/><path d="M${x} ${y - r + 3}v${r * 2 - 6}M${x - 5} ${y - 3}l5 3 5-3" fill="none" stroke="#4c9a2f" stroke-width="1.800" stroke-linecap="round"/>`;
const slice = (x: number, y: number, colour = "#e23b2e") =>
  `<path d="M${x - 6} ${y}a6 6 0 0 1 12 0z" fill="${colour}" stroke="${INK}" stroke-width="1.800"/>`;
const plate = (x: number, y: number, rx = 26) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.3}" fill="#fff" stroke="#3d8fe4" stroke-width="3"/>`;
const salad = (x: number, y: number) =>
  `<ellipse cx="${x}" cy="${y - 4}" rx="13" ry="6" fill="#7ccf4f" stroke="${INK}" stroke-width="1.800"/>${slice(x - 5, y - 6)}${slice(x + 6, y - 5)}`;
const chicken = (x: number, y: number, colour = "#c8752e", extra = "") =>
  `<g${extra}><ellipse cx="${x}" cy="${y}" rx="22" ry="13" fill="${colour}" stroke="${INK}" stroke-width="2.200"/><path d="M${x + 16} ${y + 3}l12 5" stroke="${colour}" stroke-width="9" stroke-linecap="round"/><path d="M${x + 16} ${y + 3}l12 5" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="${x + 30}" cy="${y + 9}" r="3.500" fill="#fff3e0" stroke="${INK}" stroke-width="1.500"/><path d="M${x - 10} ${y - 6}q10-6 20 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.500" stroke-linecap="round"/></g>`;
const knife = (x: number, y: number) =>
  `<path d="M${x} ${y - 2}l30 4-3 6-27-4z" fill="#dfe3ea" stroke="${INK}" stroke-width="1.800" stroke-linejoin="round"/><rect x="${x - 12}" y="${y - 4}" width="14" height="7" rx="3" fill="#2a2530"/>`;
const flame = (x: number, y: number, size = 1, cls = "ill-flicker") =>
  `<g class="${cls}" style="transform-origin:${x}px ${y}px"><path d="M${x} ${y - 30 * size}c5 9 14 13 14 22a14 14 0 0 1-28 0c0-6 4-9 6-15 2 4 3 5 4 5 0-5 2-9 4-12z" fill="#ff7a2a" stroke="${INK}" stroke-width="2"/><path d="M${x} ${y - 13 * size}c2 4 6 6 6 10a6 6 0 0 1-12 0c0-4 4-6 6-10z" fill="#ffd166"/></g>`;
const tag = (x: number, y: number, text: string, fill = INK) =>
  `<g><rect x="${x - text.length * 4.5 - 7}" y="${y - 11}" width="${text.length * 9 + 14}" height="20" rx="10" fill="${fill}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="13" font-weight="900" fill="#fff">${text}</text></g>`;

const SCENES: Record<Scene, () => string> = {
  // Reaching into a crate and coming back with a tomato.
  grab: () =>
    svg(`${chef(140)}${counter()}
      ${tomato(36, 72)}${tomato(54, 68)}${tomato(70, 73)}
      <rect x="20" y="74" width="64" height="26" rx="4" fill="#b9783f" stroke="${INK}" stroke-width="2.500"/><path d="M24 83h56M24 91h56" stroke="#7d4c22" stroke-width="2"/>
      ${arm(121, 82, 98, 76)}
      <g class="ill-grab">${tomato(92, 66, 8)}</g>`),

  // The knife arm swings down onto a tomato on the board.
  chop: () =>
    svg(`${chef(62)}${counter()}
      <rect x="98" y="88" width="86" height="10" rx="3" fill="#d7a15c" stroke="${INK}" stroke-width="2"/>
      ${slice(126, 88)}${slice(140, 88)}${slice(154, 88)}${tomato(170, 80, 8)}
      <g class="ill-burst"><path d="M122 70l-5-7M140 66v-8M158 70l5-7" stroke="${INK}" stroke-width="2.500" stroke-linecap="round"/></g>
      <g class="ill-chop" style="transform-origin:80px 78px">${arm(80, 78, 110, 74)}${knife(112, 74)}</g>`),

  // Chopped food drops onto a plate.
  plate: () =>
    svg(`${chef(56)}${counter()}
      ${plate(128, 96, 30)}
      <g class="ill-drop">${salad(128, 96)}</g>
      ${arm(74, 78, 112, 62)}`),

  // The finished plate slides into the serving window and the points pop up.
  serve: () =>
    svg(`${chef(44)}${counter(0, 140)}
      <rect x="140" y="96" width="60" height="44" fill="#2f8f7c"/><rect x="140" y="96" width="60" height="9" rx="3" fill="#45b7a0" stroke="${INK}" stroke-width="2"/>
      <path d="M156 112l8 6 8-6M176 112l8 6 8-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M180 92a8 8 0 0 1 16 0z" fill="#d9a441" stroke="${INK}" stroke-width="1.800"/>
      <g class="ill-slide">${plate(86, 94, 22)}${salad(86, 94)}</g>
      ${arm(60, 80, 70, 88)}
      <g class="ill-pop">${tag(168, 48, "+30", "#2f9e5b")}</g>`),

  // Three chopped pieces go into a pot on the hob, which steams and turns ready.
  soup: () =>
    svg(`${counter()}
      <rect x="62" y="96" width="76" height="9" rx="3" fill="#3a3d47" stroke="${INK}" stroke-width="2"/>
      <path d="M74 64h52v22a10 10 0 0 1-10 10H84a10 10 0 0 1-10-10z" fill="#8b93a3" stroke="${INK}" stroke-width="2.500"/>
      <rect x="70" y="60" width="60" height="8" rx="4" fill="#a9b0bd" stroke="${INK}" stroke-width="2"/>
      <g class="ill-drop">${slice(88, 52)}</g><g class="ill-drop ill-delay-1">${slice(100, 52)}</g><g class="ill-drop ill-delay-2">${slice(112, 52)}</g>
      <g class="ill-steam"><path d="M84 40c-4-6 4-9 0-15M100 38c-4-6 4-9 0-15M116 40c-4-6 4-9 0-15" fill="none" stroke="#b9c3d6" stroke-width="3" stroke-linecap="round"/></g>
      ${tag(40, 40, "×3")}
      <g class="ill-pop">${tag(160, 48, "READY!", "#2f9e5b")}</g>`),

  // Two chefs on either side of a counter wall, handing a plate over it.
  pass: () =>
    svg(`${chef(40, SHIRTS[0], 0.85)}${chef(160, SHIRTS[1], 0.85)}${counter()}
      <rect x="84" y="66" width="32" height="74" fill="#c9733f" stroke="${INK}" stroke-width="2.500"/><rect x="80" y="62" width="40" height="9" rx="3" fill="#f0a46c" stroke="${INK}" stroke-width="2"/>
      ${arm(54, 82, 66, 70, 0.85)}${arm(146, 82, 134, 70, 0.85)}
      <g class="ill-pass">${plate(70, 62, 18)}${salad(70, 62)}</g>`),

  // Scrubbing a dirty plate in the sink with a sponge, in a froth of bubbles.
  wash: () =>
    svg(`${chef(100, SHIRTS[2])}${counter()}
      <rect x="52" y="96" width="96" height="16" rx="5" fill="#b9c3d6" stroke="${INK}" stroke-width="2.500"/><ellipse cx="100" cy="100" rx="42" ry="5" fill="#8fd0f2"/>
      ${plate(100, 96, 26)}
      <g class="ill-clean"><circle cx="92" cy="95" r="3" fill="#a8622e"/><circle cx="106" cy="97" r="2.500" fill="#a8622e"/><circle cx="112" cy="94" r="2" fill="#7ccf4f"/></g>
      <g class="ill-bubble"><circle cx="66" cy="88" r="5" fill="#fff" stroke="#8fd0f2" stroke-width="2"/><circle cx="136" cy="86" r="4" fill="#fff" stroke="#8fd0f2" stroke-width="2"/></g>
      <g class="ill-bubble ill-delay-1"><circle cx="78" cy="84" r="3.500" fill="#fff" stroke="#8fd0f2" stroke-width="2"/><circle cx="124" cy="82" r="5" fill="#fff" stroke="#8fd0f2" stroke-width="2"/></g>
      ${arm(82, 82, 92, 90)}
      <g class="ill-scrub">${arm(118, 82, 108, 88)}<rect x="98" y="80" width="20" height="11" rx="3" fill="#ffd84a" stroke="${INK}" stroke-width="2"/><rect x="98" y="78" width="20" height="5" rx="2" fill="#3f9d57"/></g>`),

  // A whole chicken on the grill turns from raw to golden over the coals.
  grill: () =>
    svg(`${counter()}
      <rect x="44" y="86" width="112" height="14" rx="4" fill="#3a3d47" stroke="${INK}" stroke-width="2.500"/>
      <g class="ill-glow"><circle cx="62" cy="90" r="4" fill="#ff6a1a"/><circle cx="82" cy="91" r="4" fill="#ffb03a"/><circle cx="104" cy="90" r="4" fill="#ff6a1a"/><circle cx="124" cy="91" r="4" fill="#ffb03a"/><circle cx="142" cy="90" r="4" fill="#ff6a1a"/></g>
      <path d="M50 86h100" stroke="#8a93a6" stroke-width="3" stroke-linecap="round"/>
      ${chicken(96, 72, "#f3c0ad", ' class="ill-roast"')}
      ${flame(56, 84, 0.5)}${flame(146, 84, 0.5)}
      <g class="ill-steam"><path d="M86 52c-4-6 4-9 0-15M104 50c-4-6 4-9 0-15" fill="none" stroke="#b9c3d6" stroke-width="3" stroke-linecap="round"/></g>
      ${tag(168, 30, "10s")}
      <g transform="translate(18 18)"><circle cx="12" cy="12" r="13" fill="#fff" stroke="#d23c2c" stroke-width="3"/><path d="M4 15 16 7l3 3-11 7z" fill="#dfe3ea" stroke="${INK}" stroke-width="1.500"/><path d="M3 21 21 3" stroke="#d23c2c" stroke-width="3"/></g>`),

  // Spraying a burning worktop with the extinguisher until the flames die down.
  fire: () =>
    svg(`${chef(44, SHIRTS[3])}${counter()}
      ${flame(150, 96, 1.4, "ill-flicker ill-shrink")}${flame(176, 96, 0.9, "ill-flicker ill-shrink")}
      <g class="ill-spray"><ellipse cx="104" cy="70" rx="12" ry="9" fill="#fff" stroke="#d6e2f2" stroke-width="2"/><ellipse cx="124" cy="76" rx="15" ry="11" fill="#fff" stroke="#d6e2f2" stroke-width="2"/><ellipse cx="146" cy="78" rx="18" ry="12" fill="#fff" stroke="#d6e2f2" stroke-width="2" opacity=".9"/></g>
      <rect x="62" y="64" width="18" height="34" rx="8" fill="#d23c2c" stroke="${INK}" stroke-width="2.500"/><path d="M71 64v-6h14l6 8" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      ${arm(60, 80, 68, 80)}`),

  // A roasted chicken, lettuce and tomato all land on one plate.
  combo: () =>
    svg(`${counter()}
      ${plate(100, 96, 40)}
      <g class="ill-drop">${chicken(36, 40, "#c8752e")}</g>
      <text x="76" y="46" font-size="22" font-weight="900" fill="${INK}">+</text>
      <g class="ill-drop ill-delay-1">${lettuce(106, 40, 12)}</g>
      <text x="126" y="46" font-size="22" font-weight="900" fill="${INK}">+</text>
      <g class="ill-drop ill-delay-2">${tomato(156, 40, 11)}</g>
      ${chicken(86, 86, "#c8752e")}${salad(124, 94)}`),

  // A plate rides the belt from one chef to the other while the chevrons roll.
  belt: () =>
    svg(`${chef(28, SHIRTS[0], 0.8)}${chef(172, SHIRTS[1], 0.8)}${counter()}
      <rect x="0" y="92" width="200" height="16" fill="#2f2b38" stroke="${INK}" stroke-width="2"/>
      <g class="ill-roll">${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 20 - 6} 95l6 5-6 5" fill="none" stroke="#f2c230" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</g>
      <g class="ill-ride">${plate(44, 92, 18)}${salad(44, 92)}</g>`),
};

export const illustration = (scene: Scene): string => SCENES[scene]();
