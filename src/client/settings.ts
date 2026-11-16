// The settings menu behind the header's menu button, the player's camera zoom, and the guards that stop
// iPhone Safari from zooming the whole page when a player double-taps or pinches.

const ZOOM_KEY = "chef-intern-zoom";
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 2;
const ZOOM_STEP = 0.15;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(value) ? value : 1));

let zoom = 1;
try {
  zoom = clampZoom(Number(localStorage.getItem(ZOOM_KEY) ?? 1));
} catch {
  // Without storage the camera starts at its usual distance.
}
const zoomListeners = new Set<(zoom: number) => void>();

// 1 frames the whole kitchen; above 1 the camera moves in and follows the local chef.
export const getZoom = (): number => zoom;

export function setZoom(value: number): void {
  const next = Math.round(clampZoom(value) * 100) / 100;
  if (next === zoom) return;
  zoom = next;
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    // The zoom still applies for this visit.
  }
  for (const listener of zoomListeners) listener(zoom);
}

export function onZoom(listener: (zoom: number) => void): void {
  zoomListeners.add(listener);
}

// Opens and closes the menu, and keeps its zoom slider in step with the camera.
export function wireMenu(): { showZoom(): void } {
  const button = document.querySelector<HTMLButtonElement>("#menu-button")!;
  const menu = document.querySelector<HTMLElement>("#menu")!;
  const slider = document.querySelector<HTMLInputElement>("#zoom")!;

  // The button shows three bars while the menu is shut and a cross while it is open, and toggles it either way.
  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close settings" : "Settings");
  };
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(menu.hidden !== false);
  });
  // A tap anywhere outside the card, Escape, or choosing an action closes it again.
  document.addEventListener("pointerdown", (event) => {
    // The button itself (its icon included) is left to its own click, which toggles.
    const target = event.target as Node;
    if (!menu.hidden && !menu.querySelector(".menu-card")!.contains(target) && !button.contains(target)) setOpen(false);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && !menu.hidden) setOpen(false);
  });
  for (const item of menu.querySelectorAll(".menu-item")) item.addEventListener("click", () => setOpen(false));

  slider.min = String(MIN_ZOOM);
  slider.max = String(MAX_ZOOM);
  slider.value = String(zoom);
  slider.addEventListener("input", () => setZoom(Number(slider.value)));
  onZoom((value) => (slider.value = String(value)));
  document.querySelector("#zoom-out")!.addEventListener("click", () => setZoom(zoom - ZOOM_STEP));
  document.querySelector("#zoom-in")!.addEventListener("click", () => setZoom(zoom + ZOOM_STEP));

  return {
    // Zoom only means something once there is a kitchen on screen.
    showZoom() {
      document.querySelector<HTMLElement>("#zoom-row")!.hidden = false;
      document.querySelector<HTMLElement>("#zoom-hint")!.hidden = false;
    },
  };
}

// Pinching the kitchen with two fingers, or scrolling over it with a mouse or trackpad, zooms the camera.
export function wireCanvasZoom(canvas: HTMLCanvasElement): void {
  const touches = new Map<number, { x: number; z: number }>();
  let pinch: { distance: number; zoom: number } | null = null;
  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.z - b.z);
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    touches.set(event.pointerId, { x: event.clientX, z: event.clientY });
    if (touches.size === 2) pinch = { distance: spread(), zoom };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, z: event.clientY });
    if (pinch && touches.size === 2 && pinch.distance > 0) setZoom(pinch.zoom * (spread() / pinch.distance));
  });
  const lift = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = null;
  };
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      setZoom(zoom * Math.exp(-event.deltaY * 0.0015));
    },
    { passive: false },
  );
}

// iPhone Safari ignores user-scalable=no, so a quick double tap on a button or a stray pinch used to zoom the
// whole page and leave the game cropped. These stop its gesture and double-tap zooming everywhere.
export function preventPageZoom(): void {
  const block = (event: Event) => event.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(type, block, { passive: false });
  document.addEventListener("dblclick", block, { passive: false });
  document.addEventListener(
    "touchmove",
    (event) => {
      if ((event as TouchEvent & { scale?: number }).scale !== undefined && (event as TouchEvent & { scale: number }).scale !== 1) {
        event.preventDefault();
      }
    },
    { passive: false },
  );
  // A second tap within a moment of the first is what Safari reads as "zoom in"; swallow it on the page itself.
  // Buttons and text boxes keep their taps (they already opt out of double-tap zoom with touch-action in style.css).
  let lastTouch = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      const now = performance.now();
      const target = event.target as HTMLElement;
      if (now - lastTouch < 320 && !target.closest("button, input, textarea, a, label")) event.preventDefault();
      lastTouch = now;
    },
    { passive: false },
  );
}
