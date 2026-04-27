import {
    COLORS,
    applyAction,
    canSkipSpecialMove,
    chooseAiAction,
    createGameState,
    findPieceById,
    generateLegalActions,
    getActionsForPiece,
    ownerOf,
    skipHumanSpecialMove,
    squareKey,
} from '../engine/index.js';
import { Renderer, emptyHighlights } from './renderer.js';
import { ANIMATION_TIMING, BoardAnimator, moveAnimationDurationForAction } from './animation.js';
import {
    aiLabelForLevel,
    aiOptionsForLevel,
    effectivePlayerSide,
    isAiEnabled,
    loadSettings,
    saveSettings,
} from './settings.js';

const AI_COLOR = COLORS.BLACK;
const HUMAN_COLOR = COLORS.WHITE;

export class GameController {
    constructor({ boardEl, coordinateEl, statusPanelEl, promotionEl, controlsEl, settingsEl, rulesEl }) {
        this.renderer = new Renderer({ boardEl, coordinateEl, statusPanelEl, promotionEl, controlsEl, settingsEl, rulesEl });
        this.animator = new BoardAnimator(boardEl);
        this.state = createGameState();
        this.view = this.createEmptyView();
        this.isAiRunning = false;
        this.settings = loadSettings();
        this.settingsOpen = false;
        this.rulesOpen = false;
        this.documentClickHandler = (event) => this.handleDocumentClick(event);
        this.boardContextMenuHandler = (event) => this.suppressBoardContextMenu(event);

        boardEl.addEventListener('click', (event) => this.handleBoardClick(event));
        boardEl.addEventListener('contextmenu', this.boardContextMenuHandler);
        boardEl.addEventListener('auxclick', this.boardContextMenuHandler);
        promotionEl.addEventListener('click', (event) => this.handlePromotionClick(event));
        controlsEl?.addEventListener('click', (event) => this.handleControlClick(event));
        settingsEl?.addEventListener('click', (event) => this.handleSettingsClick(event));
        settingsEl?.addEventListener('input', (event) => this.handleSettingsInput(event));
        settingsEl?.addEventListener('change', (event) => this.handleSettingsInput(event));
        globalThis.document?.addEventListener?.('click', this.documentClickHandler, true);
        this.render();
        this.maybeRunAiTurn();
    }

    createEmptyView() {
        return {
            selectedPiece: null,
            selectedActions: [],
            phase: 'select',
            phaseInfo: 'White to move. Select a piece.',
            highlights: emptyHighlights(),
            attackCandidates: [],
            rampRouteCandidates: [],
            stagedAttackCandidates: [],
            promotionActions: [],
            isAiThinking: false,
        };
    }

    handleBoardClick(event) {
        const square = event.target.closest('.square');
        if (!square || !this.canHumanAct()) return;
        const row = Number(square.dataset.row);
        const col = Number(square.dataset.col);

        if (this.view.phase === 'staging') {
            this.chooseStaging(row, col);
            return;
        }

        if (this.view.phase === 'resting') {
            this.chooseResting(row, col);
            return;
        }

        if (this.view.phase === 'ramp-route') {
            this.chooseRampRoute(row, col);
            return;
        }

        const piece = this.state.board[row][col];
        if (this.view.selectedPiece) {
            if (this.view.selectedPiece.row === row && this.view.selectedPiece.col === col) {
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

        if (piece && ownerOf(piece) === this.state.currentPlayer) this.selectPiece(piece);
    }

    suppressBoardContextMenu(event) {
        if (event.button === undefined || event.button === 2) event.preventDefault?.();
    }

    handlePromotionClick(event) {
        const button = event.target.closest('[data-promotion]');
        if (!button || this.view.promotionActions.length === 0) return;
        const action = this.view.promotionActions.find((candidate) => candidate.promotionType === button.dataset.promotion);
        if (action) this.commitAction(action);
    }

    handleControlClick(event) {
        const control = event.target.closest('[data-control]');
        if (!control) return;
        if (control.dataset.control === 'skip-special') {
            this.skipSpecialMove();
        }
        if (control.dataset.control === 'new-game') {
            this.newGame();
        }
        if (control.dataset.control === 'settings') {
            this.settingsOpen = !this.settingsOpen;
            if (this.settingsOpen) this.rulesOpen = false;
            this.render();
        }
        if (control.dataset.control === 'rules') {
            this.rulesOpen = !this.rulesOpen;
            if (this.rulesOpen) this.settingsOpen = false;
            this.render();
        }
    }

    handleSettingsInput(event) {
        const target = event.target;
        if (target.id === 'ai-level') {
            this.settings = saveSettings({ ...this.settings, aiLevel: Number(target.value) });
            this.clearSelection();
            this.render();
            this.maybeRunAiTurn();
        }
        if (target.id === 'animations-enabled') {
            this.settings = saveSettings({ ...this.settings, animationsEnabled: target.checked });
            this.render();
        }
    }

    handleSettingsClick(event) {
        const sideButton = event.target.closest?.('[data-side]');
        if (!sideButton || sideButton.disabled || this.isPlayingAgainstAi()) return;
        this.settings = saveSettings({ ...this.settings, playerSide: sideButton.dataset.side });
        this.render();
    }

    handleDocumentClick(event) {
        if (!this.settingsOpen && !this.rulesOpen) return;
        const target = event.target;
        const inSettings = this.renderer.settingsEl?.contains?.(target)
            || target.closest?.('[data-control="settings"]');
        const inRules = this.renderer.rulesEl?.contains?.(target)
            || target.closest?.('[data-control="rules"]');
        const nextSettingsOpen = this.settingsOpen && Boolean(inSettings);
        const nextRulesOpen = this.rulesOpen && Boolean(inRules);
        if (nextSettingsOpen === this.settingsOpen && nextRulesOpen === this.rulesOpen) return;
        this.settingsOpen = nextSettingsOpen;
        this.rulesOpen = nextRulesOpen;
        this.render();
    }

    canHumanAct() {
        if (this.state.gameOver || this.isAiRunning) return false;
        return !this.isPlayingAgainstAi() || this.state.currentPlayer === HUMAN_COLOR;
    }

    isPlayingAgainstAi() {
        return isAiEnabled(this.settings);
    }

    selectPiece(piece) {
        const actions = getActionsForPiece(this.state, piece.id);
        if (actions.length === 0) {
            this.view = this.createEmptyView();
            this.view.phaseInfo = 'That piece has no legal action in the remaining turn slots.';
            this.render();
            return;
        }

        this.view = {
            ...this.createEmptyView(),
            selectedPiece: piece,
            selectedActions: actions,
            phaseInfo: `${piece.type} selected.`,
            highlights: highlightsForActions(actions, piece),
        };
        this.render();
    }

    tryDestination(row, col) {
        const candidates = this.view.selectedActions.filter((action) => {
            const square = action.to;
            return action.kind === 'move' && square?.r === row && square?.c === col;
        });
        if (candidates.length === 0) return false;
        if (candidates[0]?.mode === 'knightRamp') {
            this.chooseKnightRampRoute(candidates);
            return true;
        }
        this.commitOrPromote(candidates);
        return true;
    }

    trySpecial(row, col) {
        const candidates = this.view.selectedActions.filter((action) => {
            const square = action.to;
            return action.kind === 'special' && square?.r === row && square?.c === col;
        });
        if (candidates.length === 0) return false;
        this.commitAction(candidates[0]);
        return true;
    }

    tryAttack(row, col) {
        const candidates = this.view.selectedActions.filter((action) => {
            const square = action.to;
            return action.kind === 'attack' && square?.r === row && square?.c === col;
        });
        if (candidates.length === 0) return false;

        const stagingKeys = uniqueSquareKeys(candidates.map((action) => action.staging));
        if (stagingKeys.length > 1) {
            this.view = {
                ...this.view,
                phase: 'staging',
                attackCandidates: candidates,
                highlights: {
                    ...emptyHighlights(),
                    staging: new Set(stagingKeys),
                },
                phaseInfo: 'Choose a staging square for the attack.',
            };
            this.render();
            return true;
        }

        this.chooseAttackRest(candidates);
        return true;
    }

    chooseStaging(row, col) {
        const key = `${row},${col}`;
        const candidates = this.view.attackCandidates.filter((action) => squareKey(action.staging) === key);
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
                phase: 'resting',
                stagedAttackCandidates: candidates,
                highlights: {
                    ...emptyHighlights(),
                    resting: new Set(restKeys),
                },
                phaseInfo: 'Choose where the attacker rests.',
            };
            this.render();
            return;
        }
        this.commitOrPromote(candidates);
    }

    chooseKnightRampRoute(candidates) {
        const routeKeys = uniqueSquareKeys(candidates.map((action) => rampRouteChoiceSquare(action)));
        if (routeKeys.length > 1) {
            this.view = {
                ...this.view,
                phase: 'ramp-route',
                rampRouteCandidates: candidates,
                highlights: {
                    ...emptyHighlights(),
                    rampRoutes: new Set(routeKeys),
                },
                phaseInfo: 'Choose the Knight ramp route.',
            };
            this.render();
            return;
        }
        this.commitOrPromote(candidates);
    }

    chooseRampRoute(row, col) {
        const key = `${row},${col}`;
        const candidates = this.view.rampRouteCandidates.filter((action) => squareKey(rampRouteChoiceSquare(action)) === key);
        if (candidates.length === 0) return;
        this.commitOrPromote(candidates);
    }

    chooseResting(row, col) {
        const key = `${row},${col}`;
        const candidates = this.view.stagedAttackCandidates.filter((action) => squareKey(action.rest) === key);
        if (candidates.length === 0) return;
        this.commitOrPromote(candidates);
    }

    commitOrPromote(candidates) {
        const promotionActions = candidates.filter((action) => action.promotionType);
        if (promotionActions.length > 1) {
            this.view = {
                ...this.view,
                phase: 'promotion',
                promotionActions,
                highlights: emptyHighlights(),
                phaseInfo: 'Choose a promotion piece.',
            };
            this.render();
            return;
        }
        this.commitAction(candidates[0]);
    }

    commitAction(action) {
        const previous = this.animator.snapshot();
        this.state = applyAction(this.state, action);
        this.clearSelection();
        this.render();
        this.animator.animate(previous, action, this.settings.animationsEnabled);
        this.maybeRunAiTurn({ startDelay: this.animationDelay(action) });
    }

    skipSpecialMove() {
        if (!this.canHumanAct() || !canSkipSpecialMove(this.state, this.state.currentPlayer)) return;
        const previous = this.animator.snapshot();
        this.state = skipHumanSpecialMove(this.state, this.state.currentPlayer);
        this.clearSelection();
        this.render();
        this.animator.animate(previous, this.state.lastAction, this.settings.animationsEnabled);
        this.maybeRunAiTurn({ startDelay: this.animationDelay(this.state.lastAction) });
    }

    newGame() {
        this.state = createGameState();
        this.isAiRunning = false;
        this.settingsOpen = false;
        this.rulesOpen = false;
        this.clearSelection();
        this.render();
        this.maybeRunAiTurn();
    }

    clearSelection() {
        this.view = this.createEmptyView();
        if (this.canHumanAct()) {
            this.view.phaseInfo = `${playerName(this.state.currentPlayer)} to move. Select a piece.`;
        }
    }

    async maybeRunAiTurn({ startDelay = 0 } = {}) {
        if (!this.isPlayingAgainstAi() || this.isAiRunning || this.state.gameOver || this.state.currentPlayer !== AI_COLOR) return;
        this.isAiRunning = true;
        if (startDelay > 0) await delay(startDelay);
        if (!this.isPlayingAgainstAi() || this.state.gameOver || this.state.currentPlayer !== AI_COLOR) {
            this.isAiRunning = false;
            this.render();
            return;
        }
        this.view = { ...this.createEmptyView(), isAiThinking: true };
        this.render();

        while (this.isPlayingAgainstAi() && !this.state.gameOver && this.state.currentPlayer === AI_COLOR) {
            const aiOptions = aiOptionsForLevel(this.settings.aiLevel);
            await delay(aiOptions.thinkDelay);
            if (!this.isPlayingAgainstAi() || this.state.gameOver || this.state.currentPlayer !== AI_COLOR) break;
            const action = chooseAiAction(this.state, AI_COLOR, aiOptions);
            if (!action) break;
            const previous = this.animator.snapshot();
            this.state = applyAction(this.state, action);
            this.view = { ...this.createEmptyView(), isAiThinking: this.state.currentPlayer === AI_COLOR };
            this.render();
            this.animator.animate(previous, action, this.settings.animationsEnabled);
            await delay(this.animationDelay(action));
        }

        this.isAiRunning = false;
        this.clearSelection();
        this.render();
    }

    render() {
        const selected = this.view.selectedPiece ? findPieceById(this.state, this.view.selectedPiece.id) : null;
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
        });
    }

    canShowSkip() {
        return this.canHumanAct() && canSkipSpecialMove(this.state, this.state.currentPlayer);
    }

    animationDelay(action = null) {
        if (!this.settings.animationsEnabled) return 0;
        return Math.max(
            ANIMATION_TIMING.turnAdvanceDelayMs,
            moveAnimationDurationForAction(action) + 60,
        );
    }
}

function highlightsForActions(actions, selectedPiece) {
    const highlights = emptyHighlights();
    for (const action of actions) {
        if (action.kind === 'move' && action.mode === 'knightRamp') highlights.rampMoves.add(squareKey(action.to));
        else if (action.kind === 'move') highlights.moves.add(squareKey(action.to));
        if (action.kind === 'attack') highlights.attacks.add(squareKey(action.to));
        if (action.kind === 'special') highlights.specials.add(squareKey(action.to));
    }
    highlights.moves.delete(`${selectedPiece.row},${selectedPiece.col}`);
    highlights.rampMoves.delete(`${selectedPiece.row},${selectedPiece.col}`);
    return highlights;
}

function rampRouteChoiceSquare(action) {
    if (action.rampSequence?.length > 1) return action.rampSequence[0].land;
    return action.to;
}

function uniqueSquareKeys(squares) {
    return [...new Set(squares.filter(Boolean).map((square) => squareKey(square)))];
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function playerName(color) {
    return color === COLORS.WHITE ? 'White' : 'Black';
}

export function legalActionSummary(state) {
    return generateLegalActions(state).map((action) => action.id);
}
