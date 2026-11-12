import type { PlayerInput } from "../shared/sim";

const INTERACT_KEYS = new Set(["KeyE", "Space"]);
const USE_KEYS = ["KeyF", "ShiftLeft"];
const HANDLED_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
  ...INTERACT_KEYS,
  ...USE_KEYS,
]);

// Tracks held keys and hands the simulation one input sample per step.
export function createKeyboard(): { sample(): PlayerInput } {
  const down = new Set<string>();
  let interactQueued = false;

  window.addEventListener("keydown", (event) => {
    if (!HANDLED_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    down.add(event.code);
    if (INTERACT_KEYS.has(event.code)) interactQueued = true;
  });
  window.addEventListener("keyup", (event) => down.delete(event.code));
  window.addEventListener("blur", () => down.clear());

  const axis = (negative: string[], positive: string[]) =>
    Number(positive.some((code) => down.has(code))) - Number(negative.some((code) => down.has(code)));

  return {
    sample() {
      const interact = interactQueued;
      interactQueued = false;
      return {
        moveX: axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]),
        moveZ: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]),
        use: USE_KEYS.some((code) => down.has(code)),
        interact,
      };
    },
  };
}
