/* game.js */
// --- CONSTANTS AND CONFIG --- //
const BOARD_SIZE = 10;
const PIECE_SYMBOLS = {
    white: { King: '♔', Queen: '♕', Rook: '♖', Bishop: '♗', Knight: '♘', Pawn: '♙', Life: '♥', Death: '†' },
    black: { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟', Life: '♥', Death: '†' }
};

// --- PIECE CLASSES --- //
class Piece {
    constructor(color, row, col, type) {
        this.color = color; // 'white' or 'black'
        this.row = row;
        this.col = col;
        this.type = type;
        this.hasShield = !['King', 'Life', 'Death'].includes(type);
        this.hasMoved = false;
    }

    get symbol() {
        return PIECE_SYMBOLS[this.color][this.type];
    }

    get owner() {
        if (this.type === 'Life' || this.type === 'Death') {
            // Ranks 6-10 (rows 0-4) are white's half
            return this.row <= 4 ? 'white' : 'black';
        }
        return this.color;
    }

    // To be implemented by subclasses
    getPossibleMoves(gameState) {
        return { moves: [], attacks: [], specialActions: [] };
    }
}

class Pawn extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const attacks = [];
        const dir = this.color === 'white' ? 1 : -1; // White starts at top (row 0) and moves down (positive dir)
        const whiteStartRow = 1;
        const blackStartRow = 8;

        // My coordinate system has white on top (row 0, 1) and black on bottom (row 8, 9)
        // Let's adjust rule interpretation to code: White pawns start on row 1, move to row 2,3,4...
        // Black pawns start on row 8, move to row 7,6,5...

        // Standard 1-square move
        if (gameState.isValid(this.row + dir, this.col) && !gameState.getPiece(this.row + dir, this.col)) {
            moves.push({ r: this.row + dir, c: this.col });
        }
        // Initial 2 or 3 square move
        if ((this.color === 'white' && this.row === whiteStartRow) || (this.color === 'black' && this.row === blackStartRow)) {
            if (moves.length > 0 && !gameState.getPiece(this.row + 2 * dir, this.col)) {
                moves.push({ r: this.row + 2 * dir, c: this.col });
                if (!gameState.getPiece(this.row + 3 * dir, this.col)) {
                    moves.push({ r: this.row + 3 * dir, c: this.col });
                }
            }
        }
        // Standard captures
        [-1, 1].forEach(dCol => {
            const target = gameState.getPiece(this.row + dir, this.col + dCol);
            if (target && target.owner !== this.owner) {
                attacks.push({ r: this.row + dir, c: this.col + dCol });
            }
        });

        // Special Jump over Life/Death
        const blockingPiece = gameState.getPiece(this.row + dir, this.col);
        if (blockingPiece && (blockingPiece.type === 'Life' || blockingPiece.type === 'Death') && blockingPiece.owner !== this.owner) {
            if (gameState.isValid(this.row + 2 * dir, this.col) && !gameState.getPiece(this.row + 2 * dir, this.col)) {
                moves.push({ r: this.row + 2 * dir, c: this.col, isSpecialJump: true, jumpedPiece: blockingPiece });
            }
        }
        return { moves, attacks };
    }
}

class Rook extends Piece {
    getPossibleMoves(gameState) {
        return this._getSlidingMoves(gameState, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
    }

    _getSlidingMoves(gameState, directions) {
        const moves = [];
        const attacks = [];
        directions.forEach(([dr, dc]) => {
            for (let i = 1; i < BOARD_SIZE; i++) {
                const r = this.row + i * dr;
                const c = this.col + i * dc;
                if (!gameState.isValid(r, c)) break;

                const piece = gameState.getPiece(r, c);
                if (piece) {
                    if (piece.type === 'Life' || piece.type === 'Death') {
                        continue; // Can pass through
                    }
                    if (piece.owner !== this.owner) {
                        attacks.push({ r, c });
                    }
                    break;
                }
                moves.push({ r, c });
            }
        });
        return { moves, attacks };
    }
}
class Bishop extends Rook {
    getPossibleMoves(gameState) {
        return this._getSlidingMoves(gameState, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    }
}
class Queen extends Rook {
    getPossibleMoves(gameState) {
        const straight = this._getSlidingMoves(gameState, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
        const diagonal = this._getSlidingMoves(gameState, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
        return {
            moves: [...straight.moves, ...diagonal.moves],
            attacks: [...straight.attacks, ...diagonal.attacks]
        };
    }
}
class King extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const attacks = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = this.row + dr;
                const c = this.col + dc;
                if (gameState.isValid(r, c)) {
                    const piece = gameState.getPiece(r, c);
                    if (!piece) {
                        moves.push({ r, c });
                    } else if (piece.owner !== this.owner && piece.type !== 'Life' && piece.type !== 'Death') {
                        attacks.push({ r, c });
                    }
                }
            }
        }
        return { moves, attacks };
    }
}
class Knight extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const attacks = [];
        const l_moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        l_moves.forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c)) {
                const piece = gameState.getPiece(r, c);
                if (!piece) {
                    moves.push({ r, c });
                } else if (piece.owner !== this.owner && piece.type !== 'Life' && piece.type !== 'Death') {
                    attacks.push({ r, c });
                }
            }
        });

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const rampR = this.row + dr;
                const rampC = this.col + dc;
                const landR = this.row + 2 * dr;
                const landC = this.col + 2 * dc;

                const rampPiece = gameState.getPiece(rampR, rampC);
                if (rampPiece && !['Life', 'Death', 'King'].includes(rampPiece.type)) {
                    if (gameState.isValid(landR, landC) && !gameState.getPiece(landR, landC)) {
                        moves.push({ r: landR, c: landC, isRampJump: true });
                    }
                }
            }
        }

        return { moves, attacks };
    }
}

class Life extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const specialActions = [];
        // Diagonal Movement. (r+c)%2 === 0 is a light square.
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && !gameState.getPiece(r, c) && (r + c) % 2 === 0) {
                moves.push({ r, c });
            }
        });

        // Heal Action (consumes standard move)
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && (r + c) % 2 === 0) {
                const target = gameState.getPiece(r, c);
                if (target && target.owner === this.owner && !target.hasShield) {
                    specialActions.push({ r, c, type: 'heal' });
                }
            }
        });

        return { moves, specialActions };
    }
}
class Death extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const specialActions = [];

        // Diagonal Movement. (r+c)%2 !== 0 is a dark square.
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && !gameState.getPiece(r, c) && (r + c) % 2 !== 0) {
                moves.push({ r, c });
            }
        });

        // Kill Action
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && (r + c) % 2 !== 0) {
                const target = gameState.getPiece(r, c);
                if (target && !this._isProtected(target, gameState)) {
                    specialActions.push({ r, c, type: 'kill' });
                }
            }
        });
        return { moves, specialActions };
    }

    _isProtected(piece, gameState) {
        const { row, col } = piece;
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dr, dc] of directions) {
            const protector = gameState.getPiece(row + dr, col + dc);
            if (protector && protector.owner === piece.owner && protector !== piece) {
                return true;
            }
        }
        return false;
    }
}

// --- GAME LOGIC AND STATE --- //
class Game {
    constructor() {
        this.gameState = {
            board: this.createInitialBoard(),
            currentPlayer: 'white',
            phase: 'SELECT_PIECE', // SELECT_PIECE, SELECT_TARGET, SELECT_STAGING, SELECT_RESTING
            selectedPiece: null,
            validMoves: [],
            validAttacks: [],
            validSpecialActions: [],
            stagingOptions: [],
            restingOptions: [],
            attackInfo: null,
            phaseInfo: 'Select a piece to move.',
            turn: {
                standardMoveMade: false,
                specialMoveMade: false
            },
        };
        // *** FIX: Attach helper methods directly to gameState object for reliable access ***
        this.gameState.getPiece = (r, c) => {
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
            return this.gameState.board[r]?.[c] ?? null;
        };
        this.gameState.isValid = (r, c) => {
            return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
        };

        this.renderer = new Renderer(document.getElementById('game-board'), document.getElementById('status-panel'));
        this.inputHandler = new InputHandler(this);
        this.endTurnButton = document.getElementById('end-turn-btn');
        this.endTurnButton.addEventListener('click', () => this.endTurn());

        this.gameLoop();
    }

    // Board Setup: White on top (rows 0,1), Black on bottom (rows 8,9)
    // Rank 10 = row 0, Rank 1 = row 9
    createInitialBoard() {
        const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        const backRank = ['Rook', 'Knight', 'Bishop', 'Queen', 'King', 'Bishop', 'Knight', 'Rook'];

        // White pieces (Rank 10 & 9 -> rows 0 & 1)
        board[0][0] = new Death('white', 0, 0, 'Death');
        board[0][9] = new Life('white', 0, 9, 'Life');
        backRank.forEach((type, i) => {
            board[0][i + 1] = new (this.getPieceClass(type))('white', 0, i + 1, type);
        });
        for (let c = 0; c < 10; c++) board[1][c] = new Pawn('white', 1, c, 'Pawn');

        // Black pieces (Rank 1 & 2 -> rows 9 & 8)
        board[9][0] = new Life('black', 9, 0, 'Life');
        board[9][9] = new Death('black', 9, 9, 'Death');
        backRank.forEach((type, i) => {
            board[9][i + 1] = new (this.getPieceClass(type))('black', 9, i + 1, type);
        });
        for (let c = 0; c < 10; c++) board[8][c] = new Pawn('black', 8, c, 'Pawn');

        return board;
    }

    getPieceClass(type) {
        return { Pawn, Rook, Knight, Bishop, Queen, King, Life, Death }[type] || Piece;
    }

    gameLoop() {
        this.renderer.render(this.gameState);
        requestAnimationFrame(() => this.gameLoop());
    }

    handleSquareClick(r, c) {
        const { phase } = this.gameState;

        switch (phase) {
            case 'SELECT_PIECE': this.handleSelectPiece(r, c); break;
            case 'SELECT_TARGET': this.handleSelectTarget(r, c); break;
            case 'SELECT_STAGING': this.handleSelectStaging(r, c); break;
            case 'SELECT_RESTING': this.handleSelectResting(r, c); break;
        }
        this.updateEndTurnButton();
    }

    handleSelectPiece(r, c) {
        const piece = this.gameState.getPiece(r, c);
        if (piece && piece.owner === this.gameState.currentPlayer) {
            this.selectPiece(piece);
        } else {
            this.deselect();
        }
    }

    handleSelectTarget(r, c) {
        const targetMove = this.gameState.validMoves.find(m => m.r === r && m.c === c);
        const targetAttack = this.gameState.validAttacks.find(a => a.r === r && a.c === c);
        const targetSpecial = this.gameState.validSpecialActions.find(s => s.r === r && s.c === c);
        const clickedPiece = this.gameState.getPiece(r, c);

        if (targetMove) {
            this.executeMove(this.gameState.selectedPiece, r, c, targetMove);
        } else if (targetAttack) {
            this.initiateAttack(this.gameState.selectedPiece, this.gameState.getPiece(r, c));
        } else if (targetSpecial) {
            this.executeSpecialAction(this.gameState.selectedPiece, targetSpecial);
        } else if (clickedPiece && clickedPiece.owner === this.gameState.currentPlayer) {
            this.selectPiece(clickedPiece);
        } else {
            this.deselect();
        }
    }

    handleSelectStaging(r, c) {
        if (this.gameState.stagingOptions.find(s => s.r === r && s.c === c)) {
            this.executeAttack(r, c);
        } else {
            this.deselect();
        }
    }

    handleSelectResting(r, c) {
        if (this.gameState.restingOptions.find(s => s.r === r && s.c === c)) {
            this.completeResting(r, c);
        }
    }

    selectPiece(piece) {
        const isStandard = !['Life', 'Death'].includes(piece.type);
        const canMoveStandard = isStandard && !this.gameState.turn.standardMoveMade;
        const canMoveSpecial = !isStandard && !this.gameState.turn.specialMoveMade;

        if (!canMoveStandard && !canMoveSpecial) {
            this.deselect();
            this.gameState.phaseInfo = "You have made all available moves this turn.";
            return;
        }

        this.gameState.selectedPiece = piece;
        this.gameState.phase = 'SELECT_TARGET';

        const { moves, attacks, specialActions } = piece.getPossibleMoves(this.gameState);
        this.gameState.validMoves = moves || [];
        this.gameState.validAttacks = attacks || [];
        // Only show special actions if the standard move is available to be consumed
        this.gameState.validSpecialActions = (specialActions && !this.gameState.turn.standardMoveMade) ? specialActions : [];
        this.gameState.phaseInfo = 'Select a destination, target, or special action.';
    }

    deselect() {
        this.gameState.selectedPiece = null;
        this.gameState.phase = 'SELECT_PIECE';
        this.gameState.validMoves = [];
        this.gameState.validAttacks = [];
        this.gameState.validSpecialActions = [];
        this.gameState.stagingOptions = [];
        this.gameState.restingOptions = [];
        this.gameState.attackInfo = null;
        this.gameState.phaseInfo = 'Select a piece to move.';
    }

    executeMove(piece, toR, toC, moveInfo) {
        const fromR = piece.row;
        const fromC = piece.col;

        this.checkPassThrough(piece, fromR, fromC, toR, toC);
        if (moveInfo.isSpecialJump) {
            const jumpedPiece = moveInfo.jumpedPiece;
            if (jumpedPiece.type === 'Life') piece.hasShield = true;
            if (jumpedPiece.type === 'Death') {
                if (piece.hasShield) piece.hasShield = false;
                else {
                    this.gameState.board[fromR][fromC] = null;
                    this.completeMove(piece);
                    return;
                }
            }
        }

        this.gameState.board[toR][toC] = piece;
        this.gameState.board[fromR][fromC] = null;
        piece.row = toR;
        piece.col = toC;
        piece.hasMoved = true;
        this.completeMove(piece);
    }

    initiateAttack(attacker, target) {
        const stagingSquares = this.calculateStagingSquares(attacker, target);
        if (stagingSquares.length > 0) {
            this.gameState.phase = 'SELECT_STAGING';
            this.gameState.stagingOptions = stagingSquares;
            this.gameState.attackInfo = { attacker, target };
            this.gameState.phaseInfo = 'Select a staging square for the attack.';
        } else {
            this.gameState.phaseInfo = 'No valid staging squares for this attack.';
        }
    }

    calculateStagingSquares(attacker, target) {
        let staging = [];
        const adjacentSquares = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = target.row + dr;
                const c = target.col + dc;
                if (this.gameState.isValid(r, c) && !this.gameState.getPiece(r, c)) {
                    adjacentSquares.push({ r, c });
                }
            }
        }

        const { moves } = attacker.getPossibleMoves(this.gameState);
        if (attacker.type === 'Knight') {
            const l_moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            const canLandOnTarget = l_moves.some(([dr, dc]) => attacker.row + dr === target.row && attacker.col + dc === target.col);
            if (canLandOnTarget) {
                staging = adjacentSquares.filter(adj => l_moves.some(([dr, dc]) => attacker.row + dr === adj.r && attacker.col + dc === adj.c));
            }
        } else {
            staging = adjacentSquares.filter(adj => moves.some(m => m.r === adj.r && m.c === adj.c));
        }
        return staging;
    }

    executeAttack(stagingR, stagingC) {
        const { attacker, target } = this.gameState.attackInfo;
        const fromR = attacker.row;
        const fromC = attacker.col;

        this.checkPassThrough(attacker, fromR, fromC, stagingR, stagingC);

        this.gameState.board[stagingR][stagingC] = attacker;
        this.gameState.board[fromR][fromC] = null;
        attacker.row = stagingR;
        attacker.col = stagingC;
        attacker.hasMoved = true;

        if (target.hasShield) {
            target.hasShield = false;
            this.completeMove(attacker);
        } else {
            this.gameState.board[target.row][target.col] = null;
            this.gameState.phase = 'SELECT_RESTING';
            this.gameState.restingOptions = [{ r: stagingR, c: stagingC }, { r: target.row, c: target.col }];
            this.gameState.attackInfo = { attacker };
            this.gameState.phaseInfo = 'Choose a resting square for your piece.';
        }
    }

    completeResting(toR, toC) {
        const { attacker } = this.gameState.attackInfo;
        if (attacker.row !== toR || attacker.col !== toC) {
            this.gameState.board[toR][toC] = attacker;
            this.gameState.board[attacker.row][attacker.col] = null;
            attacker.row = toR;
            attacker.col = toC;
        }
        this.completeMove(attacker);
    }

    executeSpecialAction(piece, action) {
        if (action.type === 'heal') {
            const target = this.gameState.getPiece(action.r, action.c);
            if (target) target.hasShield = true;
        } else if (action.type === 'kill') {
            this.gameState.board[action.r][action.c] = null;
        }
        this.gameState.turn.standardMoveMade = true; // Consumes standard move
        this.completeMove(piece, false); // `false` because the piece itself didn't move
    }

    completeMove(piece, movedPiece = true) {
        const isStandard = !['Life', 'Death'].includes(piece.type);
        if (isStandard) {
            this.gameState.turn.standardMoveMade = true;
        } else if (movedPiece) {
            this.gameState.turn.specialMoveMade = true;
        }

        this.checkForAnnihilation();
        this.checkForCheck();
        this.deselect();
    }

    endTurn() {
        this.gameState.currentPlayer = this.gameState.currentPlayer === 'white' ? 'black' : 'white';
        this.gameState.turn.standardMoveMade = false;
        this.gameState.turn.specialMoveMade = false;
        this.deselect();
        this.updateEndTurnButton();
    }

    updateEndTurnButton() {
        const { standardMoveMade, specialMoveMade } = this.gameState.turn;
        this.endTurnButton.disabled = !(standardMoveMade || specialMoveMade);
    }

    checkPassThrough(piece, r1, c1, r2, c2) {
        const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
        let r = r1 + dr, c = c1 + dc;
        while (r !== r2 || c !== c2) {
            const p = this.gameState.getPiece(r, c);
            if (p && (p.type === 'Life' || p.type === 'Death')) this.applyPassThroughEffect(piece, p);
            r += dr; c += dc;
        }
    }

    applyPassThroughEffect(movingPiece, staticPiece) {
        if (staticPiece.type === 'Life') movingPiece.hasShield = true;
        else if (staticPiece.type === 'Death') {
            if (movingPiece.hasShield) movingPiece.hasShield = false;
            else this.gameState.board[movingPiece.row][movingPiece.col] = null;
        }
    }

    checkForAnnihilation() {
        const lifeDeathPieces = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = this.gameState.getPiece(r, c);
                if (p && (p.type === 'Life' || p.type === 'Death')) {
                    lifeDeathPieces.push(p);
                }
            }
        }
        const toRemove = new Set();
        for (let i = 0; i < lifeDeathPieces.length; i++) {
            for (let j = i + 1; j < lifeDeathPieces.length; j++) {
                const p1 = lifeDeathPieces[i];
                const p2 = lifeDeathPieces[j];
                if (p1.type !== p2.type && Math.max(Math.abs(p1.row - p2.row), Math.abs(p1.col - p2.col)) === 1) {
                    toRemove.add(p1);
                    toRemove.add(p2);
                }
            }
        }
        toRemove.forEach(p => {
            this.gameState.board[p.row][p.col] = null;
        });
    }

    checkForCheck() {
        // Simplified check, a full implementation is very complex.
        // This version just finds the kings and checks if any opponent piece can attack their square.
        // Then applies intimidation.
        ['white', 'black'].forEach(kingColor => {
            const king = this.findKing(kingColor);
            if (!king) return;

            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    const piece = this.gameState.getPiece(r, c);
                    if (piece && piece.owner !== kingColor) {
                        const { attacks } = piece.getPossibleMoves(this.gameState);
                        if (attacks.find(a => a.r === king.row && a.c === king.col)) {
                            // This piece is checking the king. Apply Intimidation.
                            if (piece.hasShield) piece.hasShield = false;
                        }
                    }
                }
            }
        });
    }

    findKing(color) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = this.gameState.getPiece(r, c);
                if (p && p.type === 'King' && p.color === color) return p;
            }
        }
        return null;
    }
}

// --- RENDERER --- //
class Renderer {
    constructor(boardEl, statusPanel) {
        this.boardEl = boardEl;
        this.statusPanel = statusPanel;
        this.playerTurnEl = statusPanel.querySelector('#player-turn');
        this.moveStatusEl = statusPanel.querySelector('#move-status');
        this.phaseInfoEl = statusPanel.querySelector('#phase-info');
    }

    render(gameState) {
        this.boardEl.innerHTML = '';
        const { getPiece } = gameState; // Use the attached helper

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.dataset.r = r;
                square.dataset.c = c;
                square.classList.add('square');
                // A10 (row 0, col 0) is light.
                square.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');

                const piece = getPiece(r, c);
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.classList.add('piece', piece.color);
                    if (piece.hasShield) pieceEl.classList.add('has-shield');
                    pieceEl.textContent = piece.symbol;
                    square.appendChild(pieceEl);
                }

                const overlay = this.createHighlightOverlay(r, c, gameState);
                if (overlay) square.appendChild(overlay);

                this.boardEl.appendChild(square);
            }
        }
        this.updateStatus(gameState);
    }

    createHighlightOverlay(r, c, gameState) {
        const overlay = document.createElement('div');
        overlay.classList.add('highlight-overlay');
        let highlighted = false;

        if (gameState.selectedPiece?.row === r && gameState.selectedPiece?.col === c) {
            overlay.classList.add('selected');
            highlighted = true;
        }
        if (gameState.validMoves.some(m => m.r === r && m.c === c)) {
            overlay.classList.add('valid-move');
            highlighted = true;
        }
        if (gameState.validAttacks.some(a => a.r === r && a.c === c) ||
            gameState.validSpecialActions.some(s => s.r === r && s.c === c)) {
            overlay.classList.add('valid-attack');
            highlighted = true;
        }
        if (gameState.stagingOptions.some(s => s.r === r && s.c === c)) {
            overlay.classList.add('valid-staging');
            highlighted = true;
        }
        if (gameState.restingOptions.some(s => s.r === r && s.c === c)) {
            overlay.classList.add('valid-resting');
            highlighted = true;
        }

        return highlighted ? overlay : null;
    }

    updateStatus(gameState) {
        this.playerTurnEl.textContent = gameState.currentPlayer.charAt(0).toUpperCase() + gameState.currentPlayer.slice(1);
        this.playerTurnEl.className = gameState.currentPlayer;
        const stdMove = gameState.turn.standardMoveMade ? 'Used' : 'Available';
        const spcMove = gameState.turn.specialMoveMade ? 'Used' : 'Available';
        this.moveStatusEl.textContent = `Standard Move: ${stdMove} | Special Move: ${spcMove}`;
        this.phaseInfoEl.textContent = gameState.phaseInfo || ' ';
    }
}

// --- INPUT HANDLER --- //
class InputHandler {
    constructor(game) {
        this.game = game;
        this.game.renderer.boardEl.addEventListener('click', (e) => {
            const square = e.target.closest('.square, .valid-staging, .valid-resting');
            if (square) {
                const r = parseInt(square.dataset.r);
                const c = parseInt(square.dataset.c);
                if (!isNaN(r) && !isNaN(c)) {
                    this.game.handleSquareClick(r, c);
                }
            }
        });
    }
}

// --- INITIALIZE GAME --- //
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});
