import { GameController } from "./ui/controller.js";

function startChessTwo() {
  new GameController({
    boardEl: document.querySelector("#game-board"),
    coordinateEl: document.querySelector("#file-coordinates"),
    statusPanelEl: document.querySelector("#status-panel"),
    promotionEl: document.querySelector("#promotion-panel"),
    controlsEl: document.querySelector("#turn-controls"),
    settingsEl: document.querySelector("#settings-panel"),
    rulesEl: document.querySelector("#rules-panel"),
    devPanelEl: document.querySelector("#developer-panel"),
    capturedTopEl: document.querySelector("#captured-top"),
    capturedBottomEl: document.querySelector("#captured-bottom"),
  });
  void revealBootedApp();
}

async function revealBootedApp() {
  await waitForInitialAssets();
  await nextFrame();
  document.body.classList.remove("app-booting");
  document.body.classList.add("app-ready");
}

async function waitForInitialAssets() {
  const container = document.querySelector("#game-container");
  const imagePromises = [...(container?.querySelectorAll("img") ?? [])].map(
    imageReady,
  );
  await Promise.allSettled(
    [document.fonts?.ready, ...imagePromises].filter(Boolean),
  );
}

function imageReady(image) {
  if (image.complete) return image.decode?.().catch(() => {}) ?? null;
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
  });
}

function nextFrame() {
  return new Promise((resolve) => {
    const reveal = () => {
      resolve();
    };
    globalThis.requestAnimationFrame?.(reveal) ?? reveal();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startChessTwo, { once: true });
} else {
  startChessTwo();
}
