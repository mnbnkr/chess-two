const BOARD_SIZE = 10;
const PIECE_SYMBOLS = {
    white: { King: '♔', Queen: '♕', Rook: '♖', Bishop: '♗', Knight: '♘', Pawn: '♙', Life: '❤', Death: '💀' },
    black: { King: '♚', Queen: '♛', Rook: '♜', Bishop: '♝', Knight: '♞', Pawn: '♟', Life: '❤', Death: '💀' }
};

class Piece {
    constructor(color, row, col, type) {
        this.color = color;
        this.row = row;
        this.col = col;
        this.type = type;
        this.hasShield = !['King', 'Queen', 'Life', 'Death'].includes(type);
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

        // 1-square move (always possible if empty)
        if (gameState.isValid(this.row + dir, this.col) && !gameState.getPiece(this.row + dir, this.col)) {
            moves.push({ r: this.row + dir, c: this.col });
        }

        // Multi-square forward moves, only if the first square is clear
        if (moves.length > 0) {
            const isWhite = this.color === 'white';
            const startRow = isWhite ? 8 : 1;
            const oneStepFwdRow = isWhite ? 7 : 2;

            // From starting rank: can move 2 or 3 squares forward
            if (this.row === startRow) {
                if (gameState.isValid(this.row + 2 * dir, this.col) && !gameState.getPiece(this.row + 2 * dir, this.col)) {
                    moves.push({ r: this.row + 2 * dir, c: this.col });
                    if (gameState.isValid(this.row + 3 * dir, this.col) && !gameState.getPiece(this.row + 3 * dir, this.col)) {
                        moves.push({ r: this.row + 3 * dir, c: this.col });
                    }
                }
            }
            // From rank after start: can move 2 squares forward
            else if (this.row === oneStepFwdRow) {
                if (gameState.isValid(this.row + 2 * dir, this.col) && !gameState.getPiece(this.row + 2 * dir, this.col)) {
                    moves.push({ r: this.row + 2 * dir, c: this.col });
                }
            }
        }

        // Attacks
        [-1, 1].forEach(dCol => {
            if (!gameState.isValid(this.row + dir, this.col + dCol)) return;
            const target = gameState.getPiece(this.row + dir, this.col + dCol);
            if (target && target.owner !== this.owner) {
                attacks.push({ r: this.row + dir, c: this.col + dCol });
            }
        });

        // Special Jump
        const blockingPiece = gameState.getPiece(this.row + dir, this.col);
        if (blockingPiece && (blockingPiece.type === 'Life' || blockingPiece.type === 'Death') && blockingPiece.owner !== this.owner) {
            if (gameState.isValid(this.row + 2 * dir, this.col) && !gameState.getPiece(this.row + 2 * dir, this.col)) {
                moves.push({ r: this.row + 2 * dir, c: this.col, isSpecialJump: true, jumpedPiece: blockingPiece });
            }
        }
        return { moves, attacks, specialActions: [] };
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
                        continue; // Pass through Life/Death
                    }
                    if (piece.owner !== this.owner) {
                        attacks.push({ r, c });
                    }
                    break;
                }
                moves.push({ r, c });
            }
        });
        return { moves, attacks, specialActions: [] };
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
            attacks: [...straight.attacks, ...diagonal.attacks],
            specialActions: []
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
        return { moves, attacks, specialActions: [] };
    }
}
class Knight extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const attacks = [];

        // Standard L-moves
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

        // Chained Ramp Jumps (non-capturing)
        const rampDestinations = new Set();
        const originalPosKey = `${this.row},${this.col}`;

        const _findSingleRampJumps = (startR, startC) => {
            const singleJumps = [];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;

                    const rampR = startR + dr;
                    const rampC = startC + dc;
                    const landR = startR + 2 * dr;
                    const landC = startC + 2 * dc;

                    const rampPiece = gameState.getPiece(rampR, rampC);
                    if (rampPiece && !['Life', 'Death', 'King'].includes(rampPiece.type)) {
                        if (gameState.isValid(landR, landC) && !gameState.getPiece(landR, landC)) {
                            singleJumps.push({ r: landR, c: landC });
                        }
                    }
                }
            }
            return singleJumps;
        };

        const firstJumps = _findSingleRampJumps(this.row, this.col);
        firstJumps.forEach(jump => rampDestinations.add(`${jump.r},${jump.c}`));

        firstJumps.forEach(jump1 => {
            const secondJumps = _findSingleRampJumps(jump1.r, jump1.c);
            secondJumps.forEach(jump2 => {
                // Cannot land back on the starting square in a double jump
                if (`${jump2.r},${jump2.c}` !== originalPosKey) {
                    rampDestinations.add(`${jump2.r},${jump2.c}`);
                }
            });
        });

        const existingMoveKeys = new Set(moves.map(m => `${m.r},${m.c}`));
        rampDestinations.forEach(key => {
            if (!existingMoveKeys.has(key)) {
                const [r, c] = key.split(',').map(Number);
                moves.push({ r, c, isRampJump: true });
            }
        });

        return { moves, attacks, specialActions: [] };
    }
}

class Life extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const specialActions = [];
        // Life moves on LIGHT squares (odd sum of coordinates, assuming (0,0) is dark).
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;

            if (gameState.isValid(r, c) && (r + c) % 2 !== 0) {
                if (!gameState.getPiece(r, c)) {
                    moves.push({ r, c });
                }
                const target = gameState.getPiece(r, c);
                if (target && target.owner === this.owner && !target.hasShield && !['King', 'Life', 'Death'].includes(target.type)) {
                    specialActions.push({ r, c, type: 'heal' });
                }
            }
        });
        return { moves, attacks: [], specialActions };
    }
}
class Death extends Piece {
    getPossibleMoves(gameState) {
        const moves = [];
        const specialActions = [];
        // Death moves on DARK squares (even sum of coordinates, assuming (0,0) is dark).
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && (r + c) % 2 === 0) {
                if (!gameState.getPiece(r, c)) {
                    moves.push({ r, c });
                }
                const target = gameState.getPiece(r, c);
                if (target && !this._isProtected(target, gameState)) {
                    specialActions.push({ r, c, type: 'kill' });
                }
            }
        });
        return { moves, attacks: [], specialActions };
    }

    _isProtected(piece, gameState) {
        const { row, col } = piece;
        // Protection is by allied pieces on adjacent horizontal or vertical squares.
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
        const currentPlayerName = gameState.currentPlayer.charAt(0).toUpperCase() + gameState.currentPlayer.slice(1);
        this.playerTurnEl.textContent = currentPlayerName;
        this.playerTurnEl.className = 'player-turn ' + gameState.currentPlayer;

        const stdMoveStatus = gameState.turn.standardMoveMade ? 'Used' : 'Available';
        this.standardMoveStatusEl.textContent = stdMoveStatus;
        this.standardMoveStatusEl.className = 'status-' + stdMoveStatus.toLowerCase();

        const spcMoveAvailable = game.playerHasPossibleMoves('special');
        let spcMoveStatus, spcMoveClass;
        if (gameState.turn.specialMoveMade) {
            spcMoveStatus = 'Used';
            spcMoveClass = 'status-used';
        } else if (spcMoveAvailable) {
            spcMoveStatus = 'Available';
            spcMoveClass = 'status-available';
        } else {
            spcMoveStatus = 'Unavailable';
            spcMoveClass = 'status-unavailable';
        }
        this.specialMoveStatusEl.textContent = spcMoveStatus;
        this.specialMoveStatusEl.className = spcMoveClass;

        if (gameState.phase === 'SELECT_PIECE' && !gameState.phaseInfo.includes('turn')) {
            this.phaseInfoEl.textContent = `${currentPlayerName}'s turn. Select a piece to move.`;
        } else {
            this.phaseInfoEl.textContent = gameState.phaseInfo || ' ';
        }
    }
}

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
            phaseInfo: "White's turn. Select a piece to begin.",
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

        if (phase === 'SELECT_STAGING') {
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
        else if (selectedPiece) {
            const targetMove = this.gameState.validMoves.find(m => m.r === r && m.c === c);
            const targetAttack = this.gameState.validAttacks.find(a => a.r === r && a.c === c);
            const targetSpecial = this.gameState.validSpecialActions.find(s => s.r === r && s.c === c);

            if (targetMove) {
                this.executeMove(selectedPiece, r, c, targetMove);
            } else if (targetAttack) {
                this.initiateAttack(selectedPiece, this.gameState.getPiece(r, c));
            } else if (targetSpecial) {
                this.executeSpecialAction(selectedPiece, targetSpecial);
            } else {
                const clickedPiece = this.gameState.getPiece(r, c);
                if (clickedPiece && clickedPiece.owner === this.gameState.currentPlayer) {
                    this.selectPiece(clickedPiece);
                } else {
                    this.deselect();
                }
            }
        } else {
            const piece = this.gameState.getPiece(r, c);
            if (piece && piece.owner === this.gameState.currentPlayer) {
                this.selectPiece(piece);
            }
        }

        this.renderer.render(this.gameState, this);
    }


    selectPiece(piece) {
        const isStandard = !['Life', 'Death'].includes(piece.type);
        const { moves, attacks, specialActions } = piece.getPossibleMoves(this.gameState);

        const canMakeStandardMove = !this.gameState.turn.standardMoveMade;
        const canMakeSpecialMove = !this.gameState.turn.specialMoveMade;

        let validMoves = [];
        let validAttacks = [];
        let validSpecialActions = [];

        if (isStandard) {
            if (canMakeStandardMove) {
                validMoves = moves || [];
                validAttacks = attacks || [];
            }
        } else { // Life or Death piece
            if (canMakeSpecialMove) {
                validMoves = moves || [];
            }
            // A special action requires BOTH move slots to be available.
            if (canMakeStandardMove && canMakeSpecialMove) {
                validSpecialActions = specialActions || [];
            }
        }

        if (validMoves.length === 0 && validAttacks.length === 0 && validSpecialActions.length === 0) {
            this.gameState.phaseInfo = "This piece has no available moves this turn.";
            return;
        }

        this.gameState.selectedPiece = piece;
        this.gameState.phase = 'SELECT_TARGET';
        this.gameState.validMoves = validMoves;
        this.gameState.validAttacks = validAttacks;
        this.gameState.validSpecialActions = validSpecialActions;
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
        const currentPlayerName = this.gameState.currentPlayer.charAt(0).toUpperCase() + this.gameState.currentPlayer.slice(1);
        this.gameState.phaseInfo = `${currentPlayerName}'s turn. Select a piece to move.`;
    }

    executeMove(piece, toR, toC, moveInfo) {
        const fromR = piece.row;
        const fromC = piece.col;
        let destroyed = false;

        if (moveInfo?.isSpecialJump) {
            destroyed = this.applyPassThroughEffect(piece, moveInfo.jumpedPiece);
        } else if (piece.type !== 'Knight') {
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

        if (stagingSquares.length === 0) {
            this.deselect();
            this.gameState.phaseInfo = 'Attack impossible: No valid staging square.';
            return;
        }

        this.gameState.attackInfo = { attacker, target };

        if (stagingSquares.length === 1) {
            this.executeAttack(stagingSquares[0].r, stagingSquares[0].c);
        } else {
            this.gameState.phase = 'SELECT_STAGING';
            this.gameState.stagingOptions = stagingSquares;
            this.gameState.phaseInfo = 'Select a staging square for the attack.';
        }
    }

    calculateStagingSquares(attacker, target) {
        switch (attacker.type) {
            case 'Rook':
            case 'Bishop':
            case 'Queen':
                return this._calculateSlidingStagingSquares(attacker, target);
            case 'Knight':
                return this._calculateKnightStagingSquares(attacker, target);
            case 'Pawn':
            case 'King':
                return this._calculateAdjacentAttackStagingSquares(attacker, target);
            default:
                return [];
        }
    }

    _calculateSlidingStagingSquares(attacker, target) {
        const rA = attacker.row, cA = attacker.col;
        const rT = target.row, cT = target.col;

        const dr = Math.sign(rT - rA);
        const dc = Math.sign(cT - cA);

        const isStraight = (dr === 0 || dc === 0) && (dr !== 0 || dc !== 0);
        const isDiagonal = (Math.abs(rT - rA) === Math.abs(cT - cA));

        // Validate direction for the specific piece type
        if ((attacker.type === 'Rook' && !isStraight) || (attacker.type === 'Bishop' && !isDiagonal)) {
            return [];
        }

        // Check for obstructions between the attacker and the target
        let r = rA + dr;
        let c = cA + dc;
        while (r !== rT || c !== cT) {
            const piece = this.gameState.getPiece(r, c);
            if (piece && piece.type !== 'Life' && piece.type !== 'Death') {
                return []; // Path is blocked
            }
            r += dr;
            c += dc;
        }

        // Path is clear. Check for empty staging squares adjacent to target on the line of attack.
        const potentialSquares = [
            { r: rT - dr, c: cT - dc }, // Square "in front" of target
            { r: rT + dr, c: cT + dc }  // Square "behind" target
        ];

        return potentialSquares.filter(s =>
            (s.r !== rA || s.c !== cA) && // Cannot stage on attacker's current square
            this.gameState.isValid(s.r, s.c) &&
            !this.gameState.getPiece(s.r, s.c)
        );
    }

    _calculateKnightStagingSquares(attacker, target) {
        const rT = target.row, cT = target.col;

        // Potential staging squares are the 8 locations from which a Knight can jump TO the target.
        // We then filter these to only squares adjacent to the target, per the special Knight rule.
        // The rule example: Knight on c2 attacks d4, staging squares are c4 and d3.
        // Let's analyze this specific transformation.
        // Attack vector (c2->d4) is (+1 col, +2 row) -> (dc=1, dr=2) assuming a1=0,0 bottom-left.
        // Staging squares (c4, d3) are (target_c-1, target_r) and (target_c, target_r-1).
        // Let's use board coordinates (0,0 top-left). Attacker (rA,cA), Target(rT,cT).
        const dr_abs = Math.abs(rT - attacker.row);
        const dc_abs = Math.abs(cT - attacker.col);
        const dr_sign = Math.sign(rT - attacker.row);
        const dc_sign = Math.sign(cT - attacker.col);

        const potentialSquares = [];
        if (dr_abs === 2 && dc_abs === 1) { // Vertical L
            potentialSquares.push({ r: rT - dr_sign, c: cT }); // one step back on long axis
            potentialSquares.push({ r: rT, c: cT - dc_sign }); // one step back on short axis
        } else if (dr_abs === 1 && dc_abs === 2) { // Horizontal L
            potentialSquares.push({ r: rT - dr_sign, c: cT }); // one step back on short axis
            potentialSquares.push({ r: rT, c: cT - dc_sign }); // one step back on long axis
        }

        // Filter for squares that are valid and empty
        return potentialSquares.filter(s =>
            this.gameState.isValid(s.r, s.c) && !this.gameState.getPiece(s.r, s.c)
        );
    }

    _calculateAdjacentAttackStagingSquares(attacker, target) {
        const rA = attacker.row, cA = attacker.col;
        const rT = target.row, cT = target.col;

        // This logic is for pieces that attack adjacent squares (King, Pawn).
        // The line of attack is directly from attacker to target.
        const dr = rT - rA;
        const dc = cT - cA;

        // The only possible staging square is the one "behind" the target on the same line.
        const stagingSquare = { r: rT + dr, c: cT + dc };

        if (this.gameState.isValid(stagingSquare.r, stagingSquare.c) && !this.gameState.getPiece(stagingSquare.r, stagingSquare.c)) {
            return [stagingSquare];
        }

        return [];
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
            this.completeMove(piece, false, true);
        } else if (action.type === 'kill') {
            const fromR = piece.row;
            const fromC = piece.col;
            this.gameState.board[fromR][fromC] = null;
            this.gameState.board[action.r][action.c] = piece;
            piece.row = action.r;
            piece.col = action.c;
            piece.hasMoved = true;
            this.completeMove(piece, true, true);
        }
    }

    completeMove(piece, pieceMoved, isSpecialAction) {
        const isStandardPiece = !['Life', 'Death'].includes(piece.type);

        if (isStandardPiece) {
            this.gameState.turn.standardMoveMade = true;
        } else { // Life or Death piece
            if (isSpecialAction) {
                // Special actions for Life/Death consume both move slots for the turn.
                this.gameState.turn.standardMoveMade = true;
                this.gameState.turn.specialMoveMade = true;
            } else if (pieceMoved) {
                this.gameState.turn.specialMoveMade = true;
            }
        }

        this.checkForAnnihilation();
        this.checkForCheck();
        this.deselect();
        this.checkAndEndTurn();
    }

    checkAndEndTurn() {
        const { standardMoveMade, specialMoveMade } = this.gameState.turn;

        const canMakeStandard = !standardMoveMade && this.playerHasPossibleMoves('standard');
        const canMakeSpecial = !specialMoveMade && this.playerHasPossibleMoves('special');

        if (!canMakeStandard && !canMakeSpecial) {
            this.gameState.currentPlayer = this.gameState.currentPlayer === 'white' ? 'black' : 'white';
            this.gameState.turn = { standardMoveMade: false, specialMoveMade: false };
            this.deselect();
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
                    if (!isLifeDeath && ((moves && moves.length > 0) || (attacks && attacks.length > 0))) return true;
                    // A special action requires both slots, so we must check both here.
                    if (isLifeDeath && specialActions && specialActions.length > 0 && !this.gameState.turn.specialMoveMade) return true;
                } else if (moveType === 'special') {
                    if (isLifeDeath && moves && moves.length > 0) return true;
                }
            }
        }
        return false;
    }

    checkPassThrough(piece, r1, c1, r2, c2) {
        if (r1 === r2 && c1 === c2) return false;
        const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
        if (dr === 0 && dc === 0) return false;
        let r = r1 + dr, c = c1 + dc;
        while (r !== r2 || c !== c2) {
            const p = this.gameState.getPiece(r, c);
            if (p && (p.type === 'Life' || p.type === 'Death')) {
                if (this.applyPassThroughEffect(piece, p)) return true; // Piece was destroyed
            }
            r += dr; c += dc;
        }
        return false;
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
        return false;
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
                if (p1.type !== p2.type && Math.abs(p1.row - p2.row) <= 1 && Math.abs(p1.col - p2.col) <= 1 && (p1.row === p2.row || p1.col === p2.col)) {
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
            const opponentColor = kingColor === 'white' ? 'black' : 'white';
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    const piece = this.gameState.getPiece(r, c);
                    if (piece && piece.owner === opponentColor) {
                        const { attacks } = piece.getPossibleMoves(this.gameState);
                        if (attacks && attacks.some(a => a.r === king.row && a.c === king.col)) {
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

document.addEventListener('DOMContentLoaded', () => new Game());
