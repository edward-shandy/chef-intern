import type { PlayerInput } from "../shared/sim";

const INTERACT_KEYS = new Set(["KeyE", "Space"]);
const USE_KEYS = ["KeyF"];
const DASH_KEYS = ["ShiftLeft", "ShiftRight"];
const HANDLED_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
  ...INTERACT_KEYS,
  ...USE_KEYS,
  ...DASH_KEYS,
]);

// Tracks held keys and hands the simulation one input sample per step.
export function createKeyboard(): { sample(): PlayerInput; movedAt(): number } {
  const down = new Set<string>();
  let interactQueued = false;
  let dashQueued = false;
  let movedAt = 0;

  window.addEventListener("keydown", (event) => {
    if (!HANDLED_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    down.add(event.code);
    if (INTERACT_KEYS.has(event.code)) interactQueued = true;
    else if (DASH_KEYS.includes(event.code)) dashQueued = true;
    else if (!USE_KEYS.includes(event.code)) movedAt = performance.now();
  });
  window.addEventListener("keyup", (event) => down.delete(event.code));
  window.addEventListener("blur", () => down.clear());

  const axis = (negative: string[], positive: string[]) =>
    Number(positive.some((code) => down.has(code))) - Number(negative.some((code) => down.has(code)));

  return {
    // When a movement key was last pressed, so the mouse aim can yield to the keyboard.
    movedAt: () => movedAt,
    sample() {
      const interact = interactQueued;
      interactQueued = false;
      const dash = dashQueued;
      dashQueued = false;
      return {
        moveX: axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]),
        moveZ: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]),
        use: USE_KEYS.some((code) => down.has(code)),
        aim: null,
        dash,
        interact,
      };
    },
  };
}
