import { expect, test } from 'bun:test';
import {
    COLORS,
    FILES,
    PIECE_TYPES,
    applyAction,
    createEmptyState,
    createGameState,
    createPiece,
    generateLegalActions,
    placePiece,
} from '../src/engine/index.js';
import { GameController } from '../src/ui/controller.js';
import { Renderer, emptyHighlights } from '../src/ui/renderer.js';
import { aiLabelForLevel, aiOptionsForLevel, loadSettings, saveSettings } from '../src/ui/settings.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.className = '';
        this.textContent = '';
        this.hidden = false;
        this.disabled = false;
        this.value = '';
        this.checked = false;
        this.parent = null;
        this.listeners = {};
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientHeight = 0;
        this.classList = {
            add: (...classes) => {
                const current = new Set(this.className.split(/\s+/).filter(Boolean));
                for (const className of classes) current.add(className);
                this.className = [...current].join(' ');
            },
            remove: (...classes) => {
                const current = new Set(this.className.split(/\s+/).filter(Boolean));
                for (const className of classes) current.delete(className);
                this.className = [...current].join(' ');
            },
            toggle: (className, force) => {
                const current = new Set(this.className.split(/\s+/).filter(Boolean));
                const shouldAdd = force ?? !current.has(className);
                if (shouldAdd) current.add(className);
                else current.delete(className);
                this.className = [...current].join(' ');
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
        if (name === 'id') this.id = value;
    }

    querySelector(selector) {
        if (selector === '#action-history ol') return findByTag(findById(this, 'action-history'), 'ol');
        if (selector.startsWith('#')) return findById(this, selector.slice(1));
        if (selector.startsWith('[data-control="')) return findByDataset(this, 'control', selector.slice(15, -2));
        if (selector.startsWith('[data-side="')) return findByDataset(this, 'side', selector.slice(12, -2));
        if (selector.startsWith('[data-piece-id]')) return findByDatasetKey(this, 'pieceId');
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
        return '';
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
    if (selector === '[data-piece-id]' && root.dataset?.pieceId) matches.push(root);
    if (selector === '[data-side]' && root.dataset?.side) matches.push(root);
    for (const child of root.children) collectMatches(child, selector, matches);
}

function makeStatusPanel() {
    const panel = new FakeElement('div');
    for (const id of ['player-turn', 'standard-move-status', 'special-move-status', 'phase-info', 'move-number', 'ai-level-label']) {
        const child = new FakeElement('span');
        child.setAttribute('id', id);
        panel.appendChild(child);
    }
    const actionHistory = new FakeElement('div');
    actionHistory.setAttribute('id', 'action-history');
    const list = new FakeElement('ol');
    actionHistory.appendChild(list);
    panel.appendChild(actionHistory);
    return panel;
}

function makeControls() {
    const controls = new FakeElement('div');
    const settings = new FakeElement('button');
    settings.dataset.control = 'settings';
    controls.appendChild(settings);
    const rules = new FakeElement('button');
    rules.dataset.control = 'rules';
    controls.appendChild(rules);
    const skip = new FakeElement('button');
    skip.dataset.control = 'skip-special';
    controls.appendChild(skip);
    return controls;
}

function makeRulesPanel() {
    const panel = new FakeElement('div');
    panel.setAttribute('id', 'rules-panel');
    return panel;
}

function makeSettingsPanel() {
    const panel = new FakeElement('div');
    const aiLabel = new FakeElement('span');
    aiLabel.setAttribute('id', 'ai-setting-label');
    panel.appendChild(aiLabel);
    const ai = new FakeElement('input');
    ai.setAttribute('id', 'ai-level');
    panel.appendChild(ai);
    const whiteSide = new FakeElement('button');
    whiteSide.dataset.side = 'white';
    panel.appendChild(whiteSide);
    const blackSide = new FakeElement('button');
    blackSide.dataset.side = 'black';
    panel.appendChild(blackSide);
    const lockNote = new FakeElement('p');
    lockNote.setAttribute('id', 'side-lock-note');
    panel.appendChild(lockNote);
    const animations = new FakeElement('input');
    animations.setAttribute('id', 'animations-enabled');
    panel.appendChild(animations);
    const newGame = new FakeElement('button');
    newGame.dataset.control = 'new-game';
    panel.appendChild(newGame);
    return panel;
}

test('renderer paints a 10x10 board and status without browser dependencies', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const board = new FakeElement('div');
    const coordinates = new FakeElement('div');
    const status = makeStatusPanel();
    const promotion = new FakeElement('div');
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
    expect(coordinates.children.map((child) => child.textContent).join('')).toBe(FILES);
    expect(status.querySelector('#player-turn').textContent).toBe('White');
    expect(status.querySelector('#special-move-status').textContent).toBe('Unavailable');
    expect(controls.querySelector('[data-control="skip-special"]').hidden).toBe(true);
    expect(promotion.hidden).toBe(true);

    globalThis.document = previousDocument;
});

test('renderer exposes promotion choices when promotion actions are pending', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createGameState();
    const promotionActions = generateLegalActions(state).slice(0, 0);
    promotionActions.push(
        { promotionType: 'Queen' },
        { promotionType: 'Rook' },
    );

    const renderer = new Renderer({
        boardEl: new FakeElement('div'),
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(state, { promotionActions });

    expect(renderer.promotionEl.hidden).toBe(false);
    expect(renderer.promotionEl.children[1].children).toHaveLength(2);

    globalThis.document = previousDocument;
});

test('renderer shows the full action history with player markers', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createGameState();
    state.actionHistory = [
        {
            kind: 'move',
            mode: 'pawnAdvance',
            pieceType: 'Pawn',
            color: 'white',
            from: { r: 8, c: 0 },
            to: { r: 7, c: 0 },
        },
        {
            kind: 'move',
            mode: 'pawnAdvance',
            pieceType: 'Pawn',
            color: 'black',
            from: { r: 1, c: 8 },
            to: { r: 3, c: 8 },
        },
        {
            kind: 'skip',
            mode: 'skipSpecial',
            color: 'black',
        },
    ];

    const status = makeStatusPanel();
    const renderer = new Renderer({
        boardEl: new FakeElement('div'),
        statusPanelEl: status,
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(state, {});

    const history = status.querySelector('#action-history ol');
    expect(history.children).toHaveLength(3);
    expect(history.children[0].dataset.actionColor).toBe('white');
    expect(history.children[0].textContent).toContain('Pawn a2-a3');
    expect(history.children[1].dataset.actionColor).toBe('black');
    expect(history.children[1].className).toContain('player-break');
    expect(history.children[1].textContent).toContain('Pawn j9-j7');
    expect(history.children[2].textContent).toContain('Skipped Life/Death');
    expect(history.scrollTop).toBe(history.scrollHeight);

    globalThis.document = previousDocument;
});

test('renderer preserves action history scroll when history has not changed', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createGameState();
    state.actionHistory = [
        {
            kind: 'move',
            mode: 'pawnAdvance',
            pieceType: 'Pawn',
            color: 'white',
            from: { r: 8, c: 0 },
            to: { r: 7, c: 0 },
        },
    ];

    const status = makeStatusPanel();
    const renderer = new Renderer({
        boardEl: new FakeElement('div'),
        statusPanelEl: status,
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(state, {});

    const history = status.querySelector('#action-history ol');
    history.scrollTop = 7;
    renderer.render(state, { settingsOpen: true });

    expect(history.children).toHaveLength(1);
    expect(history.scrollTop).toBe(7);

    state.actionHistory = [
        ...state.actionHistory,
        {
            kind: 'skip',
            mode: 'skipSpecial',
            color: 'white',
        },
    ];
    renderer.render(state, {});
    expect(history.children).toHaveLength(2);
    expect(history.scrollTop).toBe(history.scrollHeight);

    globalThis.document = previousDocument;
});

test('renderer shows action history fade only when newer actions are hidden below', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createGameState();
    state.actionHistory = [
        { kind: 'move', mode: 'pawnAdvance', pieceType: 'Pawn', color: 'white', from: { r: 8, c: 0 }, to: { r: 7, c: 0 } },
        { kind: 'move', mode: 'pawnAdvance', pieceType: 'Pawn', color: 'black', from: { r: 1, c: 9 }, to: { r: 2, c: 9 } },
        { kind: 'skip', mode: 'skipSpecial', color: 'black' },
    ];

    const status = makeStatusPanel();
    const renderer = new Renderer({
        boardEl: new FakeElement('div'),
        statusPanelEl: status,
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(state, {});

    const history = status.querySelector('#action-history ol');
    const container = findById(status, 'action-history');
    history.clientHeight = 20;
    history.scrollTop = 0;
    history.dispatchEvent({ type: 'scroll' });
    expect(container.className).toContain('has-hidden-actions-below');

    history.scrollTop = history.scrollHeight;
    history.dispatchEvent({ type: 'scroll' });
    expect(container.className).not.toContain('has-hidden-actions-below');

    globalThis.document = previousDocument;
});

test('renderer flashes the player badge when the turn changes', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createGameState();
    const status = makeStatusPanel();
    const renderer = new Renderer({
        boardEl: new FakeElement('div'),
        statusPanelEl: status,
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });

    renderer.render(state, {});
    expect(status.querySelector('#player-turn').className).not.toContain('turn-start-flash');
    state.currentPlayer = COLORS.BLACK;
    renderer.render(state, {});
    expect(status.querySelector('#player-turn').className).toContain('turn-start-flash');

    globalThis.document = previousDocument;
});

test('renderer distinguishes knight ramp highlights from ordinary moves', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const board = new FakeElement('div');
    const highlights = emptyHighlights();
    highlights.moves.add('5,5');
    highlights.rampMoves.add('5,7');
    const renderer = new Renderer({
        boardEl: board,
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(createGameState(), { highlights });

    expect(board.children[55].children[0].className).toContain('valid-move');
    expect(board.children[57].children[0].className).toContain('valid-ramp');
    expect(board.children[57].children[0].className).not.toContain('valid-move');

    globalThis.document = previousDocument;
});

test('settings persist and AI slider maps to stronger search options', () => {
    const store = new Map();
    const storage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
    };

    saveSettings({ aiLevel: 5, animationsEnabled: false, playerSide: 'black' }, storage);
    expect(loadSettings(storage)).toEqual({ aiLevel: 5, animationsEnabled: false, playerSide: 'black' });
    saveSettings({ aiLevel: 0, animationsEnabled: true, playerSide: 'white' }, storage);
    expect(loadSettings(storage).aiLevel).toBe(0);
    expect(aiLabelForLevel(0)).toBe('Off (self-play)');
    expect(aiOptionsForLevel(5).maxDepth).toBeGreaterThanOrEqual(aiOptionsForLevel(1).maxDepth);
    expect(aiOptionsForLevel(5).maxActions).toBeGreaterThanOrEqual(aiOptionsForLevel(1).maxActions);
    expect(aiOptionsForLevel(5).maxDepth).toBeGreaterThan(aiOptionsForLevel(4).maxDepth);
    expect(aiOptionsForLevel(5).quiescenceDepth).toBeGreaterThan(aiOptionsForLevel(1).quiescenceDepth);
    expect(aiOptionsForLevel(5).tacticalWeight).toBeGreaterThan(aiOptionsForLevel(1).tacticalWeight);
    expect(aiOptionsForLevel(5).timeLimitMs).toBeGreaterThan(aiOptionsForLevel(4).timeLimitMs);
    expect(aiOptionsForLevel(5).hardTimeLimitMs).toBeGreaterThan(aiOptionsForLevel(5).timeLimitMs);
    expect(aiOptionsForLevel(5).thinkDelay).toBeLessThan(aiOptionsForLevel(1).thinkDelay);
    expect(aiOptionsForLevel(4).thinkDelay).toBeLessThan(aiOptionsForLevel(2).thinkDelay);
});

test('renderer locks side controls while AI is enabled and rotates board when AI is off', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createGameState();
    const board = new FakeElement('div');
    const coordinates = new FakeElement('div');
    const status = makeStatusPanel();
    const settings = makeSettingsPanel();
    const renderer = new Renderer({
        boardEl: board,
        coordinateEl: coordinates,
        statusPanelEl: status,
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: settings,
        rulesEl: makeRulesPanel(),
    });

    renderer.render(state, {
        settings: { aiLevel: 3, animationsEnabled: true, playerSide: 'black' },
        settingsOpen: true,
        sideLocked: true,
        boardSide: 'white',
        aiLabel: 'Level 3',
    });
    expect(settings.querySelector('[data-side="white"]').disabled).toBe(true);
    expect(settings.querySelector('[data-side="black"]').disabled).toBe(true);
    expect(settings.querySelector('#side-lock-note').hidden).toBe(false);
    expect(settings.querySelector('#ai-setting-label').textContent).toBe('Level 3');
    expect(board.children[0].dataset).toEqual({ row: '0', col: '0' });
    expect(coordinates.children[0].textContent).toBe('a');

    renderer.render(state, {
        settings: { aiLevel: 0, animationsEnabled: true, playerSide: 'black' },
        settingsOpen: true,
        sideLocked: false,
        boardSide: 'black',
        aiLabel: 'Off (self-play)',
    });
    expect(settings.querySelector('[data-side="black"]').disabled).toBe(false);
    expect(settings.querySelector('[data-side="black"]').attributes['aria-pressed']).toBe('true');
    expect(settings.querySelector('#side-lock-note').hidden).toBe(true);
    expect(settings.querySelector('#ai-setting-label').textContent).toBe('Off (self-play)');
    expect(board.children[0].dataset).toEqual({ row: '9', col: '9' });
    expect(coordinates.children[0].textContent).toBe('k');

    globalThis.document = previousDocument;
});

test('renderer marks Life and Death pieces with owner glow classes', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const board = new FakeElement('div');
    const renderer = new Renderer({
        boardEl: board,
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(createGameState(), {});

    const blackDeath = board.children[0].children[0];
    const whiteLife = board.children[90].children[0];
    expect(blackDeath.dataset.owner).toBe('black');
    expect(blackDeath.className).toContain('owner-black');
    expect(whiteLife.dataset.owner).toBe('white');
    expect(whiteLife.className).toContain('owner-white');

    globalThis.document = previousDocument;
});

test('renderer marks the surviving king after a king-destruction win', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createGameState();
    state.gameOver = { winner: 'white', reason: 'black king destroyed' };
    const board = new FakeElement('div');
    const renderer = new Renderer({
        boardEl: board,
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(state, {});

    const whiteKing = board.children[95].children[0];
    const blackKing = board.children[5].children[0];
    expect(whiteKing.className).toContain('winning-king');
    expect(blackKing.className).not.toContain('winning-king');

    globalThis.document = previousDocument;
});

test('renderer frames only intimidation that suppressed a shield', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const state = createEmptyState(COLORS.WHITE);
    placePiece(state.board, createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 1, {
        id: 'shield-suppressed',
        hasShield: false,
        isIntimidated: true,
        intimidationSuppressedShield: true,
    }));
    placePiece(state.board, createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 5, 2, {
        id: 'bare-checker',
        hasShield: false,
        isIntimidated: true,
    }));
    const board = new FakeElement('div');
    const renderer = new Renderer({
        boardEl: board,
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });
    renderer.render(state, {});

    expect(board.children[51].children[0].className).toContain('is-intimidated');
    expect(board.children[51].children[0].className).toContain('intimidation-framed');
    expect(board.children[52].children[0].className).toContain('is-intimidated');
    expect(board.children[52].children[0].className).not.toContain('intimidation-framed');

    globalThis.document = previousDocument;
});

test('renderer opens the rules popup independently from settings', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };

    const controls = makeControls();
    const rules = makeRulesPanel();
    const renderer = new Renderer({
        boardEl: new FakeElement('div'),
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: controls,
        settingsEl: makeSettingsPanel(),
        rulesEl: rules,
    });
    renderer.render(createGameState(), { rulesOpen: true, settingsOpen: false });

    expect(rules.hidden).toBe(false);
    expect(controls.querySelector('[data-control="rules"]').attributes['aria-expanded']).toBe('true');
    expect(controls.querySelector('[data-control="settings"]').attributes['aria-expanded']).toBe('false');

    globalThis.document = previousDocument;
});

test('controller deselects a selected piece when its own square is clicked', () => {
    const previousDocument = globalThis.document;
    const previousLocalStorage = globalThis.localStorage;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };
    globalThis.localStorage = null;

    const controller = new GameController({
        boardEl: new FakeElement('div'),
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
    });

    const pawn = controller.state.board[8][0];
    controller.selectPiece(pawn);
    expect(controller.view.selectedPiece.id).toBe('white-pawn-0');
    controller.handleBoardClick({
        target: {
            closest: () => ({ dataset: { row: '8', col: '0' } }),
        },
    });
    expect(controller.view.selectedPiece).toBe(null);

    globalThis.document = previousDocument;
    globalThis.localStorage = previousLocalStorage;
});

test('controller allows self-play turns only when AI is off', () => {
    const previousDocument = globalThis.document;
    const previousLocalStorage = globalThis.localStorage;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
    };
    globalThis.localStorage = null;

    const controller = new GameController({
        boardEl: new FakeElement('div'),
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
    });

    controller.state.currentPlayer = 'black';
    controller.settings = { aiLevel: 0, animationsEnabled: true, playerSide: 'black' };
    expect(controller.canHumanAct()).toBe(true);
    controller.settings = { aiLevel: 3, animationsEnabled: true, playerSide: 'black' };
    expect(controller.canHumanAct()).toBe(false);

    globalThis.document = previousDocument;
    globalThis.localStorage = previousLocalStorage;
});

test('controller starts a new game from the settings panel', () => {
    const previousDocument = globalThis.document;
    const previousLocalStorage = globalThis.localStorage;
    globalThis.document = {
        createElement: (tagName) => new FakeElement(tagName),
        addEventListener() {},
    };
    globalThis.localStorage = null;

    const controller = new GameController({
        boardEl: new FakeElement('div'),
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: makeSettingsPanel(),
        rulesEl: makeRulesPanel(),
    });

    controller.state.currentPlayer = 'black';
    controller.state.moveNumber = 5;
    controller.state.actionHistory = [{ kind: 'skip', mode: 'skipSpecial', color: 'white' }];
    controller.settingsOpen = true;
    controller.handleControlClick({
        target: {
            closest: (selector) => selector === '[data-control]' ? { dataset: { control: 'new-game' } } : null,
        },
    });

    expect(controller.state.currentPlayer).toBe('white');
    expect(controller.state.moveNumber).toBe(1);
    expect(controller.state.actionHistory).toHaveLength(0);
    expect(controller.settingsOpen).toBe(false);

    globalThis.document = previousDocument;
    globalThis.localStorage = previousLocalStorage;
});

test('controller closes settings on outside clicks only', () => {
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
        boardEl: new FakeElement('div'),
        statusPanelEl: makeStatusPanel(),
        promotionEl: new FakeElement('div'),
        controlsEl: makeControls(),
        settingsEl: settings,
        rulesEl: rules,
    });

    controller.settingsOpen = true;
    controller.handleDocumentClick({ target: settings.querySelector('#ai-level') });
    expect(controller.settingsOpen).toBe(true);

    controller.handleDocumentClick({
        target: {
            closest: (selector) => selector === '[data-control="settings"]' ? {} : null,
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
