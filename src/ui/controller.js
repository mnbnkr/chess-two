import {
  COLORS,
  PIECE_TYPES,
  applyShieldOverrideToBoard,
  applyAction,
  canHaveShield,
  canSkipSpecialMove,
  chooseAiAction,
  cloneState,
  createGameState,
  createPiece,
  createStateFromFen,
  createEmptyState,
  findPieceById,
  foolProfileForState,
  generateLegalActions,
  getActionsForPiece,
  normalizeRuleOverrides,
  normalizeTurn,
  ownerOf,
  skipSpecialMove,
  setPiece,
  stateToFen,
  squareKey,
  updateIntimidation,
} from "../engine/index.js";
import { Renderer, emptyHighlights } from "./renderer.js";
import {
  ANIMATION_TIMING,
  BoardAnimator,
  moveAnimationDurationForAction,
} from "./animation.js";
import {
  DEFAULT_SETTINGS,
  aiLabelForLevel,
  aiOptionsForLevel,
  clearStoredSettings,
  effectivePlayerSide,
  isAiEnabled,
  loadSettings,
  saveSettings,
} from "./settings.js";
import {
  DEFAULT_UI_VARIANT_ID,
  getVariant,
} from "../variants/index.js";

const AI_COLOR = COLORS.BLACK;
const HUMAN_COLOR = COLORS.WHITE;

export class GameController {
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
    this.settings = loadSettings();
    this.renderer = new Renderer({
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
    });
    this.animator = new BoardAnimator(boardEl);
    this.state = createGameState({ variantId: this.settings.variantId });
    this.view = this.createEmptyView();
    this.isAiRunning = false;
    this.aiRunToken = 0;
    this.undoStack = [];
    this.boardEditUndoStack = [];
    this.lastUndoAnchorKey = null;
    this.developer = {
      collapsed: false,
      boardEditEnabled: false,
      editPieceType: "",
      editPieceColor: COLORS.WHITE,
      editPieceShield: true,
      editPieceImmune: false,
      editPieceMoved: false,
      fenText: stateToFen(this.state),
      keepFenDraft: false,
      message: "",
      toastMessage: "",
    };
    this.devToastTimer = null;
    this.settingsOpen = false;
    this.rulesOpen = false;
    this.documentClickHandler = (event) => this.handleDocumentClick(event);
    this.boardContextMenuHandler = (event) =>
      this.handleBoardContextMenu(event);
    this.windowResizeHandler = () => this.renderer.resizeDeveloperFenField();
    this.windowKeydownHandler = (event) => this.handleWindowKeydown(event);

    boardEl.addEventListener("click", (event) => this.handleBoardClick(event));
    boardEl.addEventListener("contextmenu", this.boardContextMenuHandler);
    boardEl.addEventListener("auxclick", this.boardContextMenuHandler);
    promotionEl.addEventListener("click", (event) =>
      this.handlePromotionClick(event),
    );
    controlsEl?.addEventListener("click", (event) =>
      this.handleControlClick(event),
    );
    settingsEl?.addEventListener("click", (event) =>
      this.handleSettingsClick(event),
    );
    settingsEl?.addEventListener("input", (event) =>
      this.handleSettingsInput(event),
    );
    settingsEl?.addEventListener("change", (event) =>
      this.handleSettingsInput(event),
    );
    devPanelEl?.addEventListener("click", (event) =>
      this.handleDeveloperClick(event),
    );
    devPanelEl?.addEventListener("input", (event) =>
      this.handleDeveloperInput(event),
    );
    devPanelEl?.addEventListener("change", (event) =>
      this.handleDeveloperInput(event),
    );
    globalThis.document?.addEventListener?.(
      "click",
      this.documentClickHandler,
      true,
    );
    globalThis.addEventListener?.("resize", this.windowResizeHandler);
    globalThis.addEventListener?.("keydown", this.windowKeydownHandler, true);
    this.render();
    this.maybeRunAiTurn();
  }

  createEmptyView() {
    return {
      selectedPiece: null,
      selectedActions: [],
      phase: "select",
      phaseInfo: "White to move. Select a piece.",
      highlights: emptyHighlights(),
      attackCandidates: [],
      stagedAttackCandidates: [],
      promotionActions: [],
      isAiThinking: false,
    };
  }

  handleBoardClick(event) {
    const square = event.target.closest(".square");
    if (!square) return;
    const row = Number(square.dataset.row);
    const col = Number(square.dataset.col);
    if (this.developer.boardEditEnabled) {
      this.applyBoardEdit(row, col);
      return;
    }
    if (!this.canHumanAct()) return;

    if (this.view.phase === "staging") {
      this.chooseStaging(row, col);
      return;
    }

    if (this.view.phase === "resting") {
      this.chooseResting(row, col);
      return;
    }

    const piece = this.state.board[row][col];
    if (this.view.selectedPiece) {
      if (
        this.view.selectedPiece.row === row &&
        this.view.selectedPiece.col === col
      ) {
        this.clearSelection();
        this.render();
        return;
      }
      if (this.tryDestination(row, col)) return;
      if (this.trySpecial(row, col)) return;
      if (this.tryAttack(row, col)) return;
      if (piece && ownerOf(piece) === this.state.currentPlayer) {
        this.selectPiece(piece);
        return;
      }
      this.clearSelection();
      this.render();
      return;
    }

    if (piece && ownerOf(piece) === this.state.currentPlayer)
      this.selectPiece(piece);
  }

  handleBoardContextMenu(event) {
    if (event.button !== undefined && event.button !== 2) return;
    event.preventDefault?.();
    if (!this.view.selectedPiece) return;
    this.clearSelection();
    this.render();
  }

  handlePromotionClick(event) {
    const button = event.target.closest("[data-promotion]");
    if (!button || this.view.promotionActions.length === 0) return;
    const action = this.view.promotionActions.find(
      (candidate) => candidate.promotionType === button.dataset.promotion,
    );
    if (action) this.commitAction(action);
  }

  handleControlClick(event) {
    const control = event.target.closest("[data-control]");
    if (!control) return;
    if (control.dataset.control === "skip-special") {
      this.skipSpecialMove();
    }
    if (control.dataset.control === "undo-turn") {
      this.undoLastTurn();
    }
    if (control.dataset.control === "new-game") {
      this.newGame();
    }
    if (control.dataset.control === "settings") {
      this.settingsOpen = !this.settingsOpen;
      if (this.settingsOpen) this.rulesOpen = false;
      this.render();
    }
    if (control.dataset.control === "rules") {
      this.rulesOpen = !this.rulesOpen;
      if (this.rulesOpen) this.settingsOpen = false;
      this.render();
    }
  }

  handleSettingsInput(event) {
    const target = event.target;
    if (target.id === "ai-level") {
      const wasRunningAi = this.isAiRunning;
      if (wasRunningAi) {
        this.aiRunToken += 1;
        this.isAiRunning = false;
        cancelAiWorkerSearch();
      }
      this.settings = saveSettings({
        ...this.settings,
        aiLevel: Number(target.value),
      });
      this.clearSelection();
      this.render();
      this.maybeRunAiTurn();
    }
    if (target.id === "animations-enabled") {
      this.settings = saveSettings({
        ...this.settings,
        animationsEnabled: target.checked,
      });
      this.render();
    }
  }

  handleWindowKeydown(event) {
    const isCacheReset =
      event?.key === "F5" && (event.ctrlKey || event.metaKey);
    if (!isCacheReset) return;
    event.preventDefault?.();
    this.resetRuntimeDefaultsAndReload();
  }

  async resetRuntimeDefaultsAndReload() {
    this.cancelAi();
    clearStoredSettings();
    this.settings = { ...DEFAULT_SETTINGS };
    await clearBrowserRuntimeCaches();
    globalThis.location?.reload?.();
  }

  handleSettingsClick(event) {
    const sideButton = event.target.closest?.("[data-side]");
    if (!sideButton || sideButton.disabled || this.isPlayingAgainstAi()) return;
    this.settings = saveSettings({
      ...this.settings,
      playerSide: sideButton.dataset.side,
    });
    this.render();
  }

  handleDeveloperClick(event) {
    const action = event.target.closest?.("[data-dev-action]")?.dataset
      ?.devAction;
    if (!action) return;
    if (action === "new-game") this.newGame();
    if (action === "toggle-collapse") this.toggleDeveloperPanel();
    if (action === "load-defaults") this.loadVariantDefaults();
    if (action === "fen-export") void this.exportFen();
    if (action === "fen-import") this.importFen();
    if (action === "clear-board") this.clearBoardForEditing();
    if (action === "undo-board-edit") this.undoBoardEdit();
  }

  handleDeveloperInput(event) {
    const target = event.target;
    if (!target?.id) return;
    if (target.id === "variant-select") {
      this.setVariant(normalizeVariantSelectValue(target.value));
      return;
    }
    if (target.id === "check-pattern-select") {
      this.updateRuleOverrides({ checkPattern: target.value });
      return;
    }
    if (target.id === "pawn-behavior-select") {
      this.updateRuleOverrides({ pawnBehavior: target.value });
      return;
    }
    if (target.id === "pawn-initial-max-step-select") {
      this.updateRuleOverrides({ pawnInitialMaxStep: Number(target.value) });
      return;
    }
    if (target.id === "knight-movement-select") {
      this.updateRuleOverrides({ knightMovement: target.value });
      return;
    }
    if (target.id === "shields-disabled") {
      this.updateRuleOverrides(
        { shieldsEnabled: !target.checked },
        { restoreShields: !target.checked },
      );
      return;
    }
    if (target.id === "frame-enabled") {
      this.updateRuleOverrides({ frameEnabled: target.checked });
      return;
    }
    if (target.id === "wraparound-enabled") {
      this.updateRuleOverrides({ wraparoundEnabled: target.checked });
      return;
    }
    if (target.id === "checkmate-disabled") {
      this.updateRuleOverrides({ checkmateEnabled: !target.checked });
      return;
    }
    if (target.id === "dev-current-player") {
      this.applyDeveloperMutation(() => {
        this.state.currentPlayer =
          target.value === COLORS.BLACK ? COLORS.BLACK : COLORS.WHITE;
      });
      return;
    }
    if (target.id === "dev-standard-used") {
      this.applyDeveloperMutation(() => {
        this.state.turn.standardMoveMade = target.checked;
      });
      return;
    }
    if (target.id === "dev-special-used") {
      this.applyDeveloperMutation(() => {
        this.state.turn.specialMoveMade = target.checked;
      });
      return;
    }
    if (target.id === "dev-move-number") {
      this.applyDeveloperMutation(() => {
        this.state.moveNumber = Math.max(1, Number(target.value) || 1);
      });
      return;
    }
    if (target.id === "board-edit-enabled") {
      this.developer.boardEditEnabled = target.checked;
      this.cancelAi();
      this.clearSelection();
      this.render();
      return;
    }
    if (target.id === "edit-piece-type") {
      this.developer.editPieceType = target.value;
      this.render();
      return;
    }
    if (target.id === "edit-piece-color") {
      this.developer.editPieceColor =
        target.value === COLORS.BLACK ? COLORS.BLACK : COLORS.WHITE;
      this.render();
      return;
    }
    if (target.id === "edit-piece-shield") {
      this.developer.editPieceShield = target.checked;
      this.render();
      return;
    }
    if (target.id === "edit-piece-immune") {
      this.developer.editPieceImmune = target.checked;
      this.render();
      return;
    }
    if (target.id === "edit-piece-moved") {
      this.developer.editPieceMoved = target.checked;
      this.render();
      return;
    }
    if (target.id === "fen-field") {
      this.developer.fenText = target.value;
      this.developer.keepFenDraft = true;
      this.renderer.resizeDeveloperFenField();
    }
  }

  handleDocumentClick(event) {
    if (!this.settingsOpen && !this.rulesOpen) return;
    const target = event.target;
    const inSettings =
      this.renderer.settingsEl?.contains?.(target) ||
      target.closest?.('[data-control="settings"]');
    const inRules =
      this.renderer.rulesEl?.contains?.(target) ||
      target.closest?.('[data-control="rules"]');
    const nextSettingsOpen = this.settingsOpen && Boolean(inSettings);
    const nextRulesOpen = this.rulesOpen && Boolean(inRules);
    if (
      nextSettingsOpen === this.settingsOpen &&
      nextRulesOpen === this.rulesOpen
    )
      return;
    this.settingsOpen = nextSettingsOpen;
    this.rulesOpen = nextRulesOpen;
    this.render();
  }

  canHumanAct() {
    if (this.state.gameOver || this.isAiRunning) return false;
    return (
      !this.isPlayingAgainstAi() || this.state.currentPlayer === HUMAN_COLOR
    );
  }

  isPlayingAgainstAi() {
    return isAiEnabled(this.settings);
  }

  selectPiece(piece) {
    const actions = getActionsForPiece(this.state, piece.id);
    const foolProfile =
      piece.type === PIECE_TYPES.FOOL
        ? foolProfileForState(this.state, piece)
        : null;
    if (actions.length === 0) {
      this.view = this.createEmptyView();
      this.view.phaseInfo =
        piece.type === PIECE_TYPES.FOOL
          ? foolProfile
            ? `Fool selected: imitating ${foolProfile.type}, but has no legal action in the remaining turn slots.`
            : "Fool selected: no copied behavior yet."
          : "That piece has no legal action in the remaining turn slots.";
      this.render();
      return;
    }

    this.view = {
      ...this.createEmptyView(),
      selectedPiece: piece,
      selectedActions: actions,
      phaseInfo:
        piece.type === PIECE_TYPES.FOOL
          ? `Fool selected: imitating ${foolProfile?.type ?? "nothing"}.`
          : `${piece.type} selected.`,
      highlights: highlightsForActions(this.state, actions, piece),
    };
    this.render();
  }

  tryDestination(row, col) {
    const candidates = this.view.selectedActions.filter((action) => {
      const square = action.to;
      return action.kind === "move" && square?.r === row && square?.c === col;
    });
    if (candidates.length === 0) return false;
    if (isRampAction(candidates[0])) {
      this.commitOrPromote([chooseRampAction(candidates)]);
    } else {
      this.commitOrPromote(candidates);
    }
    return true;
  }

  trySpecial(row, col) {
    const candidates = this.view.selectedActions.filter((action) => {
      const square = action.to;
      return (
        action.kind === "special" && square?.r === row && square?.c === col
      );
    });
    if (candidates.length === 0) return false;
    this.commitAction(candidates[0]);
    return true;
  }

  tryAttack(row, col) {
    const candidates = this.view.selectedActions.filter((action) => {
      const square = action.to;
      return action.kind === "attack" && square?.r === row && square?.c === col;
    });
    if (candidates.length === 0) return false;

    const stagingKeys = uniqueSquareKeys(
      candidates.map((action) => action.staging),
    );
    if (stagingKeys.length > 1) {
      this.view = {
        ...this.view,
        phase: "staging",
        attackCandidates: candidates,
        highlights: {
          ...emptyHighlights(),
          staging: new Set(stagingKeys),
        },
        phaseInfo: "Choose a staging square for the attack.",
      };
      this.render();
      return true;
    }

    this.chooseAttackRest(candidates);
    return true;
  }

  chooseStaging(row, col) {
    const key = `${row},${col}`;
    const candidates = this.view.attackCandidates.filter(
      (action) => squareKey(action.staging) === key,
    );
    if (candidates.length === 0) {
      this.clearSelection();
      this.render();
      return;
    }
    this.chooseAttackRest(candidates);
  }

  chooseAttackRest(candidates) {
    const restKeys = uniqueSquareKeys(candidates.map((action) => action.rest));
    if (restKeys.length > 1) {
      this.view = {
        ...this.view,
        phase: "resting",
        stagedAttackCandidates: candidates,
        highlights: {
          ...emptyHighlights(),
          resting: new Set(restKeys),
        },
        phaseInfo: "Confirm the attacker rest square.",
      };
      this.render();
      return;
    }
    this.commitOrPromote(candidates);
  }

  chooseResting(row, col) {
    const key = `${row},${col}`;
    const candidates = this.view.stagedAttackCandidates.filter(
      (action) => squareKey(action.rest) === key,
    );
    if (candidates.length === 0) return;
    this.commitOrPromote(candidates);
  }

  commitOrPromote(candidates) {
    const promotionActions = candidates.filter(
      (action) => action.promotionType,
    );
    if (promotionActions.length > 1) {
      this.view = {
        ...this.view,
        phase: "promotion",
        promotionActions,
        highlights: emptyHighlights(),
        phaseInfo: "Choose a promotion piece.",
      };
      this.render();
      return;
    }
    this.commitAction(candidates[0]);
  }

  commitAction(action) {
    if (!isCurrentLegalAction(this.state, action)) {
      this.clearSelection();
      this.view.phaseInfo = "That action is no longer legal.";
      this.render();
      return;
    }
    this.rememberUndoAnchor();
    const previous = this.animator.snapshot();
    this.state = applyAction(this.state, action);
    this.clearSelection();
    this.render();
    this.animator.animate(previous, action, this.settings.animationsEnabled);
    this.maybeRunAiTurn({ startDelay: this.animationDelay(action) });
  }

  skipSpecialMove() {
    if (
      !this.canHumanAct() ||
      !canSkipSpecialMove(this.state, this.state.currentPlayer)
    )
      return;
    this.rememberUndoAnchor();
    const previous = this.animator.snapshot();
    this.state = skipSpecialMove(this.state, this.state.currentPlayer);
    this.clearSelection();
    this.render();
    this.animator.animate(
      previous,
      this.state.lastAction,
      this.settings.animationsEnabled,
    );
    this.maybeRunAiTurn({
      startDelay: this.animationDelay(this.state.lastAction),
    });
  }

  newGame() {
    this.cancelAi();
    this.state = createGameState({
      variantId: this.settings.variantId,
      overrides: this.state.ruleOverrides,
    });
    this.isAiRunning = false;
    this.undoStack = [];
    this.boardEditUndoStack = [];
    this.lastUndoAnchorKey = null;
    this.settingsOpen = false;
    this.rulesOpen = false;
    this.clearSelection();
    this.render();
    this.maybeRunAiTurn();
  }

  cancelAi() {
    this.aiRunToken += 1;
    this.isAiRunning = false;
    cancelAiWorkerSearch();
  }

  toggleDeveloperPanel() {
    this.developer.collapsed = !this.developer.collapsed;
    this.render();
  }

  setVariant(variantId) {
    const nextVariantId = getVariant(variantId).id;
    this.settings = saveSettings({
      ...this.settings,
      variantId: nextVariantId,
      aiLevel:
        nextVariantId === DEFAULT_UI_VARIANT_ID ? 0 : this.settings.aiLevel,
    });
    this.cancelAi();
    this.state = createGameState({ variantId: nextVariantId });
    this.undoStack = [];
    this.boardEditUndoStack = [];
    this.lastUndoAnchorKey = null;
    this.developer.fenText = stateToFen(this.state);
    this.developer.keepFenDraft = false;
    this.developer.message = `${getVariant(nextVariantId).name} loaded.`;
    this.clearSelection();
    this.render();
    this.maybeRunAiTurn();
  }

  loadVariantDefaults() {
    this.cancelAi();
    this.state = createGameState({ variantId: this.state.variantId });
    this.settings = saveSettings({
      ...this.settings,
      variantId: this.state.variantId,
      aiLevel:
        this.state.variantId === DEFAULT_UI_VARIANT_ID
          ? 0
          : this.settings.aiLevel,
    });
    this.undoStack = [];
    this.boardEditUndoStack = [];
    this.lastUndoAnchorKey = null;
    this.developer.fenText = stateToFen(this.state);
    this.developer.keepFenDraft = false;
    this.developer.message = "Variant defaults restored.";
    this.clearSelection();
    this.render();
  }

  updateRuleOverrides(overrides, options = {}) {
    this.applyDeveloperMutation(() => {
      const wasShieldless = this.state.ruleOverrides?.shieldsEnabled === false;
      this.state.ruleOverrides = normalizeRuleOverrides(this.state.variantId, {
        ...this.state.ruleOverrides,
        ...overrides,
      });
      if (ruleOverrideClearsEnPassant(overrides)) this.state.enPassant = null;
      applyShieldOverrideToBoard(this.state, {
        restoreEligible:
          options.restoreShields ??
          (wasShieldless && this.state.ruleOverrides.shieldsEnabled),
      });
    });
  }

  applyDeveloperMutation(mutator, options = {}) {
    this.cancelAi();
    mutator();
    applyShieldOverrideToBoard(this.state, {
      restoreEligible: Boolean(options.restoreShields),
    });
    if (options.clearHistory) {
      this.state.lastAction = null;
      this.state.actionHistory = [];
      this.state.capturedPieces = [];
      this.undoStack = [];
      this.lastUndoAnchorKey = null;
    }
    this.state.gameOver = null;
    updateIntimidation(this.state);
    normalizeTurn(this.state);
    this.developer.fenText = stateToFen(this.state);
    this.developer.keepFenDraft = false;
    this.developer.message = "";
    this.clearSelection();
    this.render();
  }

  async exportFen() {
    this.developer.fenText = stateToFen(this.state);
    this.developer.keepFenDraft = false;
    this.developer.message = "FEN exported.";
    this.render();
    if (!(await copyTextToClipboard(this.developer.fenText))) return;
    this.developer.message = "FEN copied.";
    this.showDeveloperToast("Copied");
    this.render();
  }

  showDeveloperToast(message, durationMs = 1200) {
    if (this.devToastTimer) globalThis.clearTimeout?.(this.devToastTimer);
    this.developer.toastMessage = message;
    this.devToastTimer = globalThis.setTimeout?.(() => {
      this.developer.toastMessage = "";
      this.devToastTimer = null;
      this.render();
    }, durationMs);
    this.devToastTimer?.unref?.();
  }

  importFen() {
    try {
      this.cancelAi();
      const nextState = createStateFromFen(this.developer.fenText, {
        variantId: this.state.variantId,
        overrides: this.state.ruleOverrides,
        referenceState: this.state,
      });
      this.rememberBoardEditUndo();
      this.state = nextState;
      updateIntimidation(this.state);
      normalizeTurn(this.state);
      this.undoStack = [];
      this.lastUndoAnchorKey = null;
      this.developer.fenText = stateToFen(this.state);
      this.developer.keepFenDraft = false;
      this.developer.message = "FEN imported.";
      this.clearSelection();
      this.render();
    } catch (error) {
      this.developer.message = errorMessage(error);
      this.developer.keepFenDraft = true;
      this.render();
    }
  }

  clearBoardForEditing() {
    this.rememberBoardEditUndo();
    this.applyDeveloperMutation(() => {
      this.state.board = createEmptyState(this.state.currentPlayer, {
        variantId: this.state.variantId,
        ruleOverrides: this.state.ruleOverrides,
      }).board;
      this.state.enPassant = null;
      this.state.foolMemory = { [COLORS.WHITE]: null, [COLORS.BLACK]: null };
    }, { clearHistory: true });
  }

  applyBoardEdit(row, col) {
    this.rememberBoardEditUndo();
    this.applyDeveloperMutation(() => {
      if (!this.developer.editPieceType) {
        setPiece(this.state.board, row, col, null);
        return;
      }
      setPiece(
        this.state.board,
        row,
        col,
        createPiece(
          this.developer.editPieceType,
          this.developer.editPieceColor,
          row,
          col,
          {
            hasShield:
              this.developer.editPieceShield &&
              this.state.ruleOverrides.shieldsEnabled &&
              canHaveShield(this.developer.editPieceType),
            isImmune: this.developer.editPieceImmune,
            hasMoved: this.developer.editPieceMoved,
            id: `dev-${Date.now()}-${row}-${col}-${Math.random()
              .toString(36)
              .slice(2)}`,
          },
        ),
      );
      this.state.enPassant = null;
    }, { clearHistory: true });
  }

  clearSelection() {
    this.view = this.createEmptyView();
    if (this.canHumanAct()) {
      this.view.phaseInfo = `${playerName(this.state.currentPlayer)} to move. Select a piece.`;
    }
  }

  async maybeRunAiTurn({ startDelay = 0 } = {}) {
    if (
      !this.isPlayingAgainstAi() ||
      this.isAiRunning ||
      this.state.gameOver ||
      this.state.currentPlayer !== AI_COLOR
    )
      return;
    const runToken = ++this.aiRunToken;
    this.isAiRunning = true;
    if (startDelay > 0) await delay(startDelay);
    if (
      runToken !== this.aiRunToken ||
      !this.isPlayingAgainstAi() ||
      this.state.gameOver ||
      this.state.currentPlayer !== AI_COLOR
    ) {
      this.isAiRunning = false;
      this.render();
      return;
    }
    this.view = { ...this.createEmptyView(), isAiThinking: true };
    this.render();

    while (
      this.isPlayingAgainstAi() &&
      !this.state.gameOver &&
      this.state.currentPlayer === AI_COLOR
    ) {
      const aiOptions = aiOptionsForLevel(this.settings.aiLevel);
      await delay(aiOptions.thinkDelay);
      if (
        runToken !== this.aiRunToken ||
        !this.isPlayingAgainstAi() ||
        this.state.gameOver ||
        this.state.currentPlayer !== AI_COLOR
      )
        break;
      let action = null;
      try {
        action = await chooseAiActionForUi(this.state, AI_COLOR, aiOptions);
      } catch {
        break;
      }
      if (
        runToken !== this.aiRunToken ||
        !this.isPlayingAgainstAi() ||
        this.state.gameOver ||
        this.state.currentPlayer !== AI_COLOR
      )
        break;
      if (!action) break;
      const statusState = this.state;
      const previous = this.animator.snapshot();
      this.state = applyAction(this.state, action);
      const holdAiTurnStatus =
        !this.state.gameOver && this.state.currentPlayer !== AI_COLOR;
      this.view = {
        ...this.createEmptyView(),
        isAiThinking: this.state.currentPlayer === AI_COLOR,
        isAiAnimating: holdAiTurnStatus,
        statusState: holdAiTurnStatus ? statusState : null,
      };
      this.render();
      this.animator.animate(previous, action, this.settings.animationsEnabled);
      await delay(this.animationDelay(action));
      if (runToken !== this.aiRunToken) break;
    }

    if (runToken !== this.aiRunToken) return;
    this.isAiRunning = false;
    this.clearSelection();
    this.render();
  }

  render() {
    const selected = this.view.selectedPiece
      ? findPieceById(this.state, this.view.selectedPiece.id)
      : null;
    this.renderer.render(this.state, {
      ...this.view,
      selectedPiece: selected,
      isAiThinking: this.isAiRunning || this.view.isAiThinking,
      canSkipSpecial: this.canShowSkip(),
      settings: this.settings,
      settingsOpen: this.settingsOpen,
      rulesOpen: this.rulesOpen,
      aiLabel: aiLabelForLevel(this.settings.aiLevel),
      boardSide: effectivePlayerSide(this.settings),
      sideLocked: this.isPlayingAgainstAi(),
      canUndo: this.canUndo(),
      developer: this.developer,
      canUndoBoardEdit: this.canUndoBoardEdit(),
    });
  }

  canShowSkip() {
    return (
      this.canHumanAct() &&
      canSkipSpecialMove(this.state, this.state.currentPlayer)
    );
  }

  animationDelay(action = null) {
    if (!this.settings.animationsEnabled) return 0;
    return Math.max(
      ANIMATION_TIMING.turnAdvanceDelayMs,
      moveAnimationDurationForAction(action) + 60,
    );
  }

  rememberUndoAnchor() {
    if (!this.canHumanAct()) return;
    const key = turnUndoKey(this.state);
    if (this.lastUndoAnchorKey === key) return;
    this.undoStack.push({
      key,
      state: cloneState(this.state),
    });
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.lastUndoAnchorKey = key;
  }

  canUndo() {
    return !this.isAiRunning && this.undoStack.length > 0;
  }

  undoLastTurn() {
    if (!this.canUndo()) return;
    this.aiRunToken += 1;
    cancelAiWorkerSearch();
    const entry = this.undoStack.pop();
    this.state = cloneState(entry.state);
    this.lastUndoAnchorKey = null;
    this.isAiRunning = false;
    this.settingsOpen = false;
    this.rulesOpen = false;
    this.clearSelection();
    this.render();
  }

  rememberBoardEditUndo() {
    this.boardEditUndoStack.push(
      cloneState(this.state, { preserveHistory: false }),
    );
    if (this.boardEditUndoStack.length > 40) this.boardEditUndoStack.shift();
  }

  canUndoBoardEdit() {
    return !this.isAiRunning && this.boardEditUndoStack.length > 0;
  }

  undoBoardEdit() {
    if (!this.canUndoBoardEdit()) return;
    this.cancelAi();
    this.state = cloneState(this.boardEditUndoStack.pop(), {
      preserveHistory: false,
    });
    this.undoStack = [];
    this.lastUndoAnchorKey = null;
    updateIntimidation(this.state);
    normalizeTurn(this.state);
    this.developer.fenText = stateToFen(this.state);
    this.developer.keepFenDraft = false;
    this.developer.message = "Board edit undone.";
    this.clearSelection();
    this.render();
  }
}

function highlightsForActions(state, actions, selectedPiece) {
  const highlights = emptyHighlights();
  const moveActions = actions.filter(
    (action) => action.kind === "move" && action.to,
  );
  const moveGroups = groupByDestination(
    moveActions.filter((action) => !isRampAction(action)),
  );
  const rampGroups = groupByDestination(
    moveActions.filter((action) => isRampAction(action)),
  );

  for (const [key, candidates] of moveGroups) {
    if (candidates.every((action) => movePassesThroughDeath(state, action)))
      highlights.deathMoves.add(key);
    else highlights.moves.add(key);
  }

  for (const [key, candidates] of rampGroups) {
    if (candidates.every((action) => movePassesThroughDeath(state, action)))
      highlights.deathRampMoves.add(key);
    else highlights.rampMoves.add(key);
  }

  for (const action of actions) {
    if (action.kind === "attack") highlights.attacks.add(squareKey(action.to));
    if (action.kind === "special")
      highlights.specials.add(squareKey(action.to));
  }
  highlights.moves.delete(`${selectedPiece.row},${selectedPiece.col}`);
  highlights.rampMoves.delete(`${selectedPiece.row},${selectedPiece.col}`);
  highlights.deathMoves.delete(`${selectedPiece.row},${selectedPiece.col}`);
  highlights.deathRampMoves.delete(`${selectedPiece.row},${selectedPiece.col}`);
  return highlights;
}

function groupByDestination(actions) {
  const groups = new Map();
  for (const action of actions) {
    const key = squareKey(action.to);
    groups.set(key, [...(groups.get(key) ?? []), action]);
  }
  return groups;
}

function ruleOverrideClearsEnPassant(overrides = {}) {
  return [
    "checkPattern",
    "pawnBehavior",
    "pawnInitialMaxStep",
    "knightMovement",
    "shieldsEnabled",
    "frameEnabled",
    "wraparoundEnabled",
    "checkmateEnabled",
  ].some((key) => Object.hasOwn(overrides, key));
}

async function copyTextToClipboard(text) {
  const writeText = globalThis.navigator?.clipboard?.writeText;
  if (typeof writeText !== "function") return false;
  try {
    await writeText.call(globalThis.navigator.clipboard, text);
    return true;
  } catch {
    return false;
  }
}

function normalizeVariantSelectValue(value) {
  return String(value ?? "").replace(/^custom:/, "");
}

function movePassesThroughDeath(state, action) {
  if (action.deathLanding) return true;
  return (action.path ?? []).some(
    (square) => state.board[square.r]?.[square.c]?.type === PIECE_TYPES.DEATH,
  );
}

function isRampAction(action) {
  return Array.isArray(action?.rampSequence) && action.rampSequence.length > 0;
}

function chooseRampAction(candidates) {
  const bestScore = Math.max(...candidates.map(rampRouteScore));
  const bestRoutes = candidates.filter(
    (action) => rampRouteScore(action) === bestScore,
  );
  const shortestLength = Math.min(...bestRoutes.map(rampRouteLength));
  const preferred = bestRoutes.filter(
    (action) => rampRouteLength(action) === shortestLength,
  );
  if (preferred.length === 1) return preferred[0];
  return preferred[Math.floor(Math.random() * preferred.length)];
}

function rampRouteLength(action) {
  return action.rampSequence?.length ?? 1;
}

function rampRouteScore(action) {
  let lifeCount = 0;
  let deathCount = 0;
  for (const step of action.rampSequence ?? []) {
    if (step.rampType === PIECE_TYPES.LIFE) lifeCount += 1;
    if (step.rampType === PIECE_TYPES.DEATH) deathCount += 1;
  }
  const shieldStripCount = action.shieldStrips?.length ?? 0;
  return shieldStripCount * 220 + lifeCount * 100 - deathCount * 1000;
}

function uniqueSquareKeys(squares) {
  return [
    ...new Set(squares.filter(Boolean).map((square) => squareKey(square))),
  ];
}

async function chooseAiActionForUi(state, color, options) {
  if (typeof globalThis.Worker === "function") {
    try {
      return await chooseAiActionInWorker(state, color, options);
    } catch (error) {
      if (isAiWorkerCancellation(error) || !isAiWorkerStartupFailure(error)) {
        throw error;
      }
    }
  }

  return chooseAiActionOnMainThread(state, color, options);
}

function chooseAiActionInWorker(state, color, options) {
  return new Promise((resolve, reject) => {
    const workerUrl = new URL("../ai-worker.js", import.meta.url).href;
    let worker = null;
    try {
      worker = new Worker(new URL("../ai-worker.js", import.meta.url), {
        type: "module",
      });
    } catch (error) {
      reject(aiWorkerStartupError(error));
      return;
    }
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    const timeoutMs =
      Math.max(options?.hardTimeLimitMs ?? 0, options?.timeLimitMs ?? 0) + 1200;
    const timer =
      timeoutMs > 1200
        ? setTimeout(() => {
            cleanupWorker(worker);
            reject(new Error("AI worker timed out"));
          }, timeoutMs)
        : null;

    activeAiWorker = {
      reject,
      timer,
      url: workerUrl,
      worker,
    };

    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cleanupWorker(worker);
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      resolve(event.data.action ?? null);
    };

    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cleanupWorker(worker);
      reject(event.error ?? new Error("AI worker failed"));
    };

    worker.postMessage({ id, state, color, options });
  });
}

async function chooseAiActionOnMainThread(state, color, options) {
  await delay(0);
  return chooseAiAction(state, color, mainThreadAiOptions(options));
}

function mainThreadAiOptions(options = {}) {
  const timeLimitMs =
    options.timeLimitMs && options.timeLimitMs > 0 ? options.timeLimitMs : 650;
  const hardTimeLimitMs =
    options.hardTimeLimitMs && options.hardTimeLimitMs > 0
      ? options.hardTimeLimitMs
      : 950;
  return {
    ...options,
    maxDepth: Math.min(options.maxDepth ?? 3, 5),
    maxActions: Math.min(options.maxActions ?? 36, 34),
    maxTacticalActions: Math.min(options.maxTacticalActions ?? 8, 14),
    quiescenceDepth: Math.min(options.quiescenceDepth ?? 0, 2),
    priorityOverflowLimit: Math.min(options.priorityOverflowLimit ?? 12, 12),
    timeLimitMs: Math.min(timeLimitMs, 650),
    hardTimeLimitMs: Math.min(hardTimeLimitMs, 950),
  };
}

function isAiWorkerCancellation(error) {
  return errorMessage(error).includes("cancelled");
}

function isAiWorkerStartupFailure(error) {
  return Boolean(error?.aiWorkerStartupFailed);
}

function aiWorkerStartupError(error) {
  const startupError = new Error(
    errorMessage(error) || "AI worker startup failed",
  );
  startupError.cause = error;
  startupError.aiWorkerStartupFailed = true;
  return startupError;
}

function errorMessage(error) {
  return String(error?.message ?? error ?? "");
}

let activeAiWorker = null;

function cancelAiWorkerSearch() {
  if (!activeAiWorker) return;
  const { reject, timer, worker } = activeAiWorker;
  activeAiWorker = null;
  if (timer) clearTimeout(timer);
  worker.terminate();
  reject(new Error("AI worker cancelled"));
}

function cleanupWorker(worker) {
  if (activeAiWorker?.worker === worker) activeAiWorker = null;
  worker.terminate();
}

async function clearBrowserRuntimeCaches() {
  const cacheStorage = globalThis.caches;
  if (cacheStorage?.keys && cacheStorage?.delete) {
    try {
      const names = await cacheStorage.keys();
      await Promise.all(names.map((name) => cacheStorage.delete(name)));
    } catch {
      // Best-effort browser cache cleanup before reload.
    }
  }

  const serviceWorker = globalThis.navigator?.serviceWorker;
  if (serviceWorker?.getRegistrations) {
    try {
      const registrations = await serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    } catch {
      // No service worker is required for this app.
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function playerName(color) {
  return color === COLORS.WHITE ? "White" : "Black";
}

function turnUndoKey(state) {
  return `${state.currentPlayer}|${state.moveNumber}`;
}

export function legalActionSummary(state) {
  return generateLegalActions(state).map((action) => action.id);
}

function isCurrentLegalAction(state, action) {
  if (!action?.id) return false;
  return generateLegalActions(state).some(
    (candidate) => candidate.id === action.id,
  );
}
