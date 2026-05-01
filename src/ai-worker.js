import { chooseAiAction } from "./engine/ai.js";

globalThis.onmessage = (event) => {
  const { id, state, color, options } = event.data ?? {};
  try {
    const action = chooseAiAction(state, color, options);
    globalThis.postMessage({ id, action });
  } catch (error) {
    globalThis.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
