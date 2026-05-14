import {
  BOARD_SIZE,
  COLORS,
  FILES,
  PIECE_TYPES,
  PIECE_SYMBOLS,
  canHaveShield,
  isFrameSquare,
} from "./constants.js";
import {
  CHECK_PATTERNS,
  DEFAULT_ENGINE_VARIANT_ID,
  getVariant,
  normalizeRuleOverrides,
  normalizeVariantId,
} from "../variants/index.js";

let nextGeneratedId = 1;

export function isValidSquare(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

export function createPiece(type, color, row, col, overrides = {}) {
  const piece = {
    id:
      overrides.id ?? `${color[0]}-${type}-${row}-${col}-${nextGeneratedId++}`,
    type,
    color,
    row,
    col,
    hasShield: overrides.hasShield ?? canHaveShield(type),
    hasMoved: overrides.hasMoved ?? false,
    isImmune: overrides.isImmune ?? false,
    immunityGrantedBy: overrides.immunityGrantedBy ?? null,
    isIntimidated: overrides.isIntimidated ?? false,
    intimidationSuppressedShield:
      overrides.intimidationSuppressedShield ?? false,
    frameSuppressedShield: overrides.frameSuppressedShield ?? false,
  };
  if (!canHaveShield(type)) piece.hasShield = false;
  return piece;
}

export function clonePiece(piece) {
  return piece ? { ...piece } : null;
}

export function cloneState(state, options = {}) {
  const preserveHistory = options.preserveHistory ?? true;
  const board = createBoard();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[r][c] = clonePiece(state.board[r][c]);
    }
  }
  return {
    board,
    variantId: normalizeVariantId(state.variantId),
    boardMetadata: structuredClone(
      state.boardMetadata ?? boardMetadataForVariant(state.variantId),
    ),
    ruleOverrides: normalizeRuleOverrides(state.variantId, state.ruleOverrides),
    foolMemory: cloneFoolMemory(state.foolMemory),
    currentPlayer: state.currentPlayer,
    turn: { ...state.turn },
    moveNumber: state.moveNumber,
    enPassant: state.enPassant
      ? {
          ...state.enPassant,
          from: { ...state.enPassant.from },
          to: { ...state.enPassant.to },
          crossed: state.enPassant.crossed.map((sq) => ({ ...sq })),
        }
      : null,
    gameOver: state.gameOver ? { ...state.gameOver } : null,
    lastAction:
      preserveHistory && state.lastAction
        ? structuredClone(state.lastAction)
        : null,
    actionHistory:
      preserveHistory && state.actionHistory
        ? structuredClone(state.actionHistory)
        : [],
    capturedPieces:
      preserveHistory && state.capturedPieces
        ? structuredClone(state.capturedPieces)
        : [],
  };
}

function cloneFoolMemory(memory = {}) {
  return {
    [COLORS.WHITE]: memory[COLORS.WHITE]
      ? structuredClone(memory[COLORS.WHITE])
      : null,
    [COLORS.BLACK]: memory[COLORS.BLACK]
      ? structuredClone(memory[COLORS.BLACK])
      : null,
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
  recordCapturedPiece(state, piece, removedByColor);
  if (getPiece(state.board, piece.row, piece.col)?.id === piece.id) {
    setPiece(state.board, piece.row, piece.col, null);
  }
  if (piece.type === PIECE_TYPES.KING && !state.gameOver) {
    state.gameOver = {
      winner:
        removedByColor ??
        (piece.color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE),
      reason: `${piece.color} king removed`,
    };
  }
}

function recordCapturedPiece(state, piece, removedByColor) {
  state.capturedPieces ??= [];
  if (state.capturedPieces.some((captured) => captured.id === piece.id))
    return;
  state.capturedPieces.push({
    id: piece.id,
    type: piece.type,
    color: piece.color,
    owner: ownerOf(piece),
    removedByColor,
    moveNumber: state.moveNumber,
  });
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

export function createInitialState(options = {}) {
  const variantId = normalizeVariantId(
    options.variantId ?? DEFAULT_ENGINE_VARIANT_ID,
  );
  const variant = getVariant(variantId);
  const board = createBoard();
  for (const [row, col, type, color, id] of variant.setup) {
    placePiece(board, createPiece(type, color, row, col, { id }));
  }

  const state = createStateObject(board, COLORS.WHITE, {
    variantId,
    ruleOverrides: normalizeRuleOverrides(variantId, options.overrides),
  });
  applyShieldOverrideToBoard(state);
  return state;
}

function createStateObject(board, currentPlayer, options = {}) {
  const variantId = normalizeVariantId(
    options.variantId ?? DEFAULT_ENGINE_VARIANT_ID,
  );
  return {
    board,
    variantId,
    boardMetadata: boardMetadataForVariant(variantId),
    ruleOverrides: normalizeRuleOverrides(variantId, options.ruleOverrides),
    foolMemory: cloneFoolMemory(options.foolMemory),
    currentPlayer,
    turn: { standardMoveMade: false, specialMoveMade: false },
    moveNumber: 1,
    enPassant: null,
    gameOver: null,
    lastAction: null,
    actionHistory: [],
    capturedPieces: [],
  };
}

export function createEmptyState(currentPlayer = COLORS.WHITE, options = {}) {
  return createStateObject(createBoard(), currentPlayer, {
    variantId: options.variantId,
    ruleOverrides: options.ruleOverrides ?? options.overrides,
  });
}

function boardMetadataForVariant(variantId) {
  const variant = getVariant(variantId);
  return {
    size: BOARD_SIZE,
    files: FILES,
    variantName: variant.name,
  };
}

export function ruleOverridesForState(state) {
  return normalizeRuleOverrides(state?.variantId, state?.ruleOverrides);
}

export function shieldsEnabledForState(state) {
  return ruleOverridesForState(state).shieldsEnabled;
}

export function frameEnabledForState(state) {
  return ruleOverridesForState(state).frameEnabled;
}

export function wraparoundEnabledForState(state) {
  return ruleOverridesForState(state).wraparoundEnabled;
}

export function checkmateEnabledForState(state) {
  return ruleOverridesForState(state).checkmateEnabled;
}

export function applyShieldOverrideToBoard(
  state,
  { restoreEligible = false } = {},
) {
  const shieldsEnabled = shieldsEnabledForState(state);
  for (const piece of allPieces(state)) {
    if (!canHaveShield(piece.type)) {
      piece.hasShield = false;
      piece.intimidationSuppressedShield = false;
      piece.frameSuppressedShield = false;
      continue;
    }

    if (!shieldsEnabled) {
      piece.hasShield = false;
      piece.intimidationSuppressedShield = false;
      piece.frameSuppressedShield = false;
      continue;
    }

    if (restoreEligible) {
      piece.hasShield = !piece.isIntimidated;
      piece.intimidationSuppressedShield = piece.isIntimidated;
      piece.frameSuppressedShield = false;
    }
  }
  normalizeFrameShields(state);
}

export function normalizeFrameShields(state) {
  const shieldsEnabled = shieldsEnabledForState(state);
  const frameEnabled = frameEnabledForState(state);
  for (const piece of allPieces(state)) {
    syncFrameShieldForSquareWithFlags(
      piece,
      { r: piece.row, c: piece.col },
      { shieldsEnabled, frameEnabled },
    );
  }
}

export function syncFrameShieldForSquare(state, piece, square) {
  syncFrameShieldForSquareWithFlags(piece, square, {
    shieldsEnabled: shieldsEnabledForState(state),
    frameEnabled: frameEnabledForState(state),
  });
}

function syncFrameShieldForSquareWithFlags(
  piece,
  square,
  { shieldsEnabled, frameEnabled },
) {
  if (!piece) return;
  if (!canHaveShield(piece.type) || !shieldsEnabled) {
    piece.hasShield = false;
    piece.frameSuppressedShield = false;
    if (!canHaveShield(piece.type)) piece.intimidationSuppressedShield = false;
    return;
  }

  if (!frameEnabled) {
    restoreFrameSuppressedShield(piece);
    return;
  }

  if (isFrameSquare(square.r, square.c)) {
    if (piece.hasShield) {
      piece.frameSuppressedShield = true;
      piece.hasShield = false;
    }
    return;
  }

  restoreFrameSuppressedShield(piece);
}

function restoreFrameSuppressedShield(piece) {
  if (!piece.frameSuppressedShield) return;
  if (piece.isIntimidated) {
    piece.intimidationSuppressedShield = true;
  } else {
    piece.hasShield = true;
  }
  piece.frameSuppressedShield = false;
}

export function isLightSquareByPattern(
  row,
  col,
  checkPattern = CHECK_PATTERNS.STANDARD,
) {
  const standardLight = (row + col) % 2 !== 0;
  return checkPattern === CHECK_PATTERNS.INVERTED
    ? !standardLight
    : standardLight;
}

export function isLightSquareForState(state, row, col) {
  return isLightSquareByPattern(
    row,
    col,
    ruleOverridesForState(state).checkPattern,
  );
}

export function isDarkSquareForState(state, row, col) {
  return !isLightSquareForState(state, row, col);
}

const FEN_TO_PIECE = Object.freeze({
  p: PIECE_TYPES.PAWN,
  r: PIECE_TYPES.ROOK,
  n: PIECE_TYPES.KNIGHT,
  b: PIECE_TYPES.BISHOP,
  q: PIECE_TYPES.QUEEN,
  k: PIECE_TYPES.KING,
  f: PIECE_TYPES.FOOL,
  t: PIECE_TYPES.TOAD,
  l: PIECE_TYPES.LIFE,
  d: PIECE_TYPES.DEATH,
});

const PIECE_TO_FEN = Object.freeze(
  Object.fromEntries(
    Object.entries(FEN_TO_PIECE).map(([code, type]) => [type, code]),
  ),
);

export function stateToFen(state) {
  const ranks = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let rank = "";
    let empty = 0;
    const flushEmpty = () => {
      if (empty === 0) return;
      while (empty > 9) {
        rank += "9";
        empty -= 9;
      }
      rank += String(empty);
      empty = 0;
    };
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = state.board[r][c];
      if (!piece) {
        empty += 1;
        continue;
      }
      flushEmpty();
      const code = PIECE_TO_FEN[piece.type] ?? "?";
      rank += piece.color === COLORS.WHITE ? code.toUpperCase() : code;
    }
    flushEmpty();
    ranks.push(rank);
  }
  const activeColor = state.currentPlayer === COLORS.BLACK ? "b" : "w";
  return `${ranks.join("/")} ${activeColor} - - 0 ${state.moveNumber ?? 1}`;
}

export function createStateFromFen(fen, options = {}) {
  const parts = String(fen ?? "")
    .trim()
    .split(/\s+/);
  const ranks = parts[0]?.split("/") ?? [];
  if (ranks.length !== BOARD_SIZE)
    throw new Error(`FEN must contain ${BOARD_SIZE} ranks`);

  const variantId = normalizeVariantId(
    options.variantId ?? DEFAULT_ENGINE_VARIANT_ID,
  );
  const referencePieceIds = pieceIdsByFenSquare(options.referenceState);
  const setupPieceIds = pieceIdsByVariantSetup(variantId);
  const usedPieceIds = new Set();
  const board = createBoard();
  for (let row = 0; row < BOARD_SIZE; row++) {
    let col = 0;
    for (let index = 0; index < ranks[row].length; index++) {
      const char = ranks[row][index];
      if (/\d/.test(char)) {
        if (char === "1" && ranks[row][index + 1] === "0") {
          col += 10;
          index += 1;
        } else if (char !== "0") {
          col += Number(char);
        } else {
          throw new Error("FEN empty-square count cannot be zero");
        }
        continue;
      }

      const type = FEN_TO_PIECE[char.toLowerCase()];
      if (!type) throw new Error(`Unsupported FEN piece "${char}"`);
      if (!isValidSquare(row, col)) throw new Error("FEN rank is too wide");
      const color = char === char.toUpperCase() ? COLORS.WHITE : COLORS.BLACK;
      const key = fenPieceKey(row, col, type, color);
      const fallbackId = `fen-${color}-${type.toLowerCase()}-${row}-${col}`;
      placePiece(
        board,
        createPiece(type, color, row, col, {
          id: claimFenPieceId(
            referencePieceIds.get(key) ??
              setupPieceIds.get(key) ??
              fallbackId,
            fallbackId,
            usedPieceIds,
          ),
        }),
      );
      col += 1;
    }
    if (col !== BOARD_SIZE)
      throw new Error(`FEN rank ${row + 1} contains ${col} files`);
  }

  const currentPlayer = parts[1] === "b" ? COLORS.BLACK : COLORS.WHITE;
  const moveNumber = Math.max(1, Number.parseInt(parts[5] ?? "1", 10) || 1);
  const state = createStateObject(board, currentPlayer, {
    variantId,
    ruleOverrides: options.ruleOverrides ?? options.overrides,
  });
  state.moveNumber = moveNumber;
  applyShieldOverrideToBoard(state);
  return state;
}

function pieceIdsByFenSquare(state) {
  const ids = new Map();
  if (!state?.board) return ids;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = state.board[row]?.[col];
      if (!piece) continue;
      ids.set(fenPieceKey(row, col, piece.type, piece.color), piece.id);
    }
  }
  return ids;
}

function pieceIdsByVariantSetup(variantId) {
  const ids = new Map();
  for (const [row, col, type, color, id] of getVariant(variantId).setup) {
    ids.set(fenPieceKey(row, col, type, color), id);
  }
  return ids;
}

function fenPieceKey(row, col, type, color) {
  return `${row},${col},${type},${color}`;
}

function claimFenPieceId(preferredId, fallbackId, usedPieceIds) {
  if (!usedPieceIds.has(preferredId)) {
    usedPieceIds.add(preferredId);
    return preferredId;
  }

  let index = 2;
  let id = `${fallbackId}-${index}`;
  while (usedPieceIds.has(id)) {
    index += 1;
    id = `${fallbackId}-${index}`;
  }
  usedPieceIds.add(id);
  return id;
}
