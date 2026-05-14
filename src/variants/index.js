import { COLORS, PIECE_TYPES } from "../engine/constants.js";

export const VARIANT_IDS = Object.freeze({
  CHESS_TWO: "chess-two",
  TOAD_FOOL: "toad-fool",
  TOAD_FOOL_CLASSIC: "toad-fool-classic",
  FRAME_CHESS: "frame-chess",
  FRAME_CHESS_WITHOUT_LD: "frame-chess-without-ld",
});

export const CHECK_PATTERNS = Object.freeze({
  STANDARD: "standard",
  INVERTED: "inverted",
});

export const PAWN_BEHAVIORS = Object.freeze({
  CHESS_TWO: "chessTwo",
  FRONTAL_FAN: "frontalFan",
  FRONTAL_FAN_2: "frontalFan2",
});

const LEGACY_PAWN_BEHAVIOR_ALIASES = Object.freeze({
  forwardFan: PAWN_BEHAVIORS.FRONTAL_FAN,
});

export const KNIGHT_MOVEMENTS = Object.freeze({
  RAMP: "ramp",
  ORTHODOX: "orthodox",
});

export const PAWN_INITIAL_MAX_STEPS = Object.freeze([2, 3]);

export const DEFAULT_ENGINE_VARIANT_ID = VARIANT_IDS.CHESS_TWO;
export const DEFAULT_UI_VARIANT_ID = VARIANT_IDS.FRAME_CHESS;

const visualRules = (...flippedPieceIds) =>
  Object.freeze({
    flippedPieceIds: Object.freeze(flippedPieceIds),
  });

const CHESS_TWO_VISUAL_RULES = visualRules(
  "black-knight-2",
  "black-bishop-3",
  "white-knight-2",
  "white-bishop-3",
);
const TOAD_FOOL_VISUAL_RULES = visualRules(
  "black-bishop-2",
  "white-knight-2",
);
const FRAME_CHESS_VISUAL_RULES = visualRules(
  "frame-black-bishop-3",
  "frame-white-knight-3",
);
const TOAD_FOOL_CLASSIC_VISUAL_RULES = visualRules(
  "classic-black-bishop-2",
  "classic-white-knight-2",
);

const CHESS_TWO_SETUP = [
  [0, 0, PIECE_TYPES.DEATH, COLORS.BLACK, "black-death-a"],
  [0, 1, PIECE_TYPES.ROOK, COLORS.BLACK, "black-rook-1"],
  [0, 2, PIECE_TYPES.KNIGHT, COLORS.BLACK, "black-knight-2"],
  [0, 3, PIECE_TYPES.BISHOP, COLORS.BLACK, "black-bishop-3"],
  [0, 4, PIECE_TYPES.QUEEN, COLORS.BLACK, "black-queen-4"],
  [0, 5, PIECE_TYPES.KING, COLORS.BLACK, "black-king-5"],
  [0, 6, PIECE_TYPES.BISHOP, COLORS.BLACK, "black-bishop-6"],
  [0, 7, PIECE_TYPES.KNIGHT, COLORS.BLACK, "black-knight-7"],
  [0, 8, PIECE_TYPES.ROOK, COLORS.BLACK, "black-rook-8"],
  [0, 9, PIECE_TYPES.LIFE, COLORS.BLACK, "black-life-j"],
  ...Array.from({ length: 10 }, (_, col) => [
    1,
    col,
    PIECE_TYPES.PAWN,
    COLORS.BLACK,
    `black-pawn-${col}`,
  ]),
  ...Array.from({ length: 10 }, (_, col) => [
    8,
    col,
    PIECE_TYPES.PAWN,
    COLORS.WHITE,
    `white-pawn-${col}`,
  ]),
  [9, 0, PIECE_TYPES.LIFE, COLORS.WHITE, "white-life-a"],
  [9, 1, PIECE_TYPES.ROOK, COLORS.WHITE, "white-rook-1"],
  [9, 2, PIECE_TYPES.KNIGHT, COLORS.WHITE, "white-knight-2"],
  [9, 3, PIECE_TYPES.BISHOP, COLORS.WHITE, "white-bishop-3"],
  [9, 4, PIECE_TYPES.QUEEN, COLORS.WHITE, "white-queen-4"],
  [9, 5, PIECE_TYPES.KING, COLORS.WHITE, "white-king-5"],
  [9, 6, PIECE_TYPES.BISHOP, COLORS.WHITE, "white-bishop-6"],
  [9, 7, PIECE_TYPES.KNIGHT, COLORS.WHITE, "white-knight-7"],
  [9, 8, PIECE_TYPES.ROOK, COLORS.WHITE, "white-rook-8"],
  [9, 9, PIECE_TYPES.DEATH, COLORS.WHITE, "white-death-j"],
];

const TOAD_FOOL_SETUP = [
  [0, 0, PIECE_TYPES.LIFE, COLORS.BLACK, "black-life-a"],
  [0, 9, PIECE_TYPES.DEATH, COLORS.BLACK, "black-death-j"],
  [1, 1, PIECE_TYPES.ROOK, COLORS.BLACK, "black-rook-1"],
  [1, 2, PIECE_TYPES.BISHOP, COLORS.BLACK, "black-bishop-2"],
  [1, 3, PIECE_TYPES.TOAD, COLORS.BLACK, "black-toad-3"],
  [1, 4, PIECE_TYPES.QUEEN, COLORS.BLACK, "black-queen-4"],
  [1, 5, PIECE_TYPES.KING, COLORS.BLACK, "black-king-5"],
  [1, 6, PIECE_TYPES.FOOL, COLORS.BLACK, "black-fool-6"],
  [1, 7, PIECE_TYPES.KNIGHT, COLORS.BLACK, "black-knight-7"],
  [1, 8, PIECE_TYPES.ROOK, COLORS.BLACK, "black-rook-8"],
  ...Array.from({ length: 10 }, (_, col) => [
    2,
    col,
    PIECE_TYPES.PAWN,
    COLORS.BLACK,
    `black-pawn-${col}`,
  ]),
  ...Array.from({ length: 10 }, (_, col) => [
    7,
    col,
    PIECE_TYPES.PAWN,
    COLORS.WHITE,
    `white-pawn-${col}`,
  ]),
  [8, 1, PIECE_TYPES.ROOK, COLORS.WHITE, "white-rook-1"],
  [8, 2, PIECE_TYPES.KNIGHT, COLORS.WHITE, "white-knight-2"],
  [8, 3, PIECE_TYPES.TOAD, COLORS.WHITE, "white-toad-3"],
  [8, 4, PIECE_TYPES.QUEEN, COLORS.WHITE, "white-queen-4"],
  [8, 5, PIECE_TYPES.KING, COLORS.WHITE, "white-king-5"],
  [8, 6, PIECE_TYPES.FOOL, COLORS.WHITE, "white-fool-6"],
  [8, 7, PIECE_TYPES.BISHOP, COLORS.WHITE, "white-bishop-7"],
  [8, 8, PIECE_TYPES.ROOK, COLORS.WHITE, "white-rook-8"],
  [9, 0, PIECE_TYPES.DEATH, COLORS.WHITE, "white-death-a"],
  [9, 9, PIECE_TYPES.LIFE, COLORS.WHITE, "white-life-j"],
];

const LEGACY_FRAME_CHESS_SETUP = TOAD_FOOL_SETUP.filter(
  ([, col, type]) =>
    !(type === PIECE_TYPES.PAWN && (col === 0 || col === 9)),
);

const FRAME_CHESS_SETUP = [
  [0, 0, PIECE_TYPES.DEATH, COLORS.BLACK, "frame-black-death-a"],
  [0, 4, PIECE_TYPES.QUEEN, COLORS.BLACK, "frame-black-queen-4"],
  [0, 5, PIECE_TYPES.KING, COLORS.BLACK, "frame-black-king-5"],
  [0, 9, PIECE_TYPES.LIFE, COLORS.BLACK, "frame-black-life-j"],
  [1, 2, PIECE_TYPES.ROOK, COLORS.BLACK, "frame-black-rook-2"],
  [1, 3, PIECE_TYPES.BISHOP, COLORS.BLACK, "frame-black-bishop-3"],
  [1, 4, PIECE_TYPES.TOAD, COLORS.BLACK, "frame-black-toad-4"],
  [1, 5, PIECE_TYPES.FOOL, COLORS.BLACK, "frame-black-fool-5"],
  [1, 6, PIECE_TYPES.KNIGHT, COLORS.BLACK, "frame-black-knight-6"],
  [1, 7, PIECE_TYPES.ROOK, COLORS.BLACK, "frame-black-rook-7"],
  ...Array.from({ length: 8 }, (_, index) => [
    2,
    index + 1,
    PIECE_TYPES.PAWN,
    COLORS.BLACK,
    `frame-black-pawn-${index + 1}`,
  ]),
  ...Array.from({ length: 8 }, (_, index) => [
    7,
    index + 1,
    PIECE_TYPES.PAWN,
    COLORS.WHITE,
    `frame-white-pawn-${index + 1}`,
  ]),
  [8, 2, PIECE_TYPES.ROOK, COLORS.WHITE, "frame-white-rook-2"],
  [8, 3, PIECE_TYPES.KNIGHT, COLORS.WHITE, "frame-white-knight-3"],
  [8, 4, PIECE_TYPES.TOAD, COLORS.WHITE, "frame-white-toad-4"],
  [8, 5, PIECE_TYPES.FOOL, COLORS.WHITE, "frame-white-fool-5"],
  [8, 6, PIECE_TYPES.BISHOP, COLORS.WHITE, "frame-white-bishop-6"],
  [8, 7, PIECE_TYPES.ROOK, COLORS.WHITE, "frame-white-rook-7"],
  [9, 0, PIECE_TYPES.LIFE, COLORS.WHITE, "frame-white-life-a"],
  [9, 4, PIECE_TYPES.QUEEN, COLORS.WHITE, "frame-white-queen-4"],
  [9, 5, PIECE_TYPES.KING, COLORS.WHITE, "frame-white-king-5"],
  [9, 9, PIECE_TYPES.DEATH, COLORS.WHITE, "frame-white-death-j"],
];

const FRAME_CHESS_WITHOUT_LD_SETUP = LEGACY_FRAME_CHESS_SETUP.filter(
  ([, , type]) => type !== PIECE_TYPES.LIFE && type !== PIECE_TYPES.DEATH,
);

const TOAD_FOOL_CLASSIC_SETUP = [
  [0, 0, PIECE_TYPES.DEATH, COLORS.BLACK, "classic-black-death-a"],
  [0, 1, PIECE_TYPES.ROOK, COLORS.BLACK, "classic-black-rook-1"],
  [0, 2, PIECE_TYPES.BISHOP, COLORS.BLACK, "classic-black-bishop-2"],
  [0, 3, PIECE_TYPES.TOAD, COLORS.BLACK, "classic-black-toad-3"],
  [0, 4, PIECE_TYPES.QUEEN, COLORS.BLACK, "classic-black-queen-4"],
  [0, 5, PIECE_TYPES.KING, COLORS.BLACK, "classic-black-king-5"],
  [0, 6, PIECE_TYPES.FOOL, COLORS.BLACK, "classic-black-fool-6"],
  [0, 7, PIECE_TYPES.KNIGHT, COLORS.BLACK, "classic-black-knight-7"],
  [0, 8, PIECE_TYPES.ROOK, COLORS.BLACK, "classic-black-rook-8"],
  [0, 9, PIECE_TYPES.LIFE, COLORS.BLACK, "classic-black-life-j"],
  ...Array.from({ length: 10 }, (_, col) => [
    1,
    col,
    PIECE_TYPES.PAWN,
    COLORS.BLACK,
    `classic-black-pawn-${col}`,
  ]),
  ...Array.from({ length: 10 }, (_, col) => [
    8,
    col,
    PIECE_TYPES.PAWN,
    COLORS.WHITE,
    `classic-white-pawn-${col}`,
  ]),
  [9, 0, PIECE_TYPES.LIFE, COLORS.WHITE, "classic-white-life-a"],
  [9, 1, PIECE_TYPES.ROOK, COLORS.WHITE, "classic-white-rook-1"],
  [9, 2, PIECE_TYPES.KNIGHT, COLORS.WHITE, "classic-white-knight-2"],
  [9, 3, PIECE_TYPES.TOAD, COLORS.WHITE, "classic-white-toad-3"],
  [9, 4, PIECE_TYPES.QUEEN, COLORS.WHITE, "classic-white-queen-4"],
  [9, 5, PIECE_TYPES.KING, COLORS.WHITE, "classic-white-king-5"],
  [9, 6, PIECE_TYPES.FOOL, COLORS.WHITE, "classic-white-fool-6"],
  [9, 7, PIECE_TYPES.BISHOP, COLORS.WHITE, "classic-white-bishop-7"],
  [9, 8, PIECE_TYPES.ROOK, COLORS.WHITE, "classic-white-rook-8"],
  [9, 9, PIECE_TYPES.DEATH, COLORS.WHITE, "classic-white-death-j"],
];

export const VARIANTS = Object.freeze({
  [VARIANT_IDS.CHESS_TWO]: Object.freeze({
    id: VARIANT_IDS.CHESS_TWO,
    name: "Chess Two",
    description: "Canonical Shield and Scythe rules from RULES.md.",
    setup: CHESS_TWO_SETUP,
    defaultRuleOverrides: Object.freeze({
      checkPattern: CHECK_PATTERNS.STANDARD,
      pawnBehavior: PAWN_BEHAVIORS.CHESS_TWO,
      pawnInitialMaxStep: 3,
      knightMovement: KNIGHT_MOVEMENTS.RAMP,
      shieldsEnabled: true,
      frameEnabled: false,
      wraparoundEnabled: false,
      checkmateEnabled: true,
    }),
    visualRules: CHESS_TWO_VISUAL_RULES,
  }),
  [VARIANT_IDS.TOAD_FOOL]: Object.freeze({
    id: VARIANT_IDS.TOAD_FOOL,
    name: "Toad-Fool Chess",
    description:
      "Experimental delta with Toad, Fool, Frontal Fan pawns, and orthodox Knights.",
    setup: TOAD_FOOL_SETUP,
    defaultRuleOverrides: Object.freeze({
      checkPattern: CHECK_PATTERNS.INVERTED,
      pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN,
      pawnInitialMaxStep: 2,
      knightMovement: KNIGHT_MOVEMENTS.ORTHODOX,
      shieldsEnabled: true,
      frameEnabled: false,
      wraparoundEnabled: false,
      checkmateEnabled: true,
    }),
    visualRules: TOAD_FOOL_VISUAL_RULES,
  }),
  [VARIANT_IDS.FRAME_CHESS]: Object.freeze({
    id: VARIANT_IDS.FRAME_CHESS,
    name: "Frame Chess",
    description:
      "Toad-Fool delta with shieldless attackless frame squares and horizontal wrap-around.",
    setup: FRAME_CHESS_SETUP,
    defaultRuleOverrides: Object.freeze({
      checkPattern: CHECK_PATTERNS.STANDARD,
      pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN,
      pawnInitialMaxStep: 2,
      knightMovement: KNIGHT_MOVEMENTS.ORTHODOX,
      shieldsEnabled: true,
      frameEnabled: true,
      wraparoundEnabled: true,
      checkmateEnabled: true,
    }),
    visualRules: FRAME_CHESS_VISUAL_RULES,
  }),
  [VARIANT_IDS.FRAME_CHESS_WITHOUT_LD]: Object.freeze({
    id: VARIANT_IDS.FRAME_CHESS_WITHOUT_LD,
    name: "Frame Chess w/o LD",
    description:
      "Old Frame Chess layout with the same frame and wrap rules but no Life or Death pieces.",
    setup: FRAME_CHESS_WITHOUT_LD_SETUP,
    defaultRuleOverrides: Object.freeze({
      checkPattern: CHECK_PATTERNS.INVERTED,
      pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN,
      pawnInitialMaxStep: 2,
      knightMovement: KNIGHT_MOVEMENTS.ORTHODOX,
      shieldsEnabled: true,
      frameEnabled: true,
      wraparoundEnabled: true,
      checkmateEnabled: true,
    }),
    visualRules: TOAD_FOOL_VISUAL_RULES,
  }),
  [VARIANT_IDS.TOAD_FOOL_CLASSIC]: Object.freeze({
    id: VARIANT_IDS.TOAD_FOOL_CLASSIC,
    name: "Toad-Fool Classic",
    description:
      "Toad-Fool rules on a denser Chess Two-like back rank and home-rank pawns.",
    setup: TOAD_FOOL_CLASSIC_SETUP,
    defaultRuleOverrides: Object.freeze({
      checkPattern: CHECK_PATTERNS.STANDARD,
      pawnBehavior: PAWN_BEHAVIORS.FRONTAL_FAN,
      pawnInitialMaxStep: 2,
      knightMovement: KNIGHT_MOVEMENTS.ORTHODOX,
      shieldsEnabled: true,
      frameEnabled: false,
      wraparoundEnabled: false,
      checkmateEnabled: true,
    }),
    visualRules: TOAD_FOOL_CLASSIC_VISUAL_RULES,
  }),
});

const VARIANT_OPTION_ORDER = Object.freeze([
  VARIANT_IDS.FRAME_CHESS,
  VARIANT_IDS.FRAME_CHESS_WITHOUT_LD,
  VARIANT_IDS.TOAD_FOOL,
  VARIANT_IDS.TOAD_FOOL_CLASSIC,
  VARIANT_IDS.CHESS_TWO,
]);

export function getVariant(variantId = DEFAULT_ENGINE_VARIANT_ID) {
  return VARIANTS[variantId] ?? VARIANTS[DEFAULT_ENGINE_VARIANT_ID];
}

export function normalizeVariantId(variantId) {
  return VARIANTS[variantId] ? variantId : DEFAULT_ENGINE_VARIANT_ID;
}

export function normalizeRuleOverrides(variantId, overrides = {}) {
  const defaults = getVariant(variantId).defaultRuleOverrides;
  const pawnBehavior =
    LEGACY_PAWN_BEHAVIOR_ALIASES[overrides?.pawnBehavior] ??
    overrides?.pawnBehavior;
  const pawnInitialMaxStep = Number(overrides?.pawnInitialMaxStep);
  return {
    checkPattern: Object.values(CHECK_PATTERNS).includes(
      overrides?.checkPattern,
    )
      ? overrides.checkPattern
      : defaults.checkPattern,
    pawnBehavior: Object.values(PAWN_BEHAVIORS).includes(pawnBehavior)
      ? pawnBehavior
      : defaults.pawnBehavior,
    pawnInitialMaxStep: PAWN_INITIAL_MAX_STEPS.includes(pawnInitialMaxStep)
      ? pawnInitialMaxStep
      : defaults.pawnInitialMaxStep,
    knightMovement: Object.values(KNIGHT_MOVEMENTS).includes(
      overrides?.knightMovement,
    )
      ? overrides.knightMovement
      : defaults.knightMovement,
    shieldsEnabled:
      typeof overrides?.shieldsEnabled === "boolean"
        ? overrides.shieldsEnabled
        : defaults.shieldsEnabled,
    frameEnabled:
      typeof overrides?.frameEnabled === "boolean"
        ? overrides.frameEnabled
        : defaults.frameEnabled,
    wraparoundEnabled:
      typeof overrides?.wraparoundEnabled === "boolean"
        ? overrides.wraparoundEnabled
        : defaults.wraparoundEnabled,
    checkmateEnabled:
      typeof overrides?.checkmateEnabled === "boolean"
        ? overrides.checkmateEnabled
        : defaults.checkmateEnabled,
  };
}

export function variantOptions() {
  return VARIANT_OPTION_ORDER.map((id) => {
    const variant = VARIANTS[id];
    return { id: variant.id, name: variant.name };
  });
}
