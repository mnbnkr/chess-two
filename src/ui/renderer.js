import {
    BOARD_SIZE,
    COLORS,
    FILES,
    LIFE_DEATH_PIECES,
    PROMOTION_TYPES,
    ownerOf,
    generateLegalActions,
    symbolFor,
} from '../engine/index.js';

export class Renderer {
    constructor({ boardEl, coordinateEl, statusPanelEl, promotionEl, controlsEl, settingsEl, rulesEl }) {
        this.boardEl = boardEl;
        this.coordinateEl = coordinateEl;
        this.statusPanelEl = statusPanelEl;
        this.promotionEl = promotionEl;
        this.controlsEl = controlsEl;
        this.settingsEl = settingsEl;
        this.rulesEl = rulesEl;
        this.actionHistoryRef = null;
        this.actionHistoryLength = -1;
        this.actionHistoryLastKey = '';
        this.actionHistoryScrollEl = null;
        this.renderedPlayer = null;
    }

    render(state, view = {}) {
        this.renderBoard(state, view);
        this.renderCoordinates(view);
        this.renderStatus(state, view);
        this.renderControls(view);
        this.renderPromotion(view);
        this.renderSettings(view);
        this.renderRules(view);
    }

    renderBoard(state, view) {
        this.boardEl.innerHTML = '';
        const highlights = view.highlights ?? emptyHighlights();
        const rowOrder = orderedIndexes(view.boardSide);
        const colOrder = orderedIndexes(view.boardSide);

        for (const r of rowOrder) {
            for (const c of colOrder) {
                const square = document.createElement('button');
                square.type = 'button';
                square.className = `square ${(r + c) % 2 === 0 ? 'dark' : 'light'}`;
                square.dataset.row = String(r);
                square.dataset.col = String(c);
                square.setAttribute('aria-label', squareLabel(r, c));

                const piece = state.board[r][c];
                if (piece) {
                    square.classList.add('has-piece');
                    square.appendChild(renderPiece(piece, state));
                }

                const marker = markerForSquare(r, c, view, highlights);
                if (marker) {
                    square.classList.add('is-actionable');
                    square.appendChild(marker);
                }

                this.boardEl.appendChild(square);
            }
        }
    }

    renderStatus(state, view) {
        const statusState = view.statusState ?? state;
        const playerTurnEl = this.statusPanelEl.querySelector('#player-turn');
        const previousPlayer = this.renderedPlayer;
        const displayedPlayer = view.displayPlayer ?? statusState.currentPlayer;
        const playerSide = view.boardSide ?? COLORS.WHITE;
        const keepFlash = previousPlayer === displayedPlayer && playerTurnEl.className.includes('turn-start-flash');
        const shouldFlashTurn = previousPlayer
            && previousPlayer !== displayedPlayer
            && displayedPlayer === playerSide
            && !statusState.gameOver;
        playerTurnEl.textContent = playerName(displayedPlayer);
        playerTurnEl.className = `player-turn ${displayedPlayer}${keepFlash ? ' turn-start-flash' : ''}`;
        if (shouldFlashTurn) {
            restartClassAnimation(playerTurnEl, 'turn-start-flash');
        }
        this.renderedPlayer = displayedPlayer;
        this.renderActionHistory(state);

        const legalActions = statusState.gameOver ? [] : generateLegalActions(statusState);
        const standardStatus = statusState.turn.standardMoveMade
            ? 'Used'
            : (legalActions.some((action) => action.consumes?.standard) ? 'Available' : 'Unavailable');
        const specialStatus = statusState.turn.specialMoveMade
            ? 'Used'
            : (legalActions.some((action) => action.consumes?.special) ? 'Available' : 'Unavailable');
        setStatus(this.statusPanelEl.querySelector('#standard-move-status'), standardStatus);
        setStatus(this.statusPanelEl.querySelector('#special-move-status'), specialStatus);

        const info = this.statusPanelEl.querySelector('#phase-info');
        if (state.gameOver) {
            info.textContent = state.gameOver.winner
                ? `${playerName(state.gameOver.winner)} wins: ${state.gameOver.reason}.`
                : `Draw: ${state.gameOver.reason}.`;
        } else if (view.isAiAnimating) {
            info.textContent = 'Black AI is finishing its move...';
        } else if (view.isAiThinking) {
            info.textContent = 'Black AI is thinking...';
        } else {
            info.textContent = view.phaseInfo ?? `${playerName(statusState.currentPlayer)} to move.`;
        }

        const moveNumber = this.statusPanelEl.querySelector('#move-number');
        if (moveNumber) moveNumber.textContent = String(statusState.moveNumber);
    }

    renderActionHistory(state) {
        const history = this.statusPanelEl.querySelector('#action-history ol');
        if (!history) return;
        this.bindActionHistoryScroll(history);
        const actions = state.actionHistory ?? [];
        const lastKey = actionHistoryKey(actions.at(-1));
        if (
            this.actionHistoryRef === actions
            && this.actionHistoryLength === actions.length
            && this.actionHistoryLastKey === lastKey
        ) {
            updateActionHistoryFade(history);
            return;
        }

        const previousLength = this.actionHistoryLength;
        const previousLastKey = this.actionHistoryLastKey;
        if (actions.length === 0) {
            history.innerHTML = '';
            const item = document.createElement('li');
            item.textContent = 'None yet';
            item.className = 'empty-history';
            history.appendChild(item);
            this.actionHistoryRef = actions;
            this.actionHistoryLength = 0;
            this.actionHistoryLastKey = lastKey;
            updateActionHistoryFade(history);
            return;
        }

        const canAppend = previousLength > 0
            && actions.length > previousLength
            && history.children.length === previousLength
            && previousLastKey === actionHistoryKey(actions[previousLength - 1]);

        if (canAppend) {
            let previousColor = actionColor(actions[previousLength - 1]);
            for (let i = previousLength; i < actions.length; i++) {
                previousColor = appendActionHistoryItem(history, actions[i], previousColor);
            }
        } else {
            history.innerHTML = '';
            let previousColor = null;
            for (const action of actions) {
                previousColor = appendActionHistoryItem(history, action, previousColor);
            }
        }

        if (actions.length > previousLength) history.scrollTop = history.scrollHeight;
        this.actionHistoryRef = actions;
        this.actionHistoryLength = actions.length;
        this.actionHistoryLastKey = lastKey;
        updateActionHistoryFade(history);
    }

    bindActionHistoryScroll(history) {
        if (this.actionHistoryScrollEl === history) return;
        this.actionHistoryScrollEl = history;
        history.addEventListener('scroll', () => updateActionHistoryFade(history));
    }

    renderCoordinates(view) {
        if (!this.coordinateEl) return;
        this.coordinateEl.innerHTML = '';
        for (const col of orderedIndexes(view.boardSide)) {
            const label = document.createElement('span');
            label.textContent = FILES[col];
            this.coordinateEl.appendChild(label);
        }
    }

    renderPromotion(view) {
        this.promotionEl.innerHTML = '';
        const actions = view.promotionActions ?? [];
        if (actions.length === 0) {
            this.promotionEl.hidden = true;
            return;
        }

        this.promotionEl.hidden = false;
        this.promotionEl.className = 'promotion-dialog';
        this.promotionEl.setAttribute('role', 'dialog');
        this.promotionEl.setAttribute('aria-label', 'Choose promotion piece');
        const title = document.createElement('p');
        title.textContent = 'Promote pawn';
        this.promotionEl.appendChild(title);

        const options = document.createElement('div');
        options.className = 'promotion-options';
        for (const type of PROMOTION_TYPES) {
            const action = actions.find((candidate) => candidate.promotionType === type);
            if (!action) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'promotion-choice';
            button.dataset.promotion = type;
            button.textContent = type;
            options.appendChild(button);
        }
        this.promotionEl.appendChild(options);
    }

    renderControls(view) {
        if (!this.controlsEl) return;
        const skip = this.controlsEl.querySelector('[data-control="skip-special"]');
        const settings = this.controlsEl.querySelector('[data-control="settings"]');
        const rules = this.controlsEl.querySelector('[data-control="rules"]');
        if (skip) {
            skip.hidden = !view.canSkipSpecial;
            skip.disabled = !view.canSkipSpecial;
        }
        if (settings) {
            settings.setAttribute('aria-expanded', view.settingsOpen ? 'true' : 'false');
        }
        if (rules) {
            rules.setAttribute('aria-expanded', view.rulesOpen ? 'true' : 'false');
        }
    }

    renderSettings(view) {
        if (!this.settingsEl) return;
        this.settingsEl.hidden = !view.settingsOpen;
        const aiValue = this.settingsEl.querySelector('#ai-level');
        const aiLabel = this.statusPanelEl.querySelector('#ai-level-label');
        const aiSettingLabel = this.settingsEl.querySelector('#ai-setting-label');
        const animationToggle = this.settingsEl.querySelector('#animations-enabled');
        const sideButtons = this.settingsEl.querySelectorAll('[data-side]');
        const sideLock = this.settingsEl.querySelector('#side-lock-note');
        const aiLevel = view.settings?.aiLevel ?? 3;
        const activeSide = view.boardSide ?? COLORS.WHITE;
        if (aiValue) aiValue.value = String(aiLevel);
        if (aiLabel) aiLabel.textContent = view.aiLabel ?? 'Level 3';
        if (aiSettingLabel) aiSettingLabel.textContent = view.aiLabel ?? 'Level 3';
        if (animationToggle) animationToggle.checked = view.settings?.animationsEnabled ?? true;
        for (const button of sideButtons) {
            const active = button.dataset.side === activeSide;
            button.disabled = Boolean(view.sideLocked);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        if (sideLock) sideLock.hidden = !view.sideLocked;
    }

    renderRules(view) {
        if (!this.rulesEl) return;
        this.rulesEl.hidden = !view.rulesOpen;
    }
}

function renderPiece(piece, state) {
    const pieceEl = document.createElement('span');
    pieceEl.className = `piece ${piece.color}`;
    pieceEl.dataset.pieceId = piece.id;
    pieceEl.textContent = symbolFor(piece);
    const titleParts = [`${piece.color} ${piece.type}`];
    if (piece.hasShield) pieceEl.classList.add('has-shield');
    if (piece.isImmune) {
        pieceEl.classList.add('is-immune');
        titleParts.push('immune');
    }
    if (piece.isIntimidated) {
        pieceEl.classList.add('is-intimidated');
        if (piece.intimidationSuppressedShield) pieceEl.classList.add('intimidation-framed');
        titleParts.push(piece.intimidationSuppressedShield
            ? 'intimidated: shield suppressed while checking the enemy king'
            : 'intimidated while checking the enemy king');
    }
    if (state.gameOver?.winner === piece.color && piece.type === 'King') {
        pieceEl.classList.add('winning-king');
        titleParts.push('winner');
    }
    if (LIFE_DEATH_PIECES.has(piece.type)) {
        pieceEl.classList.add(piece.type === 'Life' ? 'life-piece' : 'death-piece');
        const owner = ownerOf(piece);
        pieceEl.dataset.owner = owner;
        pieceEl.classList.add(`owner-${owner}`);
        titleParts.push(`${owner} controlled`);
    }
    pieceEl.title = titleParts.join(' - ');
    return pieceEl;
}

function markerForSquare(row, col, view, highlights) {
    const classes = [];
    const key = `${row},${col}`;
    const isResting = highlights.resting.has(key);
    if (view.selectedPiece?.row === row && view.selectedPiece?.col === col) {
        classes.push(view.phase === 'resting' && !isResting ? 'selected-muted' : 'selected');
    }
    if (highlights.moves.has(key)) classes.push('valid-move');
    if (highlights.deathMoves?.has(key)) classes.push('valid-death-move');
    if (highlights.rampMoves?.has(key)) classes.push('valid-ramp');
    if (highlights.deathRampMoves?.has(key)) classes.push('valid-death-ramp');
    if (highlights.attacks.has(key)) classes.push('valid-attack');
    if (highlights.specials.has(key)) classes.push('valid-special');
    if (highlights.staging.has(key)) classes.push('valid-staging');
    if (isResting) classes.push('valid-resting');
    if (classes.length === 0) return null;
    const marker = document.createElement('span');
    marker.className = `highlight-overlay ${classes.join(' ')}`;
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
    element.textContent = value;
    element.className = `status-${value.toLowerCase()}`;
}

function playerName(color) {
    return color === COLORS.WHITE ? 'White' : 'Black';
}

function squareLabel(row, col) {
    return `${FILES[col]}${BOARD_SIZE - row}`;
}

function orderedIndexes(boardSide = COLORS.WHITE) {
    const indexes = [...Array(BOARD_SIZE).keys()];
    return boardSide === COLORS.BLACK ? indexes.reverse() : indexes;
}

function describeAction(action) {
    const piece = action.pieceType ?? 'Piece';
    const from = action.from ? squareLabel(action.from.r, action.from.c) : '';
    const to = action.to ? squareLabel(action.to.r, action.to.c) : '';
    const suffix = action.promotionType ? `=${action.promotionType}` : '';

    if (action.kind === 'skip') return 'Skipped Life/Death';
    if (action.mode === 'castle') return `King castles ${from}-${to}`;
    if (action.mode === 'knightRamp') {
        const via = action.rampSequence?.slice(0, -1).map((step) => squareLabel(step.land.r, step.land.c)) ?? [];
        return `Knight ${from}-${to}${via.length ? ` via ${via.join(', ')}` : ''}`;
    }
    if (action.kind === 'move') {
        const deathNote = action.deathLanding ? ' into Death' : '';
        return `${piece} ${from}-${to}${deathNote}${suffix}`;
    }
    if (action.kind === 'attack') {
        const target = `${action.target?.color ?? 'enemy'} ${action.target?.type ?? 'piece'}`;
        const hit = action.target?.hadShield ? 'breaks shield on' : 'takes';
        const deathStaging = action.deathStaging ? ', attacker dies on Death' : '';
        const rest = action.rest ? `, rests ${squareLabel(action.rest.r, action.rest.c)}` : '';
        return `${piece} ${hit} ${target} ${to}${deathStaging}${rest}${suffix}`;
    }
    if (action.mode === 'heal') {
        return `Life shields ${action.target?.color ?? ''} ${action.target?.type ?? 'piece'} ${to}`;
    }
    if (action.mode === 'kill') {
        return `Death kills ${action.target?.color ?? ''} ${action.target?.type ?? 'piece'} ${to}`;
    }
    return `${piece} action`;
}

function actionColor(action) {
    return action.color ?? action.target?.color ?? COLORS.WHITE;
}

function appendActionHistoryItem(history, action, previousColor) {
    const color = actionColor(action);
    const item = document.createElement('li');
    item.dataset.actionColor = color;
    if (previousColor && previousColor !== color) item.classList.add('player-break');
    item.textContent = describeAction(action);
    item.setAttribute('aria-label', `${playerName(color)}: ${item.textContent}`);
    history.appendChild(item);
    return color;
}

function updateActionHistoryFade(history) {
    const container = history.parentElement ?? history.parent;
    if (!container?.classList) return;
    const clientHeight = history.clientHeight ?? history.offsetHeight ?? 0;
    const hiddenBelow = clientHeight > 0 && history.scrollTop + clientHeight < history.scrollHeight - 1;
    container.classList.toggle('has-hidden-actions-below', hiddenBelow);
}

function restartClassAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
}

function actionHistoryKey(action) {
    if (!action) return 'empty';
    return [
        action.color ?? '',
        action.kind ?? '',
        action.mode ?? '',
        action.pieceId ?? '',
        action.targetId ?? '',
        action.promotionType ?? '',
        action.deathStaging ? 'death' : '',
        action.deathLanding ? 'deathLanding' : '',
        rampSequenceKey(action.rampSequence),
        actionSquareKey(action.from),
        actionSquareKey(action.to),
        actionSquareKey(action.staging),
        actionSquareKey(action.rest),
    ].join('|');
}

function actionSquareKey(square) {
    return square ? `${square.r},${square.c}` : '';
}

function rampSequenceKey(sequence = []) {
    return sequence.map((step) => `${actionSquareKey(step.ramp)}>${actionSquareKey(step.land)}`).join(';');
}
