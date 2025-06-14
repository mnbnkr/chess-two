// Imports from new modules
import { Pawn, Rook, Knight, Bishop, Queen, King, Life, Death } from './pieces.js';
import { Renderer, InputHandler } from './ui.js';

// Export the constant so other modules can use it
export const BOARD_SIZE = 10;

// Keep the piece classes in a map for easy instantiation in createInitialBoard
const pieceClassMap = { Pawn, Rook, Knight, Bishop, Queen, King, Life, Death };

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
        return pieceClassMap[type];
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

        // Check for effects of passing through pieces en route to destination.
        if (moveInfo?.isSpecialJump) {
            destroyed = this.applyPassThroughEffect(piece, moveInfo.jumpedPiece);
        } else {
            if (piece.type === 'Knight') {
                if (!moveInfo?.isRampJump) { // Only for L-shaped moves
                    destroyed = this.checkKnightPassThrough(piece, fromR, fromC, toR, toC);
                }
            } else { // For all other non-special-jump moves (sliding, pawn, king)
                destroyed = this.checkPassThrough(piece, fromR, fromC, toR, toC);
            }
        }

        if (destroyed) {
            this.gameState.board[fromR][fromC] = null;
            this.completeMove(piece, true, false);
            return;
        }

        // Now, handle the effect of the destination square itself.
        const destPiece = this.gameState.getPiece(toR, toC);
        let landedOnDeath = false;
        if (destPiece && destPiece.type === 'Death') {
            landedOnDeath = true;
            if (this.applyPassThroughEffect(piece, destPiece)) {
                destroyed = true; // Piece is destroyed by landing on Death.
            }
        }

        // Move piece from old square.
        this.gameState.board[fromR][fromC] = null;

        if (destroyed || landedOnDeath) {
            // If piece was destroyed OR landed on Death and survived (lost shield),
            // it is removed from the board. Death piece at destination remains untouched.
        } else {
            // Normal move to an unoccupied square.
            this.gameState.board[toR][toC] = piece;
            piece.row = toR;
            piece.col = toC;
        }

        piece.hasMoved = true;
        this.completeMove(piece, true, false);
    }

    initiateAttack(attacker, target) {
        if (target.isImmune) {
            this.deselect();
            this.gameState.phaseInfo = 'Target is immune to attacks this turn.';
            return;
        }
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
                return [{ r: attacker.row, c: attacker.col }];
            default:
                return [];
        }
    }

    _calculateSlidingStagingSquares(attacker, target) {
        const rA = attacker.row, cA = attacker.col;
        const rT = target.row, cT = target.col;

        const dr = Math.sign(rT - rA);
        const dc = Math.sign(cT - cA);

        const stagingR = rT - dr;
        const stagingC = cT - dc;

        if (stagingR === rA && stagingC === cA) {
            return [{ r: rA, c: cA }];
        }

        const stagingPiece = this.gameState.getPiece(stagingR, stagingC);
        if (stagingPiece && stagingPiece.type !== 'Death') {
            return [];
        }

        let r = rA + dr;
        let c = cA + dc;
        while (r !== stagingR || c !== stagingC) {
            const pieceOnPath = this.gameState.getPiece(r, c);
            if (pieceOnPath && pieceOnPath.type !== 'Life' && pieceOnPath.type !== 'Death') {
                return [];
            }
            r += dr;
            c += dc;
        }
        return [{ r: stagingR, c: stagingC }];
    }

    _calculateKnightStagingSquares(attacker, target) {
        const rA = attacker.row, cA = attacker.col;
        const rT = target.row, cT = target.col;

        const dr = rT - rA;
        const dc = cT - cA;

        // This check is redundant if called for a valid attack, but serves as a safeguard.
        if (!((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2))) {
            return [];
        }

        const sign_dr = Math.sign(dr);
        const sign_dc = Math.sign(dc);

        const potentialStagingSquares = [
            // Staging square on the same column as the target.
            { r: rT - sign_dr, c: cT },
            // Staging square on the same row as the target.
            { r: rT, c: cT - sign_dc }
        ];

        return potentialStagingSquares.filter(s => {
            if (!this.gameState.isValid(s.r, s.c)) {
                return false;
            }
            // A staging square cannot be the attacker's original square.
            if (s.r === rA && s.c === cA) {
                return false;
            }
            // A staging square must be empty or occupied by a Death piece to be used.
            const pieceOnSquare = this.gameState.getPiece(s.r, s.c);
            return !pieceOnSquare || pieceOnSquare.type === 'Death';
        });
    }

    executeAttack(stagingR, stagingC) {
        const { attacker, target } = this.gameState.attackInfo;
        const fromR = attacker.row;
        const fromC = attacker.col;

        if (target.isImmune) {
            this.deselect();
            this.gameState.phaseInfo = 'Target is immune to attacks this turn.';
            return;
        }

        const isAdjacentAttack = (attacker.type === 'King' || attacker.type === 'Pawn');

        if (isAdjacentAttack) {
            if (target.hasShield) {
                target.hasShield = false;
                this.completeMove(attacker, true, false);
            } else {
                this.gameState.board[target.row][target.col] = null;
                this.gameState.phase = 'SELECT_RESTING';
                this.gameState.restingOptions = [{ r: fromR, c: fromC }, { r: target.row, c: target.col }];
                this.gameState.attackInfo = {
                    attacker: attacker,
                    isAdjacent: true,
                    targetSquare: { r: target.row, c: target.col },
                    originalPos: { r: fromR, c: fromC }
                };
                this.gameState.phaseInfo = 'Choose a resting square for your piece.';
            }
        } else { // Ranged attack
            const pieceAtStaging = this.gameState.getPiece(stagingR, stagingC);
            const stagedOnDeath = pieceAtStaging?.type === 'Death';
            let destroyedOnPath = false;

            // For any ranged attack, check the path from the attacker's start to the staging square.
            destroyedOnPath = this.checkPassThrough(attacker, fromR, fromC, stagingR, stagingC);

            this.gameState.board[fromR][fromC] = null;
            if (destroyedOnPath) {
                this.completeMove(attacker, true, false);
                return;
            }

            // To prevent the Death piece from being overwritten, we only update the attacker's
            // logical position. It is only physically placed on the board if the square is empty.
            if (!stagedOnDeath) {
                this.gameState.board[stagingR][stagingC] = attacker;
            }
            attacker.row = stagingR;
            attacker.col = stagingC;
            attacker.hasMoved = true;

            if (target.hasShield) {
                target.hasShield = false;
                // If the attacker staged on a Death square, its move ends here. The pass-through
                // effect removed its shield, making a "rest" on the Death square lethal.
                // Since it was never placed on the board, it is effectively removed.
                this.completeMove(attacker, true, false);
            } else {
                // The target is unshielded and will be removed. Proceed to resting phase.
                this.gameState.board[target.row][target.col] = null;
                this.gameState.phase = 'SELECT_RESTING';
                this.gameState.restingOptions = [{ r: stagingR, c: stagingC }, { r: target.row, c: target.col }];
                this.gameState.attackInfo = {
                    attacker: attacker,
                    isAdjacent: false,
                    stagedOnDeath: stagedOnDeath,
                    deathPiece: pieceAtStaging,
                };
                this.gameState.phaseInfo = 'Choose a resting square for your piece.';
            }
        }
    }

    completeResting(toR, toC) {
        const { attacker, isAdjacent, targetSquare, stagedOnDeath, originalPos } = this.gameState.attackInfo;

        if (isAdjacent) {
            const fromR = originalPos.r;
            const fromC = originalPos.c;
            if (toR === targetSquare.r && toC === targetSquare.c) { // Chose to move to target's vacated square
                const destroyed = this.checkPassThrough(attacker, fromR, fromC, toR, toC);
                this.gameState.board[fromR][fromC] = null;
                if (!destroyed) {
                    this.gameState.board[toR][toC] = attacker;
                    attacker.row = toR;
                    attacker.col = toC;
                }
            }
        } else { // Ranged attack
            const stagingR = attacker.row; // Attacker's logical position from executeAttack
            const stagingC = attacker.col;

            // Clear the board at the staging square only if the attacker was physically there
            // (i.e., it was not a Death square).
            if (!stagedOnDeath) {
                if (stagingR !== toR || stagingC !== toC) {
                    this.gameState.board[stagingR][stagingC] = null;
                }
            }

            // The attacker is destroyed only if it chooses to end its move ON the Death square.
            // Any pass-through damage was already applied in executeAttack.
            let destroyed = false;
            if (stagedOnDeath && toR === stagingR && toC === stagingC) {
                destroyed = true;
            }

            if (!destroyed) {
                // If it survived, place it at its final resting spot.
                this.gameState.board[toR][toC] = attacker;
                attacker.row = toR;
                attacker.col = toC;
            }
        }

        attacker.hasMoved = true;
        this.completeMove(attacker, true, false);
    }

    executeSpecialAction(piece, action) {
        if (action.type === 'heal') {
            const target = this.gameState.getPiece(action.r, action.c);
            if (target) {
                target.hasShield = true;
                target.isImmune = true;
            }
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

            // Clear immunity for the new current player's pieces at the start of their turn.
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    const p = this.gameState.getPiece(r, c);
                    if (p && p.owner === this.gameState.currentPlayer && p.isImmune) {
                        p.isImmune = false;
                    }
                }
            }
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
        let currentR = r, currentC = c;
        const endR = r2 + dr, endC = c2 + dc;

        while (currentR !== endR || currentC !== endC) {
            const p = this.gameState.getPiece(r, c);
            if (p && (p.type === 'Life' || p.type === 'Death')) {
                if (this.applyPassThroughEffect(piece, p)) return true;
            }
            if (r === r2 && c === c2) break;
            r += dr; c += dc;
            currentR = r; currentC = c;
        }
        return false;
    }

    checkKnightPassThrough(piece, r1, c1, r2, c2) {
        const dr = r2 - r1;
        const dc = c2 - c1;
        const squaresToCheck = [];

        if (Math.abs(dr) === 2 && Math.abs(dc) === 1) {
            squaresToCheck.push({ r: r1 + Math.sign(dr), c: c1 });
            squaresToCheck.push({ r: r1 + Math.sign(dr), c: c2 });
        } else if (Math.abs(dr) === 1 && Math.abs(dc) === 2) {
            squaresToCheck.push({ r: r1, c: c1 + Math.sign(dc) });
            squaresToCheck.push({ r: r2, c: c1 + Math.sign(dc) });
        }

        let destroyed = false;
        for (const sq of squaresToCheck) {
            const p = this.gameState.getPiece(sq.r, sq.c);
            if (p && (p.type === 'Life' || p.type === 'Death')) {
                if (this.applyPassThroughEffect(piece, p)) {
                    destroyed = true;
                    break;
                }
            }
        }
        return destroyed;
    }

    applyPassThroughEffect(movingPiece, staticPiece) {
        if (movingPiece.isImmune) {
            return false; // Immune pieces are not affected.
        }
        if (staticPiece.type === 'Life') {
            if (!['King', 'Queen'].includes(movingPiece.type)) {
                movingPiece.hasShield = true;
            }
        } else if (staticPiece.type === 'Death') {
            if (movingPiece.hasShield) {
                movingPiece.hasShield = false;
            } else {
                return true; // Piece is destroyed
            }
        }
        return false; // Piece is not destroyed
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
        const allPieces = this.gameState.board.flat().filter(p => p);

        // Phase 1: Restore shields for pieces that are no longer checking
        const intimidatedPieces = allPieces.filter(p => p.isIntimidated);
        for (const piece of intimidatedPieces) {
            const opponentColor = piece.owner === 'white' ? 'black' : 'white';
            const opponentKing = this.findKing(opponentColor);
            if (!opponentKing) continue;

            const { attacks } = piece.getPossibleMoves(this.gameState);
            const isStillChecking = attacks && attacks.some(a => a.r === opponentKing.row && a.c === opponentKing.col);

            if (!isStillChecking) {
                piece.hasShield = true;
                piece.isIntimidated = false;
            }
        }

        // Phase 2: Apply intimidation for new checks
        ['white', 'black'].forEach(kingColor => {
            const king = this.findKing(kingColor);
            if (!king) return;
            const opponentColor = kingColor === 'white' ? 'black' : 'white';

            const opponentPieces = allPieces.filter(p => p.owner === opponentColor);
            for (const piece of opponentPieces) {
                const { attacks } = piece.getPossibleMoves(this.gameState);
                if (attacks && attacks.some(a => a.r === king.row && a.c === king.col)) {
                    if (piece.hasShield && !piece.isIntimidated) {
                        piece.hasShield = false;
                        piece.isIntimidated = true;
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

// Entry point
document.addEventListener('DOMContentLoaded', () => new Game());
