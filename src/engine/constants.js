export const BOARD_SIZE = 10;

export const COLORS = {
  WHITE: "white",
  BLACK: "black",
};

export const PIECE_TYPES = {
  PAWN: "Pawn",
  ROOK: "Rook",
  KNIGHT: "Knight",
  BISHOP: "Bishop",
  QUEEN: "Queen",
  KING: "King",
  FOOL: "Fool",
  TOAD: "Toad",
  LIFE: "Life",
  DEATH: "Death",
};

export const STANDARD_PIECES = new Set([
  PIECE_TYPES.PAWN,
  PIECE_TYPES.ROOK,
  PIECE_TYPES.KNIGHT,
  PIECE_TYPES.BISHOP,
  PIECE_TYPES.QUEEN,
  PIECE_TYPES.KING,
  PIECE_TYPES.FOOL,
  PIECE_TYPES.TOAD,
]);

export const LIFE_DEATH_PIECES = new Set([PIECE_TYPES.LIFE, PIECE_TYPES.DEATH]);

export const SHIELDLESS_TYPES = new Set([
  PIECE_TYPES.KING,
  PIECE_TYPES.QUEEN,
  PIECE_TYPES.LIFE,
  PIECE_TYPES.DEATH,
]);

export const PROMOTION_TYPES = [
  PIECE_TYPES.QUEEN,
  PIECE_TYPES.ROOK,
  PIECE_TYPES.BISHOP,
  PIECE_TYPES.KNIGHT,
];

export const PIECE_SYMBOLS = {
  white: {
    King: "♔",
    Queen: "♕",
    Rook: "♖",
    Bishop: "♗",
    Knight: "♘",
    Pawn: "♙",
    Fool: "♟",
    Toad: "♙",
    Life: "❤",
    Death: "💀",
  },
  black: {
    King: "♚",
    Queen: "♛",
    Rook: "♜",
    Bishop: "♝",
    Knight: "♞",
    Pawn: "♟",
    Fool: "♙",
    Toad: "♟",
    Life: "❤",
    Death: "💀",
  },
};

export const MATERIAL_VALUES = {
  King: 10000,
  Queen: 900,
  Rook: 500,
  Bishop: 330,
  Knight: 320,
  Toad: 310,
  Fool: 280,
  Pawn: 100,
  Life: 190,
  Death: 220,
};

export const FILES = "abcdefghjk";

export function oppositeColor(color) {
  return color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
}

export function isLightSquare(row, col) {
  return (row + col) % 2 !== 0;
}

export function isDarkSquare(row, col) {
  return !isLightSquare(row, col);
}

export function isFrameSquare(row, col) {
  return (
    row === 0 ||
    row === BOARD_SIZE - 1 ||
    col === 0 ||
    col === BOARD_SIZE - 1
  );
}

export function canHaveShield(type) {
  return !SHIELDLESS_TYPES.has(type);
}

export function isPromotionRank(piece) {
  if (piece.type !== PIECE_TYPES.PAWN) return false;
  return piece.color === COLORS.WHITE
    ? piece.row === 0
    : piece.row === BOARD_SIZE - 1;
}
