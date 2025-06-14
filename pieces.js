import { BOARD_SIZE } from './game.js';

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
        this.isImmune = false;
        this.isIntimidated = false;
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
        const startPos = this.color === 'white' ? 8 : 1;

        const oneStepFwd = { r: this.row + dir, c: this.col };
        if (gameState.isValid(oneStepFwd.r, oneStepFwd.c)) {
            const pieceAtOne = gameState.getPiece(oneStepFwd.r, oneStepFwd.c);
            if (!pieceAtOne || pieceAtOne.type === 'Death') {
                moves.push(oneStepFwd);
            }
        }

        if (!this.hasMoved) {
            const canPass = (r, c) => {
                const p = gameState.getPiece(r, c);
                return !p || ['Life', 'Death'].includes(p.type);
            };
            const isEmptyOrDeath = (r, c) => {
                const p = gameState.getPiece(r, c);
                return !p || p.type === 'Death';
            };

            const twoStepsFwd = { r: this.row + 2 * dir, c: this.col };
            if (gameState.isValid(twoStepsFwd.r, twoStepsFwd.c) && canPass(this.row + dir, this.col)) {
                if (isEmptyOrDeath(twoStepsFwd.r, twoStepsFwd.c)) {
                    moves.push(twoStepsFwd);
                }
            }

            const threeStepsFwd = { r: this.row + 3 * dir, c: this.col };
            if (this.row === startPos && gameState.isValid(threeStepsFwd.r, threeStepsFwd.c) && canPass(this.row + dir, this.col) && canPass(this.row + 2 * dir, this.col)) {
                if (isEmptyOrDeath(threeStepsFwd.r, threeStepsFwd.c)) {
                    moves.push(threeStepsFwd);
                }
            }
        } else if (this.row === (this.color === 'white' ? 7 : 2)) { // After a 1-square first move
            const canPass = (r, c) => {
                const p = gameState.getPiece(r, c);
                return !p || ['Life', 'Death'].includes(p.type);
            };
            const isEmptyOrDeath = (r, c) => {
                const p = gameState.getPiece(r, c);
                return !p || p.type === 'Death';
            };

            const twoStepsFwd = { r: this.row + 2 * dir, c: this.col };
            if (gameState.isValid(twoStepsFwd.r, twoStepsFwd.c) && canPass(this.row + dir, this.col)) {
                if (isEmptyOrDeath(twoStepsFwd.r, twoStepsFwd.c)) {
                    moves.push(twoStepsFwd);
                }
            }
        }

        [-1, 1].forEach(dCol => {
            if (!gameState.isValid(this.row + dir, this.col + dCol)) return;
            const target = gameState.getPiece(this.row + dir, this.col + dCol);
            if (target && target.owner !== this.owner && target.type !== 'Life' && target.type !== 'Death') {
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
                    if (piece.type === 'Life') {
                        continue; // Pass through Life
                    }
                    if (piece.type === 'Death') {
                        moves.push({ r, c }); // Allow move onto Death square
                        continue; // Can also pass through Death
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
                    } else if (piece.type === 'Death') {
                        moves.push({ r, c });
                    } else if (piece.owner !== this.owner && piece.type !== 'Life') {
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

        const l_moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        l_moves.forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c)) {
                const piece = gameState.getPiece(r, c);
                if (!piece) {
                    moves.push({ r, c });
                } else if (piece.type === 'Death') {
                    moves.push({ r, c });
                } else if (piece.owner !== this.owner && piece.type !== 'Life') {
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
                    if (rampPiece && !['Life', 'Death'].includes(rampPiece.type)) {
                        if (gameState.isValid(landR, landC)) {
                            const landingPiece = gameState.getPiece(landR, landC);
                            if (!landingPiece || landingPiece.type === 'Death') {
                                singleJumps.push({ r: landR, c: landC });
                            }
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
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;

            if (gameState.isValid(r, c) && (r + c) % 2 !== 0) { // Can only move to light squares
                const pieceAtTarget = gameState.getPiece(r, c);
                if (!pieceAtTarget) {
                    moves.push({ r, c });
                } else {
                    // Allow healing (to grant immunity) any valid piece that is not already immune.
                    if (!pieceAtTarget.isImmune && !['King', 'Queen', 'Life', 'Death'].includes(pieceAtTarget.type)) {
                        specialActions.push({ r, c, type: 'heal' });
                    }
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
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
            const r = this.row + dr;
            const c = this.col + dc;
            if (gameState.isValid(r, c) && (r + c) % 2 === 0) { // Can only move to dark squares
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

export { Piece, Pawn, Rook, Bishop, Queen, King, Knight, Life, Death };
