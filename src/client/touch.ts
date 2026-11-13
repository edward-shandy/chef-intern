const STICK_RADIUS = 52;
const DEAD_ZONE = 0.3;

export interface TouchSample {
  moveX: number;
  moveZ: number;
  use: boolean;
  dash: boolean;
  interact: boolean;
}

export interface TouchControls {
  sample(): TouchSample;
  // When the stick was last touched, so a tapped station can yield back to the facing direction.
  movedAt(): number;
}

// True on phones and tablets, or anywhere with `?touch=1` for testing on a desktop.
export const wantsTouchControls = (): boolean =>
  matchMedia("(pointer: coarse)").matches || new URLSearchParams(location.search).has("touch");

// Adds an on-screen stick and three buttons, reporting input in the same shape as the keyboard.
export function createTouchControls(): TouchControls {
  document.body.classList.add("touch");
  const root = document.createElement("div");
  root.className = "touch-controls";
  root.innerHTML = `
    <div class="stick-zone"><div class="stick"><div class="stick-knob"></div></div></div>
    <div class="touch-buttons">
      <button class="touch-button touch-dash" data-action="dash">Dash</button>
      <button class="touch-button touch-chop" data-action="chop">Chop</button>
      <button class="touch-button touch-use" data-action="use">Use</button>
    </div>`;
  document.body.append(root);

  const zone = root.querySelector<HTMLElement>(".stick-zone")!;
  const stick = root.querySelector<HTMLElement>(".stick")!;
  const knob = root.querySelector<HTMLElement>(".stick-knob")!;
  const state = { moveX: 0, moveZ: 0, chopping: false, dash: false, interact: false, movedAt: 0 };
  let stickPointer: number | null = null;
  let originX = 0;
  let originY = 0;

  // The stick appears wherever the thumb lands, so there is no fixed spot to aim for.
  const moveStick = (event: PointerEvent) => {
    const dx = event.clientX - originX;
    const dy = event.clientY - originY;
    const length = Math.hypot(dx, dy);
    const reach = Math.min(1, length / STICK_RADIUS);
    knob.style.transform = `translate(${((dx / (length || 1)) * reach * STICK_RADIUS).toFixed(1)}px, ${((dy / (length || 1)) * reach * STICK_RADIUS).toFixed(1)}px)`;
    // Snapping to the eight keyboard directions keeps input messages as rare as with keys.
    const pushed = reach > DEAD_ZONE;
    state.moveX = pushed && Math.abs(dx) > Math.abs(dy) * 0.4 ? Math.sign(dx) : 0;
    state.moveZ = pushed && Math.abs(dy) > Math.abs(dx) * 0.4 ? Math.sign(dy) : 0;
    state.movedAt = performance.now();
  };
  const releaseStick = (event: PointerEvent) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    state.moveX = state.moveZ = 0;
    stick.classList.remove("active");
    knob.style.transform = "";
  };
  zone.addEventListener("pointerdown", (event) => {
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    try {
      zone.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; without it the stick just stops when the thumb leaves the zone.
    }
    const bounds = zone.getBoundingClientRect();
    originX = event.clientX;
    originY = event.clientY;
    stick.style.left = `${originX - bounds.left}px`;
    stick.style.top = `${originY - bounds.top}px`;
    stick.classList.add("active");
    moveStick(event);
  });
  zone.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickPointer) moveStick(event);
  });
  zone.addEventListener("pointerup", releaseStick);
  zone.addEventListener("pointercancel", releaseStick);

  for (const button of root.querySelectorAll<HTMLElement>(".touch-button")) {
    const action = button.dataset.action;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.classList.add("pressed");
      if (action === "use") state.interact = true;
      if (action === "dash") state.dash = true;
      if (action === "chop") state.chopping = true;
    });
    const release = () => {
      button.classList.remove("pressed");
      if (action === "chop") state.chopping = false;
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  return {
    movedAt: () => state.movedAt,
    sample() {
      const sample = { moveX: state.moveX, moveZ: state.moveZ, use: state.chopping, dash: state.dash, interact: state.interact };
      state.dash = state.interact = false;
      return sample;
    },
  };
}
