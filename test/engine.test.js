import { expect, test } from "bun:test";
import {
  COLORS,
  FILES,
  PAWN_BEHAVIORS,
  PIECE_TYPES,
  VARIANT_IDS,
  applyShieldOverrideToBoard,
  applyAction,
  canSkipSpecialMove,
  chooseAiAction,
  createEmptyState,
  createGameState,
  createPiece,
  createStateFromFen,
  evaluateState,
  getActionsForPiece,
  getVariant,
  generateLegalActions,
  isLightSquareForState,
  isCheckmate,
  isKingInCheck,
  normalizeTurn,
  ownerOf,
  placePiece,
  stateToFen,
  skipSpecialMove,
  updateIntimidation,
} from "../src/engine/index.js";

function actionMatching(state, predicate) {
  const action = generateLegalActions(state).find(predicate);
  expect(action).toBeTruthy();
  return action;
}

const LEVEL_5_AI_OPTIONS = {
  maxDepth: 8,
  maxActions: 54,
  maxTacticalActions: 26,
  quiescenceDepth: 4,
  tacticalWeight: 2.75,
  priorityOverflowLimit: 36,
  forcedRootTactics: 10,
  depthStartMargin: 1.25,
  timeLimitMs: 3000,
  hardTimeLimitMs: 4600,
};

test("initial setup follows the RULES board and shield rules", () => {
  const state = createGameState();
  expect(state.board).toHaveLength(10);
  expect(state.board[0][0].type).toBe(PIECE_TYPES.DEATH);
  expect(state.board[0][9].type).toBe(PIECE_TYPES.LIFE);
  expect(state.board[9][0].type).toBe(PIECE_TYPES.LIFE);
  expect(state.board[9][9].type).toBe(PIECE_TYPES.DEATH);
  expect(
    state.board[8].filter((piece) => piece?.type === PIECE_TYPES.PAWN),
  ).toHaveLength(10);
  expect(state.board[8][4].hasShield).toBe(true);
  expect(state.board[9][5].hasShield).toBe(false);
  expect(ownerOf(state.board[9][0])).toBe(COLORS.WHITE);
  expect(ownerOf(state.board[0][9])).toBe(COLORS.BLACK);
});

test("official file coordinates skip the letter i", () => {
  expect(FILES).toBe("abcdefghjk");
});

test("Chess Two keeps the stable variant id", () => {
  const variant = getVariant(VARIANT_IDS.CHESS_TWO);

  expect(variant.id).toBe("chess-two");
  expect(variant.name).toBe("Chess Two");
});

test("Toad-Fool setup uses swapped corners, d-file Toads, and g-file Fools", () => {
  const state = createGameState({ variantId: VARIANT_IDS.TOAD_FOOL });

  expect(state.variantId).toBe(VARIANT_IDS.TOAD_FOOL);
  expect(state.ruleOverrides).toEqual({
    checkPattern: "inverted",
    pawnBehavior: "frontalFan",
    pawnInitialMaxStep: 2,
    knightMovement: "orthodox",
    shieldsEnabled: true,
    frameEnabled: false,
    wraparoundEnabled: false,
    checkmateEnabled: true,
  });
  expect(state.board[0][0].type).toBe(PIECE_TYPES.LIFE);
  expect(state.board[0][9].type).toBe(PIECE_TYPES.DEATH);
  expect(state.board[9][0].type).toBe(PIECE_TYPES.DEATH);
  expect(state.board[9][9].type).toBe(PIECE_TYPES.LIFE);
  expect(isLightSquareForState(state, 0, 0)).toBe(true);
  expect(isLightSquareForState(state, 9, 9)).toBe(true);
  expect(state.board[1][3].type).toBe(PIECE_TYPES.TOAD);
  expect(state.board[1][6].type).toBe(PIECE_TYPES.FOOL);
  expect(state.board[8][3].type).toBe(PIECE_TYPES.TOAD);
  expect(state.board[8][6].type).toBe(PIECE_TYPES.FOOL);
  for (const color of [COLORS.WHITE, COLORS.BLACK]) {
    const pieces = state.board.flat().filter((piece) => piece?.color === color);
    expect(
      pieces.filter((piece) => piece.type === PIECE_TYPES.BISHOP),
    ).toHaveLength(1);
    expect(
      pieces.filter((piece) => piece.type === PIECE_TYPES.KNIGHT),
    ).toHaveLength(1);
  }
  expect(
    state.board[2].filter((piece) => piece?.type === PIECE_TYPES.PAWN),
  ).toHaveLength(10);
  expect(
    state.board[7].filter((piece) => piece?.type === PIECE_TYPES.PAWN),
  ).toHaveLength(10);
  expect(stateToFen(state).split(" ")[0]).toBe(
    "l8d/1rbtqkfnr1/pppppppppp/91/91/91/91/PPPPPPPPPP/1RNTQKFBR1/D8L",
  );
});

test("Frame Chess uses the widened frame setup with frame defaults and removed edge pawns", () => {
  const state = createGameState({ variantId: VARIANT_IDS.FRAME_CHESS });

  expect(state.variantId).toBe(VARIANT_IDS.FRAME_CHESS);
  expect(state.ruleOverrides).toEqual({
    checkPattern: "standard",
    pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN,
    pawnInitialMaxStep: 2,
    knightMovement: "orthodox",
    shieldsEnabled: true,
    frameEnabled: true,
    wraparoundEnabled: true,
    checkmateEnabled: true,
  });
  expect(state.board[2][0]).toBeNull();
  expect(state.board[2][9]).toBeNull();
  expect(state.board[7][0]).toBeNull();
  expect(state.board[7][9]).toBeNull();
  expect(
    state.board[2].filter((piece) => piece?.type === PIECE_TYPES.PAWN),
  ).toHaveLength(8);
  expect(
    state.board[7].filter((piece) => piece?.type === PIECE_TYPES.PAWN),
  ).toHaveLength(8);
  expect(state.board[0][0].type).toBe(PIECE_TYPES.DEATH);
  expect(state.board[0][9].type).toBe(PIECE_TYPES.LIFE);
  expect(state.board[9][0].type).toBe(PIECE_TYPES.LIFE);
  expect(state.board[9][9].type).toBe(PIECE_TYPES.DEATH);
  expect(isLightSquareForState(state, 0, 0)).toBe(false);
  expect(isLightSquareForState(state, 0, 9)).toBe(true);
  expect(isLightSquareForState(state, 9, 0)).toBe(true);
  expect(isLightSquareForState(state, 9, 9)).toBe(false);
  expect(state.board[1][3].id).toBe("frame-black-bishop-3");
  expect(state.board[1][6].id).toBe("frame-black-knight-6");
  expect(state.board[8][3].id).toBe("frame-white-knight-3");
  expect(state.board[8][6].id).toBe("frame-white-bishop-6");
  expect(stateToFen(state).split(" ")[0]).toBe(
    "d3qk3l/2rbtfnr2/1pppppppp1/91/91/91/91/1PPPPPPPP1/2RNTFBR2/L3QK3D",
  );
});

test("Frame Chess w/o LD uses the old Frame layout without Life or Death", () => {
  const state = createGameState({
    variantId: VARIANT_IDS.FRAME_CHESS_WITHOUT_LD,
  });

  expect(state.variantId).toBe(VARIANT_IDS.FRAME_CHESS_WITHOUT_LD);
  expect(state.ruleOverrides).toEqual({
    checkPattern: "inverted",
    pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN,
    pawnInitialMaxStep: 2,
    knightMovement: "orthodox",
    shieldsEnabled: true,
    frameEnabled: true,
    wraparoundEnabled: true,
    checkmateEnabled: true,
  });
  expect(
    state.board
      .flat()
      .some(
        (piece) =>
          piece?.type === PIECE_TYPES.LIFE || piece?.type === PIECE_TYPES.DEATH,
      ),
  ).toBe(false);
  expect(stateToFen(state).split(" ")[0]).toBe(
    "91/1rbtqkfnr1/1pppppppp1/91/91/91/91/1PPPPPPPP1/1RNTQKFBR1/91",
  );
});

test("legacy forwardFan override normalizes to Frontal Fan", () => {
  const state = createGameState({
    variantId: VARIANT_IDS.TOAD_FOOL,
    overrides: { pawnBehavior: "forwardFan" },
  });

  expect(state.ruleOverrides.pawnBehavior).toBe("frontalFan");
});

test("Toad-Fool Classic setup uses normalized 10x10 FEN and standard checks", () => {
  const state = createGameState({ variantId: VARIANT_IDS.TOAD_FOOL_CLASSIC });

  expect(state.variantId).toBe(VARIANT_IDS.TOAD_FOOL_CLASSIC);
  expect(state.ruleOverrides).toEqual({
    checkPattern: "standard",
    pawnBehavior: "frontalFan",
    pawnInitialMaxStep: 2,
    knightMovement: "orthodox",
    shieldsEnabled: true,
    frameEnabled: false,
    wraparoundEnabled: false,
    checkmateEnabled: true,
  });
  expect(isLightSquareForState(state, 0, 0)).toBe(false);
  expect(isLightSquareForState(state, 0, 9)).toBe(true);
  expect(isLightSquareForState(state, 9, 0)).toBe(true);
  expect(isLightSquareForState(state, 9, 9)).toBe(false);
  expect(state.board[0].map((piece) => piece?.type)).toEqual([
    PIECE_TYPES.DEATH,
    PIECE_TYPES.ROOK,
    PIECE_TYPES.BISHOP,
    PIECE_TYPES.TOAD,
    PIECE_TYPES.QUEEN,
    PIECE_TYPES.KING,
    PIECE_TYPES.FOOL,
    PIECE_TYPES.KNIGHT,
    PIECE_TYPES.ROOK,
    PIECE_TYPES.LIFE,
  ]);
  expect(state.board[9].map((piece) => piece?.type)).toEqual([
    PIECE_TYPES.LIFE,
    PIECE_TYPES.ROOK,
    PIECE_TYPES.KNIGHT,
    PIECE_TYPES.TOAD,
    PIECE_TYPES.QUEEN,
    PIECE_TYPES.KING,
    PIECE_TYPES.FOOL,
    PIECE_TYPES.BISHOP,
    PIECE_TYPES.ROOK,
    PIECE_TYPES.DEATH,
  ]);
  expect(stateToFen(state).split(" ")[0]).toBe(
    "drbtqkfnrl/pppppppppp/91/91/91/91/91/91/PPPPPPPPPP/LRNTQKFBRD",
  );
});

test("Toad-Fool FEN import accepts the corrected g-file Fool setup", () => {
  const state = createStateFromFen(
    "91/1rbtqkfnr1/pppppppppp/91/91/91/91/PPPPPPPPPP/1RNTQKFBR1/91 w - - 0 1",
    { variantId: VARIANT_IDS.TOAD_FOOL },
  );

  expect(state.board[1][3].type).toBe(PIECE_TYPES.TOAD);
  expect(state.board[1][6].type).toBe(PIECE_TYPES.FOOL);
  expect(state.board[8][3].type).toBe(PIECE_TYPES.TOAD);
  expect(state.board[8][6].type).toBe(PIECE_TYPES.FOOL);
  expect(stateToFen(state).split(" ")[0]).toBe(
    "91/1rbtqkfnr1/pppppppppp/91/91/91/91/PPPPPPPPPP/1RNTQKFBR1/91",
  );
});

test("FEN import preserves stable setup ids for piece orientation", () => {
  const chessTwo = createGameState({ variantId: VARIANT_IDS.CHESS_TWO });
  const importedChessTwo = createStateFromFen(stateToFen(chessTwo), {
    variantId: VARIANT_IDS.CHESS_TWO,
  });
  expect(importedChessTwo.board[0][2].id).toBe("black-knight-2");
  expect(importedChessTwo.board[0][3].id).toBe("black-bishop-3");
  expect(importedChessTwo.board[9][2].id).toBe("white-knight-2");
  expect(importedChessTwo.board[9][3].id).toBe("white-bishop-3");

  const classic = createGameState({
    variantId: VARIANT_IDS.TOAD_FOOL_CLASSIC,
  });
  const importedClassic = createStateFromFen(stateToFen(classic), {
    variantId: VARIANT_IDS.TOAD_FOOL_CLASSIC,
  });
  expect(importedClassic.board[9][2].id).toBe("classic-white-knight-2");
});

test("FEN import can preserve current ids for moved pieces", () => {
  const state = createGameState({ variantId: VARIANT_IDS.CHESS_TWO });
  const knight = state.board[9][2];
  state.board[9][2] = null;
  knight.row = 5;
  knight.col = 5;
  state.board[5][5] = knight;

  const imported = createStateFromFen(stateToFen(state), {
    variantId: VARIANT_IDS.CHESS_TWO,
    referenceState: state,
  });

  expect(imported.board[5][5].id).toBe("white-knight-2");

  const sparseReference = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.CHESS_TWO,
  });
  placePiece(
    sparseReference.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, {
      id: "white-knight-2",
    }),
  );
  const duplicateSetupImport = createStateFromFen(
    "91/91/91/91/91/5N4/91/91/91/2N7 w - - 0 1",
    {
      variantId: VARIANT_IDS.CHESS_TWO,
      referenceState: sparseReference,
    },
  );
  const ids = duplicateSetupImport.board
    .flat()
    .flatMap((piece) => (piece ? [piece.id] : []));
  expect(duplicateSetupImport.board[5][5].id).toBe("white-knight-2");
  expect(duplicateSetupImport.board[9][2].id).not.toBe("white-knight-2");
  expect(new Set(ids).size).toBe(ids.length);
});

test("Toad steps, ramp moves, and King-style attacks are separate in Toad-Fool", () => {
  const state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 5, 5, { id: "toad" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 6, { id: "ramp" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 4, { id: "target" }),
  );

  const actions = generateLegalActions(state);
  expect(
    actions.some(
      (action) =>
        action.mode === "toadRamp" && action.to.r === 5 && action.to.c === 7,
    ),
  ).toBe(true);
  expect(
    actions.some(
      (action) =>
        action.mode === "toadStep" && action.to.r === 4 && action.to.c === 5,
    ),
  ).toBe(true);
  expect(
    actions.some(
      (action) => action.mode === "toadAttack" && action.targetId === "target",
    ),
  ).toBe(true);
  expect(actions.some((action) => action.mode === "kingStep")).toBe(false);
});

test("Toad-Fool Knights move orthogonally by chess L-shapes but keep staged L-attacks", () => {
  const state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 4, { id: "target" }),
  );

  const actions = generateLegalActions(state);
  expect(actions.some((action) => action.mode === "knightRamp")).toBe(false);
  expect(
    actions.some(
      (action) =>
        action.mode === "knightMove" && action.to.r === 3 && action.to.c === 6,
    ),
  ).toBe(true);
  expect(
    actions.some(
      (action) =>
        action.mode === "knightAttack" && action.targetId === "target",
    ),
  ).toBe(true);
});

test("orthodox Knight L-moves apply Life and Death pass-through effects", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 2, {
      id: "life-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 4, 2, { id: "life" }),
  );

  let knightMove = actionMatching(
    state,
    (action) =>
      action.mode === "knightMove" &&
      action.to.r === 3 &&
      action.to.c === 3,
  );
  expect(knightMove.path.map((square) => `${square.r},${square.c}`)).toEqual([
    "4,2",
    "4,3",
  ]);
  state = applyAction(state, knightMove);

  expect(state.board[3][3]?.id).toBe("life-knight");
  expect(state.board[3][3].hasShield).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 2, {
      id: "death-shielded-knight",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 3, { id: "death" }),
  );

  knightMove = actionMatching(
    state,
    (action) =>
      action.mode === "knightMove" &&
      action.to.r === 3 &&
      action.to.c === 3,
  );
  expect(knightMove.path.map((square) => `${square.r},${square.c}`)).toEqual([
    "4,2",
    "4,3",
  ]);
  state = applyAction(state, knightMove);

  expect(state.board[3][3]?.id).toBe("death-shielded-knight");
  expect(state.board[3][3].hasShield).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 2, {
      id: "death-bare-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 3, { id: "death" }),
  );

  knightMove = actionMatching(
    state,
    (action) =>
      action.mode === "knightMove" &&
      action.to.r === 3 &&
      action.to.c === 3,
  );
  state = applyAction(state, knightMove);

  expect(state.board[4][3]?.id).toBe("death");
  expect(
    state.board.flat().some((piece) => piece?.id === "death-bare-knight"),
  ).toBe(false);
});

test("Toad ramp hops strip shields from jumped enemy pieces", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 5, 5, { id: "toad" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 6, { id: "enemy-ramp" }),
  );

  const hop = actionMatching(
    state,
    (action) =>
      action.mode === "toadRamp" &&
      action.to.r === 5 &&
      action.to.c === 7 &&
      action.shieldStrips?.[0]?.pieceId === "enemy-ramp",
  );
  state = applyAction(state, hop);

  expect(state.board[5][7]?.id).toBe("toad");
  expect(state.board[5][6]?.id).toBe("enemy-ramp");
  expect(state.board[5][6].hasShield).toBe(false);
});

test("Knight, Toad step, and ramp moves can self-destruct on Death", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 3, 6, { id: "death" }),
  );

  const knightDeath = actionMatching(
    state,
    (action) =>
      action.mode === "knightMove" &&
      action.deathLanding &&
      action.to.r === 3 &&
      action.to.c === 6,
  );
  state = applyAction(state, knightDeath);
  expect(state.board[3][6]?.id).toBe("death");
  expect(state.board.flat().some((piece) => piece?.id === "knight")).toBe(
    false,
  );

  state = createEmptyState(COLORS.WHITE, { variantId: VARIANT_IDS.TOAD_FOOL });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 5, 5, { id: "toad-step" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "step-death" }),
  );
  const toadStepDeath = actionMatching(
    state,
    (action) => action.mode === "toadStep" && action.deathLanding,
  );
  state = applyAction(state, toadStepDeath);
  expect(state.board[4][4]?.id).toBe("step-death");
  expect(state.board.flat().some((piece) => piece?.id === "toad-step")).toBe(
    false,
  );

  state = createEmptyState(COLORS.WHITE, { variantId: VARIANT_IDS.TOAD_FOOL });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 5, 5, { id: "toad-ramp" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 6, { id: "ramp" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 5, 7, { id: "ramp-death" }),
  );
  const toadRampDeath = actionMatching(
    state,
    (action) => action.mode === "toadRamp" && action.deathLanding,
  );
  state = applyAction(state, toadRampDeath);
  expect(state.board[5][7]?.id).toBe("ramp-death");
  expect(state.board.flat().some((piece) => piece?.id === "toad-ramp")).toBe(
    false,
  );
});

test("Fools copy the last enemy standard profile without copying shield state", () => {
  const state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  const fool = placePiece(
    state.board,
    createPiece(PIECE_TYPES.FOOL, COLORS.WHITE, 5, 5, {
      id: "white-fool",
      hasShield: true,
    }),
  );
  state.foolMemory[COLORS.BLACK] = { type: PIECE_TYPES.PAWN };

  const actions = getActionsForPiece(state, fool.id);
  expect(
    actions.some(
      (action) =>
        action.pieceType === PIECE_TYPES.FOOL &&
        action.profileType === PIECE_TYPES.PAWN &&
        action.mode === "pawnAdvance" &&
        action.to.r === 4,
    ),
  ).toBe(true);
  expect(fool.hasShield).toBe(true);
});

test("Fools copy the profile imitated by an enemy Fool, including Toad", () => {
  let state = createEmptyState(COLORS.BLACK, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.FOOL, COLORS.BLACK, 5, 5, { id: "black-fool" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.FOOL, COLORS.WHITE, 2, 2, { id: "white-fool" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 6, { id: "black-ramp" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 2, 3, { id: "white-ramp" }),
  );
  state.foolMemory[COLORS.WHITE] = { type: PIECE_TYPES.TOAD };

  const blackFoolMove = actionMatching(
    state,
    (action) => action.pieceId === "black-fool" && action.mode === "toadRamp",
  );
  state = applyAction(state, blackFoolMove);
  expect(state.foolMemory[COLORS.BLACK]).toEqual({ type: PIECE_TYPES.TOAD });

  state.currentPlayer = COLORS.WHITE;
  state.turn = { standardMoveMade: false, specialMoveMade: false };
  const whiteFoolActions = getActionsForPiece(state, "white-fool");
  expect(
    whiteFoolActions.some(
      (action) =>
        action.mode === "toadRamp" && action.profileType === PIECE_TYPES.TOAD,
    ),
  ).toBe(true);
});

test("Frontal Fan pawns use orthodox attacks while Frontal Fan 2 preserves lane recoil", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 6, 5, { id: "target" }),
  );

  const shieldBreak = actionMatching(
    state,
    (action) => action.mode === "pawnAttack" && action.targetId === "target",
  );
  state = applyAction(state, shieldBreak);
  expect(state.board[6][5]?.id).toBe("target");
  expect(state.board[6][5].hasShield).toBe(false);
  expect(state.board[7][4]?.id).toBe("white-pawn");
  expect(state.board[7][4].hasShield).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
    overrides: { pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN_2 },
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 5, { id: "target" }),
  );

  const legacyShieldBreak = actionMatching(
    state,
    (action) => action.mode === "pawnAttack" && action.targetId === "target",
  );
  state = applyAction(state, legacyShieldBreak);
  expect(state.board[5][5]?.id).toBe("target");
  expect(state.board[5][5].hasShield).toBe(false);
  expect(state.board[6][5]?.id).toBe("white-pawn");
  expect(state.board[6][5].hasShield).toBe(false);
});

test("Frontal Fan movement is compact and rank-smart", () => {
  const toadFool = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    toadFool.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 4, { id: "toad-pawn" }),
  );
  const compactMoves = generateLegalActions(toadFool)
    .filter(
      (action) =>
        action.pieceId === "toad-pawn" && action.mode === "pawnAdvance",
    )
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();

  expect(compactMoves).toEqual(["5,3", "5,4", "5,5", "6,3", "6,4", "6,5"]);

  const classicRange = createGameState({
    variantId: VARIANT_IDS.CHESS_TWO,
    overrides: { pawnBehavior: "frontalFan" },
  });
  const firstMoveSquares = generateLegalActions(classicRange)
    .filter(
      (action) =>
        action.pieceId === "white-pawn-4" && action.mode === "pawnAdvance",
    )
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();

  expect(firstMoveSquares).toEqual([
    "5,3",
    "5,4",
    "5,5",
    "6,3",
    "6,4",
    "6,5",
    "7,3",
    "7,4",
    "7,5",
  ]);
});

test("Frontal Fan pawns cannot make first diagonal leaps over a standard forward blocker", () => {
  const state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 4, { id: "pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 6, 4, {
      id: "forward-blocker",
    }),
  );

  const moves = generateLegalActions(state)
    .filter((action) => action.pieceId === "pawn" && action.kind === "move")
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();

  expect(moves).toEqual(["6,3", "6,5"]);
});

test("Frontal Fan pawns do not use the Chess Two Life/Death pawn jump", () => {
  const state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 4, { id: "toad-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 6, 4, { id: "life-blocker" }),
  );

  const actions = generateLegalActions(state).filter(
    (action) => action.pieceId === "toad-pawn",
  );
  expect(actions.some((action) => action.mode === "pawnLifeDeathJump")).toBe(
    false,
  );
  expect(
    actions.some(
      (action) =>
        action.mode === "pawnAdvance" && action.to.r === 5 && action.to.c === 4,
    ),
  ).toBe(false);
});

test("pawn initial max override applies to Chess Two and Frontal Fan pawns", () => {
  const chessTwoMaxTwo = createGameState({
    overrides: { pawnInitialMaxStep: 2 },
  });
  const chessTwoMoves = generateLegalActions(chessTwoMaxTwo)
    .filter(
      (action) =>
        action.pieceId === "white-pawn-4" && action.mode === "pawnAdvance",
    )
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();
  expect(chessTwoMoves).toEqual(["6,4", "7,4"]);

  const frontalFanMaxThree = createGameState({
    variantId: VARIANT_IDS.TOAD_FOOL_CLASSIC,
    overrides: { pawnInitialMaxStep: 3 },
  });
  const fanMoves = generateLegalActions(frontalFanMaxThree)
    .filter(
      (action) =>
        action.pieceId === "classic-white-pawn-4" &&
        action.mode === "pawnAdvance",
    )
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();
  expect(fanMoves).toEqual([
    "5,3",
    "5,4",
    "5,5",
    "6,3",
    "6,4",
    "6,5",
    "7,3",
    "7,4",
    "7,5",
  ]);

  const classicDefault = createGameState({
    variantId: VARIANT_IDS.TOAD_FOOL_CLASSIC,
  });
  const classicMoves = generateLegalActions(classicDefault)
    .filter(
      (action) =>
        action.pieceId === "classic-white-pawn-4" &&
        action.mode === "pawnAdvance",
    )
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();
  expect(classicMoves).toEqual(["6,3", "6,4", "6,5", "7,3", "7,4", "7,5"]);
});

test("shieldless override blocks default shields, Life repair, and Life pass-through", () => {
  const initial = createGameState({ overrides: { shieldsEnabled: false } });
  expect(initial.board.flat().filter((piece) => piece?.hasShield)).toHaveLength(
    0,
  );

  let healState = createEmptyState(COLORS.WHITE);
  placePiece(
    healState.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "life" }),
  );
  placePiece(
    healState.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 5, {
      id: "pawn",
      hasShield: false,
    }),
  );
  const staleHeal = actionMatching(
    healState,
    (action) => action.mode === "heal" && action.targetId === "pawn",
  );
  healState.ruleOverrides = {
    ...healState.ruleOverrides,
    shieldsEnabled: false,
  };
  expect(
    generateLegalActions(healState).some(
      (action) => action.mode === "heal" && action.targetId === "pawn",
    ),
  ).toBe(false);
  healState = applyAction(healState, staleHeal);
  expect(healState.board[4][5].hasShield).toBe(false);

  let passState = createEmptyState(COLORS.WHITE, {
    overrides: { shieldsEnabled: false },
  });
  placePiece(
    passState.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 4, {
      id: "runner",
      hasShield: false,
    }),
  );
  placePiece(
    passState.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "pass-life" }),
  );
  const passThrough = actionMatching(
    passState,
    (action) =>
      action.pieceId === "runner" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 4 &&
      action.to.c === 4,
  );
  passState = applyAction(passState, passThrough);
  expect(passState.board[4][4].hasShield).toBe(false);
});

test("restoring shields leaves active intimidated checkers unshielded", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  const checker = placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 5, { id: "checker" }),
  );
  updateIntimidation(state);
  expect(checker.isIntimidated).toBe(true);
  expect(checker.hasShield).toBe(false);

  state.ruleOverrides = { ...state.ruleOverrides, shieldsEnabled: false };
  applyShieldOverrideToBoard(state);
  state.ruleOverrides = { ...state.ruleOverrides, shieldsEnabled: true };
  applyShieldOverrideToBoard(state, { restoreEligible: true });

  expect(checker.hasShield).toBe(false);
  expect(checker.intimidationSuppressedShield).toBe(true);
});

test("Frame Chess suppresses edge shields, restores them inside, and stores frame heals latently", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 4, { id: "rook" }),
  );
  applyShieldOverrideToBoard(state);

  expect(state.board[0][4].hasShield).toBe(false);
  expect(state.board[0][4].frameSuppressedShield).toBe(true);

  const leaveFrame = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.mode === "slide" &&
      action.to.r === 1 &&
      action.to.c === 4,
  );
  state = applyAction(state, leaveFrame);
  expect(state.board[1][4].hasShield).toBe(true);
  expect(state.board[1][4].frameSuppressedShield).toBe(false);

  state = createEmptyState(COLORS.BLACK, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 1, 2, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 3, {
      id: "frame-pawn",
      hasShield: false,
    }),
  );

  const heal = actionMatching(
    state,
    (action) => action.mode === "heal" && action.targetId === "frame-pawn",
  );
  expect(heal.target.frameSuppressedShield).toBe(true);
  state = applyAction(state, heal);
  expect(state.board[0][3].hasShield).toBe(false);
  expect(state.board[0][3].frameSuppressedShield).toBe(true);
  expect(state.board[0][3].isImmune).toBe(true);

  state.ruleOverrides = { ...state.ruleOverrides, shieldsEnabled: false };
  applyShieldOverrideToBoard(state);
  expect(state.board[0][3].hasShield).toBe(false);
  expect(state.board[0][3].frameSuppressedShield).toBe(false);
});

test("Frame Chess blocks non-King frame attacks while preserving King and Life/Death exceptions", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 4, { id: "edge-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 6, {
      id: "edge-target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "edge-rook" && action.targetId === "edge-target",
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 2, 4, { id: "inside-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 4, {
      id: "frame-target",
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(state.board[0][4].hasShield).toBe(false);
  expect(state.board[0][4].frameSuppressedShield).toBe(true);

  const frameCapture = actionMatching(
    state,
    (action) =>
      action.pieceId === "inside-rook" &&
      action.targetId === "frame-target",
  );
  state = applyAction(state, frameCapture);
  expect(
    state.board.flat().some((piece) => piece?.id === "frame-target"),
  ).toBe(false);
  expect(state.board[0][4]?.id).toBe("inside-rook");
  expect(state.board[0][4].frameSuppressedShield).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 2, 4, {
      id: "inside-knight",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 5, {
      id: "knight-frame-target",
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(state.board[0][5].hasShield).toBe(false);
  expect(state.board[0][5].frameSuppressedShield).toBe(true);

  const knightFrameCapture = actionMatching(
    state,
    (action) =>
      action.mode === "knightAttack" &&
      action.pieceId === "inside-knight" &&
      action.targetId === "knight-frame-target",
  );
  expect(knightFrameCapture.path).toEqual([
    { r: 1, c: 4 },
    { r: 1, c: 5 },
  ]);
  state = applyAction(state, knightFrameCapture);
  expect(
    state.board.flat().some((piece) => piece?.id === "knight-frame-target"),
  ).toBe(false);
  expect(state.board[0][5]?.id).toBe("inside-knight");

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 0, 4, { id: "king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 5, {
      id: "king-target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "kingAttack" && action.targetId === "king-target",
    ),
  ).toBe(true);

  state = createEmptyState(COLORS.BLACK, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 0, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 1, 5, {
      id: "death-target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) => action.mode === "kill" && action.targetId === "death-target",
    ),
  ).toBe(true);
});

test("Frame Chess allows non-King interior attacks to target the frame only as the target square", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 1, 4, { id: "toad" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 5, {
      id: "toad-frame-target",
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "toadAttack" &&
        action.pieceId === "toad" &&
        action.targetId === "toad-frame-target",
    ),
  ).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 1, 4, { id: "pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 5, {
      id: "pawn-frame-target",
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "pawnAttack" &&
        action.pieceId === "pawn" &&
        action.targetId === "pawn-frame-target",
    ),
  ).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  state.foolMemory[COLORS.BLACK] = { type: PIECE_TYPES.KNIGHT };
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.FOOL, COLORS.WHITE, 2, 4, { id: "fool" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 5, {
      id: "fool-frame-target",
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "knightAttack" &&
        action.pieceId === "fool" &&
        action.targetId === "fool-frame-target",
    ),
  ).toBe(true);
});

test("Frame Chess lets adjacent Knights attack frame targets through frame bend squares", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 1, 2, {
      id: "rank-adjacent-knight",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 0, {
      id: "rank-frame-target",
    }),
  );
  applyShieldOverrideToBoard(state);

  let attack = actionMatching(
    state,
    (action) =>
      action.mode === "knightAttack" &&
      action.pieceId === "rank-adjacent-knight" &&
      action.targetId === "rank-frame-target",
  );
  expect(attack.path).toEqual([
    { r: 1, c: 1 },
    { r: 0, c: 1 },
  ]);
  state = applyAction(state, attack);
  expect(
    state.board.flat().some((piece) => piece?.id === "rank-frame-target"),
  ).toBe(false);
  expect(state.board[0][0]?.id).toBe("rank-adjacent-knight");

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 4, 1, {
      id: "file-adjacent-knight",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 2, 0, {
      id: "file-frame-target",
    }),
  );
  applyShieldOverrideToBoard(state);

  attack = actionMatching(
    state,
    (action) =>
      action.mode === "knightAttack" &&
      action.pieceId === "file-adjacent-knight" &&
      action.targetId === "file-frame-target",
  );
  expect(attack.path).toEqual([
    { r: 3, c: 1 },
    { r: 3, c: 0 },
  ]);
  state = applyAction(state, attack);
  expect(
    state.board.flat().some((piece) => piece?.id === "file-frame-target"),
  ).toBe(false);
  expect(state.board[2][0]?.id).toBe("file-adjacent-knight");
});

test("Frame Chess wrap does not passively annihilate corner Life and Death pieces", () => {
  let state = createGameState({ variantId: VARIANT_IDS.FRAME_CHESS });
  const move = actionMatching(
    state,
    (action) =>
      action.pieceId === "frame-white-pawn-1" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 6 &&
      action.to.c === 1,
  );

  state = applyAction(state, move);

  expect(state.board[0][0]?.type).toBe(PIECE_TYPES.DEATH);
  expect(state.board[0][9]?.type).toBe(PIECE_TYPES.LIFE);
  expect(state.board[9][0]?.type).toBe(PIECE_TYPES.LIFE);
  expect(state.board[9][9]?.type).toBe(PIECE_TYPES.DEATH);
});

test("Wrap-around movement works for non-King standard, Toad/Fool, Pawn, and Life/Death profiles", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.mode === "slide" &&
      action.to.r === 4 &&
      action.to.c === 9 &&
      action.path.some((square) => square.r === 4 && square.c === 0),
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 4, 0, { id: "king" }),
  );
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "king" &&
        action.mode === "kingStep" &&
        action.to.r === 4 &&
        action.to.c === 9,
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 4, 0, { id: "knight" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "knight" &&
      action.mode === "knightMove" &&
      action.to.r === 3 &&
      action.to.c === 8,
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 4, 0, {
      id: "wrapped-life-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 4, 9, { id: "wrapped-life" }),
  );
  const wrappedKnightMove = actionMatching(
    state,
    (action) =>
      action.pieceId === "wrapped-life-knight" &&
      action.mode === "knightMove" &&
      action.to.r === 3 &&
      action.to.c === 8,
  );
  expect(
    wrappedKnightMove.path.map((square) => `${square.r},${square.c}`),
  ).toEqual(["4,9", "3,9"]);
  state = applyAction(state, wrappedKnightMove);
  expect(state.board[3][8]?.id).toBe("wrapped-life-knight");
  expect(state.board[3][8].hasShield).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 0, { id: "pawn" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "pawn" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 6 &&
      action.to.c === 9,
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 4, 0, { id: "toad" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "toad" &&
      action.mode === "toadStep" &&
      action.to.r === 4 &&
      action.to.c === 9,
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 4, 1, { id: "toad" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 0, { id: "ramp" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "toad" &&
      action.mode === "toadRamp" &&
      action.to.r === 4 &&
      action.to.c === 9 &&
      action.path.some((square) => square.r === 4 && square.c === 0),
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.FOOL, COLORS.WHITE, 4, 0, { id: "fool" }),
  );
  state.foolMemory[COLORS.BLACK] = { type: PIECE_TYPES.TOAD };
  actionMatching(
    state,
    (action) =>
      action.pieceId === "fool" &&
      action.mode === "toadStep" &&
      action.profileType === PIECE_TYPES.TOAD &&
      action.to.r === 4 &&
      action.to.c === 9,
  );

  state = createEmptyState(COLORS.BLACK, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 4, 9, { id: "life" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "life" &&
      action.mode === "lifeDeathMove" &&
      action.to.r === 5 &&
      action.to.c === 0,
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 5, 9, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 0, {
      id: "death-target",
      hasShield: false,
    }),
  );
  expect(
    generateLegalActions(state).some(
      (action) => action.mode === "kill" && action.targetId === "death-target",
    ),
  ).toBe(false);
});

test("Frame wrap-around does not create attacks across opposite files", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.mode === "slide" &&
      action.to.r === 4 &&
      action.to.c === 9,
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 2, { id: "blocker" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 9, {
      id: "target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) => action.pieceId === "rook" && action.targetId === "target",
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 1, 8, { id: "knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 0, {
      id: "knight-target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "knightAttack" &&
        action.pieceId === "knight" &&
        action.targetId === "knight-target",
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.TOAD, COLORS.WHITE, 1, 9, { id: "toad" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 0, {
      id: "toad-target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "toadAttack" &&
        action.pieceId === "toad" &&
        action.targetId === "toad-target",
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 1, 9, { id: "pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 0, {
      id: "pawn-target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "pawnAttack" &&
        action.pieceId === "pawn" &&
        action.targetId === "pawn-target",
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  state.foolMemory[COLORS.BLACK] = { type: PIECE_TYPES.KNIGHT };
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.FOOL, COLORS.WHITE, 1, 8, { id: "fool" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 0, 0, {
      id: "fool-target",
      hasShield: false,
    }),
  );
  applyShieldOverrideToBoard(state);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "knightAttack" &&
        action.pieceId === "fool" &&
        action.targetId === "fool-target",
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 5, 9, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 0, {
      id: "death-target",
      hasShield: false,
    }),
  );
  expect(
    generateLegalActions(state).some(
      (action) => action.mode === "kill" && action.targetId === "death-target",
    ),
  ).toBe(false);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 6, 9, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 0, {
      id: "life-target",
      hasShield: false,
    }),
  );
  expect(
    generateLegalActions(state).some(
      (action) => action.mode === "heal" && action.targetId === "life-target",
    ),
  ).toBe(false);
});

test("wrapped orthogonal moves prefer Life routes, avoid Death routes, then use the shortest path", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  let preferred = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.mode === "slide" &&
      action.to.r === 4 &&
      action.to.c === 9,
  );
  expect(preferred.path.map((square) => `${square.r},${square.c}`)).toEqual([
    "4,0",
  ]);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 4, 4, { id: "life" }),
  );
  preferred = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.mode === "slide" &&
      action.to.r === 4 &&
      action.to.c === 9,
  );
  expect(preferred.path.some((square) => square.r === 4 && square.c === 4)).toBe(
    true,
  );
  expect(preferred.path.some((square) => square.r === 4 && square.c === 0)).toBe(
    false,
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 0, { id: "death" }),
  );
  preferred = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.mode === "slide" &&
      action.to.r === 4 &&
      action.to.c === 9,
  );
  expect(preferred.path.some((square) => square.r === 4 && square.c === 0)).toBe(
    false,
  );
});

test("Frame Chess rule defaults survive serialized states missing new flags", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  delete state.ruleOverrides.frameEnabled;
  delete state.ruleOverrides.wraparoundEnabled;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 4, { id: "edge-rook" }),
  );
  updateIntimidation(state);
  expect(state.board[0][4].hasShield).toBe(false);
  expect(state.board[0][4].frameSuppressedShield).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  delete state.ruleOverrides.frameEnabled;
  delete state.ruleOverrides.wraparoundEnabled;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 2, { id: "blocker" }),
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.mode === "slide" &&
      action.to.r === 4 &&
      action.to.c === 9 &&
      action.path.some((square) => square.r === 4 && square.c === 0),
  );

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.FRAME_CHESS,
  });
  delete state.ruleOverrides.frameEnabled;
  delete state.ruleOverrides.wraparoundEnabled;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 2, { id: "blocker" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 9, {
      id: "target",
      hasShield: false,
    }),
  );
  expect(
    generateLegalActions(state).some(
      (action) => action.pieceId === "rook" && action.targetId === "target",
    ),
  ).toBe(false);
});

test("Frontal Fan en passant uses orthodox diagonals while Frontal Fan 2 preserves lane recoil", () => {
  let state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 3, { id: "black-pawn" }),
  );

  const advance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5 &&
      action.to.c === 4,
  );
  state = applyAction(state, advance);
  const enPassant = actionMatching(
    state,
    (action) => action.mode === "enPassant" && action.pieceId === "black-pawn",
  );
  state = applyAction(state, enPassant);

  expect(state.board[5][4]?.id).toBe("white-pawn");
  expect(state.board[5][4].hasShield).toBe(false);
  expect(state.board[6][4]?.id).toBe("black-pawn");
  expect(state.board[6][4].hasShield).toBe(true);

  state = createEmptyState(COLORS.WHITE, {
    variantId: VARIANT_IDS.TOAD_FOOL,
    overrides: { pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN_2 },
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 3, { id: "black-pawn" }),
  );

  const legacyAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5 &&
      action.to.c === 4,
  );
  state = applyAction(state, legacyAdvance);
  const legacyEnPassant = actionMatching(
    state,
    (action) => action.mode === "enPassant" && action.pieceId === "black-pawn",
  );
  state = applyAction(state, legacyEnPassant);

  expect(state.board[5][4]?.id).toBe("white-pawn");
  expect(state.board[5][4].hasShield).toBe(false);
  expect(state.board[6][4]?.id).toBe("black-pawn");
  expect(state.board[6][4].hasShield).toBe(false);
});

test("deterministic smoke self-play produces legal actions in both variants", () => {
  for (const variantId of [
    VARIANT_IDS.CHESS_TWO,
    VARIANT_IDS.TOAD_FOOL,
    VARIANT_IDS.TOAD_FOOL_CLASSIC,
    VARIANT_IDS.FRAME_CHESS,
  ]) {
    let state = createGameState({ variantId });
    for (let ply = 0; ply < 6 && !state.gameOver; ply++) {
      const action = generateLegalActions(state)[0];
      expect(action).toBeTruthy();
      state = applyAction(state, action);
      expect(state.board).toHaveLength(10);
    }
  }
});

test("AI returns legal actions across all playable variants", () => {
  for (const variantId of [
    VARIANT_IDS.CHESS_TWO,
    VARIANT_IDS.TOAD_FOOL,
    VARIANT_IDS.TOAD_FOOL_CLASSIC,
    VARIANT_IDS.FRAME_CHESS,
  ]) {
    const state = createGameState({ variantId });
    const action = chooseAiAction(state, state.currentPlayer, {
      maxDepth: 1,
      maxActions: 12,
      timeLimitMs: 120,
      hardTimeLimitMs: 180,
    });

    expect(action).toBeTruthy();
    expect(
      generateLegalActions(state).some(
        (candidate) => candidate.id === action.id,
      ),
    ).toBe(true);
  }
});

test("pawn multi-advance creates a variant en passant shield attack", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 3, { id: "black-pawn" }),
  );

  const advance = actionMatching(
    state,
    (action) => action.mode === "pawnAdvance" && action.to.r === 4,
  );
  state = applyAction(state, advance);

  expect(state.currentPlayer).toBe(COLORS.BLACK);
  expect(state.enPassant?.pieceId).toBe("white-pawn");

  const enPassant = actionMatching(
    state,
    (action) => action.mode === "enPassant",
  );
  state = applyAction(state, enPassant);

  expect(state.board[4][4].hasShield).toBe(false);
  expect(state.board[5][4]?.id).toBe("black-pawn");
});

test("three-square pawn advances expose every crossed square to en passant", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 8, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 6, 3, { id: "black-pawn-a" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 5, { id: "black-pawn-b" }),
  );

  const advance = actionMatching(
    state,
    (action) => action.mode === "pawnAdvance" && action.to.r === 5,
  );
  state = applyAction(state, advance);

  const enPassantActions = generateLegalActions(state).filter(
    (action) => action.mode === "enPassant",
  );
  expect(
    enPassantActions
      .map(
        (action) => `${action.pieceId}:${action.staging.r},${action.staging.c}`,
      )
      .sort(),
  ).toEqual(["black-pawn-a:7,4", "black-pawn-b:6,4"]);
});

test("variant en passant killing blows still apply Death-occupied crossed square pass-through", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 8, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 6, 3, { id: "black-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 7, 4, { id: "death" }),
  );

  const advance = actionMatching(
    state,
    (action) => action.mode === "pawnAdvance" && action.to.r === 5,
  );
  state = applyAction(state, advance);

  const enPassant = actionMatching(
    state,
    (action) =>
      action.mode === "enPassant" &&
      !action.deathStaging &&
      !action.staging &&
      action.rest.r === 5 &&
      action.rest.c === 4 &&
      action.path.some((square) => square.r === 7 && square.c === 4),
  );
  state = applyAction(state, enPassant);

  expect(state.board[7][4]?.id).toBe("death");
  expect(state.board.flat().some((piece) => piece?.id === "white-pawn")).toBe(
    false,
  );
  expect(state.board[5][4]?.id).toBe("black-pawn");
  expect(state.board[5][4].hasShield).toBe(false);
});

test("variant en passant stays available after a Life/Death reply first", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 4, { id: "white-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 3, { id: "black-pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 2, 1, { id: "black-life" }),
  );

  const advance = actionMatching(
    state,
    (action) => action.mode === "pawnAdvance" && action.to.r === 4,
  );
  state = applyAction(state, advance);

  expect(
    generateLegalActions(state).some((action) => action.mode === "enPassant"),
  ).toBe(true);

  const lifeMove = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-life" &&
      action.mode === "lifeDeathMove" &&
      action.to.r === 3 &&
      action.to.c === 2,
  );
  state = applyAction(state, lifeMove);

  expect(state.enPassant?.pieceId).toBe("white-pawn");
  expect(
    generateLegalActions(state).some((action) => action.mode === "enPassant"),
  ).toBe(true);

  const standardReply = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-pawn" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5 &&
      action.to.c === 3,
  );
  state = applyAction(state, standardReply);

  expect(state.enPassant).toBe(null);
});

test("white a2 pawn always has all three opening advances when lanes are clear", () => {
  const state = createGameState();
  const moves = generateLegalActions(state)
    .filter(
      (action) =>
        action.pieceId === "white-pawn-0" && action.mode === "pawnAdvance",
    )
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();

  expect(moves).toEqual(["5,0", "6,0", "7,0"]);
});

test("white a2 pawn can either pass through Death or choose it as a fatal final square", () => {
  let state = createGameState();
  state.board[7][1] = createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 7, 1, {
    id: "death-pass",
  });

  const moves = generateLegalActions(state)
    .filter(
      (action) =>
        action.pieceId === "white-pawn-1" && action.mode === "pawnAdvance",
    )
    .map(
      (action) =>
        `${action.to.r},${action.to.c}${action.deathLanding ? ":death" : ""}`,
    )
    .sort();

  expect(moves).toEqual(["5,1", "6,1", "7,1:death"]);

  const deathLanding = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-1" &&
      action.mode === "pawnAdvance" &&
      action.deathLanding,
  );
  state = applyAction(state, deathLanding);

  expect(state.board[7][1]?.id).toBe("death-pass");
  expect(state.board.flat().some((piece) => piece?.id === "white-pawn-1")).toBe(
    false,
  );
});

test("pawn that moved one square can still make a two-square continuation", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 7, 0, {
      id: "advanced-pawn",
      hasMoved: true,
    }),
  );

  const moves = generateLegalActions(state)
    .filter(
      (action) =>
        action.pieceId === "advanced-pawn" && action.mode === "pawnAdvance",
    )
    .map((action) => `${action.to.r},${action.to.c}`)
    .sort();

  expect(moves).toEqual(["5,0", "6,0"]);
});

test("pawns can jump Life or Death blockers before reaching the opponent half", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 4, {
      id: "white-pawn",
      hasMoved: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );

  const whiteJump = actionMatching(
    state,
    (action) =>
      action.mode === "pawnLifeDeathJump" &&
      action.pieceId === "white-pawn" &&
      action.to.r === 3 &&
      action.to.c === 4,
  );
  state = applyAction(state, whiteJump);

  expect(state.board[3][4]?.id).toBe("white-pawn");
  expect(state.board[3][4].hasShield).toBe(false);
  expect(state.board[4][4]?.id).toBe("death");

  state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 5, {
      id: "black-pawn",
      hasMoved: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 5, { id: "life" }),
  );

  const blackJump = actionMatching(
    state,
    (action) =>
      action.mode === "pawnLifeDeathJump" &&
      action.pieceId === "black-pawn" &&
      action.to.r === 6 &&
      action.to.c === 5,
  );
  state = applyAction(state, blackJump);

  expect(state.board[6][5]?.id).toBe("black-pawn");
  expect(state.board[5][5]?.id).toBe("life");
});

test("pawns can jump any directly blocking Life or Death piece from later ranks", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 4, {
      id: "white-pawn",
      hasMoved: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "own-life" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "pawnLifeDeathJump" &&
        action.pieceId === "white-pawn" &&
        action.to.r === 4 &&
        action.to.c === 4,
    ),
  ).toBe(true);
});

test("Life and Death pass-through effects modify shields during standard movement", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 9, 3, { id: "death" }),
  );

  const move = actionMatching(
    state,
    (action) =>
      action.kind === "move" && action.to.r === 9 && action.to.c === 5,
  );
  state = applyAction(state, move);

  expect(state.board[9][5]?.id).toBe("rook");
  expect(state.board[9][5].hasShield).toBe(false);
  expect(state.board[9][3]?.id).toBe("death");
});

test("standard pieces may choose a Death square as a fatal normal-move destination", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 9, 3, { id: "death" }),
  );

  const deathLanding = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.kind === "move" &&
      action.to.r === 9 &&
      action.to.c === 3 &&
      action.deathLanding,
  );
  state = applyAction(state, deathLanding);

  expect(state.board[9][3]?.id).toBe("death");
  expect(state.board.flat().some((piece) => piece?.id === "rook")).toBe(false);
});

test("Kings cannot choose Death squares as fatal move destinations", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 8, 5, { id: "death" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "king" && action.to?.r === 8 && action.to?.c === 5,
    ),
  ).toBe(false);
});

test("Death pass-through destroys an attacker after the attack resolves", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 0, {
      id: "rook",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 5, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 5, 5, {
      id: "target",
      hasShield: false,
    }),
  );

  const attack = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.kind === "attack" &&
      action.targetId === "target" &&
      !action.staging &&
      action.rest.r === 5 &&
      action.rest.c === 5,
  );
  expect(attack.path.some((square) => square.r === 5 && square.c === 2)).toBe(
    true,
  );
  state = applyAction(state, attack);

  expect(state.board[5][0]).toBe(null);
  expect(state.board[5][5]).toBe(null);
  expect(state.gameOver).toBe(null);
});

test("Death can be used as a fatal attack staging square", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 0, {
      id: "rook",
      hasShield: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 5, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 5, { id: "target" }),
  );

  const attack = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" &&
      action.kind === "attack" &&
      action.targetId === "target" &&
      action.staging.r === 5 &&
      action.staging.c === 4 &&
      action.deathStaging,
  );
  state = applyAction(state, attack);

  expect(state.board[5][4]?.id).toBe("death");
  expect(state.board[5][5]?.id).toBe("target");
  expect(state.board[5][5].hasShield).toBe(false);
  expect(state.board.flat().some((piece) => piece?.id === "rook")).toBe(false);
  expect(attack.rest).toBe(undefined);
});

test("ranged killing blows force the attacker to rest on the destroyed square", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 1, {
      id: "target",
      hasShield: false,
    }),
  );

  const attacks = generateLegalActions(state).filter(
    (action) => action.kind === "attack" && action.targetId === "target",
  );
  expect(attacks).toHaveLength(1);
  expect(attacks[0].staging).toBe(undefined);
  expect(
    attacks[0].path.some((square) => square.r === 4 && square.c === 1),
  ).toBe(true);

  const attack = actionMatching(
    state,
    (action) =>
      action.kind === "attack" &&
      action.targetId === "target" &&
      action.rest.r === 3 &&
      action.rest.c === 1,
  );
  state = applyAction(state, attack);

  expect(state.board[3][1]?.id).toBe("rook");
  expect(state.board[4][1]).toBe(null);
});

test("state records removed pieces for captured-piece display", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 1, {
      id: "target",
      hasShield: false,
    }),
  );

  const attack = actionMatching(
    state,
    (action) => action.kind === "attack" && action.targetId === "target",
  );
  state = applyAction(state, attack);

  expect(state.capturedPieces).toEqual([
    expect.objectContaining({
      id: "target",
      type: PIECE_TYPES.PAWN,
      color: COLORS.BLACK,
      owner: COLORS.BLACK,
      removedByColor: COLORS.WHITE,
    }),
  ]);
});

test("shielded attacks remove only the target shield and rest on staging", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 1, { id: "target" }),
  );

  const attack = actionMatching(
    state,
    (action) => action.kind === "attack" && action.targetId === "target",
  );
  state = applyAction(state, attack);

  expect(state.board[3][1]?.id).toBe("target");
  expect(state.board[3][1].hasShield).toBe(false);
  expect(state.board[4][1]?.id).toBe("rook");
});

test("knights can ramp jump over adjacent ordinary pieces", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 6, { id: "ramp" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) =>
        action.mode === "knightRamp" && action.to.r === 5 && action.to.c === 7,
    ),
  ).toBe(true);
});

test("knights cannot use L-shaped moves to move to empty squares", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) => action.pieceId === "knight" && action.kind === "move",
    ),
  ).toBe(false);
});

test("knight ramp actions preserve distinct double-jump routes to the same destination", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 6, { id: "upper-ramp-a" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 8, { id: "upper-ramp-b" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 6, { id: "lower-ramp-a" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 8, { id: "lower-ramp-b" }),
  );

  const routes = generateLegalActions(state).filter(
    (action) =>
      action.mode === "knightRamp" && action.to.r === 5 && action.to.c === 9,
  );

  expect(routes).toHaveLength(2);
  expect(
    routes
      .map(
        (action) =>
          `${action.rampSequence[0].land.r},${action.rampSequence[0].land.c}`,
      )
      .sort(),
  ).toEqual(["3,7", "7,7"]);
  expect(new Set(routes.map((action) => action.id)).size).toBe(2);
});

test("knight ramp jumps can use Life and Death pieces as pass-through ramps", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, {
      id: "life-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 6, { id: "life-ramp" }),
  );

  const lifeRamp = actionMatching(
    state,
    (action) =>
      action.mode === "knightRamp" &&
      action.pieceId === "life-knight" &&
      action.to.r === 5 &&
      action.to.c === 7 &&
      action.path.some((square) => square.r === 5 && square.c === 6) &&
      action.rampSequence[0].rampType === PIECE_TYPES.LIFE,
  );
  state = applyAction(state, lifeRamp);

  expect(state.board[5][7]?.id).toBe("life-knight");
  expect(state.board[5][7].hasShield).toBe(true);
  expect(state.board[5][6]?.id).toBe("life-ramp");

  state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, { id: "death-knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 6, 5, { id: "death-ramp" }),
  );

  const deathRamp = actionMatching(
    state,
    (action) =>
      action.mode === "knightRamp" &&
      action.pieceId === "death-knight" &&
      action.to.r === 7 &&
      action.to.c === 5 &&
      action.path.some((square) => square.r === 6 && square.c === 5) &&
      action.rampSequence[0].rampType === PIECE_TYPES.DEATH,
  );
  state = applyAction(state, deathRamp);

  expect(state.board[7][5]?.id).toBe("death-knight");
  expect(state.board[7][5].hasShield).toBe(false);
  expect(state.board[6][5]?.id).toBe("death-ramp");
});

test("shieldless knight dies when ramp-jumping over Death", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 5, {
      id: "knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 6, 5, { id: "death-ramp" }),
  );

  const deathRamp = actionMatching(
    state,
    (action) =>
      action.mode === "knightRamp" && action.to.r === 7 && action.to.c === 5,
  );
  state = applyAction(state, deathRamp);

  expect(state.board[6][5]?.id).toBe("death-ramp");
  expect(state.board.flat().some((piece) => piece?.id === "knight")).toBe(
    false,
  );
});

test("knight attacks expose staging choices and forced target-square rests", () => {
  const shielded = createEmptyState(COLORS.WHITE);
  placePiece(
    shielded.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 8, 2, { id: "knight" }),
  );
  placePiece(
    shielded.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 6, 3, { id: "target" }),
  );

  const shieldedAttacks = generateLegalActions(shielded).filter(
    (action) => action.kind === "attack" && action.targetId === "target",
  );
  expect(
    shieldedAttacks
      .map((action) => `${action.staging.r},${action.staging.c}`)
      .sort(),
  ).toEqual(["6,2", "7,3"]);
  expect(
    shieldedAttacks.every(
      (action) =>
        action.rest.r === action.staging.r &&
        action.rest.c === action.staging.c,
    ),
  ).toBe(true);

  const unshielded = createEmptyState(COLORS.WHITE);
  placePiece(
    unshielded.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 8, 2, { id: "knight" }),
  );
  placePiece(
    unshielded.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 6, 3, {
      id: "target",
      hasShield: false,
    }),
  );

  const killingAttacks = generateLegalActions(unshielded).filter(
    (action) => action.kind === "attack" && action.targetId === "target",
  );
  expect(killingAttacks).toHaveLength(1);
  expect(killingAttacks[0].staging).toBe(undefined);
  expect(
    killingAttacks[0].path.map((square) => `${square.r},${square.c}`),
  ).toEqual(["7,2", "7,3"]);
  expect(killingAttacks[0].rest).toEqual({ r: 6, c: 3 });
});

test("knights can choose Death-occupied attack staging squares", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 8, 2, { id: "knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 7, 3, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 6, 3, { id: "target" }),
  );

  const attacks = generateLegalActions(state).filter(
    (action) => action.kind === "attack" && action.targetId === "target",
  );
  expect(
    attacks.map((action) => `${action.staging.r},${action.staging.c}`).sort(),
  ).toEqual(["6,2", "7,3"]);
  expect(attacks.some((action) => action.deathStaging)).toBe(true);
});

test("Knight shield-break attacks apply Life and Death pass-through before staging", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 2, {
      id: "life-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 4, 3, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 3, { id: "target" }),
  );

  let attack = actionMatching(
    state,
    (action) =>
      action.mode === "knightAttack" &&
      action.targetId === "target" &&
      action.staging.r === 3 &&
      action.staging.c === 2,
  );
  expect(attack.path.map((square) => `${square.r},${square.c}`)).toEqual([
    "4,2",
    "4,3",
  ]);
  state = applyAction(state, attack);

  expect(state.board[3][3]?.id).toBe("target");
  expect(state.board[3][3].hasShield).toBe(false);
  expect(state.board[3][2]?.id).toBe("life-knight");
  expect(state.board[3][2].hasShield).toBe(true);

  state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 2, {
      id: "death-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 3, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 3, { id: "target" }),
  );

  attack = actionMatching(
    state,
    (action) =>
      action.mode === "knightAttack" &&
      action.targetId === "target" &&
      action.staging.r === 3 &&
      action.staging.c === 2,
  );
  state = applyAction(state, attack);

  expect(state.board[3][3]?.id).toBe("target");
  expect(state.board[3][3].hasShield).toBe(false);
  expect(state.board[4][3]?.id).toBe("death");
  expect(
    state.board.flat().some((piece) => piece?.id === "death-knight"),
  ).toBe(false);
});

test("shieldless Knight killing blows still apply Death pass-through before resting", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 2, { id: "knight" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 3, {
      id: "target",
      hasShield: false,
    }),
  );

  const shieldedKnightAttack = actionMatching(
    state,
    (action) =>
      action.pieceId === "knight" &&
      action.kind === "attack" &&
      action.targetId === "target" &&
      !action.staging,
  );
  expect(
    shieldedKnightAttack.path.map((square) => `${square.r},${square.c}`),
  ).toEqual(["4,2", "4,3"]);
  state = applyAction(state, shieldedKnightAttack);

  expect(state.board[4][2]?.id).toBe("death");
  expect(state.board[3][3]?.id).toBe("knight");
  expect(state.board[3][3].hasShield).toBe(false);

  state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 5, 2, {
      id: "knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 3, {
      id: "target",
      hasShield: false,
    }),
  );

  const fatalKnightAttack = actionMatching(
    state,
    (action) =>
      action.pieceId === "knight" &&
      action.kind === "attack" &&
      action.targetId === "target" &&
      !action.staging,
  );
  state = applyAction(state, fatalKnightAttack);

  expect(state.board[4][2]?.id).toBe("death");
  expect(state.board.flat().some((piece) => piece?.id === "target")).toBe(
    false,
  );
  expect(state.board.flat().some((piece) => piece?.id === "knight")).toBe(
    false,
  );
});

test("Life heal grants shield and one-turn immunity only to shieldless eligible pieces", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 3, {
      id: "pawn",
      hasShield: false,
    }),
  );

  const heal = actionMatching(state, (action) => action.mode === "heal");
  state = applyAction(state, heal);

  expect(state.board[4][3].hasShield).toBe(true);
  expect(state.board[4][3].isImmune).toBe(true);
});

test("applying a stale Life heal action rechecks target immunity", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 3, {
      id: "pawn",
      hasShield: false,
    }),
  );

  const heal = actionMatching(state, (action) => action.mode === "heal");
  state.board[4][3].isImmune = true;
  state = applyAction(state, heal);

  expect(state.board[4][3].hasShield).toBe(false);
  expect(state.board[4][3].isImmune).toBe(true);
});

test("Life cannot heal an intimidated checking piece", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 2, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 1, { id: "checking-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 4, 5, { id: "black-king" }),
  );
  updateIntimidation(state);

  const rook = state.board[4][1];
  expect(rook.isIntimidated).toBe(true);
  expect(rook.hasShield).toBe(false);
  expect(
    generateLegalActions(state).some(
      (action) => action.mode === "heal" && action.targetId === "checking-rook",
    ),
  ).toBe(false);
});

test("Life and Death control changes by board half after movement", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "life" }),
  );

  const transfer = actionMatching(
    state,
    (action) => action.mode === "lifeDeathMove" && action.to.r === 4,
  );
  state = applyAction(state, transfer);

  expect(state.board[4][3]?.id ?? state.board[4][5]?.id).toBe("life");
  const movedLife = state.board[4][3] ?? state.board[4][5];
  expect(ownerOf(movedLife)).toBe(COLORS.BLACK);
});

test("Life and Death annihilate when they become orthogonally adjacent", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 6, 3, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );

  const move = actionMatching(
    state,
    (action) =>
      action.mode === "lifeDeathMove" && action.to.r === 5 && action.to.c === 4,
  );
  state = applyAction(state, move);

  expect(state.board[5][4]).toBe(null);
  expect(state.board[4][4]).toBe(null);
});

test("Death kill is blocked by orthogonal allied protection", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 5, 5, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 4, {
      id: "target",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 5, { id: "protector" }),
  );

  expect(
    generateLegalActions(state).some((action) => action.mode === "kill"),
  ).toBe(false);
  state.board[4][5] = null;
  expect(
    generateLegalActions(state).some((action) => action.mode === "kill"),
  ).toBe(true);
});

test("applying a stale Death kill action rechecks allied protection", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 5, 5, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 4, {
      id: "target",
      hasShield: false,
    }),
  );

  const kill = actionMatching(state, (action) => action.mode === "kill");
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 4, 5, { id: "late-protector" }),
  );
  state = applyAction(state, kill);

  expect(state.board[4][4]?.id).toBe("target");
  expect(state.board[5][5]?.id).toBe("death");
});

test("Death cannot kill another Death piece", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 3, 3, { id: "owned-death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 5, 5, {
      id: "opponent-death",
    }),
  );

  const kills = generateLegalActions(state).filter(
    (action) => action.mode === "kill",
  );
  expect(
    kills.some((action) => action.target?.type === PIECE_TYPES.DEATH),
  ).toBe(false);
});

test("nearest-rook castling is available when the rank is clear", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "left-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 8, { id: "right-rook" }),
  );

  const castles = generateLegalActions(state).filter(
    (action) => action.mode === "castle",
  );
  expect(castles.map((action) => action.to.c).sort()).toEqual([3, 7]);
});

test("castling is forbidden out of check or through attacked squares", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "left-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 8, { id: "right-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 4, {
      id: "file-attacker",
    }),
  );

  expect(
    generateLegalActions(state)
      .filter((action) => action.mode === "castle")
      .map((action) => action.to.c),
  ).toEqual([7]);

  state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "left-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 8, { id: "right-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 5, {
      id: "checking-rook",
    }),
  );

  expect(isKingInCheck(state, COLORS.WHITE)).toBe(true);
  expect(
    generateLegalActions(state).some((action) => action.mode === "castle"),
  ).toBe(false);
});

test("checked players must spend the standard move on a check evasion", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 0, {
      id: "checking-rook",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 2, 2, {
      id: "black-bishop",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 2, 8, {
      id: "black-pawn",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 3, 3, { id: "queen" }),
  );

  const actions = generateLegalActions(state);

  expect(isKingInCheck(state, COLORS.BLACK)).toBe(true);
  expect(actions.some((action) => action.mode === "kill")).toBe(false);
  expect(
    actions.some(
      (action) =>
        action.pieceId === "black-bishop" &&
        action.kind === "attack" &&
        action.targetId === "checking-rook",
    ),
  ).toBe(true);
  for (const action of actions.filter(
    (candidate) => candidate.consumes?.standard && !candidate.consumes?.special,
  )) {
    expect(
      isKingInCheck(
        applyAction(state, action, { recordHistory: false, normalize: false }),
        COLORS.BLACK,
      ),
    ).toBe(false);
  }
  expect(getActionsForPiece(state, "black-pawn")).toEqual([]);
  expect(
    getActionsForPiece(state, "black-bishop").some(
      (action) => action.targetId === "checking-rook",
    ),
  ).toBe(true);
  expect(actions.some((action) => action.mode === "lifeDeathMove")).toBe(true);
});

test("a checked King with no escape sequence is checkmated", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 5, { id: "rank-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 0, { id: "file-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 2, 2, {
      id: "diagonal-bishop",
    }),
  );

  expect(isCheckmate(state, COLORS.BLACK)).toBe(true);
  normalizeTurn(state);
  expect(state.gameOver?.winner).toBe(COLORS.WHITE);
  expect(state.gameOver?.reason).toBe("black king checkmated");
});

test("checkmate ends immediately even before the mover skips a remaining special slot", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 5, { id: "mating-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 0, { id: "file-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 2, 2, {
      id: "diagonal-bishop",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 8, 7, { id: "white-life" }),
  );

  const mate = actionMatching(
    state,
    (action) =>
      action.pieceId === "mating-rook" &&
      action.to?.r === 0 &&
      action.to?.c === 5,
  );

  state = applyAction(state, mate);

  expect(state.gameOver?.winner).toBe(COLORS.WHITE);
  expect(state.gameOver?.reason).toBe("black king checkmated");
});

test("checkmate-disabled mode allows ordinary play in check and wins by King capture", () => {
  let state = createEmptyState(COLORS.WHITE, {
    overrides: { checkmateEnabled: false },
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 5, {
      id: "black-checker",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 8, 0, { id: "white-pawn" }),
  );

  expect(isKingInCheck(state, COLORS.WHITE)).toBe(false);
  actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 7,
  );

  state = createEmptyState(COLORS.WHITE, {
    overrides: { checkmateEnabled: false },
  });
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 5, 8, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 5, { id: "rook" }),
  );

  const kingCapture = actionMatching(
    state,
    (action) => action.pieceId === "rook" && action.targetId === "black-king",
  );
  state = applyAction(state, kingCapture);

  expect(state.gameOver).toEqual({
    winner: COLORS.WHITE,
    reason: "black king removed",
  });
});

test("ordinary Life/Death moves can prepare the required check evasion", () => {
  let state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 0, 5, { id: "rank-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 2, 2, {
      id: "diagonal-bishop",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 1, 0, { id: "black-life" }),
  );

  const actions = generateLegalActions(state);
  const prep = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-life" &&
      action.mode === "lifeDeathMove" &&
      action.to.r === 2 &&
      action.to.c === 1,
  );

  expect(isKingInCheck(state, COLORS.BLACK)).toBe(true);
  expect(isCheckmate(state, COLORS.BLACK)).toBe(false);
  expect(actions.some((action) => action.pieceType === PIECE_TYPES.KING)).toBe(
    false,
  );
  expect(actions.map((action) => action.id)).toContain(prep.id);

  state = applyAction(state, prep);
  expect(state.gameOver).toBe(null);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "black-king" &&
        action.to?.r === 1 &&
        action.to?.c === 0,
    ),
  ).toBe(true);
});

test("promotion inherits pawn shield state except Queen remains unshielded", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 1, 0, {
      id: "pawn",
      hasShield: false,
      hasMoved: true,
    }),
  );

  const promoteRook = actionMatching(
    state,
    (action) => action.promotionType === PIECE_TYPES.ROOK,
  );
  state = applyAction(state, promoteRook);

  expect(state.board[0][0].type).toBe(PIECE_TYPES.ROOK);
  expect(state.board[0][0].hasShield).toBe(false);

  state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 1, 1, {
      id: "pawn2",
      hasShield: true,
      hasMoved: true,
    }),
  );
  const promoteQueen = actionMatching(
    state,
    (action) => action.promotionType === PIECE_TYPES.QUEEN,
  );
  state = applyAction(state, promoteQueen);
  expect(state.board[0][1].type).toBe(PIECE_TYPES.QUEEN);
  expect(state.board[0][1].hasShield).toBe(false);
});

test("king threats create check without legal king-capture actions", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 5, 5, { id: "king" }),
  );
  updateIntimidation(state);

  expect(isKingInCheck(state, COLORS.BLACK)).toBe(true);
  expect(state.board[5][1].isIntimidated).toBe(true);
  expect(
    generateLegalActions(state).some(
      (action) => action.kind === "attack" && action.targetId === "king",
    ),
  ).toBe(false);
});

test("king intimidation strips and restores checking shields", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 5, 5, { id: "king" }),
  );
  updateIntimidation(state);

  expect(state.board[5][1].hasShield).toBe(false);
  expect(state.board[5][1].isIntimidated).toBe(true);
  expect(state.board[5][1].intimidationSuppressedShield).toBe(true);

  const moveAway = actionMatching(
    state,
    (action) =>
      action.pieceId === "rook" && action.kind === "move" && action.to.r === 6,
  );
  state = applyAction(state, moveAway);
  const rook = state.board[6][1];
  expect(rook.hasShield).toBe(true);
  expect(rook.isIntimidated).toBe(false);
  expect(rook.intimidationSuppressedShield).toBe(false);
});

test("unshielded checking pieces are intimidated without receiving a restored shield", () => {
  const state = createEmptyState(COLORS.WHITE);
  const rook = placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 1, {
      id: "rook",
      hasShield: false,
    }),
  );
  const king = placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 5, 5, { id: "king" }),
  );
  updateIntimidation(state);

  expect(rook.isIntimidated).toBe(true);
  expect(rook.hasShield).toBe(false);
  expect(rook.intimidationSuppressedShield).toBe(false);

  state.board[5][5] = null;
  king.row = 4;
  king.col = 5;
  state.board[4][5] = king;
  updateIntimidation(state);

  expect(rook.isIntimidated).toBe(false);
  expect(rook.hasShield).toBe(false);
});

test("shieldless checking piece types are still intimidated", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 5, 1, { id: "queen" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 5, 5, { id: "king" }),
  );
  updateIntimidation(state);

  const queen = state.board[5][1];
  expect(queen.isIntimidated).toBe(true);
  expect(queen.hasShield).toBe(false);
  expect(queen.intimidationSuppressedShield).toBe(false);
});

test("only kings and Life pieces remaining is a draw", () => {
  const state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "life" }),
  );

  normalizeTurn(state);

  expect(state.gameOver?.winner).toBe(null);
  expect(state.gameOver?.reason).toBe("Only kings and Life pieces remain");
});

test("Life and Death annihilation can leave only kings and trigger a draw", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 6, 3, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );

  const move = actionMatching(
    state,
    (action) =>
      action.pieceId === "life" && action.to.r === 5 && action.to.c === 4,
  );
  state = applyAction(state, move);

  expect(
    state.board
      .flat()
      .filter(Boolean)
      .map((piece) => piece.type)
      .sort(),
  ).toEqual([PIECE_TYPES.KING, PIECE_TYPES.KING]);
  expect(state.gameOver?.winner).toBe(null);
  expect(state.gameOver?.reason).toBe("Only kings and Life pieces remain");
});

test("AI returns a deterministic legal black action", () => {
  let state = createGameState();
  const whiteAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-4" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5,
  );
  state = applyAction(state, whiteAdvance);

  const action = chooseAiAction(state, COLORS.BLACK, { maxDepth: 1 });
  expect(action).toBeTruthy();
  expect(
    generateLegalActions(state).some((candidate) => candidate.id === action.id),
  ).toBe(true);
});

test("AI values opening a Life or Death gate file in quiet openings", () => {
  let state = createGameState();
  const whiteAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-4" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5,
  );
  state = applyAction(state, whiteAdvance);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 22,
  });
  expect(["black-pawn-1", "black-pawn-8"]).toContain(action.pieceId);
  expect(action.mode).toBe("pawnAdvance");
});

test("AI depth counts a same-turn Life or Death slot as part of the same turn", () => {
  let state = createGameState();
  const whiteAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-4" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5,
  );
  state = applyAction(state, whiteAdvance);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 6,
  });

  expect(action.pieceId).toBe("black-pawn-1");
  expect(action.mode).toBe("pawnAdvance");
  expect(action.to).toEqual({ r: 4, c: 1 });
});

test("Level 5 AI avoids quiet Knight routes that spend shield on its own Death", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, {
      id: "black-king-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, {
      id: "white-king-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.BLACK, 0, 0, {
      id: "black-knight-test",
      hasShield: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 1, {
      id: "black-ramp-pawn-test",
      hasShield: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 3, 3, {
      id: "black-ramp-death-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 6, 5, {
      id: "white-queen-test",
      hasShield: false,
    }),
  );

  const usesLateOwnDeathRamp = (action) =>
    (action.rampSequence ?? []).some((step, index) => {
      const ramp = state.board[step.ramp.r]?.[step.ramp.c];
      return (
        index > 0 &&
        step.rampType === PIECE_TYPES.DEATH &&
        ramp &&
        ownerOf(ramp) === COLORS.BLACK
      );
    });
  const riskyRoute = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-knight-test" &&
      action.mode === "knightRamp" &&
      action.to.r === 4 &&
      action.to.c === 4,
  );
  expect(usesLateOwnDeathRamp(riskyRoute)).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    ...LEVEL_5_AI_OPTIONS,
    timeLimitMs: 1200,
    hardTimeLimitMs: 1800,
  });

  expect(action.id).not.toBe(riskyRoute.id);
  expect(usesLateOwnDeathRamp(action)).toBe(false);
});

test("stronger AI prefers a cheap pawn shield break over quiet Life or Death gate opening", () => {
  let state = createGameState();
  const whiteAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-4" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5,
  );
  state = applyAction(state, whiteAdvance);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 2, 2, {
      id: "tactical-bishop",
    }),
  );

  const shieldBreak = generateLegalActions(state).find(
    (action) =>
      action.pieceId === "black-pawn-1" &&
      action.kind === "attack" &&
      action.targetId === "tactical-bishop",
  );
  expect(shieldBreak).toBeTruthy();

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 3,
    maxActions: 24,
    maxTacticalActions: 8,
    quiescenceDepth: 1,
    tacticalWeight: 1,
    timeLimitMs: 950,
    hardTimeLimitMs: 1650,
  });
  expect(["black-pawn-1", "black-pawn-3"]).toContain(action.pieceId);
  expect(action.kind).toBe("attack");
  expect(action.targetId).toBe("tactical-bishop");
});

test("AI takes a loose Queen instead of only threatening it", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 6, 1, { id: "bishop" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 3, 4, { id: "queen" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "bishop" &&
        action.kind === "attack" &&
        action.targetId === "queen",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 10,
    tacticalWeight: 1,
  });

  expect(action.pieceId).toBe("bishop");
  expect(action.kind).toBe("attack");
  expect(action.targetId).toBe("queen");
});

test("AI rejects a non-mating check when the intimidated checker is forced lost", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 4, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 8, 0, {
      id: "checking-rook",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.BLACK, 4, 7, {
      id: "black-queen",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 4, 2, {
      id: "loose-queen",
      hasShield: false,
    }),
  );
  updateIntimidation(state);

  const hangingCheck = actionMatching(
    state,
    (action) =>
      action.pieceId === "checking-rook" &&
      action.mode === "slide" &&
      action.to.r === 8 &&
      action.to.c === 4,
  );
  const afterCheck = applyAction(state, hangingCheck, { recordHistory: false });
  expect(isKingInCheck(afterCheck, COLORS.WHITE)).toBe(true);
  expect(afterCheck.board[8][4].isIntimidated).toBe(true);
  expect(
    generateLegalActions(afterCheck, COLORS.WHITE, { respectTurn: false }).some(
      (action) =>
        action.pieceId === "white-king" && action.targetId === "checking-rook",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);
  expect(action.pieceId).toBe("black-queen");
  expect(action.targetId).toBe("loose-queen");
});

test("AI can answer check by capturing the checking piece", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 2, 5, {
      id: "checking-queen",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 6, { id: "black-pawn" }),
  );
  updateIntimidation(state);

  expect(state.board[2][5].isIntimidated).toBe(true);
  expect(state.board[2][5].hasShield).toBe(false);
  expect(isKingInCheck(state, COLORS.BLACK)).toBe(true);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "black-pawn" &&
        action.kind === "attack" &&
        action.targetId === "checking-queen" &&
        action.rest.r === 2 &&
        action.rest.c === 5,
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 10,
    tacticalWeight: 1,
  });

  expect(action.pieceId).toBe("black-pawn");
  expect(action.targetId).toBe("checking-queen");
  expect(
    isKingInCheck(
      applyAction(state, action, { recordHistory: false, normalize: false }),
      COLORS.BLACK,
    ),
  ).toBe(false);
});

test("Level 5 AI answers check before taking loose material", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 5, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 5, 1, {
      id: "checking-queen",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 3, 3, {
      id: "black-bishop",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 0, { id: "black-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 0, 4, {
      id: "loose-knight",
      hasShield: false,
    }),
  );
  updateIntimidation(state);

  expect(isKingInCheck(state, COLORS.BLACK)).toBe(true);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "black-rook" &&
        action.kind === "attack" &&
        action.targetId === "loose-knight",
    ),
  ).toBe(false);

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);

  expect(action.targetId).toBe("checking-queen");
  expect(
    isKingInCheck(
      applyAction(state, action, { recordHistory: false, normalize: false }),
      COLORS.BLACK,
    ),
  ).toBe(false);
});

test("Level 5 AI removes a shieldless dark-square Bishop instead of only breaking a Knight shield", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 6, 2, { id: "black-bishop" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 3, 5, {
      id: "dark-bishop",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 4, 0, {
      id: "shielded-knight",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 7, 8, { id: "white-life" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "black-bishop" &&
        action.kind === "attack" &&
        action.targetId === "dark-bishop" &&
        !action.target.hadShield,
    ),
  ).toBe(true);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "black-bishop" &&
        action.kind === "attack" &&
        action.targetId === "shielded-knight" &&
        action.target.hadShield,
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);

  expect(action.pieceId).toBe("black-bishop");
  expect(action.kind).toBe("attack");
  expect(action.targetId).toBe("dark-bishop");
});

test("AI keeps a Bishop rest-square plan while also breaking a shield", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, {
      id: "black-king-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, {
      id: "white-king-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 1, 0, {
      id: "black-bishop-test",
      hasShield: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 4, 3, {
      id: "white-knight-test",
      hasShield: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 2, {
      id: "white-life-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 6, 0, {
      id: "white-rook-test",
      hasShield: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 1, {
      id: "black-pawn-test",
      hasShield: true,
    }),
  );

  const quietRest = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-bishop-test" &&
      action.kind === "move" &&
      action.to.r === 3 &&
      action.to.c === 2,
  );
  const shieldBreak = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-bishop-test" &&
      action.kind === "attack" &&
      action.targetId === "white-knight-test" &&
      action.rest?.r === quietRest.to.r &&
      action.rest?.c === quietRest.to.c,
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 8,
    maxTacticalActions: 4,
    quiescenceDepth: 1,
    tacticalWeight: 1,
  });

  expect(action.id).toBe(shieldBreak.id);
});

test("AI keeps a Knight ramp rest-square plan while also breaking a shield", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, {
      id: "black-king-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, {
      id: "white-king-test",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.BLACK, 8, 2, {
      id: "black-knight-test",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 7, 2, {
      id: "ramp-pawn",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 6, 3, {
      id: "shielded-pawn",
    }),
  );

  const quietRamp = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-knight-test" &&
      action.mode === "knightRamp" &&
      action.to.r === 6 &&
      action.to.c === 2,
  );
  const shieldBreak = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-knight-test" &&
      action.kind === "attack" &&
      action.targetId === "shielded-pawn" &&
      action.rest?.r === quietRamp.to.r &&
      action.rest?.c === quietRamp.to.c,
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 1,
    maxTacticalActions: 1,
    tacticalWeight: 1,
  });

  expect(action.kind).toBe("attack");
  expect(action.targetId).toBe(shieldBreak.targetId);
  expect(action.id).not.toBe(quietRamp.id);
});

test("Level 5 AI spends the full turn on a safe Death kill over a Queen shield break", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 2, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.BLACK, 3, 0, { id: "queen" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 3, 3, { id: "pawn" }),
  );

  const queenShieldBreak = actionMatching(
    state,
    (action) =>
      action.pieceId === "queen" &&
      action.kind === "attack" &&
      action.targetId === "pawn" &&
      action.target.hadShield,
  );
  const deathKill = actionMatching(
    state,
    (action) =>
      action.pieceId === "death" &&
      action.mode === "kill" &&
      action.targetId === "pawn",
  );

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);

  expect(action.id).toBe(deathKill.id);
  expect(action.id).not.toBe(queenShieldBreak.id);
});

test("Level 5 AI does not prune away a decisive Death kill", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 2, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 3, 3, { id: "queen" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 0, { id: "rook" }),
  );

  const deathKill = actionMatching(
    state,
    (action) =>
      action.pieceId === "death" &&
      action.mode === "kill" &&
      action.targetId === "queen",
  );
  expect(generateLegalActions(state).length).toBeGreaterThan(1);

  const action = chooseAiAction(state, COLORS.BLACK, {
    ...LEVEL_5_AI_OPTIONS,
    maxActions: 0,
    maxTacticalActions: 0,
    priorityOverflowLimit: 0,
    timeLimitMs: 1,
    hardTimeLimitMs: 1,
  });

  expect(action.id).toBe(deathKill.id);
});

test("AI evaluation gives light-square Bishops extra Life repair context", () => {
  const build = (bishopSquare) => {
    const state = createEmptyState(COLORS.BLACK);
    placePiece(
      state.board,
      createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
    );
    placePiece(
      state.board,
      createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 8, { id: "white-king" }),
    );
    placePiece(
      state.board,
      createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 0, 9, { id: "black-life" }),
    );
    placePiece(
      state.board,
      createPiece(
        PIECE_TYPES.BISHOP,
        COLORS.BLACK,
        bishopSquare.r,
        bishopSquare.c,
        {
          id: "bishop",
          hasShield: false,
        },
      ),
    );
    return state;
  };

  const darkSquareScore = evaluateState(build({ r: 4, c: 4 }), COLORS.BLACK);
  const lightSquareScore = evaluateState(build({ r: 4, c: 5 }), COLORS.BLACK);

  expect(lightSquareScore).toBeGreaterThan(darkSquareScore + 25);
});

test("deep AI may capture the checking piece when that resolves check", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 2, 5, {
      id: "checking-queen",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 4, 3, { id: "black-bishop" }),
  );
  updateIntimidation(state);

  expect(state.board[2][5].isIntimidated).toBe(true);
  expect(isKingInCheck(state, COLORS.BLACK)).toBe(true);
  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "black-bishop" &&
        action.kind === "attack" &&
        action.targetId === "checking-queen" &&
        action.target.isIntimidated,
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);

  expect(action.targetId).toBe("checking-queen");
  expect(
    isKingInCheck(
      applyAction(state, action, { recordHistory: false, normalize: false }),
      COLORS.BLACK,
    ),
  ).toBe(false);
});

test("AI rescues an endangered Bishop when no stronger tactic is available", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 0, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 5, 5, {
      id: "bishop",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 0, {
      id: "white-rook",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 1, { id: "quiet-pawn" }),
  );

  expect(
    generateLegalActions(state, COLORS.WHITE, { respectTurn: false }).some(
      (action) => action.targetId === "bishop",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 2,
    maxTacticalActions: 3,
    tacticalWeight: 1,
  });

  expect(action.pieceId).toBe("bishop");
  expect(action.kind).toBe("move");
});

test("Level 5 AI suppresses an invading Bishop before merely moving attacked material", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 0, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 4, 4, {
      id: "invading-bishop",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 6, 6, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 2, 2, {
      id: "defending-bishop",
    }),
  );

  expect(
    generateLegalActions(state, COLORS.WHITE, { respectTurn: false }).some(
      (action) => action.targetId === "rook",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);

  expect(action.pieceId).toBe("defending-bishop");
  expect(action.kind).toBe("attack");
  expect(action.targetId).toBe("invading-bishop");
});

test("AI avoids handing Life or Death pieces across the ownership line in quiet positions", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 12,
  });
  expect(action.pieceId).toBe("death");
  expect(action.mode).toBe("lifeDeathMove");
  expect(action.to.r).toBeLessThan(5);
});

test("AI activates an opened Life or Death piece instead of skipping the slot", () => {
  let state = createGameState();
  const whiteAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-4" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5,
  );
  state = applyAction(state, whiteAdvance);
  state = skipSpecialMove(state, COLORS.WHITE);

  const gateAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-pawn-1" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 4 &&
      action.to.c === 1,
  );
  state = applyAction(state, gateAdvance);

  for (const options of [
    { maxDepth: 1, maxActions: 14 },
    { maxDepth: 2, maxActions: 20, quiescenceDepth: 1 },
    { maxDepth: 3, maxActions: 24, maxTacticalActions: 8, quiescenceDepth: 1 },
  ]) {
    const action = chooseAiAction(state, COLORS.BLACK, options);
    expect(action.kind).toBe("move");
    expect(action.mode).toBe("lifeDeathMove");
    expect(action.pieceId).toBe("black-death-a");
    expect(action.to).toEqual({ r: 1, c: 1 });
  }
});

test("AI develops Life and Death pieces forward when no tactic says otherwise", () => {
  const state = createEmptyState(COLORS.BLACK);
  state.turn.standardMoveMade = true;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 2, 2, { id: "death" }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 20,
  });
  expect(action.mode).toBe("lifeDeathMove");
  expect(action.to.r).toBeGreaterThan(2);
});

test("Death kill actions cannot target Kings", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 5, 5, { id: "white-king" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) => action.mode === "kill" && action.targetId === "white-king",
    ),
  ).toBe(false);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 12,
  });
  expect(action.targetId).not.toBe("white-king");
});

test("AI refuses a non-terminal Death kill that hands Death across the ownership line", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 5, 5, {
      id: "loose-rook",
      hasShield: false,
    }),
  );

  const handoffKill = actionMatching(
    state,
    (action) =>
      action.mode === "kill" &&
      action.pieceId === "death" &&
      action.targetId === "loose-rook",
  );
  const afterHandoff = applyAction(state, handoffKill);
  expect(ownerOf(afterHandoff.board[5][5])).toBe(COLORS.WHITE);

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);

  expect(action.id).not.toBe(handoffKill.id);
});

test("AI will not spend Death across the center line for an unshielded pawn", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 5, {
      id: "loose-pawn",
      hasShield: false,
    }),
  );

  const handoffKill = actionMatching(
    state,
    (action) =>
      action.mode === "kill" &&
      action.pieceId === "death" &&
      action.targetId === "loose-pawn",
  );
  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 3,
    maxActions: 36,
    maxTacticalActions: 14,
    quiescenceDepth: 2,
    tacticalWeight: 2.2,
    priorityOverflowLimit: 10,
  });

  expect(action.id).not.toBe(handoffKill.id);
});

test("AI prioritizes a Death kill on valuable material", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 3, 3, { id: "rook" }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 10,
    tacticalWeight: 1,
  });

  expect(action.mode).toBe("kill");
  expect(action.targetId).toBe("rook");
});

test("AI prefers an enemy Queen Death kill over killing its own piece", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 3, 3, { id: "queen" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 5, 5, { id: "own-pawn" }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 10,
    tacticalWeight: 1.9,
  });

  expect(action.mode).toBe("kill");
  expect(action.targetId).toBe("queen");
});

test("AI avoids Death self-kills when a quiet Death move is available", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 3, { id: "own-pawn" }),
  );

  expect(
    generateLegalActions(state).some(
      (action) => action.mode === "kill" && action.targetId === "own-pawn",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 10,
    tacticalWeight: 1.9,
  });

  expect(action.mode === "kill" && action.targetId === "own-pawn").toBe(false);
});

test("AI skips a Life/Death move when every option only causes a bad annihilation trade", () => {
  const state = createEmptyState(COLORS.BLACK);
  state.turn.standardMoveMade = true;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "white-life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 3, {
      id: "blocker-a",
      isImmune: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 5, {
      id: "blocker-b",
      isImmune: true,
    }),
  );

  expect(
    generateLegalActions(state).some(
      (action) =>
        action.pieceId === "death" &&
        action.mode === "lifeDeathMove" &&
        action.to.r === 5,
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 8,
    tacticalWeight: 1.5,
  });

  expect(action.kind).toBe("skip");
});

test("AI Life healing prefers owned shieldless pieces over enemy pieces", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 4, 5, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 4, {
      id: "black-pawn",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 3, 6, {
      id: "white-pawn",
      hasShield: false,
    }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 12,
  });
  expect(action.mode).toBe("heal");
  expect(action.targetId).toBe("black-pawn");
});

test("AI moves Death to build a high-value kill threat", () => {
  const state = createEmptyState(COLORS.BLACK);
  state.turn.standardMoveMade = true;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 2, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.WHITE, 4, 4, { id: "queen" }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 20,
  });
  expect(action.mode).toBe("lifeDeathMove");
  expect(action.to).toEqual({ r: 3, c: 3 });
});

test("AI moves Life toward useful shield repairs", () => {
  const state = createEmptyState(COLORS.BLACK);
  state.turn.standardMoveMade = true;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 2, 3, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 4, 5, {
      id: "rook",
      hasShield: false,
    }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 20,
  });
  expect(action.mode).toBe("lifeDeathMove");
  expect(action.to).toEqual({ r: 3, c: 4 });
});

test("AI preserves quiet retreats for endangered valuable pieces under tight pruning", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 0, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.BLACK, 5, 5, { id: "queen" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 3, 4, {
      id: "white-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 1, { id: "pawn" }),
  );

  expect(
    generateLegalActions(state, COLORS.WHITE, { respectTurn: false }).some(
      (action) => action.targetId === "queen",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 2,
    maxTacticalActions: 3,
    quiescenceDepth: 1,
    tacticalWeight: 1,
  });

  expect(action.pieceId).toBe("queen");
  expect(action.kind).toBe("move");
});

test("Level 5 AI retreats an endangered Queen instead of taking a loose Bishop", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.BLACK, 5, 5, {
      id: "black-queen",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 3, 4, {
      id: "white-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 4, 0, { id: "black-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 4, 8, {
      id: "white-bishop",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 1, { id: "quiet-pawn" }),
  );

  expect(
    generateLegalActions(state, COLORS.WHITE, { respectTurn: false }).some(
      (action) => action.targetId === "black-queen",
    ),
  ).toBe(true);
  const looseBishopCapture = actionMatching(
    state,
    (action) =>
      action.pieceId === "black-rook" &&
      action.kind === "attack" &&
      action.targetId === "white-bishop",
  );

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);
  expect(action.id).not.toBe(looseBishopCapture.id);
  expect(action.pieceId).toBe("black-queen");
  expect(action.kind).toBe("move");

  const after = applyAction(state, action, { recordHistory: false });
  expect(
    generateLegalActions(after, COLORS.WHITE, { respectTurn: false }).some(
      (reply) => reply.targetId === "black-queen",
    ),
  ).toBe(false);
});

test("Level 5 AI captures a Queen attacker instead of taking loose material", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 9, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.BLACK, 5, 5, {
      id: "black-queen",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 2, 3, {
      id: "black-bishop",
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KNIGHT, COLORS.WHITE, 3, 4, {
      id: "white-knight",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 4, 0, { id: "black-rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.WHITE, 4, 8, {
      id: "white-bishop",
      hasShield: false,
    }),
  );

  actionMatching(
    state,
    (action) =>
      action.pieceId === "black-rook" &&
      action.kind === "attack" &&
      action.targetId === "white-bishop",
  );
  actionMatching(
    state,
    (action) =>
      action.pieceId === "black-bishop" &&
      action.kind === "attack" &&
      action.targetId === "white-knight",
  );

  const action = chooseAiAction(state, COLORS.BLACK, LEVEL_5_AI_OPTIONS);
  expect(action.pieceId).toBe("black-bishop");
  expect(action.targetId).toBe("white-knight");

  const after = applyAction(state, action, { recordHistory: false });
  expect(
    generateLegalActions(after, COLORS.WHITE, { respectTurn: false }).some(
      (reply) => reply.targetId === "black-queen",
    ),
  ).toBe(false);
});

test("AI treats Death threats as urgent even against shielded valuable pieces", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 0, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 6, 6, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 5, 5, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 1, { id: "pawn" }),
  );

  expect(
    generateLegalActions(state, COLORS.WHITE, { respectTurn: false }).some(
      (action) => action.mode === "kill" && action.targetId === "rook",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 2,
    maxActions: 2,
    maxTacticalActions: 3,
    quiescenceDepth: 1,
    tacticalWeight: 1,
  });

  expect(action.pieceId).toBe("rook");
  expect(action.kind).toBe("move");
});

test("AI avoids fatal Death pass-through attacks for only a shield break", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 4, 0, {
      id: "rook",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 4, 5, { id: "pawn" }),
  );

  expect(
    generateLegalActions(state).some(
      (candidate) =>
        candidate.pieceId === "rook" &&
        candidate.kind === "attack" &&
        candidate.targetId === "pawn",
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 30,
  });
  expect(
    action.pieceId === "rook" &&
      action.kind === "attack" &&
      action.targetId === "pawn",
  ).toBe(false);
});

test("AI rejects fatal Death staging for a low-value shield break under tight pruning", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.BISHOP, COLORS.BLACK, 0, 1, { id: "bishop" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 1, 2, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 2, 3, { id: "pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, 1, { id: "quiet-pawn" }),
  );

  const fatalShieldBreak = actionMatching(
    state,
    (action) =>
      action.pieceId === "bishop" &&
      action.kind === "attack" &&
      action.targetId === "pawn" &&
      action.deathStaging &&
      action.target.hadShield,
  );
  const afterFatalBreak = applyAction(state, fatalShieldBreak);
  expect(
    afterFatalBreak.board.flat().some((piece) => piece?.id === "bishop"),
  ).toBe(false);
  expect(afterFatalBreak.board[2][3]?.hasShield).toBe(false);

  const action = chooseAiAction(state, COLORS.BLACK, {
    ...LEVEL_5_AI_OPTIONS,
    maxActions: 4,
  });

  expect(action.id).not.toBe(fatalShieldBreak.id);
});

test("AI treats Death landings as fatal even for immune pieces", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 0, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 9, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 4, {
      id: "rook",
      hasShield: false,
      isImmune: true,
      immunityGrantedBy: COLORS.WHITE,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 9, 4, { id: "death" }),
  );

  expect(
    generateLegalActions(state).some(
      (candidate) =>
        candidate.pieceId === "rook" &&
        candidate.kind === "move" &&
        candidate.deathLanding,
    ),
  ).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 1,
  });
  expect(action.deathLanding).not.toBe(true);
});

test("AI values Life pass-through shield gains for shieldless pieces", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 4, 0, {
      id: "rook",
      hasShield: false,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 4, 1, { id: "life" }),
  );

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 30,
  });
  expect(action.pieceId).toBe("rook");
  expect(action.path?.some((square) => square.r === 4 && square.c === 1)).toBe(
    true,
  );
});

test("AI does not overvalue a shield break with exposed high-value material", () => {
  const state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.QUEEN, COLORS.BLACK, 5, 0, { id: "queen" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 5, 5, { id: "pawn" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 4, 4, {
      id: "rook",
      hasShield: false,
    }),
  );

  const badShieldBreakExists = generateLegalActions(state).some(
    (candidate) =>
      candidate.pieceId === "queen" &&
      candidate.kind === "attack" &&
      candidate.targetId === "pawn",
  );
  expect(badShieldBreakExists).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 3,
    maxActions: 30,
  });
  expect(
    action.pieceId === "queen" &&
      action.kind === "attack" &&
      action.targetId === "pawn",
  ).toBe(false);
});

test("AI strength levels return legal actions without mutating the search state", () => {
  let state = createGameState();
  const whiteAdvance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-4" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 5,
  );
  state = applyAction(state, whiteAdvance);
  if (canSkipSpecialMove(state, COLORS.WHITE)) {
    state = skipSpecialMove(state, COLORS.WHITE);
  }
  const before = JSON.stringify(state);

  for (const options of [
    { maxDepth: 1, maxActions: 16 },
    { maxDepth: 2, maxActions: 22 },
    { maxDepth: 4, maxActions: 30, timeLimitMs: 180 },
  ]) {
    const action = chooseAiAction(state, COLORS.BLACK, options);
    expect(action).toBeTruthy();
    expect(
      generateLegalActions(state).some(
        (candidate) => candidate.id === action.id,
      ),
    ).toBe(true);
  }
  expect(JSON.stringify(state)).toBe(before);
});

test("search-only action application skips UI action-history cloning", () => {
  const state = createGameState();
  state.actionHistory = [
    { kind: "skip", mode: "skipSpecial", color: COLORS.BLACK },
  ];
  state.lastAction = state.actionHistory[0];

  const advance = actionMatching(
    state,
    (action) =>
      action.pieceId === "white-pawn-0" &&
      action.mode === "pawnAdvance" &&
      action.to.r === 7,
  );
  const next = applyAction(state, advance, { recordHistory: false });

  expect(next.board[7][0]?.id).toBe("white-pawn-0");
  expect(next.actionHistory).toEqual([]);
  expect(next.lastAction).toBe(null);
  expect(state.actionHistory).toHaveLength(1);
});

test("state records the full session action history for the UI move log", () => {
  let state = createGameState();
  for (let i = 0; i < 24; i++) {
    const action =
      generateLegalActions(state).find(
        (candidate) => candidate.consumes?.standard,
      ) ?? generateLegalActions(state)[0];
    expect(action).toBeTruthy();
    state = applyAction(state, action);
    if (canSkipSpecialMove(state, state.currentPlayer)) {
      state = skipSpecialMove(state, state.currentPlayer);
    }
    if (state.gameOver) break;
  }

  expect(state.actionHistory.length).toBeGreaterThan(20);
  expect(state.actionHistory[0].color).toBe(COLORS.WHITE);
  expect(state.actionHistory.at(-1).color).toBeTruthy();
});

test("players can skip a remaining special move after using a standard move", () => {
  let state = createEmptyState(COLORS.WHITE);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.WHITE, 9, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 5, 4, { id: "life" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );

  const rookMove = actionMatching(
    state,
    (action) => action.pieceId === "rook" && action.kind === "move",
  );
  state = applyAction(state, rookMove);

  expect(canSkipSpecialMove(state, COLORS.WHITE)).toBe(true);
  state = skipSpecialMove(state, COLORS.WHITE);
  expect(state.currentPlayer).toBe(COLORS.BLACK);
  expect(state.lastAction.mode).toBe("skipSpecial");
});

test("skip special is generated as a legal action after the standard slot is used", () => {
  let state = createEmptyState(COLORS.BLACK);
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.ROOK, COLORS.BLACK, 0, 1, { id: "rook" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );

  const rookMove = actionMatching(
    state,
    (action) => action.pieceId === "rook" && action.kind === "move",
  );
  state = applyAction(state, rookMove);

  expect(
    generateLegalActions(state).some((action) => action.kind === "skip"),
  ).toBe(true);
  expect(canSkipSpecialMove(state, COLORS.BLACK)).toBe(true);
});

test("AI can skip a remaining special move instead of making a bad Life/Death move", () => {
  const state = createEmptyState(COLORS.BLACK);
  state.turn.standardMoveMade = true;
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.BLACK, 0, 5, { id: "black-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.KING, COLORS.WHITE, 9, 5, { id: "white-king" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 4, 4, { id: "death" }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 3, {
      id: "blocker-a",
      isImmune: true,
    }),
  );
  placePiece(
    state.board,
    createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 3, 5, {
      id: "blocker-b",
      isImmune: true,
    }),
  );

  expect(canSkipSpecialMove(state, COLORS.BLACK)).toBe(true);

  const action = chooseAiAction(state, COLORS.BLACK, {
    maxDepth: 1,
    maxActions: 8,
    tacticalWeight: 1,
  });

  expect(action.kind).toBe("skip");
});

test("no-move positions resolve to a draw instead of looping forever", () => {
  const state = normalizeTurn(createEmptyState(COLORS.WHITE));
  expect(state.gameOver?.winner).toBe(null);
  expect(state.gameOver?.reason).toContain("No legal moves");
});
