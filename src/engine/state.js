import {
    BOARD_SIZE,
    COLORS,
    PIECE_TYPES,
    PIECE_SYMBOLS,
    canHaveShield,
} from './constants.js';

let nextGeneratedId = 1;

export function isValidSquare(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

export function createPiece(type, color, row, col, overrides = {}) {
    const piece = {
        id: overrides.id ?? `${color[0]}-${type}-${row}-${col}-${nextGeneratedId++}`,
        type,
        color,
        row,
        col,
        hasShield: overrides.hasShield ?? canHaveShield(type),
        hasMoved: overrides.hasMoved ?? false,
        isImmune: overrides.isImmune ?? false,
        immunityGrantedBy: overrides.immunityGrantedBy ?? null,
        isIntimidated: overrides.isIntimidated ?? false,
        intimidationSuppressedShield: overrides.intimidationSuppressedShield ?? false,
    };
    if (!canHaveShield(type)) piece.hasShield = false;
    return piece;
}

export function clonePiece(piece) {
    return piece ? { ...piece } : null;
}

export function cloneState(state) {
    const board = createBoard();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            board[r][c] = clonePiece(state.board[r][c]);
        }
    }
    return {
        board,
        currentPlayer: state.currentPlayer,
        turn: { ...state.turn },
        moveNumber: state.moveNumber,
        enPassant: state.enPassant ? {
            ...state.enPassant,
            from: { ...state.enPassant.from },
            to: { ...state.enPassant.to },
            crossed: state.enPassant.crossed.map((sq) => ({ ...sq })),
        } : null,
        gameOver: state.gameOver ? { ...state.gameOver } : null,
        lastAction: state.lastAction ? structuredClone(state.lastAction) : null,
        actionHistory: state.actionHistory ? structuredClone(state.actionHistory) : [],
    };
}

export function getPiece(board, row, col) {
    if (!isValidSquare(row, col)) return null;
    return board[row][col];
}

export function setPiece(board, row, col, piece) {
    if (!isValidSquare(row, col)) return;
    board[row][col] = piece;
    if (piece) {
        piece.row = row;
        piece.col = col;
    }
}

export function placePiece(board, piece) {
    setPiece(board, piece.row, piece.col, piece);
    return piece;
}

export function removePiece(state, piece, removedByColor = null) {
    if (!piece) return;
    if (getPiece(state.board, piece.row, piece.col)?.id === piece.id) {
        setPiece(state.board, piece.row, piece.col, null);
    }
    if (piece.type === PIECE_TYPES.KING && !state.gameOver) {
        state.gameOver = {
            winner: removedByColor ?? (piece.color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE),
            reason: `${piece.color} king destroyed`,
        };
    }
}

export function movePiece(state, piece, toRow, toCol) {
    setPiece(state.board, piece.row, piece.col, null);
    setPiece(state.board, toRow, toCol, piece);
}

export function findPieceById(state, id) {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = state.board[r][c];
            if (piece?.id === id) return piece;
        }
    }
    return null;
}

export function allPieces(state) {
    const pieces = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = state.board[r][c];
            if (piece) pieces.push(piece);
        }
    }
    return pieces;
}

export function ownerOf(piece) {
    if (!piece) return null;
    if (piece.type === PIECE_TYPES.LIFE || piece.type === PIECE_TYPES.DEATH) {
        return piece.row >= 5 ? COLORS.WHITE : COLORS.BLACK;
    }
    return piece.color;
}

export function symbolFor(piece) {
    return PIECE_SYMBOLS[piece.color][piece.type];
}

export function createInitialState() {
    const board = createBoard();
    const backRank = [
        PIECE_TYPES.ROOK,
        PIECE_TYPES.KNIGHT,
        PIECE_TYPES.BISHOP,
        PIECE_TYPES.QUEEN,
        PIECE_TYPES.KING,
        PIECE_TYPES.BISHOP,
        PIECE_TYPES.KNIGHT,
        PIECE_TYPES.ROOK,
    ];

    placePiece(board, createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 0, 0, { id: 'black-death-a' }));
    placePiece(board, createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 0, 9, { id: 'black-life-j' }));
    backRank.forEach((type, index) => {
        placePiece(board, createPiece(type, COLORS.BLACK, 0, index + 1, {
            id: `black-${type.toLowerCase()}-${index + 1}`,
        }));
    });
    for (let col = 0; col < BOARD_SIZE; col++) {
        placePiece(board, createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, col, { id: `black-pawn-${col}` }));
    }

    placePiece(board, createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 9, 0, { id: 'white-life-a' }));
    placePiece(board, createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 9, 9, { id: 'white-death-j' }));
    backRank.forEach((type, index) => {
        placePiece(board, createPiece(type, COLORS.WHITE, 9, index + 1, {
            id: `white-${type.toLowerCase()}-${index + 1}`,
        }));
    });
    for (let col = 0; col < BOARD_SIZE; col++) {
        placePiece(board, createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 8, col, { id: `white-pawn-${col}` }));
    }

    return {
        board,
        currentPlayer: COLORS.WHITE,
        turn: { standardMoveMade: false, specialMoveMade: false },
        moveNumber: 1,
        enPassant: null,
        gameOver: null,
        lastAction: null,
        actionHistory: [],
    };
}

export function createEmptyState(currentPlayer = COLORS.WHITE) {
    return {
        board: createBoard(),
        currentPlayer,
        turn: { standardMoveMade: false, specialMoveMade: false },
        moveNumber: 1,
        enPassant: null,
        gameOver: null,
        lastAction: null,
        actionHistory: [],
    };
}
