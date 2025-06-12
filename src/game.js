// --- CONSTANTS AND CONFIG --- //
const BOARD_SIZE = 10;
const PIECE_SYMBOLS = {
    white: { King: '♔', Queen: '♕', Rook: '♖', Bishop: '♗', Knight: '♘', Pawn: '♙', Life: '❤', Death: '💀' },
    black: { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟', Life: '❤', Death: '💀' }
};

// --- PIECE CLASSES --- //
class Piece {
    constructor(color, row, col, type) {
        this.color = color;
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
            return this.row >= 5 ? 'white' : 'black';
        }
        return this.color;
    }

    getPossibleMoves(gameState) {
        return { moves: [], attacks: [], specialActions: [] };
    }
}

class Pawn extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const attacks = [];
        const dir = this.color === 'white' ? -1 : 1;
        const whiteStartRow = 8;
        const blackStartRow = 1;

        if (gameState.isValid(this.row + dir, this.col) && !gameState.getPiece(this.row + dir, this.col)) {
            moves.push({ r: this.row + dir, c: this.col });
        }
        if (!this.hasMoved && ((this.color === 'white' && this.row === whiteStartRow) || (this.color === 'black' && this.row === blackStartRow))) {
            if (moves.length > 0 && gameState.isValid(this.row + 2 * dir, this.col) && !gameState.getPiece(this.row + 2 * dir, this.col)) {
                moves.push({ r: this.row + 2 * dir, c: this.col });
                if (gameState.isValid(this.row + 3 * dir, this.col) && !gameState.getPiece(this.row + 3 * dir, this.col)) {
                    moves.push({ r: this.row + 3 * dir, c: this.col });
                }
            }
        }
        [-1, 1].forEach(dCol => {
            if (!gameState.isValid(this.row + dir, this.col + dCol)) return;
            const target = gameState.getPiece(this.row + dir, this.col + dCol);
            if (target && target.owner !== this.owner) {
                attacks.push({ r: this.row + dir, c: this.col + dCol });
            }
        });

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
                        continue;
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
        // Diagonal Movement. (r+c)%2 !== 0 is a light square.
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && (r + c) % 2 !== 0) {
                // Normal move to empty square
                if (!gameState.getPiece(r, c)) {
                    moves.push({ r, c });
                }
                // Heal action on adjacent friendly
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

        // Diagonal Movement. (r+c)%2 === 0 is a dark square.
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && (r + c) % 2 === 0) {
                // Normal move to empty square
                if (!gameState.getPiece(r, c)) {
                    moves.push({ r, c });
                }
                // Kill action on any unprotected piece
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
        // Protection is only by allied pieces on adjacent horizontal or vertical squares.
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dr, dc] of directions) {
            const protector = gameState.getPiece(row + dr, col + dc);
            if (protector && protector.owner === piece.owner && protector !== piece) {
                return true; // The piece is protected.
            }
        }
        return false; // The piece is not protected.
    }
}

// --- RENDERER --- //
class Renderer {
    constructor(boardEl, statusPanel) {
        this.boardEl = boardEl;
        this.statusPanel = statusPanel;
        this.playerTurnEl = statusPanel.querySelector('#player-turn');
        this.standardMoveStatusEl = statusPanel.querySelector('#standard-move-status');
        this.specialMoveStatusEl = statusPanel.querySelector('#special-move-status');
        this.phaseInfoEl = statusPanel.querySelector('#phase-info');
    }

    render(gameState, game) {
        this.boardEl.innerHTML = '';
        const { getPiece } = gameState;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.dataset.r = r;
                square.dataset.c = c;
                square.classList.add('square', (r + c) % 2 === 0 ? 'dark' : 'light');

                const piece = getPiece(r, c);
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.classList.add('piece', piece.color);
                    if (piece.type === 'Life') pieceEl.classList.add('life-piece');
                    if (piece.type === 'Death') pieceEl.classList.add('death-piece');
                    if (piece.hasShield) pieceEl.classList.add('has-shield');
                    pieceEl.textContent = piece.symbol;
                    square.appendChild(pieceEl);
                }

                const overlay = this.createHighlightOverlay(r, c, gameState);
                if (overlay) square.appendChild(overlay);

                this.boardEl.appendChild(square);
            }
        }
        this.updateStatus(gameState, game);
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

    updateStatus(gameState, game) {
        this.playerTurnEl.textContent = gameState.currentPlayer.charAt(0).toUpperCase() + gameState.currentPlayer.slice(1);
        this.playerTurnEl.className = 'player-turn ' + gameState.currentPlayer;
        const stdMove = gameState.turn.standardMoveMade ? 'Used' : 'Available';
        const spcMove = gameState.turn.specialMoveMade ? 'Used' : (game.canPlayerMakeSpecialMove() ? 'Available' : 'Unavailable');

        this.standardMoveStatusEl.textContent = stdMove;
        this.specialMoveStatusEl.textContent = spcMove;
        this.phaseInfoEl.textContent = gameState.phaseInfo || ' ';
    }
}

// --- INPUT HANDLER --- //
class InputHandler {
    constructor(game) {
        this.game = game;
        this.game.renderer.boardEl.addEventListener('click', (e) => {
            const square = e.target.closest('.square');
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

// --- GAME LOGIC AND STATE --- //
class Game {
    constructor() {
        this.gameState = {
            board: this.createInitialBoard(),
            currentPlayer: 'white',
            phase: 'SELECT_PIECE',
            selectedPiece: null,
            validMoves: [],
            validAttacks: [],
            validSpecialActions: [],
            stagingOptions: [],
            restingOptions: [],
            attackInfo: null,
            phaseInfo: 'Select a piece to move.',
            turn: { standardMoveMade: false, specialMoveMade: false },
        };
        this.gameState.getPiece = (r, c) => {
            if (!this.gameState.isValid(r, c)) return null;
            return this.gameState.board[r]?.[c] ?? null;
        };
        this.gameState.isValid = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

        this.renderer = new Renderer(document.getElementById('game-board'), document.getElementById('status-panel'));
        this.inputHandler = new InputHandler(this);
        this.renderer.render(this.gameState, this);
    }

    createInitialBoard() {
        const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        const backRank = ['Rook', 'Knight', 'Bishop', 'Queen', 'King', 'Bishop', 'Knight', 'Rook'];

        board[0][0] = new Death('black', 0, 0, 'Death');
        board[0][9] = new Life('black', 0, 9, 'Life');
        backRank.forEach((type, i) => {
            board[0][i + 1] = new (this.getPieceClass(type))('black', 0, i + 1, type);
        });
        for (let c = 0; c < 10; c++) board[1][c] = new Pawn('black', 1, c, 'Pawn');

        board[9][0] = new Life('white', 9, 0, 'Life');
        board[9][9] = new Death('white', 9, 9, 'Death');
        backRank.forEach((type, i) => {
            board[9][i + 1] = new (this.getPieceClass(type))('white', 9, i + 1, type);
        });
        for (let c = 0; c < 10; c++) board[8][c] = new Pawn('white', 8, c, 'Pawn');

        return board;
    }

    getPieceClass(type) {
        return { Pawn, Rook, Knight, Bishop, Queen, King, Life, Death }[type] || Piece;
    }

    handleSquareClick(r, c) {
        const { phase, selectedPiece } = this.gameState;

        if (phase === 'SELECT_PIECE') {
            const piece = this.gameState.getPiece(r, c);
            if (piece && piece.owner === this.gameState.currentPlayer) {
                this.selectPiece(piece);
            }
        } else if (phase === 'SELECT_TARGET') {
            const clickedSamePiece = selectedPiece.row === r && selectedPiece.col === c;
            const targetMove = this.gameState.validMoves.find(m => m.r === r && m.c === c);
            const targetAttack = this.gameState.validAttacks.find(a => a.r === r && a.c === c);
            const targetSpecial = this.gameState.validSpecialActions.find(s => s.r === r && s.c === c);

            if (clickedSamePiece) {
                this.deselect();
            } else if (targetMove) {
                this.executeMove(selectedPiece, r, c, targetMove);
            } else if (targetAttack) {
                this.initiateAttack(selectedPiece, this.gameState.getPiece(r, c));
            } else if (targetSpecial) {
                this.executeSpecialAction(selectedPiece, targetSpecial);
            } else {
                const otherPiece = this.gameState.getPiece(r, c);
                if (otherPiece && otherPiece.owner === this.gameState.currentPlayer) {
                    this.selectPiece(otherPiece);
                } else {
                    this.deselect();
                }
            }
        } else if (phase === 'SELECT_STAGING') {
            if (this.gameState.stagingOptions.some(s => s.r === r && s.c === c)) {
                this.executeAttack(r, c);
            } else {
                this.deselect();
            }
        } else if (phase === 'SELECT_RESTING') {
            if (this.gameState.restingOptions.some(s => s.r === r && s.c === c)) {
                this.completeResting(r, c);
            }
        }

        // Always re-render after a click to show updates
        this.renderer.render(this.gameState, this);
    }

    selectPiece(piece) {
        const isStandard = !['Life', 'Death'].includes(piece.type);
        const { moves, attacks, specialActions } = piece.getPossibleMoves(this.gameState);

        let canDoAction = false;
        // Check for standard move
        if (isStandard && !this.gameState.turn.standardMoveMade) {
            if (moves.length > 0 || attacks.length > 0) canDoAction = true;
        }
        // Check for special move (Life/Death)
        else if (!isStandard) {
            // Check for normal diagonal move (special move slot)
            if (!this.gameState.turn.specialMoveMade && moves.length > 0) canDoAction = true;
            // Check for heal/kill action (standard move slot)
            if (!this.gameState.turn.standardMoveMade && specialActions.length > 0) canDoAction = true;
        }

        if (!canDoAction) {
            this.deselect();
            this.gameState.phaseInfo = "This piece has no available moves this turn.";
            return;
        }

        this.gameState.selectedPiece = piece;
        this.gameState.phase = 'SELECT_TARGET';
        this.gameState.validMoves = (isStandard || !this.gameState.turn.specialMoveMade) ? (moves || []) : [];
        this.gameState.validAttacks = (!isStandard || this.gameState.turn.standardMoveMade) ? [] : (attacks || []);
        this.gameState.validSpecialActions = (isStandard || this.gameState.turn.standardMoveMade) ? [] : (specialActions || []);

        this.gameState.phaseInfo = 'Select a destination or target.';
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
        let destroyed = false;

        if (moveInfo?.isSpecialJump) {
            destroyed = this.applyPassThroughEffect(piece, moveInfo.jumpedPiece);
        } else if (piece.type !== 'Knight') { // Knights jump, they don't pass through
            destroyed = this.checkPassThrough(piece, fromR, fromC, toR, toC);
        }

        this.gameState.board[fromR][fromC] = null;
        if (!destroyed) {
            this.gameState.board[toR][toC] = piece;
            piece.row = toR;
            piece.col = toC;
        }
        piece.hasMoved = true;
        this.completeMove(piece, true, false);
    }

    initiateAttack(attacker, target) {
        const stagingSquares = this.calculateStagingSquares(attacker, target);
        if (stagingSquares.length > 0) {
            this.gameState.phase = 'SELECT_STAGING';
            this.gameState.stagingOptions = stagingSquares;
            this.gameState.attackInfo = { attacker, target };
            this.gameState.phaseInfo = 'Select a staging square for the attack.';
        } else {
            this.deselect();
            this.gameState.phaseInfo = 'No valid staging squares for this attack.';
        }
    }

    calculateStagingSquares(attacker, target) {
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

        // Temporarily move piece to check its moves from there
        const originalPos = { r: attacker.row, c: attacker.col };
        let validStaging = [];

        for (const adj of adjacentSquares) {
            attacker.row = originalPos.r; // Reset for each check
            attacker.col = originalPos.c;

            // For a knight, can it make a standard L-move from its current pos to the staging square?
            if (attacker.type === 'Knight') {
                const l_moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
                if (l_moves.some(([dr, dc]) => originalPos.r + dr === adj.r && originalPos.c + dc === adj.c)) {
                    validStaging.push(adj);
                }
            } else {
                // For other pieces, can they slide to the staging square?
                const { moves } = attacker.getPossibleMoves(this.gameState);
                if (moves.some(m => m.r === adj.r && m.c === adj.c)) {
                    validStaging.push(adj);
                }
            }
        }
        attacker.row = originalPos.r; // Restore original position
        attacker.col = originalPos.c;
        return validStaging;
    }

    executeAttack(stagingR, stagingC) {
        const { attacker, target } = this.gameState.attackInfo;
        const fromR = attacker.row;
        const fromC = attacker.col;
        let destroyed = false;

        if (attacker.type !== 'Knight') {
            destroyed = this.checkPassThrough(attacker, fromR, fromC, stagingR, stagingC);
        }

        this.gameState.board[fromR][fromC] = null;
        if (destroyed) {
            this.completeMove(attacker, true, false);
            return;
        }

        this.gameState.board[stagingR][stagingC] = attacker;
        attacker.row = stagingR;
        attacker.col = stagingC;
        attacker.hasMoved = true;

        if (target.hasShield) {
            target.hasShield = false;
            this.completeMove(attacker, true, false);
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
        // If the chosen resting square is not the one it's currently on
        if (attacker.row !== toR || attacker.col !== toC) {
            this.gameState.board[attacker.row][attacker.col] = null;
            this.gameState.board[toR][toC] = attacker;
            attacker.row = toR;
            attacker.col = toC;
        }
        this.completeMove(attacker, true, false);
    }

    executeSpecialAction(piece, action) {
        if (action.type === 'heal') {
            const target = this.gameState.getPiece(action.r, action.c);
            if (target) target.hasShield = true;
            this.completeMove(piece, false, true); // Piece didn't move, action used standard slot
        } else if (action.type === 'kill') {
            const fromR = piece.row;
            const fromC = piece.col;
            this.gameState.board[fromR][fromC] = null;
            this.gameState.board[action.r][action.c] = piece;
            piece.row = action.r;
            piece.col = action.c;
            piece.hasMoved = true;
            this.completeMove(piece, true, true); // Piece moved, action used standard slot
        }
    }

    completeMove(piece, pieceMoved, isSpecialAction) {
        const isStandardPiece = !['Life', 'Death'].includes(piece.type);

        if (isStandardPiece) {
            this.gameState.turn.standardMoveMade = true;
        } else { // Life or Death piece
            if (isSpecialAction) {
                this.gameState.turn.standardMoveMade = true;
            } else if (pieceMoved) {
                this.gameState.turn.specialMoveMade = true;
            }
        }

        this.checkForAnnihilation();
        this.checkForCheck();
        this.deselect();
        this.checkAndEndTurn();
    }

    endTurn() {
        this.gameState.currentPlayer = this.gameState.currentPlayer === 'white' ? 'black' : 'white';
        this.gameState.turn = { standardMoveMade: false, specialMoveMade: false };
        this.deselect();
        this.renderer.render(this.gameState, this);
    }

    checkAndEndTurn() {
        const { standardMoveMade, specialMoveMade } = this.gameState.turn;

        const canMakeStandard = !standardMoveMade && this.playerHasPossibleMoves('standard');
        const canMakeSpecial = !specialMoveMade && this.playerHasPossibleMoves('special');

        if (!canMakeStandard && !canMakeSpecial) {
            this.gameState.phaseInfo = `Turn ending for ${this.gameState.currentPlayer}...`;
            this.renderer.render(this.gameState, this);
            setTimeout(() => this.endTurn(), 1200);
        }
    }

    playerHasPossibleMoves(moveType) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = this.gameState.getPiece(r, c);
                if (!piece || piece.owner !== this.gameState.currentPlayer) continue;

                const isLifeDeath = ['Life', 'Death'].includes(piece.type);
                const { moves, attacks, specialActions } = piece.getPossibleMoves(this.gameState);

                if (moveType === 'standard') {
                    if (!isLifeDeath && (moves.length > 0 || attacks.length > 0)) return true;
                    if (isLifeDeath && specialActions && specialActions.length > 0) return true;
                } else if (moveType === 'special') {
                    if (isLifeDeath && moves.length > 0) return true;
                }
            }
        }
        return false;
    }

    checkPassThrough(piece, r1, c1, r2, c2) {
        const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
        let r = r1 + dr, c = c1 + dc;
        while (r !== r2 || c !== c2) {
            const p = this.gameState.getPiece(r, c);
            if (p && (p.type === 'Life' || p.type === 'Death')) {
                if (this.applyPassThroughEffect(piece, p)) return true; // Piece was destroyed
            }
            r += dr; c += dc;
        }
        return false; // Piece survived
    }

    applyPassThroughEffect(movingPiece, staticPiece) {
        if (staticPiece.type === 'Life') {
            movingPiece.hasShield = true;
        } else if (staticPiece.type === 'Death') {
            if (movingPiece.hasShield) {
                movingPiece.hasShield = false;
            } else {
                return true; // Is destroyed
            }
        }
        return false; // Survived
    }

    checkForAnnihilation() {
        const lifeDeathPieces = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = this.gameState.getPiece(r, c);
                if (p && (p.type === 'Life' || p.type === 'Death')) lifeDeathPieces.push(p);
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
            if (this.gameState.board[p.row] && this.gameState.board[p.row][p.col] === p) {
                this.gameState.board[p.row][p.col] = null;
            }
        });
    }

    checkForCheck() {
        ['white', 'black'].forEach(kingColor => {
            const king = this.findKing(kingColor);
            if (!king) return;
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    const piece = this.gameState.getPiece(r, c);
                    if (piece && piece.owner !== kingColor) {
                        // We need to check all possible attacks, not just from current state
                        const { attacks } = piece.getPossibleMoves(this.gameState);
                        if (attacks.some(a => a.r === king.row && a.c === king.col)) {
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

// --- INITIALIZE GAME --- //
document.addEventListener('DOMContentLoaded', () => new Game());
