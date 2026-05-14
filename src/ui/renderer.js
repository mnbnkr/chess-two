import {
  BOARD_SIZE,
  COLORS,
  FILES,
  LIFE_DEATH_PIECES,
  PIECE_TYPES,
  PROMOTION_TYPES,
  STANDARD_PIECES,
  frameEnabledForState,
  foolProfileForState,
  getVariant,
  isFrameSquare,
  isLightSquareForState,
  ownerOf,
  generateLegalActions,
  ruleOverridesForState,
  symbolFor,
  wraparoundEnabledForState,
} from "../engine/index.js";
import {
  CHECK_PATTERNS,
  KNIGHT_MOVEMENTS,
  PAWN_BEHAVIORS,
  variantOptions,
} from "../variants/index.js";

const PIECE_ASSET_BASE = pieceAssetBase();
const PIECE_ASSET_CODES = {
  [PIECE_TYPES.KING]: "K",
  [PIECE_TYPES.QUEEN]: "Q",
  [PIECE_TYPES.ROOK]: "R",
  [PIECE_TYPES.BISHOP]: "B",
  [PIECE_TYPES.KNIGHT]: "N",
  [PIECE_TYPES.PAWN]: "P",
  [PIECE_TYPES.FOOL]: "F",
  [PIECE_TYPES.TOAD]: "T",
};
const CAPTURED_ORDER = [
  PIECE_TYPES.QUEEN,
  PIECE_TYPES.ROOK,
  PIECE_TYPES.BISHOP,
  PIECE_TYPES.KNIGHT,
  PIECE_TYPES.TOAD,
  PIECE_TYPES.FOOL,
  PIECE_TYPES.PAWN,
  PIECE_TYPES.LIFE,
  PIECE_TYPES.DEATH,
  PIECE_TYPES.KING,
];
const FEN_FIELD_MAX_LINES = 8;
const CUSTOM_VARIANT_PREFIX = "custom:";

export class Renderer {
  constructor({
    boardEl,
    coordinateEl,
    statusPanelEl,
    promotionEl,
    controlsEl,
    settingsEl,
    rulesEl,
    devPanelEl,
    capturedTopEl,
    capturedBottomEl,
  }) {
    this.boardEl = boardEl;
    this.coordinateEl = coordinateEl;
    this.statusPanelEl = statusPanelEl;
    this.promotionEl = promotionEl;
    this.controlsEl = controlsEl;
    this.settingsEl = settingsEl;
    this.rulesEl = rulesEl;
    this.devPanelEl = devPanelEl;
    this.capturedTopEl = capturedTopEl;
    this.capturedBottomEl = capturedBottomEl;
    this.actionHistoryRef = null;
    this.actionHistoryLength = -1;
    this.actionHistoryLastKey = "";
    this.actionHistoryScrollEl = null;
    this.developerPanelScrollEl = null;
    this.renderedPlayer = null;
    this.boardRenderKey = "";
    this.boardOrderKey = "";
    this.boardSquareEls = new Map();
    this.pieceEls = new Map();
  }

  render(state, view = {}) {
    this.renderBoard(state, view);
    this.renderCoordinates(view);
    this.renderStatus(state, view);
    this.renderControls(view);
    this.renderPromotion(view);
    this.renderSettings(view);
    this.renderRules(view);
    this.renderDeveloperPanel(state, view);
    this.renderCapturedPieces(state, view);
  }

  renderBoard(state, view) {
    const highlights = view.highlights ?? emptyHighlights();
    const nextBoardRenderKey = boardRenderKey(state, view, highlights);
    if (nextBoardRenderKey === this.boardRenderKey) return;

    this.boardRenderKey = nextBoardRenderKey;
    this.boardEl.className = [
      frameEnabledForState(state) ? "frame-enabled" : "",
      wraparoundEnabledForState(state) ? "wraparound-enabled" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const rowOrder = orderedIndexes(view.boardSide);
    const colOrder = orderedIndexes(view.boardSide);
    const orderedSquares = [];
    const renderedPieceIds = new Set();

    for (const r of rowOrder) {
      for (const c of colOrder) {
        const square = squareElementFor(this.boardSquareEls, r, c);
        square.type = "button";
        const squareClasses = [
          "square",
          isLightSquareForState(state, r, c) ? "light" : "dark",
        ];
        square.dataset.row = String(r);
        square.dataset.col = String(c);
        square.setAttribute("aria-label", squareLabel(r, c));
        if (frameEnabledForState(state) && isFrameSquare(r, c)) {
          squareClasses.push("frame-square");
        }
        if (wraparoundEnabledForState(state) && (c === 0 || c === BOARD_SIZE - 1)) {
          squareClasses.push("wrap-file");
        }

        const children = [];
        const piece = state.board[r][c];
        if (piece) {
          squareClasses.push("has-piece");
          children.push(pieceElementFor(this.pieceEls, piece, state));
          renderedPieceIds.add(piece.id);
        }

        const marker = markerForSquare(r, c, view, highlights);
        if (marker) {
          squareClasses.push("is-actionable");
          children.push(marker);
        }

        square.className = squareClasses.join(" ");
        syncChildren(square, children);
        orderedSquares.push(square);
      }
    }

    const nextBoardOrderKey = `${view.boardSide ?? COLORS.WHITE}`;
    if (
      nextBoardOrderKey !== this.boardOrderKey ||
      this.boardEl.children?.length !== orderedSquares.length
    ) {
      syncChildren(this.boardEl, orderedSquares);
      this.boardOrderKey = nextBoardOrderKey;
    }

    for (const pieceId of this.pieceEls.keys()) {
      if (!renderedPieceIds.has(pieceId)) this.pieceEls.delete(pieceId);
    }
  }

  renderStatus(state, view) {
    const statusState = view.statusState ?? state;
    const playerTurnEl = this.statusPanelEl.querySelector("#player-turn");
    const previousPlayer = this.renderedPlayer;
    const displayedPlayer = view.displayPlayer ?? statusState.currentPlayer;
    const playerSide = view.boardSide ?? COLORS.WHITE;
    const keepFlash =
      previousPlayer === displayedPlayer &&
      playerTurnEl.className.includes("turn-start-flash");
    const shouldFlashTurn =
      previousPlayer &&
      previousPlayer !== displayedPlayer &&
      displayedPlayer === playerSide &&
      !statusState.gameOver;
    playerTurnEl.textContent = playerName(displayedPlayer);
    playerTurnEl.className = `player-turn ${displayedPlayer}${keepFlash ? " turn-start-flash" : ""}`;
    if (shouldFlashTurn) {
      restartClassAnimation(playerTurnEl, "turn-start-flash");
    }
    this.renderedPlayer = displayedPlayer;
    this.renderActionHistory(state);

    const legalActions = statusState.gameOver
      ? []
      : generateLegalActions(statusState);
    const standardStatus = statusState.turn.standardMoveMade
      ? "Used"
      : legalActions.some((action) => action.consumes?.standard)
        ? "Available"
        : "Unavailable";
    const specialStatus = statusState.turn.specialMoveMade
      ? "Used"
      : legalActions.some((action) => action.consumes?.special)
        ? "Available"
        : "Unavailable";
    setStatus(
      this.statusPanelEl.querySelector("#standard-move-status"),
      standardStatus,
    );
    setStatus(
      this.statusPanelEl.querySelector("#special-move-status"),
      specialStatus,
    );

    const info = this.statusPanelEl.querySelector("#phase-info");
    if (state.gameOver) {
      info.textContent = state.gameOver.winner
        ? `${playerName(state.gameOver.winner)} wins: ${state.gameOver.reason}.`
        : `Draw: ${state.gameOver.reason}.`;
    } else if (view.isAiAnimating) {
      info.textContent = "Black AI is finishing its move...";
    } else if (view.isAiThinking) {
      info.textContent = "Black AI is thinking...";
    } else {
      info.textContent =
        view.phaseInfo ?? `${playerName(statusState.currentPlayer)} to move.`;
    }
    fitPhaseInfo(info);

    const moveNumber = this.statusPanelEl.querySelector("#move-number");
    if (moveNumber) moveNumber.textContent = String(statusState.moveNumber);
    const variantName = this.statusPanelEl.querySelector("#variant-name");
    if (variantName) variantName.textContent = getVariant(state.variantId).name;
  }

  renderActionHistory(state) {
    const history = this.statusPanelEl.querySelector("#action-history ol");
    if (!history) return;
    this.bindActionHistoryScroll(history);
    const actions = state.actionHistory ?? [];
    const lastKey = actionHistoryKey(actions.at(-1));
    if (
      this.actionHistoryRef === actions &&
      this.actionHistoryLength === actions.length &&
      this.actionHistoryLastKey === lastKey
    ) {
      updateActionHistoryFade(history);
      return;
    }

    const previousLength = this.actionHistoryLength;
    const previousLastKey = this.actionHistoryLastKey;
    if (actions.length === 0) {
      history.innerHTML = "";
      const item = document.createElement("li");
      item.textContent = "None yet";
      item.className = "empty-history";
      history.appendChild(item);
      this.actionHistoryRef = actions;
      this.actionHistoryLength = 0;
      this.actionHistoryLastKey = lastKey;
      updateActionHistoryFade(history);
      return;
    }

    const canAppend =
      previousLength > 0 &&
      actions.length > previousLength &&
      history.children.length === previousLength &&
      previousLastKey === actionHistoryKey(actions[previousLength - 1]);

    if (canAppend) {
      let previousColor = actionColor(actions[previousLength - 1]);
      for (let i = previousLength; i < actions.length; i++) {
        previousColor = appendActionHistoryItem(
          history,
          actions[i],
          previousColor,
        );
      }
    } else {
      history.innerHTML = "";
      let previousColor = null;
      for (const action of actions) {
        previousColor = appendActionHistoryItem(history, action, previousColor);
      }
    }

    if (actions.length > previousLength)
      history.scrollTop = history.scrollHeight;
    this.actionHistoryRef = actions;
    this.actionHistoryLength = actions.length;
    this.actionHistoryLastKey = lastKey;
    updateActionHistoryFade(history);
  }

  bindActionHistoryScroll(history) {
    if (this.actionHistoryScrollEl === history) return;
    this.actionHistoryScrollEl = history;
    history.addEventListener("scroll", () => updateActionHistoryFade(history));
  }

  renderCoordinates(view) {
    if (!this.coordinateEl) return;
    this.coordinateEl.innerHTML = "";
    for (const col of orderedIndexes(view.boardSide)) {
      const label = document.createElement("span");
      label.textContent = FILES[col];
      this.coordinateEl.appendChild(label);
    }
  }

  renderPromotion(view) {
    this.promotionEl.innerHTML = "";
    const actions = view.promotionActions ?? [];
    if (actions.length === 0) {
      this.promotionEl.hidden = true;
      return;
    }

    this.promotionEl.hidden = false;
    this.promotionEl.className = "promotion-dialog";
    this.promotionEl.setAttribute("role", "dialog");
    this.promotionEl.setAttribute("aria-label", "Choose promotion piece");
    const title = document.createElement("p");
    title.textContent = "Promote pawn";
    this.promotionEl.appendChild(title);

    const options = document.createElement("div");
    options.className = "promotion-options";
    for (const type of PROMOTION_TYPES) {
      const action = actions.find(
        (candidate) => candidate.promotionType === type,
      );
      if (!action) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promotion-choice";
      button.dataset.promotion = type;
      button.textContent = type;
      options.appendChild(button);
    }
    this.promotionEl.appendChild(options);
  }

  renderControls(view) {
    if (!this.controlsEl) return;
    const skip = this.controlsEl.querySelector('[data-control="skip-special"]');
    const undo = this.controlsEl.querySelector('[data-control="undo-turn"]');
    const settings = this.controlsEl.querySelector('[data-control="settings"]');
    const rules = this.controlsEl.querySelector('[data-control="rules"]');
    if (skip) {
      skip.hidden = !view.canSkipSpecial;
      skip.disabled = !view.canSkipSpecial;
    }
    if (undo) {
      undo.disabled = !view.canUndo;
      undo.setAttribute("aria-disabled", view.canUndo ? "false" : "true");
    }
    if (settings) {
      settings.setAttribute(
        "aria-expanded",
        view.settingsOpen ? "true" : "false",
      );
    }
    if (rules) {
      rules.setAttribute("aria-expanded", view.rulesOpen ? "true" : "false");
    }
  }

  renderSettings(view) {
    if (!this.settingsEl) return;
    this.settingsEl.hidden = !view.settingsOpen;
    const aiValue = this.settingsEl.querySelector("#ai-level");
    const aiLabel = this.statusPanelEl.querySelector("#ai-level-label");
    const aiSettingLabel = this.settingsEl.querySelector("#ai-setting-label");
    const animationToggle = this.settingsEl.querySelector(
      "#animations-enabled",
    );
    const sideButtons = this.settingsEl.querySelectorAll("[data-side]");
    const sideLock = this.settingsEl.querySelector("#side-lock-note");
    const aiLevel = view.settings?.aiLevel ?? 3;
    const activeSide = view.boardSide ?? COLORS.WHITE;
    if (aiValue) aiValue.value = String(aiLevel);
    if (aiLabel) aiLabel.textContent = view.aiLabel ?? "Level 3";
    if (aiSettingLabel) aiSettingLabel.textContent = view.aiLabel ?? "Level 3";
    if (animationToggle)
      animationToggle.checked = view.settings?.animationsEnabled ?? true;
    for (const button of sideButtons) {
      const active = button.dataset.side === activeSide;
      button.disabled = Boolean(view.sideLocked);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    if (sideLock) sideLock.hidden = !view.sideLocked;
  }

  renderRules(view) {
    if (!this.rulesEl) return;
    this.rulesEl.hidden = !view.rulesOpen;
  }

  renderDeveloperPanel(state, view) {
    if (!this.devPanelEl) return;
    const rules = ruleOverridesForState(state);
    const previousScrollTop = this.devPanelEl.scrollTop;
    this.bindDeveloperPanelScroll(this.devPanelEl);
    const dev = view.developer ?? {};
    this.devPanelEl.classList?.toggle?.("is-collapsed", Boolean(dev.collapsed));
    const collapseButton = this.devPanelEl.querySelector(
      "#dev-collapse-button",
    );
    if (collapseButton) {
      collapseButton.textContent = dev.collapsed ? "Dev" : "Hide";
      collapseButton.setAttribute(
        "aria-expanded",
        dev.collapsed ? "false" : "true",
      );
    }
    const variantSelect = this.devPanelEl.querySelector("#variant-select");
    setSelectOptions(
      variantSelect,
      variantSelectOptions(state),
      variantOptionsKey(state),
    );
    setSelectValue(variantSelect, variantSelectValue(state));
    setSelectValue(
      this.devPanelEl.querySelector("#check-pattern-select"),
      rules.checkPattern ?? CHECK_PATTERNS.STANDARD,
    );
    setSelectValue(
      this.devPanelEl.querySelector("#pawn-behavior-select"),
      rules.pawnBehavior ?? PAWN_BEHAVIORS.CHESS_TWO,
    );
    setSelectValue(
      this.devPanelEl.querySelector("#pawn-initial-max-step-select"),
      String(rules.pawnInitialMaxStep ?? 3),
    );
    setSelectValue(
      this.devPanelEl.querySelector("#knight-movement-select"),
      rules.knightMovement ?? KNIGHT_MOVEMENTS.RAMP,
    );
    setChecked(
      this.devPanelEl.querySelector("#shields-disabled"),
      rules.shieldsEnabled === false,
    );
    setChecked(
      this.devPanelEl.querySelector("#frame-enabled"),
      rules.frameEnabled,
    );
    setChecked(
      this.devPanelEl.querySelector("#wraparound-enabled"),
      rules.wraparoundEnabled,
    );
    setChecked(
      this.devPanelEl.querySelector("#checkmate-disabled"),
      rules.checkmateEnabled === false,
    );
    setSelectValue(
      this.devPanelEl.querySelector("#dev-current-player"),
      state.currentPlayer,
    );
    setChecked(
      this.devPanelEl.querySelector("#dev-standard-used"),
      Boolean(state.turn.standardMoveMade),
    );
    setChecked(
      this.devPanelEl.querySelector("#dev-special-used"),
      Boolean(state.turn.specialMoveMade),
    );
    setInputValue(
      this.devPanelEl.querySelector("#dev-move-number"),
      String(state.moveNumber ?? 1),
    );
    setChecked(
      this.devPanelEl.querySelector("#board-edit-enabled"),
      Boolean(dev.boardEditEnabled),
    );
    setSelectValue(
      this.devPanelEl.querySelector("#edit-piece-type"),
      dev.editPieceType ?? "",
    );
    setSelectValue(
      this.devPanelEl.querySelector("#edit-piece-color"),
      dev.editPieceColor ?? COLORS.WHITE,
    );
    setChecked(
      this.devPanelEl.querySelector("#edit-piece-shield"),
      Boolean(dev.editPieceShield),
    );
    setChecked(
      this.devPanelEl.querySelector("#edit-piece-immune"),
      Boolean(dev.editPieceImmune),
    );
    setChecked(
      this.devPanelEl.querySelector("#edit-piece-moved"),
      Boolean(dev.editPieceMoved),
    );
    const fenField = this.devPanelEl.querySelector("#fen-field");
    if (fenField && !dev.keepFenDraft && dev.fenText !== undefined) {
      fenField.value = dev.fenText;
    }
    this.resizeDeveloperFenField();
    const message = this.developerMessageElement();
    if (message) message.textContent = dev.message ?? "";
    const boardEditUndo = this.devPanelEl.querySelector(
      '[data-dev-action="undo-board-edit"]',
    );
    if (boardEditUndo) {
      boardEditUndo.disabled = !view.canUndoBoardEdit;
      boardEditUndo.setAttribute(
        "aria-disabled",
        view.canUndoBoardEdit ? "false" : "true",
      );
    }
    const toast = this.devPanelEl.querySelector("#dev-toast");
    if (toast) {
      const toastMessage = dev.toastMessage ?? "";
      toast.textContent = toastMessage;
      toast.hidden = !toastMessage;
    }
    restoreScrollTop(this.devPanelEl, previousScrollTop);
    updateDeveloperPanelFade(this.devPanelEl);
  }

  bindDeveloperPanelScroll(panel) {
    if (this.developerPanelScrollEl === panel) return;
    this.developerPanelScrollEl = panel;
    panel.addEventListener("scroll", () => updateDeveloperPanelFade(panel));
  }

  developerMessageElement() {
    return (
      this.devPanelEl?.parent?.querySelector?.("#dev-message") ??
      this.devPanelEl?.parentElement?.querySelector?.("#dev-message") ??
      this.devPanelEl?.querySelector?.("#dev-message") ??
      globalThis.document?.querySelector?.("#dev-message")
    );
  }

  renderCapturedPieces(state, view) {
    if (!this.capturedTopEl && !this.capturedBottomEl) return;
    const topColor =
      (view.boardSide ?? COLORS.WHITE) === COLORS.BLACK
        ? COLORS.WHITE
        : COLORS.BLACK;
    const bottomColor = topColor === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
    renderCapturedTray(this.capturedTopEl, state, topColor, "top");
    renderCapturedTray(this.capturedBottomEl, state, bottomColor, "bottom");
  }

  resizeDeveloperFenField() {
    resizeAutoHeightTextarea(this.devPanelEl?.querySelector("#fen-field"));
  }
}

function resizeAutoHeightTextarea(textarea) {
  if (!textarea?.style) return;
  const styles = globalThis.getComputedStyle?.(textarea);
  const lineHeight = cssPixels(styles?.lineHeight, 17);
  const verticalExtra =
    cssPixels(styles?.paddingTop) +
    cssPixels(styles?.paddingBottom) +
    cssPixels(styles?.borderTopWidth) +
    cssPixels(styles?.borderBottomWidth);
  const maxHeight = Math.ceil(lineHeight * FEN_FIELD_MAX_LINES + verticalExtra);
  textarea.style.maxHeight = `${maxHeight}px`;
  textarea.style.height = "auto";
  const scrollHeight = Number(textarea.scrollHeight) || 0;
  if (scrollHeight <= 0) {
    textarea.style.overflowY = "hidden";
    return;
  }
  const nextHeight = Math.min(scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
}

function cssPixels(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function squareElementFor(squareEls, row, col) {
  const key = `${row},${col}`;
  let square = squareEls.get(key);
  if (!square) {
    square = document.createElement("button");
    squareEls.set(key, square);
  }
  return square;
}

function pieceElementFor(pieceEls, piece, state) {
  const key = pieceRenderKey(piece, state);
  const existing = pieceEls.get(piece.id);
  if (existing) {
    if (existing.key !== key) {
      syncPieceElement(existing.element, piece, state);
      existing.key = key;
    }
    return existing.element;
  }
  const element = renderPiece(piece, state);
  pieceEls.set(piece.id, { key, element });
  return element;
}

function syncChildren(element, children) {
  const current = [...(element.children ?? [])];
  if (
    current.length === children.length &&
    current.every((child, index) => child === children[index])
  ) {
    return;
  }
  element.replaceChildren(...children);
}

function renderPiece(piece, state) {
  const pieceEl = document.createElement("span");
  syncPieceElement(pieceEl, piece, state);
  return pieceEl;
}

function syncPieceElement(pieceEl, piece, state) {
  const fallbackSymbol =
    childWithClass(pieceEl, "piece-symbol") ?? createPieceFallback();
  const pieceImage =
    childWithClass(pieceEl, "piece-image") ??
    createPieceImage(fallbackSymbol);
  const statusOverlay =
    childWithClass(pieceEl, "piece-status-overlay") ??
    createPieceStatusOverlay();
  syncPieceImage(pieceImage, fallbackSymbol, piece);
  fallbackSymbol.className = "piece-symbol";
  fallbackSymbol.textContent = symbolFor(piece);
  statusOverlay.className = "piece-status-overlay";
  statusOverlay.setAttribute("aria-hidden", "true");

  const children = [pieceImage, fallbackSymbol];
  const foolOverlay = renderFoolProfileOverlay(piece, state);
  if (foolOverlay) children.push(foolOverlay);
  children.push(statusOverlay);
  syncChildren(pieceEl, children);
  applyPieceElementAttributes(pieceEl, piece, state);
}

function createPieceImage(fallbackSymbol) {
  const pieceImage = document.createElement("img");
  pieceImage.className = "piece-image";
  pieceImage.alt = "";
  pieceImage.decoding = "async";
  pieceImage.draggable = false;
  pieceImage.addEventListener("error", () => {
    pieceImage.hidden = true;
    fallbackSymbol.hidden = false;
  });
  return pieceImage;
}

function createPieceFallback() {
  const fallbackSymbol = document.createElement("span");
  fallbackSymbol.className = "piece-symbol";
  fallbackSymbol.hidden = true;
  return fallbackSymbol;
}

function createPieceStatusOverlay() {
  const statusOverlay = document.createElement("span");
  statusOverlay.className = "piece-status-overlay";
  statusOverlay.setAttribute("aria-hidden", "true");
  return statusOverlay;
}

function syncPieceImage(pieceImage, fallbackSymbol, piece) {
  pieceImage.className = "piece-image";
  pieceImage.alt = "";
  pieceImage.decoding = "async";
  pieceImage.draggable = false;
  const assetPath = pieceAssetPath(piece);
  if (pieceImage.dataset.assetPath !== assetPath) {
    pieceImage.hidden = false;
    fallbackSymbol.hidden = true;
    pieceImage.src = assetPath;
    pieceImage.dataset.assetPath = assetPath;
  }
}

function childWithClass(element, className) {
  return [...(element.children ?? [])].find((child) =>
    String(child.className).split(/\s+/).includes(className),
  );
}

function applyPieceElementAttributes(pieceEl, piece, state) {
  const classes = ["piece", piece.color, pieceAssetClass(piece)];
  const titleParts = [`${piece.color} ${piece.type}`];
  pieceEl.dataset.pieceId = piece.id;
  delete pieceEl.dataset.owner;
  pieceEl.setAttribute("aria-label", `${piece.color} ${piece.type}`);
  if (shouldFlipPieceImage(piece, state)) classes.push("is-flipped");
  if (piece.hasShield) classes.push("has-shield");
  if (piece.frameSuppressedShield) {
    classes.push("frame-shield-suppressed");
    titleParts.push("shield suppressed by frame");
  }
  if (isFrameAffectedPiece(piece, state)) {
    classes.push("frame-affected");
    titleParts.push("limited by frame");
  }
  if (piece.isImmune) {
    classes.push("is-immune");
    titleParts.push("immune");
  }
  if (piece.isIntimidated) {
    classes.push("is-intimidated");
    if (piece.intimidationSuppressedShield) classes.push("intimidation-framed");
    titleParts.push(
      piece.intimidationSuppressedShield
        ? "intimidated: shield suppressed while checking the enemy king"
        : "intimidated while checking the enemy king",
    );
  }
  if (state.gameOver?.winner === piece.color && piece.type === "King") {
    classes.push("winning-king");
    titleParts.push("winner");
  }
  if (LIFE_DEATH_PIECES.has(piece.type)) {
    classes.push(piece.type === "Life" ? "life-piece" : "death-piece");
    const owner = ownerOf(piece);
    pieceEl.dataset.owner = owner;
    classes.push(`owner-${owner}`);
    titleParts.push(`${owner} controlled`);
  }
  if (piece.type === PIECE_TYPES.FOOL) {
    const profile = foolProfileForState(state, piece);
    titleParts.push(profile ? `imitating ${profile.type}` : "imitating nothing");
  }
  pieceEl.className = classes.join(" ");
  pieceEl.title = titleParts.join(" - ");
}

function pieceRenderKey(piece, state) {
  const owner = LIFE_DEATH_PIECES.has(piece.type) ? ownerOf(piece) : "";
  const profile =
    piece.type === PIECE_TYPES.FOOL ? foolProfileForState(state, piece) : null;
  return [
    piece.id,
    piece.type,
    piece.color,
    pieceAssetName(piece),
    shouldFlipPieceImage(piece, state) ? 1 : 0,
    piece.hasShield ? 1 : 0,
    piece.frameSuppressedShield ? 1 : 0,
    isFrameAffectedPiece(piece, state) ? 1 : 0,
    piece.isImmune ? 1 : 0,
    piece.isIntimidated ? 1 : 0,
    piece.intimidationSuppressedShield ? 1 : 0,
    state.gameOver?.winner === piece.color && piece.type === PIECE_TYPES.KING
      ? 1
      : 0,
    owner,
    profile?.type ?? "",
  ].join("|");
}

function renderFoolProfileOverlay(piece, state) {
  if (piece.type !== PIECE_TYPES.FOOL) return null;
  const profile = foolProfileForState(state, piece);
  if (!profile) return null;
  const overlay = document.createElement("span");
  overlay.className = `fool-profile-overlay ${piece.color}`;
  overlay.dataset.profileType = profile.type;
  overlay.setAttribute("aria-hidden", "true");

  const profilePiece = { ...piece, type: profile.type };
  const image = document.createElement("img");
  image.className = "fool-profile-image";
  image.src = pieceAssetPath(profilePiece);
  image.alt = "";
  image.decoding = "async";
  image.draggable = false;
  const fallbackSymbol = document.createElement("span");
  fallbackSymbol.className = "fool-profile-symbol";
  fallbackSymbol.textContent = symbolFor(profilePiece);
  fallbackSymbol.hidden = true;
  image.addEventListener("error", () => {
    image.hidden = true;
    fallbackSymbol.hidden = false;
  });

  overlay.appendChild(image);
  overlay.appendChild(fallbackSymbol);
  return overlay;
}

function pieceAssetPath(piece) {
  return `${PIECE_ASSET_BASE}${pieceAssetName(piece)}`;
}

function pieceAssetBase() {
  const rawPagesBase = rawGithubPagesSourceAssetBase();
  if (rawPagesBase) return rawPagesBase;
  return `${import.meta.env?.BASE_URL ?? ""}assets/pieces/`;
}

function rawGithubPagesSourceAssetBase() {
  if (!globalThis.location?.hostname?.endsWith("github.io")) return "";
  const modulePath = new URL(import.meta.url).pathname.replaceAll("\\", "/");
  if (!modulePath.endsWith("/src/ui/renderer.js")) return "";
  return new URL(/* @vite-ignore */ "../../public/assets/pieces/", import.meta.url)
    .href;
}

function pieceAssetClass(piece) {
  return `piece-asset-${pieceAssetName(piece).replace(".webp", "")}`;
}

function pieceAssetName(piece) {
  if (piece.type === PIECE_TYPES.LIFE) return "wbL.webp";
  if (piece.type === PIECE_TYPES.DEATH) return "wbD.webp";
  const colorPrefix = piece.color === COLORS.WHITE ? "w" : "b";
  return `${colorPrefix}${PIECE_ASSET_CODES[piece.type]}.webp`;
}

function shouldFlipPieceImage(piece, state) {
  const visualRules = getVariant(state.variantId).visualRules;
  if (visualRules?.flippedPieceIds?.includes(piece.id)) return true;
  return LIFE_DEATH_PIECES.has(piece.type) && ownerOf(piece) === COLORS.BLACK;
}

function isFrameAffectedPiece(piece, state) {
  return (
    frameEnabledForState(state) &&
    isFrameSquare(piece.row, piece.col) &&
    STANDARD_PIECES.has(piece.type) &&
    piece.type !== PIECE_TYPES.KING &&
    !piece.frameSuppressedShield
  );
}

function markerForSquare(row, col, view, highlights) {
  const classes = [];
  const key = `${row},${col}`;
  const isResting = highlights.resting.has(key);
  if (view.selectedPiece?.row === row && view.selectedPiece?.col === col) {
    classes.push(
      view.phase === "resting" && !isResting ? "selected-muted" : "selected",
    );
  }
  if (highlights.moves.has(key)) classes.push("valid-move");
  if (highlights.deathMoves?.has(key)) classes.push("valid-death-move");
  if (highlights.rampMoves?.has(key)) classes.push("valid-ramp");
  if (highlights.deathRampMoves?.has(key)) classes.push("valid-death-ramp");
  if (highlights.attacks.has(key)) classes.push("valid-attack");
  if (highlights.specials.has(key)) {
    classes.push("valid-special");
    if (view.selectedPiece?.type === PIECE_TYPES.LIFE)
      classes.push("valid-life-special");
    if (view.selectedPiece?.type === PIECE_TYPES.DEATH)
      classes.push("valid-death-special");
  }
  if (highlights.staging.has(key)) classes.push("valid-staging");
  if (isResting) classes.push("valid-resting");
  if (classes.length === 0) return null;
  const marker = document.createElement("span");
  marker.className = `highlight-overlay ${classes.join(" ")}`;
  return marker;
}

export function emptyHighlights() {
  return {
    moves: new Set(),
    deathMoves: new Set(),
    rampMoves: new Set(),
    deathRampMoves: new Set(),
    attacks: new Set(),
    specials: new Set(),
    staging: new Set(),
    resting: new Set(),
  };
}

function setStatus(element, value) {
  if (!element) return;
  element.textContent = value;
  element.className = `status-${value.toLowerCase()}`;
}

function fitPhaseInfo(element) {
  if (!element?.classList) return;
  element.classList.remove("is-tight", "is-tiny");
  element.title = element.textContent;
  if (!element.clientHeight || !element.scrollHeight) return;
  if (element.scrollHeight <= element.clientHeight + 1) return;
  element.classList.add("is-tight");
  if (element.scrollHeight > element.clientHeight + 1) {
    element.classList.add("is-tiny");
  }
}

function setSelectValue(element, value) {
  if (!element) return;
  element.value = value;
}

function setInputValue(element, value) {
  if (!element) return;
  element.value = value;
}

function setChecked(element, checked) {
  if (!element) return;
  element.checked = checked;
}

function setSelectOptions(element, options, optionsKey = "static") {
  if (!element || element.dataset?.optionsKey === optionsKey) return;
  if (typeof element.replaceChildren !== "function") return;
  element.replaceChildren(
    ...options.map(({ id, name }) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = name;
      return option;
    }),
  );
  element.dataset.optionsKey = optionsKey;
}

function variantSelectOptions(state) {
  const options = variantOptions();
  if (isVariantPresetState(state)) return options;
  const variant = getVariant(state.variantId);
  return [
    { id: customVariantValue(state.variantId), name: `Custom: ${variant.name}` },
    ...options,
  ];
}

function variantSelectValue(state) {
  return isVariantPresetState(state)
    ? state.variantId
    : customVariantValue(state.variantId);
}

function variantOptionsKey(state) {
  return `${state.variantId}:${isVariantPresetState(state) ? "preset" : "custom"}`;
}

function customVariantValue(variantId) {
  return `${CUSTOM_VARIANT_PREFIX}${variantId}`;
}

function isVariantPresetState(state) {
  const variant = getVariant(state.variantId);
  return sameRuleOverrides(state.ruleOverrides, variant.defaultRuleOverrides);
}

function sameRuleOverrides(actual = {}, expected = {}) {
  return [
    "checkPattern",
    "pawnBehavior",
    "pawnInitialMaxStep",
    "knightMovement",
    "shieldsEnabled",
    "frameEnabled",
    "wraparoundEnabled",
    "checkmateEnabled",
  ].every((key) => actual?.[key] === expected?.[key]);
}

function restoreScrollTop(element, scrollTop) {
  if (!element || !Number.isFinite(scrollTop)) return;
  element.scrollTop = scrollTop;
  globalThis.requestAnimationFrame?.(() => {
    element.scrollTop = scrollTop;
  });
}

function playerName(color) {
  return color === COLORS.WHITE ? "White" : "Black";
}

function squareLabel(row, col) {
  return `${FILES[col]}${BOARD_SIZE - row}`;
}

function orderedIndexes(boardSide = COLORS.WHITE) {
  const indexes = [...Array(BOARD_SIZE).keys()];
  return boardSide === COLORS.BLACK ? indexes.reverse() : indexes;
}

function renderCapturedTray(container, state, color, position) {
  if (!container) return;
  container.innerHTML = "";
  container.dataset.side = color;
  container.dataset.position = position;
  container.setAttribute("aria-label", `${playerName(color)} captured pieces`);

  const label = document.createElement("span");
  label.className = "captured-label";
  label.textContent = playerName(color);
  container.appendChild(label);

  const list = document.createElement("div");
  list.className = "captured-piece-list";
  const captured = capturedPiecesForColor(state, color);
  for (const piece of captured) {
    list.appendChild(renderCapturedPiece(piece, state));
  }
  container.classList.toggle("is-empty", captured.length === 0);
  container.appendChild(list);
}

function renderCapturedPiece(piece, state) {
  const pieceEl = document.createElement("span");
  pieceEl.className = `captured-piece ${piece.color} ${pieceAssetClass(piece)}`;
  pieceEl.dataset.pieceId = piece.id;
  pieceEl.dataset.type = piece.type;
  pieceEl.title = `${piece.color} ${piece.type}`;
  if (shouldFlipPieceImage(piece, state)) pieceEl.classList.add("is-flipped");

  const image = document.createElement("img");
  image.src = pieceAssetPath(piece);
  image.alt = "";
  image.decoding = "async";
  image.draggable = false;
  pieceEl.appendChild(image);
  return pieceEl;
}

function capturedPiecesForColor(state, color) {
  return [...(state.capturedPieces ?? [])]
    .filter((piece) => (piece.owner ?? piece.color) === color)
    .sort(
      (a, b) =>
        CAPTURED_ORDER.indexOf(a.type) - CAPTURED_ORDER.indexOf(b.type) ||
        (a.moveNumber ?? 0) - (b.moveNumber ?? 0) ||
        a.id.localeCompare(b.id),
    );
}

function boardRenderKey(state, view, highlights) {
  const rules = ruleOverridesForState(state);
  const pieceBits = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = state.board[r][c];
      if (!piece) continue;
      pieceBits.push(
        [
          r,
          c,
          piece.id,
          piece.type,
          piece.color,
          ownerOf(piece),
          piece.hasShield ? 1 : 0,
          piece.frameSuppressedShield ? 1 : 0,
          piece.isImmune ? 1 : 0,
          piece.isIntimidated ? 1 : 0,
          piece.intimidationSuppressedShield ? 1 : 0,
          state.gameOver?.winner === piece.color && piece.type === "King"
            ? 1
            : 0,
          piece.type === PIECE_TYPES.FOOL
            ? (foolProfileForState(state, piece)?.type ?? "")
            : "",
        ].join(":"),
      );
    }
  }

  return [
    state.variantId ?? "",
    rules.checkPattern ?? "",
    rules.frameEnabled ? 1 : 0,
    rules.wraparoundEnabled ? 1 : 0,
    view.boardSide ?? COLORS.WHITE,
    view.phase ?? "",
    view.selectedPiece?.id ?? "",
    view.selectedPiece?.type ?? "",
    view.selectedPiece
      ? `${view.selectedPiece.row},${view.selectedPiece.col}`
      : "",
    setKey(highlights.moves),
    setKey(highlights.deathMoves),
    setKey(highlights.rampMoves),
    setKey(highlights.deathRampMoves),
    setKey(highlights.attacks),
    setKey(highlights.specials),
    setKey(highlights.staging),
    setKey(highlights.resting),
    state.gameOver?.winner ?? "",
    state.gameOver?.reason ?? "",
    pieceBits.join("|"),
  ].join("~");
}

function setKey(values) {
  return [...(values ?? [])].sort().join(";");
}

function describeAction(action) {
  const piece = action.pieceType ?? "Piece";
  const from = action.from ? squareLabel(action.from.r, action.from.c) : "";
  const to = action.to ? squareLabel(action.to.r, action.to.c) : "";
  const suffix = action.promotionType ? `=${action.promotionType}` : "";

  if (action.kind === "skip") return "Skipped Life/Death";
  if (action.mode === "castle") return `King castles ${from}-${to}`;
  if (Array.isArray(action.rampSequence) && action.rampSequence.length > 0) {
    const via =
      action.rampSequence
        ?.slice(0, -1)
        .map((step) => squareLabel(step.land.r, step.land.c)) ?? [];
    const stripCount = action.shieldStrips?.length ?? 0;
    const stripNote =
      stripCount > 0
        ? `, strips ${stripCount} shield${stripCount === 1 ? "" : "s"}`
        : "";
    return `${pieceLabel(action)} ${from}-${to}${via.length ? ` via ${via.join(", ")}` : ""}${stripNote}`;
  }
  if (action.kind === "move") {
    const deathNote = action.deathLanding ? " into Death" : "";
    return `${pieceLabel(action)} ${from}-${to}${deathNote}${suffix}`;
  }
  if (action.kind === "attack") {
    const target = `${action.target?.color ?? "enemy"} ${action.target?.type ?? "piece"}`;
    const hit = action.target?.hadShield ? "breaks shield on" : "takes";
    const deathStaging = action.deathStaging ? ", attacker dies on Death" : "";
    const rest = action.rest
      ? `, rests ${squareLabel(action.rest.r, action.rest.c)}`
      : "";
    const recoil = action.recoil ? ", loses shield" : "";
    return `${pieceLabel(action)} ${hit} ${target} ${to}${deathStaging}${rest}${recoil}${suffix}`;
  }
  if (action.mode === "heal") {
    const target = `${action.target?.color ?? ""} ${action.target?.type ?? "piece"}`.trim();
    const verb = action.target?.frameSuppressedShield
      ? "stores frame shield for"
      : "shields";
    return `Life ${verb} ${target} ${to}`;
  }
  if (action.mode === "kill") {
    return `Death kills ${action.target?.color ?? ""} ${action.target?.type ?? "piece"} ${to}`;
  }
  return `${piece} action`;
}

function pieceLabel(action) {
  const piece = action.pieceType ?? "Piece";
  return action.profileType ? `${piece} as ${action.profileType}` : piece;
}

function actionColor(action) {
  return action.color ?? action.target?.color ?? COLORS.WHITE;
}

function appendActionHistoryItem(history, action, previousColor) {
  const color = actionColor(action);
  const item = document.createElement("li");
  item.dataset.actionColor = color;
  if (previousColor && previousColor !== color)
    item.classList.add("player-break");
  item.textContent = describeAction(action);
  item.setAttribute("aria-label", `${playerName(color)}: ${item.textContent}`);
  history.appendChild(item);
  return color;
}

function updateActionHistoryFade(history) {
  const container = history.parentElement ?? history.parent;
  if (!container?.classList) return;
  const clientHeight = history.clientHeight ?? history.offsetHeight ?? 0;
  const hiddenBelow =
    clientHeight > 0 &&
    history.scrollTop + clientHeight < history.scrollHeight - 1;
  container.classList.toggle("has-hidden-actions-below", hiddenBelow);
}

function updateDeveloperPanelFade(panel) {
  if (!panel?.classList) return;
  const clientHeight = panel.clientHeight ?? panel.offsetHeight ?? 0;
  const collapsed = panel.className?.split(/\s+/).includes("is-collapsed");
  const hiddenBelow =
    !collapsed &&
    clientHeight > 0 &&
    panel.scrollTop + clientHeight < panel.scrollHeight - 1;
  panel.classList.toggle("has-hidden-dev-content-below", hiddenBelow);
}

function restartClassAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function actionHistoryKey(action) {
  if (!action) return "empty";
  return [
    action.color ?? "",
    action.kind ?? "",
    action.mode ?? "",
    action.pieceId ?? "",
    action.targetId ?? "",
    action.profileType ?? "",
    action.promotionType ?? "",
    action.recoil ? "recoil" : "",
    action.deathStaging ? "death" : "",
    action.deathLanding ? "deathLanding" : "",
    action.target?.frameSuppressedShield ? "frameShield" : "",
    rampSequenceKey(action.rampSequence),
    shieldStripKey(action.shieldStrips),
    actionSquareKey(action.from),
    actionSquareKey(action.to),
    actionSquareKey(action.staging),
    actionSquareKey(action.rest),
    (action.path ?? []).map(actionSquareKey).join(">"),
  ].join("|");
}

function actionSquareKey(square) {
  return square ? `${square.r},${square.c}` : "";
}

function rampSequenceKey(sequence = []) {
  return sequence
    .map(
      (step) => `${actionSquareKey(step.ramp)}>${actionSquareKey(step.land)}`,
    )
    .join(";");
}

function shieldStripKey(strips = []) {
  return strips
    .map((strip) => `${strip.pieceId}@${actionSquareKey(strip.square)}`)
    .sort()
    .join(";");
}
