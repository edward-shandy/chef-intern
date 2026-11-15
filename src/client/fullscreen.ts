// Full-screen play. Browsers with the Fullscreen API (Android, iPad, desktop) get a real toggle. iPhone Safari only
// lets videos go full screen, so there the button explains the one way that works: add the game to the Home Screen,
// which opens it as an app with no address bar or tabs (see public/manifest.webmanifest).

type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as FullscreenDocument;

const isFullscreen = () => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);

// Already running from the Home Screen, where there are no browser bars to hide.
const installed = () =>
  matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const ENTER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const EXIT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function wireFullscreen(): void {
  const button = document.querySelector<HTMLButtonElement>("#fullscreen")!;
  const tip = document.querySelector<HTMLElement>("#fullscreen-tip")!;
  if (installed()) return;

  const supported = Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled);
  const phone = matchMedia("(pointer: coarse)").matches;
  // Without the API there is nothing to toggle on a desktop; on a phone the button still teaches the Home Screen way.
  if (!supported && !phone) return;
  button.hidden = false;

  const render = () => {
    const on = isFullscreen();
    button.innerHTML = on ? EXIT_ICON : ENTER_ICON;
    button.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
    button.setAttribute("aria-pressed", String(on));
  };
  render();
  document.addEventListener("fullscreenchange", render);
  document.addEventListener("webkitfullscreenchange", render);

  button.addEventListener("click", async () => {
    if (!supported) {
      tip.hidden = false;
      tip.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
      return;
    }
    try {
      if (isFullscreen()) await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      else {
        const root = document.documentElement as FullscreenElement;
        await (root.requestFullscreen?.({ navigationUI: "hide" }) ?? root.webkitRequestFullscreen?.());
      }
    } catch {
      // A refused request leaves the page as it was; the tip still explains the Home Screen route.
      tip.hidden = false;
    }
  });

  tip.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target === tip || target.closest("[data-close]")) tip.hidden = true;
  });
}
