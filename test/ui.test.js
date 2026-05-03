import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  COLORS,
  FILES,
  PIECE_TYPES,
  applyAction,
  createEmptyState,
  createGameState,
  createPiece,
  generatePieceActions,
  generateLegalActions,
  placePiece,
} from "../src/engine/index.js";
import { GameController } from "../src/ui/controller.js";
import { Renderer, emptyHighlights } from "../src/ui/renderer.js";
import {
  ANIMATION_TIMING,
  BoardAnimator,
  moveAnimationDurationForAction,
} from "../src/ui/animation.js";
import {
  aiLabelForLevel,
  aiOptionsForLevel,
  loadSettings,
  saveSettings,
} from "../src/ui/settings.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.checked = false;
    this.parent = null;
    this.listeners = {};
    this.style = {};
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.classList = {
      add: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const className of classes) current.add(className);
        this.className = [...current].join(" ");
      },
      remove: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const className of classes) current.delete(className);
        this.className = [...current].join(" ");
      },
      toggle: (className, force) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force ?? !current.has(className);
        if (shouldAdd) current.add(className);
        else current.delete(className);
        this.className = [...current].join(" ");
        return shouldAdd;
      },
    };
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    this.scrollHeight = this.children.length * 20;
    return child;
  }

  contains(candidate) {
    let node = candidate;
    while (node) {
      if (node === this) return true;
      node = node.parent;
    }
    return false;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === "id") this.id = value;
  }

  querySelector(selector) {
    if (selector === "#action-history ol")
      return findByTag(findById(this, "action-history"), "ol");
    if (selector.startsWith("#")) return findById(this, selector.slice(1));
    if (selector.startsWith('[data-control="'))
      return findByDataset(this, "control", selector.slice(15, -2));
    if (selector.startsWith('[data-side="'))
      return findByDataset(this, "side", selector.slice(12, -2));
    if (selector.startsWith("[data-piece-id]"))
      return findByDatasetKey(this, "pieceId");
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    collectMatches(this, selector, matches);
    return matches;
  }

  addEventListener(type, handler) {
    this.listeners[type] = [...(this.listeners[type] ?? []), handler];
  }

  dispatchEvent(event) {
    for (const handler of this.listeners[event.type] ?? []) handler(event);
  }

  get innerHTML() {
    return "";
  }

  set innerHTML(value) {
    this.children = [];
    this.textContent = value;
    this.scrollHeight = 0;
  }
}

function findById(root, id) {
  if (root.id === id) return root;
  for (const child of root.children) {
    const result = findById(child, id);
    if (result) return result;
  }
  return null;
}

function findByDataset(root, key, value) {
  if (root.dataset?.[key] === value) return root;
  for (const child of root.children) {
    const result = findByDataset(child, key, value);
    if (result) return result;
  }
  return null;
}

function findByDatasetKey(root, key) {
  if (root.dataset?.[key]) return root;
  for (const child of root.children) {
    const result = findByDatasetKey(child, key);
    if (result) return result;
  }
  return null;
}

function findByTag(root, tagName) {
  if (!root) return null;
  if (root.tagName === tagName) return root;
  for (const child of root.children) {
    const result = findByTag(child, tagName);
    if (result) return result;
  }
  return null;
}

function collectMatches(root, selector, matches) {
  if (selector === "[data-piece-id]" && root.dataset?.pieceId)
    matches.push(root);
  if (selector === "[data-side]" && root.dataset?.side) matches.push(root);
  for (const child of root.children) collectMatches(child, selector, matches);
}

function makeStatusPanel() {
  const panel = new FakeElement("div");
  for (const id of [
    "player-turn",
    "standard-move-status",
    "special-move-status",
    "phase-info",
    "move-number",
    "ai-level-label",
  ]) {
    const child = new FakeElement("span");
    child.setAttribute("id", id);
    panel.appendChild(child);
  }
  const actionHistory = new FakeElement("div");
  actionHistory.setAttribute("id", "action-history");
  const list = new FakeElement("ol");
  actionHistory.appendChild(list);
  panel.appendChild(actionHistory);
  return panel;
}

function makeControls() {
  const controls = new FakeElement("div");
  const settings = new FakeElement("button");
  settings.dataset.control = "settings";
  controls.appendChild(settings);
  const rules = new FakeElement("button");
  rules.dataset.control = "rules";
  controls.appendChild(rules);
  const skip = new FakeElement("button");
  skip.dataset.control = "skip-special";
  controls.appendChild(skip);
  const undo = new FakeElement("button");
  undo.dataset.control = "undo-turn";
  controls.appendChild(undo);
  return controls;
}

function makeRulesPanel() {
  const panel = new FakeElement("div");
  panel.setAttribute("id", "rules-panel");
  return panel;
}

function makeSettingsPanel() {
  const panel = new FakeElement("div");
  const aiLabel = new FakeElement("span");
  aiLabel.setAttribute("id", "ai-setting-label");
  panel.appendChild(aiLabel);
  const ai = new FakeElement("input");
  ai.setAttribute("id", "ai-level");
  panel.appendChild(ai);
  const whiteSide = new FakeElement("button");
  whiteSide.dataset.side = "white";
  panel.appendChild(whiteSide);
  const blackSide = new FakeElement("button");
  blackSide.dataset.side = "black";
  panel.appendChild(blackSide);
  const lockNote = new FakeElement("p");
  lockNote.setAttribute("id", "side-lock-note");
  panel.appendChild(lockNote);
  const animations = new FakeElement("input");
  animations.setAttribute("id", "animations-enabled");
  panel.appendChild(animations);
  const newGame = new FakeElement("button");
  newGame.dataset.control = "new-game";
  panel.appendChild(newGame);
  return panel;
}

test("renderer paints a 10x10 board and status without browser dependencies", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const board = new FakeElement("div");
  const coordinates = new FakeElement("div");
  const status = makeStatusPanel();
  const promotion = new FakeElement("div");
  const controls = makeControls();
  const settings = makeSettingsPanel();
  const renderer = new Renderer({
    boardEl: board,
    coordinateEl: coordinates,
    statusPanelEl: status,
    promotionEl: promotion,
    controlsEl: controls,
    settingsEl: settings,
    rulesEl: makeRulesPanel(),
  });
  renderer.render(createGameState(), {});

  expect(board.children).toHaveLength(100);
  expect(coordinates.children).toHaveLength(10);
  expect(coordinates.children.map((child) => child.textContent).join("")).toBe(
    FILES,
  );
  expect(status.querySelector("#player-turn").textContent).toBe("White");
  expect(status.querySelector("#special-move-status").textContent).toBe(
    "Unavailable",
  );
  expect(board.children[0].children[0].children[0].src).toBe(
    "assets/pieces/wbD.webp",
  );
  expect(board.children[5].children[0].children[0].src).toBe(
    "assets/pieces/bK.webp",
  );
  expect(board.children[90].children[0].children[0].src).toBe(
    "assets/pieces/wbL.webp",
  );
  expect(board.children[90].children[0].children[1].hidden).toBe(true);
  expect(controls.querySelector('[data-control="skip-special"]').hidden).toBe(
    true,
  );
  expect(controls.querySelector('[data-control="undo-turn"]').disabled).toBe(
    true,
  );
  expect(promotion.hidden).toBe(true);

  globalThis.document = previousDocument;
});

test("renderer places captured pieces above and below the right panel by board side", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  state.capturedPieces = [
    {
      id: "captured-black-queen",
      type: PIECE_TYPES.QUEEN,
      color: COLORS.BLACK,
      owner: COLORS.BLACK,
      moveNumber: 4,
    },
    {
      id: "captured-white-pawn",
      type: PIECE_TYPES.PAWN,
      color: COLORS.WHITE,
      owner: COLORS.WHITE,
      moveNumber: 5,
    },
  ];
  const top = new FakeElement("div");
  const bottom = new FakeElement("div");
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
    capturedTopEl: top,
    capturedBottomEl: bottom,
  });

  renderer.render(state, { boardSide: COLORS.WHITE });
  expect(top.dataset.side).toBe(COLORS.BLACK);
  expect(bottom.dataset.side).toBe(COLORS.WHITE);
  expect(top.children[1].children[0].dataset.pieceId).toBe(
    "captured-black-queen",
  );
  expect(bottom.children[1].children[0].dataset.pieceId).toBe(
    "captured-white-pawn",
  );

  renderer.render(state, { boardSide: COLORS.BLACK });
  expect(top.dataset.side).toBe(COLORS.WHITE);
  expect(bottom.dataset.side).toBe(COLORS.BLACK);
  expect(top.children[1].children[0].dataset.pieceId).toBe(
    "captured-white-pawn",
  );
  expect(bottom.children[1].children[0].dataset.pieceId).toBe(
    "captured-black-queen",
  );

  globalThis.document = previousDocument;
});

test("portrait captured trays anchor beside the panel and grow vertically", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

  expect(css).toContain(
    "@media screen and (max-width: 1024px) and (orientation: portrait)",
  );
  expect(css).toContain("  #captured-top,\n  #captured-bottom {\n    top: 0;");
  expect(css).toContain("    bottom: auto;\n  }");
  expect(css).toContain("    height: auto;");
  expect(css).toContain("    grid-auto-rows: auto;");
  expect(css).toContain("    width: 100%;\n    gap: 0;");
  expect(css).toContain("    align-items: center;");
});

test("renderer exposes promotion choices when promotion actions are pending", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  const promotionActions = generateLegalActions(state).slice(0, 0);
  promotionActions.push({ promotionType: "Queen" }, { promotionType: "Rook" });

  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(state, { promotionActions });

  expect(renderer.promotionEl.hidden).toBe(false);
  expect(renderer.promotionEl.className).toBe("promotion-dialog");
  expect(renderer.promotionEl.attributes.role).toBe("dialog");
  expect(renderer.promotionEl.children[1].children).toHaveLength(2);

  globalThis.document = previousDocument;
});

test("renderer shows the full action history with player markers", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  state.actionHistory = [
    {
      kind: "move",
      mode: "pawnAdvance",
      pieceType: "Pawn",
      color: "white",
      from: { r: 8, c: 0 },
      to: { r: 7, c: 0 },
    },
    {
      kind: "move",
      mode: "pawnAdvance",
      pieceType: "Pawn",
      color: "black",
      from: { r: 1, c: 8 },
      to: { r: 3, c: 8 },
    },
    {
      kind: "skip",
      mode: "skipSpecial",
      color: "black",
    },
    {
      kind: "attack",
      mode: "enPassant",
      pieceType: "Pawn",
      color: "black",
      target: { color: "white", type: "Pawn", hadShield: true },
      from: { r: 4, c: 3 },
      to: { r: 5, c: 4 },
      staging: { r: 4, c: 3 },
      deathStaging: true,
    },
  ];

  const status = makeStatusPanel();
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: status,
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(state, {});

  const history = status.querySelector("#action-history ol");
  expect(history.children).toHaveLength(4);
  expect(history.children[0].dataset.actionColor).toBe("white");
  expect(history.children[0].textContent).toContain("Pawn a2-a3");
  expect(history.children[1].dataset.actionColor).toBe("black");
  expect(history.children[1].className).toContain("player-break");
  expect(history.children[1].textContent).toContain("Pawn j9-j7");
  expect(history.children[2].textContent).toContain("Skipped Life/Death");
  expect(history.children[3].textContent).toContain(
    "Pawn breaks shield on white Pawn e5, attacker dies on Death",
  );
  expect(history.children[3].textContent).not.toContain("rests");
  expect(history.scrollTop).toBe(history.scrollHeight);

  globalThis.document = previousDocument;
});

test("renderer preserves action history scroll when history has not changed", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  state.actionHistory = [
    {
      kind: "move",
      mode: "pawnAdvance",
      pieceType: "Pawn",
      color: "white",
      from: { r: 8, c: 0 },
      to: { r: 7, c: 0 },
    },
  ];

  const status = makeStatusPanel();
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: status,
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(state, {});

  const history = status.querySelector("#action-history ol");
  history.scrollTop = 7;
  renderer.render(state, { settingsOpen: true });

  expect(history.children).toHaveLength(1);
  expect(history.scrollTop).toBe(7);

  state.actionHistory = [
    ...state.actionHistory,
    {
      kind: "skip",
      mode: "skipSpecial",
      color: "white",
    },
  ];
  renderer.render(state, {});
  expect(history.children).toHaveLength(2);
  expect(history.scrollTop).toBe(history.scrollHeight);

  globalThis.document = previousDocument;
});

test("renderer shows action history fade only when newer actions are hidden below", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  state.actionHistory = [
    {
      kind: "move",
      mode: "pawnAdvance",
      pieceType: "Pawn",
      color: "white",
      from: { r: 8, c: 0 },
      to: { r: 7, c: 0 },
    },
    {
      kind: "move",
      mode: "pawnAdvance",
      pieceType: "Pawn",
      color: "black",
      from: { r: 1, c: 9 },
      to: { r: 2, c: 9 },
    },
    { kind: "skip", mode: "skipSpecial", color: "black" },
  ];

  const status = makeStatusPanel();
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: status,
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(state, {});

  const history = status.querySelector("#action-history ol");
  const container = findById(status, "action-history");
  history.clientHeight = 20;
  history.scrollTop = 0;
  history.dispatchEvent({ type: "scroll" });
  expect(container.className).toContain("has-hidden-actions-below");

  history.scrollTop = history.scrollHeight;
  history.dispatchEvent({ type: "scroll" });
  expect(container.className).not.toContain("has-hidden-actions-below");

  globalThis.document = previousDocument;
});

test("renderer flashes the player badge only when the turn reaches the player side", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  const status = makeStatusPanel();
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: status,
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  renderer.render(state, { boardSide: COLORS.WHITE });
  expect(status.querySelector("#player-turn").className).not.toContain(
    "turn-start-flash",
  );
  state.currentPlayer = COLORS.BLACK;
  renderer.render(state, { boardSide: COLORS.WHITE });
  expect(status.querySelector("#player-turn").className).not.toContain(
    "turn-start-flash",
  );
  state.currentPlayer = COLORS.WHITE;
  renderer.render(state, { boardSide: COLORS.WHITE });
  expect(status.querySelector("#player-turn").className).toContain(
    "turn-start-flash",
  );

  globalThis.document = previousDocument;
});

test("renderer can hold the visible turn during AI move resolution", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  state.currentPlayer = COLORS.WHITE;
  const heldState = createGameState();
  heldState.currentPlayer = COLORS.BLACK;
  const status = makeStatusPanel();
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: status,
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  renderer.render(state, {
    statusState: heldState,
    isAiAnimating: true,
  });

  expect(status.querySelector("#player-turn").textContent).toBe("Black");
  expect(status.querySelector("#player-turn").className).toContain("black");
  expect(status.querySelector("#phase-info").textContent).toBe(
    "Black AI is finishing its move...",
  );

  globalThis.document = previousDocument;
});

test("renderer distinguishes knight ramp highlights from ordinary moves", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const board = new FakeElement("div");
  const highlights = emptyHighlights();
  highlights.moves.add("5,5");
  highlights.rampMoves.add("5,7");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(createGameState(), { highlights });

  expect(board.children[55].children[0].className).toContain("valid-move");
  expect(board.children[57].children[0].className).toContain("valid-ramp");
  expect(board.children[57].children[0].className).not.toContain("valid-move");

  globalThis.document = previousDocument;
});

test("renderer distinguishes Death-only move and ramp highlights from safe previews", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const board = new FakeElement("div");
  const highlights = emptyHighlights();
  highlights.moves.add("5,5");
  highlights.deathMoves.add("5,6");
  highlights.rampMoves.add("5,7");
  highlights.deathRampMoves.add("5,8");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(createGameState(), { highlights });

  expect(board.children[55].children[0].className).toContain("valid-move");
  expect(board.children[56].children[0].className).toContain(
    "valid-death-move",
  );
  expect(board.children[57].children[0].className).toContain("valid-ramp");
  expect(board.children[58].children[0].className).toContain(
    "valid-death-ramp",
  );
  expect(board.children[56].children[0].className).not.toContain("valid-move");
  expect(board.children[58].children[0].className).not.toContain("valid-ramp");

  globalThis.document = previousDocument;
});

test("renderer marks Life and Death special previews distinctly", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const board = new FakeElement("div");
  const highlights = emptyHighlights();
  highlights.specials.add("4,4");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  renderer.render(createGameState(), {
    highlights,
    selectedPiece: { id: "life", type: PIECE_TYPES.LIFE, row: 5, col: 5 },
  });
  expect(board.children[44].children[0].className).toContain(
    "valid-life-special",
  );

  renderer.render(createGameState(), {
    highlights,
    selectedPiece: { id: "death", type: PIECE_TYPES.DEATH, row: 5, col: 5 },
  });
  expect(board.children[44].children[0].className).toContain(
    "valid-death-special",
  );

  globalThis.document = previousDocument;
});

test("renderer preserves identical board DOM on status-only renders", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const board = new FakeElement("div");
  const state = createGameState();
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  renderer.render(state, {});
  const firstSquare = board.children[0];
  const firstPiece = firstSquare.children[0];
  renderer.render(state, { isAiThinking: true });

  expect(board.children[0]).toBe(firstSquare);
  expect(board.children[0].children[0]).toBe(firstPiece);

  globalThis.document = previousDocument;
});

test("renderer dims the selected origin during rest choice unless it is restable", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createEmptyState(COLORS.WHITE);
  const rook = placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 1, { id: "rook" }),
  );
  const board = new FakeElement("div");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  const highlights = emptyHighlights();
  highlights.resting.add("5,4");
  renderer.render(state, { selectedPiece: rook, phase: "resting", highlights });
  expect(board.children[51].children[1].className).toContain("selected-muted");
  expect(board.children[51].children[1].className).not.toContain(
    "valid-resting",
  );

  const restableHighlights = emptyHighlights();
  restableHighlights.resting.add("5,1");
  renderer.render(state, {
    selectedPiece: rook,
    phase: "resting",
    highlights: restableHighlights,
  });
  expect(board.children[51].children[1].className).toContain("selected");
  expect(board.children[51].children[1].className).toContain("valid-resting");
  expect(board.children[51].children[1].className).not.toContain(
    "selected-muted",
  );

  globalThis.document = previousDocument;
});

test("controller auto-selects one Knight ramp route when a destination has multiple double-jump paths", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 6, { id: "upper-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 8, { id: "upper-ramp-b" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 6, { id: "lower-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 8, { id: "lower-ramp-b" }),
  );
  controller.selectPiece(knight);

  const previousRandom = Math.random;
  Math.random = () => 0.99;
  try {
    controller.handleBoardClick({
      target: {
        closest: () => ({ dataset: { row: "5", col: "9" } }),
      },
    });
  } finally {
    Math.random = previousRandom;
  }

  expect(controller.state.board[5][9]?.id).toBe("knight");
  expect(controller.view.phase).toBe("select");
  expect(controller.state.lastAction.rampSequence[0].land).toEqual({
    r: 7,
    c: 7,
  });
  controller.settings.animationsEnabled = true;
  expect(controller.animationDelay(controller.state.lastAction)).toBe(
    ANIMATION_TIMING.doubleRampHopDurationMs * 2 + 60,
  );

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller marks ordinary move destinations after Death pass-through as grey previews", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const board = new FakeElement("div");
  const controller = new GameController({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const rook = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 0, { id: "rook" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 5, 2, { id: "death" }),
  );
  controller.selectPiece(rook);

  expect(board.children[51].children[0].className).toContain("valid-move");
  expect(board.children[51].children[0].className).not.toContain(
    "valid-death-move",
  );
  expect(board.children[52].children[1].className).toContain(
    "valid-death-move",
  );
  expect(board.children[53].children[0].className).toContain(
    "valid-death-move",
  );

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller keeps a Knight destination green when any route avoids Death", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const board = new FakeElement("div");
  const controller = new GameController({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 4, 6, { id: "death-ramp" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 5, { id: "safe-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 3, 6, { id: "safe-ramp-b" }),
  );
  controller.selectPiece(knight);

  expect(board.children[37].children[0].className).toContain("valid-ramp");
  expect(board.children[37].children[0].className).not.toContain(
    "valid-death-ramp",
  );

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller marks Knight destinations grey when every route crosses Death", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const board = new FakeElement("div");
  const controller = new GameController({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 4, 6, { id: "death-ramp" }),
  );
  controller.selectPiece(knight);

  expect(board.children[37].children[0].className).toContain(
    "valid-death-ramp",
  );
  expect(board.children[37].children[0].className).not.toContain("valid-ramp");

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller prefers Knight ramp routes that avoid Death ramps", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 4, 6, { id: "death-ramp" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 8, { id: "upper-ramp-b" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 6, { id: "lower-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 8, { id: "lower-ramp-b" }),
  );
  controller.selectPiece(knight);

  const previousRandom = Math.random;
  Math.random = () => 0;
  try {
    controller.handleBoardClick({
      target: {
        closest: () => ({ dataset: { row: "5", col: "9" } }),
      },
    });
  } finally {
    Math.random = previousRandom;
  }

  expect(controller.state.board[5][9]?.id).toBe("knight");
  expect(controller.state.lastAction.rampSequence[0].land).toEqual({
    r: 7,
    c: 7,
  });
  expect(
    controller.state.lastAction.path.some(
      (square) => square.r === 4 && square.c === 6,
    ),
  ).toBe(false);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller prefers a longer Knight ramp route over a shorter Death ramp", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 4, 6, { id: "death-ramp" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 5, { id: "safe-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 3, 6, { id: "safe-ramp-b" }),
  );
  controller.selectPiece(knight);

  controller.handleBoardClick({
    target: {
      closest: () => ({ dataset: { row: "3", col: "7" } }),
    },
  });

  expect(controller.state.board[3][7]?.id).toBe("knight");
  expect(controller.state.lastAction.rampSequence).toHaveLength(2);
  expect(
    controller.state.lastAction.path.some(
      (square) => square.r === 4 && square.c === 6,
    ),
  ).toBe(false);
  expect(controller.state.lastAction.path).toEqual([
    { r: 4, c: 5 },
    { r: 3, c: 6 },
  ]);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller prefers Knight ramp routes with Life ramps when no Death route is involved", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, {
      id: "knight",
      hasShield: false,
    }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 4, 5, { id: "life-ramp" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 2, 5, { id: "upper-ramp-b" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 4, { id: "neutral-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 2, 4, { id: "neutral-ramp-b" }),
  );
  controller.selectPiece(knight);

  const previousRandom = Math.random;
  Math.random = () => 0.99;
  try {
    controller.handleBoardClick({
      target: {
        closest: () => ({ dataset: { row: "1", col: "5" } }),
      },
    });
  } finally {
    Math.random = previousRandom;
  }

  expect(controller.state.board[1][5]?.id).toBe("knight");
  expect(controller.state.board[1][5].hasShield).toBe(true);
  expect(controller.state.lastAction.rampSequence[0].land).toEqual({
    r: 3,
    c: 5,
  });
  expect(
    controller.state.lastAction.path.some(
      (square) => square.r === 4 && square.c === 5,
    ),
  ).toBe(true);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller prefers a shorter Life ramp over a longer neutral Knight ramp route", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, {
      id: "knight",
      hasShield: false,
    }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 4, 6, { id: "life-ramp" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 5, { id: "neutral-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 3, 6, { id: "neutral-ramp-b" }),
  );
  controller.selectPiece(knight);

  controller.handleBoardClick({
    target: {
      closest: () => ({ dataset: { row: "3", col: "7" } }),
    },
  });

  expect(controller.state.board[3][7]?.id).toBe("knight");
  expect(controller.state.board[3][7].hasShield).toBe(true);
  expect(controller.state.lastAction.rampSequence).toHaveLength(1);
  expect(controller.state.lastAction.path).toEqual([{ r: 4, c: 6 }]);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller prefers a one-hop Knight ramp over a longer route to the same square", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 6, { id: "single-ramp" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 5, { id: "double-ramp-a" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 6, { id: "double-ramp-b" }),
  );
  controller.selectPiece(knight);

  controller.handleBoardClick({
    target: {
      closest: () => ({ dataset: { row: "5", col: "7" } }),
    },
  });

  expect(controller.state.board[5][7]?.id).toBe("knight");
  expect(controller.state.lastAction.rampSequence).toHaveLength(1);
  expect(controller.state.lastAction.rampSequence[0].land).toEqual({
    r: 5,
    c: 7,
  });
  controller.settings.animationsEnabled = true;
  expect(controller.animationDelay(controller.state.lastAction)).toBe(
    ANIMATION_TIMING.doubleRampHopDurationMs + 60,
  );

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller commits shieldless Knight attacks without asking for staging", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  const knight = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 8, 2, { id: "knight" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 6, 3, {
      id: "target",
      hasShield: false,
    }),
  );
  controller.selectPiece(knight);

  controller.handleBoardClick({
    target: {
      closest: () => ({ dataset: { row: "6", col: "3" } }),
    },
  });

  expect(controller.view.phase).toBe("select");
  expect(controller.state.board[6][3]?.id).toBe("knight");
  expect(controller.state.lastAction.staging).toBe(undefined);
  expect(controller.state.lastAction.rest).toEqual({ r: 6, c: 3 });

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("board animator plays double Knight ramp as two chained hop animations without an intermediate pause", async () => {
  const animations = [];
  const squareEl = new FakeElement("button");
  const pieceEl = {
    dataset: { pieceId: "knight" },
    className: "piece white",
    classList: new FakeElement("span").classList,
    getBoundingClientRect: () => ({ left: 90, top: 50, width: 10, height: 10 }),
    closest: () => squareEl,
    animate: (keyframes, options) => {
      const animation = {
        keyframes,
        options,
        canceled: false,
        finished: Promise.resolve(),
        cancel() {
          this.canceled = true;
        },
      };
      animations.push(animation);
      return animation;
    },
  };
  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? [pieceEl] : [],
  });

  animator.animateMovement(
    {
      pieces: new Map([
        ["knight", { rect: { left: 50, top: 50, width: 10, height: 10 } }],
      ]),
      squares: new Map([
        ["3,7", { left: 70, top: 30, width: 10, height: 10 }],
        ["5,9", { left: 90, top: 50, width: 10, height: 10 }],
      ]),
    },
    {
      mode: "knightRamp",
      pieceId: "knight",
      rampSequence: [
        { ramp: { r: 4, c: 6 }, land: { r: 3, c: 7 } },
        { ramp: { r: 4, c: 8 }, land: { r: 5, c: 9 } },
      ],
    },
  );

  await Promise.resolve();

  expect(animations).toHaveLength(2);
  expect(animations.map((animation) => animation.options.duration)).toEqual([
    ANIMATION_TIMING.doubleRampHopDurationMs,
    ANIMATION_TIMING.doubleRampHopDurationMs,
  ]);
  expect(
    animations.every(
      (animation) => animation.options.easing === "cubic-bezier(.18,.82,.22,1)",
    ),
  ).toBe(true);
  expect(
    animations.every((animation) => animation.options.fill === "forwards"),
  ).toBe(true);
  expect(animations[0].keyframes.map((frame) => frame.offset)).toEqual([0, 1]);
  expect(animations[1].keyframes.map((frame) => frame.offset)).toEqual([0, 1]);
  expect(animations[0].keyframes[0].transform).toContain(
    "translate(-40px, 0px) scale(1.05)",
  );
  expect(animations[0].keyframes.at(-1).transform).toContain(
    "translate(-20px, -20px) scale(1.05)",
  );
  expect(animations[1].keyframes[0].transform).toContain(
    "translate(-20px, -20px) scale(1.05)",
  );
  expect(animations[1].keyframes.at(-1).transform).toContain(
    "translate(0px, 0px) scale(1)",
  );
});

test("board animator keeps a Knight shield until the Death ramp hop is reached", () => {
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  globalThis.clearTimeout = () => {};

  const squareEl = new FakeElement("button");
  const pieceEl = new FakeElement("span");
  pieceEl.dataset.pieceId = "knight";
  pieceEl.className = "piece white";
  pieceEl.getBoundingClientRect = () => ({
    left: 90,
    top: 50,
    width: 10,
    height: 10,
  });
  pieceEl.closest = () => squareEl;
  pieceEl.animate = () => ({
    finished: new Promise(() => {}),
    cancel() {},
  });

  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? [pieceEl] : [],
    querySelector: () => null,
  });

  animator.animateMovement(
    {
      pieces: new Map([
        [
          "knight",
          {
            rect: { left: 50, top: 50, width: 10, height: 10 },
            className: "piece white has-shield",
          },
        ],
      ]),
      squares: new Map([
        ["3,7", { left: 70, top: 30, width: 10, height: 10 }],
        ["5,9", { left: 90, top: 50, width: 10, height: 10 }],
      ]),
      squarePieces: new Map([
        ["4,6", { className: "piece black" }],
        ["4,8", { className: "piece death-piece" }],
      ]),
    },
    {
      mode: "knightRamp",
      pieceId: "knight",
      path: [
        { r: 4, c: 6 },
        { r: 4, c: 8 },
      ],
      rampSequence: [
        { ramp: { r: 4, c: 6 }, land: { r: 3, c: 7 } },
        { ramp: { r: 4, c: 8 }, land: { r: 5, c: 9 } },
      ],
    },
  );

  expect(pieceEl.className).toContain("has-shield");
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBeGreaterThan(
    ANIMATION_TIMING.doubleRampHopDurationMs,
  );
  expect(timers[0].ms).toBeLessThan(
    ANIMATION_TIMING.doubleRampHopDurationMs + 140,
  );

  timers[0].fn();
  expect(pieceEl.className).not.toContain("has-shield");

  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
});

test("board animator delays Life pass-through shield gain until the Life square is crossed", () => {
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  globalThis.clearTimeout = () => {};

  const squareEl = new FakeElement("button");
  const pieceEl = new FakeElement("span");
  pieceEl.dataset.pieceId = "rook";
  pieceEl.className = "piece white has-shield";
  pieceEl.getBoundingClientRect = () => ({
    left: 90,
    top: 50,
    width: 10,
    height: 10,
  });
  pieceEl.closest = () => squareEl;
  pieceEl.animate = () => ({
    finished: new Promise(() => {}),
    cancel() {},
  });

  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? [pieceEl] : [],
    querySelector: () => null,
  });

  animator.animateMovement(
    {
      pieces: new Map([
        [
          "rook",
          {
            rect: { left: 50, top: 50, width: 10, height: 10 },
            className: "piece white",
          },
        ],
      ]),
      squares: new Map(),
      squarePieces: new Map([["5,2", { className: "piece life-piece" }]]),
    },
    {
      mode: "slide",
      pieceId: "rook",
      path: [{ r: 5, c: 2 }],
    },
  );

  expect(pieceEl.className).not.toContain("has-shield");
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBeLessThan(160);
  timers[0].fn();
  expect(pieceEl.className).toContain("has-shield");

  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
});

test("board animator never shows a temporary Life shield on Queens", () => {
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  globalThis.clearTimeout = () => {};

  const squareEl = new FakeElement("button");
  const pieceEl = new FakeElement("span");
  pieceEl.dataset.pieceId = "queen";
  pieceEl.className = "piece white";
  pieceEl.getBoundingClientRect = () => ({
    left: 90,
    top: 50,
    width: 10,
    height: 10,
  });
  pieceEl.closest = () => squareEl;
  pieceEl.animate = () => ({
    finished: new Promise(() => {}),
    cancel() {},
  });

  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? [pieceEl] : [],
    querySelector: () => null,
  });

  animator.animateMovement(
    {
      pieces: new Map([
        [
          "queen",
          {
            rect: { left: 50, top: 50, width: 10, height: 10 },
            className: "piece white",
          },
        ],
      ]),
      squares: new Map(),
      squarePieces: new Map([["5,2", { className: "piece life-piece" }]]),
    },
    {
      mode: "slide",
      pieceId: "queen",
      pieceType: PIECE_TYPES.QUEEN,
      path: [{ r: 5, c: 2 }],
    },
  );

  expect(timers).toHaveLength(0);
  expect(pieceEl.className).not.toContain("has-shield");

  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
});

test("board animator times normal Death pass-through near the visual crossing point", () => {
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  globalThis.clearTimeout = () => {};

  const squareEl = new FakeElement("button");
  const pieceEl = new FakeElement("span");
  pieceEl.dataset.pieceId = "rook";
  pieceEl.className = "piece white";
  pieceEl.getBoundingClientRect = () => ({
    left: 90,
    top: 50,
    width: 10,
    height: 10,
  });
  pieceEl.closest = () => squareEl;
  pieceEl.animate = () => ({
    finished: new Promise(() => {}),
    cancel() {},
  });

  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? [pieceEl] : [],
    querySelector: () => null,
  });

  animator.animateMovement(
    {
      pieces: new Map([
        [
          "rook",
          {
            rect: { left: 50, top: 50, width: 10, height: 10 },
            className: "piece white has-shield",
          },
        ],
      ]),
      squares: new Map(),
      squarePieces: new Map([["5,2", { className: "piece death-piece" }]]),
    },
    {
      mode: "slide",
      pieceId: "rook",
      path: [{ r: 5, c: 2 }],
    },
  );

  expect(pieceEl.className).toContain("has-shield");
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBeLessThan(160);
  timers[0].fn();
  expect(pieceEl.className).not.toContain("has-shield");

  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
});

test("board animator applies new intimidation visuals when the moving checker lands", () => {
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => {
    const timer = { fn, ms, cleared: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    if (timer) timer.cleared = true;
  };
  const pulses = [];
  const pieceEl = new FakeElement("span");
  pieceEl.dataset.pieceId = "rook";
  pieceEl.className = "piece white is-intimidated intimidation-framed";
  pieceEl.getBoundingClientRect = () => ({
    left: 90,
    top: 50,
    width: 10,
    height: 10,
  });
  pieceEl.closest = () => new FakeElement("button");
  pieceEl.animate = () => ({ finished: new Promise(() => {}) });

  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? [pieceEl] : [],
    querySelector: () => null,
  });
  animator.pulseSquare = (square, className) =>
    pulses.push({ square, className });

  animator.animateMovement(
    {
      pieces: new Map([
        [
          "rook",
          {
            rect: { left: 50, top: 50, width: 10, height: 10 },
            className: "piece white has-shield",
          },
        ],
      ]),
      squares: new Map(),
      squarePieces: new Map(),
    },
    {
      mode: "slide",
      pieceId: "rook",
      pieceType: PIECE_TYPES.ROOK,
      to: { r: 5, c: 4 },
      path: [],
    },
  );

  expect(pieceEl.className).not.toContain("is-intimidated");
  expect(pieceEl.className).toContain("has-shield");
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBeGreaterThan(180);
  expect(timers[0].ms).toBeLessThan(280);

  timers[0].fn();
  expect(pieceEl.className).toContain("is-intimidated");
  expect(pieceEl.className).toContain("intimidation-framed");
  expect(pieceEl.className).toContain("is-moving");
  expect(pieceEl.className).not.toContain("has-shield");
  expect(pulses).toEqual([
    { square: { r: 5, c: 4 }, className: "intimidation-glow" },
  ]);

  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
});

test("board animator moves a Death-destroyed shieldless piece to the Death square before fading it", () => {
  const previousDocument = globalThis.document;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  let captured = null;
  globalThis.document = {
    createElement: (tagName) => {
      const element = new FakeElement(tagName);
      element.style = {};
      element.remove = () => {};
      element.animate = (keyframes, options) => {
        captured = { keyframes, options };
        return { finished: new Promise(() => {}) };
      };
      return element;
    },
  };
  globalThis.setTimeout = (fn, ms) => ({ fn, ms });
  globalThis.clearTimeout = () => {};

  const board = new FakeElement("div");
  board.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  board.querySelectorAll = () => [];
  board.querySelector = () => null;
  const animator = new BoardAnimator(board);

  animator.animateRemovedPieces(
    {
      pieces: new Map([
        [
          "rook",
          {
            rect: { left: 0, top: 0, width: 10, height: 10 },
            className: "piece white",
            textContent: "R",
            square: { r: 5, c: 0 },
          },
        ],
      ]),
      squares: new Map([
        ["5,2", { left: 20, top: 0, width: 10, height: 10 }],
        ["5,4", { left: 40, top: 0, width: 10, height: 10 }],
      ]),
      squarePieces: new Map([["5,2", { className: "piece death-piece" }]]),
    },
    {
      kind: "move",
      mode: "slide",
      pieceId: "rook",
      pieceType: PIECE_TYPES.ROOK,
      path: [{ r: 5, c: 2 }],
      to: { r: 5, c: 4 },
    },
  );

  expect(board.children).toHaveLength(1);
  expect(captured.options.duration).toBe(ANIMATION_TIMING.moveDurationMs);
  expect(captured.keyframes[1].transform).toContain("translate(20px, 0px)");
  expect(captured.keyframes.at(-1).transform).toContain("translate(20px, 0px)");
  expect(captured.keyframes.at(-1).opacity).toBe(0);

  globalThis.document = previousDocument;
  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
});

test("Knight ramp timing is 600ms per hop", () => {
  const action = {
    mode: "knightRamp",
    rampSequence: [{ ramp: { r: 5, c: 6 }, land: { r: 5, c: 7 } }],
  };
  const doubleAction = {
    mode: "knightRamp",
    rampSequence: [
      { ramp: { r: 5, c: 6 }, land: { r: 5, c: 7 } },
      { ramp: { r: 5, c: 8 }, land: { r: 5, c: 9 } },
    ],
  };

  expect(moveAnimationDurationForAction(action)).toBe(
    ANIMATION_TIMING.doubleRampHopDurationMs,
  );
  expect(moveAnimationDurationForAction(doubleAction)).toBe(
    ANIMATION_TIMING.doubleRampHopDurationMs * 2,
  );
});

test("single Knight ramp keeps the ramp hop easing", () => {
  const animated = {};
  const squareEl = new FakeElement("button");
  const pieceEl = {
    dataset: { pieceId: "knight" },
    className: "piece white",
    classList: new FakeElement("span").classList,
    getBoundingClientRect: () => ({ left: 70, top: 50, width: 10, height: 10 }),
    closest: () => squareEl,
    animate: (keyframes, options) => {
      animated.options = options;
      return { finished: Promise.resolve() };
    },
  };
  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? [pieceEl] : [],
  });

  animator.animateMovement(
    {
      pieces: new Map([
        ["knight", { rect: { left: 50, top: 50, width: 10, height: 10 } }],
      ]),
      squares: new Map([["5,7", { left: 70, top: 50, width: 10, height: 10 }]]),
    },
    {
      mode: "knightRamp",
      pieceId: "knight",
      rampSequence: [{ ramp: { r: 5, c: 6 }, land: { r: 5, c: 7 } }],
    },
  );

  expect(animated.options.duration).toBe(
    ANIMATION_TIMING.doubleRampHopDurationMs,
  );
  expect(animated.options.easing).toBe("cubic-bezier(.18,.82,.22,1)");
});

test("board animator uses board-level castling ghosts above board squares", () => {
  const previousDocument = globalThis.document;
  const appended = [];
  const animations = [];
  globalThis.document = {
    createElement: (tagName) => {
      const element = new FakeElement(tagName);
      element.animate = (keyframes, options) => {
        animations.push({ element, keyframes, options });
        return { finished: new Promise(() => {}) };
      };
      element.remove = () => {
        element.removed = true;
      };
      return element;
    },
  };

  const kingSquare = new FakeElement("button");
  const rookSquare = new FakeElement("button");
  const kingClassList = new FakeElement("span").classList;
  const rookClassList = new FakeElement("span").classList;
  const pieces = [
    {
      dataset: { pieceId: "king" },
      className: "piece black",
      classList: kingClassList,
      style: {},
      getBoundingClientRect: () => ({
        left: 70,
        top: 90,
        width: 10,
        height: 10,
      }),
      closest: () => kingSquare,
      animate: () => ({ finished: new Promise(() => {}) }),
    },
    {
      dataset: { pieceId: "rook" },
      className: "piece black",
      classList: rookClassList,
      style: {},
      getBoundingClientRect: () => ({
        left: 60,
        top: 90,
        width: 10,
        height: 10,
      }),
      closest: () => rookSquare,
      animate: () => ({ finished: new Promise(() => {}) }),
    },
  ];
  const animator = new BoardAnimator({
    querySelectorAll: (selector) =>
      selector === "[data-piece-id]" ? pieces : [],
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100 }),
    appendChild: (element) => {
      appended.push(element);
      return element;
    },
  });

  animator.animateMovement(
    {
      pieces: new Map([
        [
          "king",
          {
            rect: { left: 50, top: 90, width: 10, height: 10 },
            className: "piece black",
          },
        ],
        [
          "rook",
          {
            rect: { left: 80, top: 90, width: 10, height: 10 },
            className: "piece black",
          },
        ],
      ]),
      squares: new Map(),
      squarePieces: new Map(),
    },
    {
      mode: "castle",
      pieceId: "king",
      rookId: "rook",
      to: { r: 9, c: 7 },
      rookTo: { r: 9, c: 6 },
    },
  );

  expect(appended).toHaveLength(2);
  expect(appended.every((element) => element.className.includes("castling-ghost"))).toBe(
    true,
  );
  expect(animations).toHaveLength(2);
  expect(pieces[0].style.visibility).toBe("hidden");
  expect(pieces[1].style.visibility).toBe("hidden");
  expect(kingSquare.style.zIndex).toBeUndefined();
  expect(rookSquare.style.zIndex).toBeUndefined();
  expect(animations[0].keyframes.at(-1).transform).toContain(
    "translate(20px, 0px)",
  );
  expect(animations[1].keyframes.at(-1).transform).toContain(
    "translate(-20px, 0px)",
  );

  globalThis.document = previousDocument;
});

test("board animator uses separate Life and Death move glow effects", () => {
  const previousDocument = globalThis.document;
  const appended = [];
  globalThis.document = {
    createElement: () => ({
      style: {},
      getAnimations: () => [],
      remove() {},
    }),
  };

  const square = {
    getBoundingClientRect: () => ({ left: 12, top: 18, width: 40, height: 40 }),
  };
  const board = {
    querySelector: () => square,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    appendChild: (element) => {
      appended.push(element);
      return element;
    },
  };
  const animator = new BoardAnimator(board);

  animator.animateEffects({
    mode: "lifeDeathMove",
    pieceType: PIECE_TYPES.LIFE,
    to: { r: 4, c: 3 },
  });
  animator.animateEffects({
    mode: "lifeDeathMove",
    pieceType: PIECE_TYPES.DEATH,
    to: { r: 5, c: 4 },
  });

  expect(appended[0].className).toBe("board-effect life-glow");
  expect(appended[1].className).toBe("board-effect death-move-glow");

  globalThis.document = previousDocument;
});

test("settings persist and AI slider maps to stronger search options", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };

  saveSettings(
    { aiLevel: 5, animationsEnabled: false, playerSide: "black" },
    storage,
  );
  expect(loadSettings(storage)).toEqual({
    aiLevel: 5,
    animationsEnabled: false,
    playerSide: "black",
  });
  saveSettings(
    { aiLevel: 0, animationsEnabled: true, playerSide: "white" },
    storage,
  );
  expect(loadSettings(storage).aiLevel).toBe(0);
  expect(aiLabelForLevel(0)).toBe("Off (self-play)");
  for (const level of [1, 2, 3, 4]) {
    expect(aiOptionsForLevel(level).maxDepth).toBe(level);
    expect(aiOptionsForLevel(level + 1).maxActions).toBeGreaterThanOrEqual(
      aiOptionsForLevel(level).maxActions,
    );
    expect(
      aiOptionsForLevel(level + 1).maxTacticalActions,
    ).toBeGreaterThanOrEqual(aiOptionsForLevel(level).maxTacticalActions);
  }
  expect(aiOptionsForLevel(5).maxDepth).toBe(8);
  expect(aiOptionsForLevel(5).maxDepth).toBeGreaterThan(
    aiOptionsForLevel(4).maxDepth,
  );
  expect(aiOptionsForLevel(5).quiescenceDepth).toBeGreaterThan(
    aiOptionsForLevel(1).quiescenceDepth,
  );
  expect(aiOptionsForLevel(5).tacticalWeight).toBeGreaterThan(
    aiOptionsForLevel(1).tacticalWeight,
  );
  expect(aiOptionsForLevel(4).timeLimitMs).toBe(1200);
  expect(aiOptionsForLevel(4).hardTimeLimitMs).toBe(2000);
  expect(aiOptionsForLevel(5).maxActions).toBe(54);
  expect(aiOptionsForLevel(5).maxTacticalActions).toBe(26);
  expect(aiOptionsForLevel(5).quiescenceDepth).toBe(4);
  expect(aiOptionsForLevel(5).timeLimitMs).toBe(3000);
  expect(aiOptionsForLevel(5).hardTimeLimitMs).toBe(4600);
  expect(aiOptionsForLevel(5).timeLimitMs).toBeGreaterThan(
    aiOptionsForLevel(4).timeLimitMs,
  );
  expect(aiOptionsForLevel(5).hardTimeLimitMs).toBeGreaterThan(
    aiOptionsForLevel(5).timeLimitMs,
  );
  expect(aiOptionsForLevel(5).thinkDelay).toBeLessThan(
    aiOptionsForLevel(1).thinkDelay,
  );
  expect(aiOptionsForLevel(4).thinkDelay).toBeLessThan(
    aiOptionsForLevel(2).thinkDelay,
  );
});

test("renderer locks side controls while AI is enabled and rotates board when AI is off", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  const board = new FakeElement("div");
  const coordinates = new FakeElement("div");
  const status = makeStatusPanel();
  const settings = makeSettingsPanel();
  const renderer = new Renderer({
    boardEl: board,
    coordinateEl: coordinates,
    statusPanelEl: status,
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: settings,
    rulesEl: makeRulesPanel(),
  });

  renderer.render(state, {
    settings: { aiLevel: 3, animationsEnabled: true, playerSide: "black" },
    settingsOpen: true,
    sideLocked: true,
    boardSide: "white",
    aiLabel: "Level 3",
  });
  expect(settings.querySelector('[data-side="white"]').disabled).toBe(true);
  expect(settings.querySelector('[data-side="black"]').disabled).toBe(true);
  expect(settings.querySelector("#side-lock-note").hidden).toBe(false);
  expect(settings.querySelector("#ai-setting-label").textContent).toBe(
    "Level 3",
  );
  expect(board.children[0].dataset).toEqual({ row: "0", col: "0" });
  expect(coordinates.children[0].textContent).toBe("a");

  renderer.render(state, {
    settings: { aiLevel: 0, animationsEnabled: true, playerSide: "black" },
    settingsOpen: true,
    sideLocked: false,
    boardSide: "black",
    aiLabel: "Off (self-play)",
  });
  expect(settings.querySelector('[data-side="black"]').disabled).toBe(false);
  expect(
    settings.querySelector('[data-side="black"]').attributes["aria-pressed"],
  ).toBe("true");
  expect(settings.querySelector("#side-lock-note").hidden).toBe(true);
  expect(settings.querySelector("#ai-setting-label").textContent).toBe(
    "Off (self-play)",
  );
  expect(board.children[0].dataset).toEqual({ row: "9", col: "9" });
  expect(coordinates.children[0].textContent).toBe("k");

  globalThis.document = previousDocument;
});

test("renderer marks Life and Death pieces with owner glow classes", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const board = new FakeElement("div");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(createGameState(), {});

  const blackDeath = board.children[0].children[0];
  const whiteLife = board.children[90].children[0];
  expect(blackDeath.dataset.owner).toBe("black");
  expect(blackDeath.className).toContain("owner-black");
  expect(whiteLife.dataset.owner).toBe("white");
  expect(whiteLife.className).toContain("owner-white");

  globalThis.document = previousDocument;
});

test("renderer flips original c-file Knights, d-file Bishops, and black-owned Life or Death", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  const cKnight = state.board[9][2];
  state.board[9][2] = null;
  cKnight.row = 5;
  cKnight.col = 5;
  state.board[5][5] = cKnight;

  const blackDeath = state.board[0][0];
  state.board[0][0] = null;
  blackDeath.row = 5;
  blackDeath.col = 4;
  state.board[5][4] = blackDeath;

  const board = new FakeElement("div");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(state, {});

  expect(board.children[2].children[0].className).toContain("is-flipped");
  expect(board.children[3].children[0].className).toContain("is-flipped");
  expect(board.children[7].children[0].className).not.toContain("is-flipped");
  expect(board.children[6].children[0].className).not.toContain("is-flipped");
  expect(board.children[55].children[0].className).toContain("is-flipped");
  expect(board.children[54].children[0].className).not.toContain("is-flipped");
  expect(board.children[90].children[0].className).not.toContain("is-flipped");

  globalThis.document = previousDocument;
});

test("renderer marks the winning king after checkmate", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createGameState();
  state.gameOver = { winner: "white", reason: "black king checkmated" };
  const board = new FakeElement("div");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(state, {});

  const whiteKing = board.children[95].children[0];
  const blackKing = board.children[5].children[0];
  expect(whiteKing.className).toContain("winning-king");
  expect(blackKing.className).not.toContain("winning-king");

  globalThis.document = previousDocument;
});

test("renderer frames only intimidation that suppressed a shield", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 1, {
      id: "shield-suppressed",
      hasShield: false,
      isIntimidated: true,
      intimidationSuppressedShield: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 5, 2, {
      id: "bare-checker",
      hasShield: false,
      isIntimidated: true,
    }),
  );
  const board = new FakeElement("div");
  const renderer = new Renderer({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  renderer.render(state, {});

  expect(board.children[51].children[0].className).toContain("is-intimidated");
  expect(board.children[51].children[0].className).toContain(
    "intimidation-framed",
  );
  expect(board.children[51].children[0].children[2].className).toBe(
    "piece-status-overlay",
  );
  expect(board.children[52].children[0].className).toContain("is-intimidated");
  expect(board.children[52].children[0].className).not.toContain(
    "intimidation-framed",
  );

  globalThis.document = previousDocument;
});

test("renderer opens the rules popup independently from settings", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const controls = makeControls();
  const rules = makeRulesPanel();
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: controls,
    settingsEl: makeSettingsPanel(),
    rulesEl: rules,
  });
  renderer.render(createGameState(), { rulesOpen: true, settingsOpen: false });

  expect(rules.hidden).toBe(false);
  expect(
    controls.querySelector('[data-control="rules"]').attributes[
      "aria-expanded"
    ],
  ).toBe("true");
  expect(
    controls.querySelector('[data-control="settings"]').attributes[
      "aria-expanded"
    ],
  ).toBe("false");

  globalThis.document = previousDocument;
});

test("renderer keeps settings and rules controls interactive while AI thinks", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  const controls = makeControls();
  const settings = makeSettingsPanel();
  const renderer = new Renderer({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: controls,
    settingsEl: settings,
    rulesEl: makeRulesPanel(),
  });

  renderer.render(createGameState(), {
    isAiThinking: true,
    settings: { aiLevel: 5, animationsEnabled: true, playerSide: "white" },
    settingsOpen: true,
    aiLabel: "Level 5",
  });

  expect(controls.querySelector('[data-control="settings"]').disabled).toBe(
    false,
  );
  expect(controls.querySelector('[data-control="rules"]').disabled).toBe(false);
  expect(settings.querySelector("#ai-level").disabled).toBe(false);
  expect(settings.querySelector("#animations-enabled").disabled).toBe(false);

  globalThis.document = previousDocument;
});

test("controller blocks non-evasion standard moves while both kings are checked", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 5, {
      id: "black-checker",
    }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 3, {
      id: "white-checker",
    }),
  );
  const pawn = placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 8, 9, { id: "white-pawn" }),
  );
  const stalePawnMove = generatePieceActions(controller.state, pawn)[0];

  controller.selectPiece(pawn);
  expect(controller.view.selectedPiece).toBe(null);

  controller.commitAction(stalePawnMove);
  expect(controller.state.currentPlayer).toBe(COLORS.WHITE);
  expect(controller.state.board[8][9]?.id).toBe("white-pawn");
  expect(controller.state.board[7][9]).toBe(null);
  expect(controller.view.phaseInfo).toBe("That action is no longer legal.");

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller deselects a selected piece when its own square is clicked", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
  });

  const pawn = controller.state.board[8][0];
  controller.selectPiece(pawn);
  expect(controller.view.selectedPiece.id).toBe("white-pawn-0");
  controller.handleBoardClick({
    target: {
      closest: () => ({ dataset: { row: "8", col: "0" } }),
    },
  });
  expect(controller.view.selectedPiece).toBe(null);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller cancels an active AI search when the AI level changes", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const settings = makeSettingsPanel();
  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: settings,
    rulesEl: makeRulesPanel(),
  });
  controller.isAiRunning = true;
  controller.aiRunToken = 12;

  const aiLevel = settings.querySelector("#ai-level");
  aiLevel.value = "0";
  controller.handleSettingsInput({ target: aiLevel });

  expect(controller.isAiRunning).toBe(false);
  expect(controller.aiRunToken).toBe(13);
  expect(controller.settings.aiLevel).toBe(0);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller allows self-play turns only when AI is off", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
  });

  controller.state.currentPlayer = "black";
  controller.settings = {
    aiLevel: 0,
    animationsEnabled: true,
    playerSide: "black",
  };
  expect(controller.canHumanAct()).toBe(true);
  controller.settings = {
    aiLevel: 3,
    animationsEnabled: true,
    playerSide: "black",
  };
  expect(controller.canHumanAct()).toBe(false);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller suppresses the board context menu and deselects on right-click", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const board = new FakeElement("div");
  const controller = new GameController({
    boardEl: board,
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  controller.selectPiece(controller.state.board[8][0]);
  expect(controller.view.selectedPiece.id).toBe("white-pawn-0");

  let prevented = false;
  board.dispatchEvent({
    type: "contextmenu",
    button: 2,
    preventDefault: () => {
      prevented = true;
    },
  });

  expect(prevented).toBe(true);
  expect(controller.view.selectedPiece).toBe(null);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller starts a new game from the settings panel", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });

  controller.state.currentPlayer = "black";
  controller.state.moveNumber = 5;
  controller.state.actionHistory = [
    { kind: "skip", mode: "skipSpecial", color: "white" },
  ];
  controller.settingsOpen = true;
  controller.handleControlClick({
    target: {
      closest: (selector) =>
        selector === "[data-control]"
          ? { dataset: { control: "new-game" } }
          : null,
    },
  });

  expect(controller.state.currentPlayer).toBe("white");
  expect(controller.state.moveNumber).toBe(1);
  expect(controller.state.actionHistory).toHaveLength(0);
  expect(controller.settingsOpen).toBe(false);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller undo restores the start of the current player turn", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };

  const before = JSON.stringify(controller.state);
  const pawn = controller.state.board[8][4];
  const advance = generateLegalActions(controller.state).find(
    (action) =>
      action.pieceId === pawn.id &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5,
  );

  controller.commitAction(advance);
  expect(controller.state.board[5][4]?.id).toBe(pawn.id);
  expect(controller.canUndo()).toBe(true);

  controller.undoLastTurn();
  expect(JSON.stringify(controller.state)).toBe(before);
  expect(controller.canUndo()).toBe(false);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller undo groups both slots from one turn into a single restore point", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: makeSettingsPanel(),
    rulesEl: makeRulesPanel(),
  });
  controller.settings = {
    aiLevel: 0,
    animationsEnabled: false,
    playerSide: "white",
  };
  controller.state = createEmptyState(COLORS.WHITE);
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "rook" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "life" }),
  );
  placePiece(
    controller.state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  const before = JSON.stringify(controller.state);

  controller.commitAction(
    generateLegalActions(controller.state).find(
      (action) => action.pieceId === "rook" && action.kind === "move",
    ),
  );
  controller.skipSpecialMove();

  expect(controller.state.currentPlayer).toBe(COLORS.BLACK);
  expect(controller.undoStack).toHaveLength(1);

  controller.undoLastTurn();
  expect(JSON.stringify(controller.state)).toBe(before);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});

test("controller closes settings on outside clicks only", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener() {},
  };
  globalThis.localStorage = null;

  const settings = makeSettingsPanel();
  const rules = makeRulesPanel();
  const controller = new GameController({
    boardEl: new FakeElement("div"),
    statusPanelEl: makeStatusPanel(),
    promotionEl: new FakeElement("div"),
    controlsEl: makeControls(),
    settingsEl: settings,
    rulesEl: rules,
  });

  controller.settingsOpen = true;
  controller.handleDocumentClick({
    target: settings.querySelector("#ai-level"),
  });
  expect(controller.settingsOpen).toBe(true);

  controller.handleDocumentClick({
    target: {
      closest: (selector) =>
        selector === '[data-control="settings"]' ? {} : null,
      parent: null,
    },
  });
  expect(controller.settingsOpen).toBe(true);

  controller.handleDocumentClick({
    target: {
      closest: () => null,
      parent: null,
    },
  });
  expect(controller.settingsOpen).toBe(false);

  controller.rulesOpen = true;
  controller.handleDocumentClick({ target: rules });
  expect(controller.rulesOpen).toBe(true);

  controller.handleDocumentClick({
    target: {
      closest: () => null,
      parent: null,
    },
  });
  expect(controller.rulesOpen).toBe(false);

  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
});
