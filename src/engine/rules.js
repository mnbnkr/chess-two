import {
  BOARD_SIZE,
  COLORS,
  LIFE_DEATH_PIECES,
  MATERIAL_VALUES,
  PIECE_TYPES,
  PROMOTION_TYPES,
  STANDARD_PIECES,
  canHaveShield,
  isFrameSquare,
  isPromotionRank,
  oppositeColor,
} from "./constants.js";
import {
  allPieces,
  checkmateEnabledForState,
  cloneState,
  createInitialState,
  findPieceById,
  getPiece,
  isDarkSquareForState,
  isLightSquareForState,
  isValidSquare,
  movePiece,
  normalizeFrameShields,
  ownerOf,
  removePiece,
  ruleOverridesForState,
  setPiece,
  shieldsEnabledForState,
  syncFrameShieldForSquare,
} from "./state.js";
import {
  KNIGHT_MOVEMENTS,
  PAWN_BEHAVIORS,
} from "../variants/index.js";

const ROOK_DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT_DELTAS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

export function createGameState(options = {}) {
  const state = createInitialState(options);
  updateIntimidation(state);
  normalizeTurn(state);
  return state;
}

export function squareKey(square) {
  return `${square.r},${square.c}`;
}

export function actionKey(action) {
  const bits = [
    action.kind,
    action.mode,
    action.pieceId,
    action.targetId ?? "",
    action.from ? squareKey(action.from) : "",
    action.to ? squareKey(action.to) : "",
    action.staging ? squareKey(action.staging) : "",
    action.rest ? squareKey(action.rest) : "",
    action.promotionType ?? "",
    action.profileType ?? "",
    action.recoil ? "recoil" : "",
    action.rookId ?? "",
    action.deathLanding ? "deathLanding" : "",
    rampSequenceKey(action.rampSequence),
    shieldStripKey(action.shieldStrips),
    pathKey(action.path),
  ];
  return bits.join("|");
}

function withActionId(action) {
  action.id = actionKey(action);
  return action;
}

export function generateLegalActions(
  state,
  color = state.currentPlayer,
  options = {},
) {
  const respectTurn = options.respectTurn ?? true;
  const respectCheck = options.respectCheck ?? true;
  if (state.gameOver) return [];
  if (respectTurn && color !== state.currentPlayer) return [];

  const actions = [];
  for (const piece of allPieces(state)) {
    if (ownerOf(piece) !== color) continue;
    actions.push(...generatePieceActions(state, piece, { respectTurn }));
  }
  const legalActions = respectCheck
    ? filterCheckLegalActions(state, color, actions)
    : actions;
  if (
    respectTurn &&
    options.includeSkip !== false &&
    canSkipSpecialMoveFromActions(state, color, legalActions)
  ) {
    legalActions.push(buildSkipSpecialAction(state, color));
  }
  return sortActions(legalActions);
}

export function generatePieceActions(state, piece, options = {}) {
  const respectTurn = options.respectTurn ?? true;
  const actions = [];
  const isStandard = STANDARD_PIECES.has(piece.type);
  const isLifeDeath = LIFE_DEATH_PIECES.has(piece.type);

  const canUseStandard = !respectTurn || !state.turn.standardMoveMade;
  const canUseSpecial = !respectTurn || !state.turn.specialMoveMade;

  if (isStandard && canUseStandard) {
    actions.push(...generateStandardMoves(state, piece));
    actions.push(...generateStandardAttacks(state, piece));
    if (piece.type === PIECE_TYPES.KING) {
      actions.push(...generateCastles(state, piece));
    }
  }

  if (isLifeDeath && canUseSpecial) {
    actions.push(...generateLifeDeathMoves(state, piece));
  }

  if (isLifeDeath && canUseStandard && canUseSpecial) {
    actions.push(...generateLifeDeathSpecialActions(state, piece));
  }

  return sortActions(actions);
}

export function getActionsForPiece(state, pieceId) {
  const piece = findPieceById(state, pieceId);
  if (!piece || ownerOf(piece) !== state.currentPlayer) return [];
  const legalIds = new Set(
    generateLegalActions(state).map((action) => action.id),
  );
  return generatePieceActions(state, piece).filter((action) =>
    legalIds.has(action.id),
  );
}

export function canSkipSpecialMove(state, color = state.currentPlayer) {
  return canSkipSpecialMoveFromActions(
    state,
    color,
    generateLegalActions(state, color, { includeSkip: false }),
  );
}

export function skipSpecialMove(state, color = state.currentPlayer) {
  const next = cloneState(state);
  if (!canSkipSpecialMove(next, color)) return next;
  const action = buildSkipSpecialAction(next, color);
  next.turn.specialMoveMade = true;
  next.lastAction = action;
  recordAction(next, next.lastAction);
  normalizeTurn(next);
  return next;
}

function buildSkipSpecialAction(state, color) {
  return {
    id: `skip-special|${color}|${state.moveNumber}`,
    kind: "skip",
    mode: "skipSpecial",
    color,
    consumes: { standard: false, special: true },
  };
}

function canSkipSpecialMoveFromActions(state, color, actions) {
  if (state.gameOver || state.currentPlayer !== color) return false;
  if (usesCheckmate(state) && isKingInCheck(state, color)) return false;
  if (!state.turn.standardMoveMade || state.turn.specialMoveMade) return false;
  return actions.some((action) => action.consumes?.special);
}

function pawnBehavior(state) {
  return ruleOverridesForState(state).pawnBehavior;
}

function knightMovement(state) {
  return ruleOverridesForState(state).knightMovement;
}

function pawnInitialMaxStep(state) {
  return ruleOverridesForState(state).pawnInitialMaxStep;
}

function usesFrontalFanMoves(state) {
  return [
    PAWN_BEHAVIORS.FRONTAL_FAN,
    PAWN_BEHAVIORS.FRONTAL_FAN_2,
  ].includes(pawnBehavior(state));
}

function usesFrontalFan2Pawns(state) {
  return pawnBehavior(state) === PAWN_BEHAVIORS.FRONTAL_FAN_2;
}

function usesOrthodoxKnightMoves(state) {
  return knightMovement(state) === KNIGHT_MOVEMENTS.ORTHODOX;
}

function usesFrame(state) {
  if (typeof state?.ruleOverrides?.frameEnabled === "boolean")
    return state.ruleOverrides.frameEnabled;
  return ruleOverridesForState(state).frameEnabled;
}

function usesWraparound(state) {
  if (typeof state?.ruleOverrides?.wraparoundEnabled === "boolean")
    return state.ruleOverrides.wraparoundEnabled;
  return ruleOverridesForState(state).wraparoundEnabled;
}

function usesCheckmate(state) {
  if (typeof state?.ruleOverrides?.checkmateEnabled === "boolean")
    return state.ruleOverrides.checkmateEnabled;
  return checkmateEnabledForState(state);
}

function filterCheckLegalActions(state, color, actions) {
  if (!usesCheckmate(state)) return actions;
  const inCheck = isKingInCheck(state, color);
  if (inCheck && !hasLegalCheckEvasionSequence(state, color, actions))
    return [];
  return actions.filter((action) =>
    isActionLegalRegardingCheck(state, color, action, inCheck),
  );
}

function isActionLegalRegardingCheck(state, color, action, inCheck) {
  if (action.target?.type === PIECE_TYPES.KING && usesCheckmate(state))
    return false;

  if (inCheck) {
    if (isPreparatoryLifeDeathMove(state, action))
      return preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action);
    if (action.mode === "castle") return false;
    if (!isStandardCheckEvasionAction(action)) return false;
    return !actionLeavesKingInCheck(state, action, color);
  }

  if (action.mode === "castle" && castlingCrossesCheck(state, action, color))
    return false;
  if (action.consumes?.standard)
    return !actionLeavesKingInCheck(state, action, color);
  if (action.consumes?.special && state.turn.standardMoveMade)
    return !actionLeavesKingInCheck(state, action, color);
  return true;
}

function actionLeavesKingInCheck(state, action, color) {
  const next = applyAction(state, action, {
    recordHistory: false,
    normalize: false,
  });
  return isKingInCheck(next, color);
}

function castlingCrossesCheck(state, action, color) {
  if (action.mode !== "castle") return false;
  const king = findPieceById(state, action.pieceId);
  if (!king) return true;
  const direction = Math.sign(action.to.c - action.from.c);
  const kingPath = [
    { r: action.from.r, c: action.from.c },
    { r: action.from.r, c: action.from.c + direction },
    { r: action.to.r, c: action.to.c },
  ];
  return kingPath.some((square) => isKingInCheckAt(state, king, square));
}

function isKingInCheckAt(state, king, square) {
  const probe = cloneState(state, { preserveHistory: false });
  const probeKing = findPieceById(probe, king.id);
  if (!probeKing) return true;
  setPiece(probe.board, probeKing.row, probeKing.col, null);
  setPiece(probe.board, square.r, square.c, probeKing);
  return isKingInCheck(probe, king.color);
}

function generateStandardMoves(state, piece) {
  if (piece.type === PIECE_TYPES.FOOL) return generateFoolMoves(state, piece);
  return generateProfileMoves(state, piece, piece.type);
}

function generateProfileMoves(state, piece, profileType) {
  switch (profileType) {
    case PIECE_TYPES.PAWN:
      return generatePawnMoves(state, piece);
    case PIECE_TYPES.ROOK:
      return generateSlidingMoves(state, piece, ROOK_DIRS);
    case PIECE_TYPES.BISHOP:
      return generateSlidingMoves(state, piece, BISHOP_DIRS);
    case PIECE_TYPES.QUEEN:
      return generateSlidingMoves(state, piece, [...ROOK_DIRS, ...BISHOP_DIRS]);
    case PIECE_TYPES.KING:
      return generateKingMoves(state, piece);
    case PIECE_TYPES.KNIGHT:
      return generateKnightMoves(state, piece);
    case PIECE_TYPES.TOAD:
      return generateToadMoves(state, piece);
    default:
      return [];
  }
}

function generatePawnMoves(state, piece) {
  if (usesFrontalFanMoves(state))
    return generateFrontalFanPawnMoves(state, piece);
  return generateChessTwoPawnMoves(state, piece);
}

function generateChessTwoPawnMoves(state, piece) {
  const actions = [];
  const dir = pawnDirection(piece);
  const startRow = piece.color === COLORS.WHITE ? 8 : 1;
  const continuationRow = piece.color === COLORS.WHITE ? 7 : 2;
  const maxStep = !piece.hasMoved
    ? pawnInitialMaxStep(state)
    : piece.row === continuationRow
      ? 2
      : 1;

  for (let step = 1; step <= maxStep; step++) {
    const to = { r: piece.row + dir * step, c: piece.col };
    if (!isValidSquare(to.r, to.c)) continue;
    const occupant = getPiece(state.board, to.r, to.c);
    const deathLanding = occupant?.type === PIECE_TYPES.DEATH;
    if (occupant && !deathLanding) continue;
    if (step === 3 && piece.row !== startRow) continue;
    if (!isPawnForwardPathPassable(state, piece, step)) continue;
    const action = {
      kind: "move",
      mode: "pawnAdvance",
      pieceId: piece.id,
      pieceType: piece.type,
      from: { r: piece.row, c: piece.col },
      to,
      path: pawnPath(state, piece, step),
      deathLanding,
      consumes: { standard: true, special: false },
      enPassantOpportunity:
        !deathLanding && step > 1
          ? {
              from: { r: piece.row, c: piece.col },
              to,
              crossed: pawnPath(state, piece, step),
              eligibleColor: oppositeColor(piece.color),
            }
          : null,
    };
    actions.push(
      ...(deathLanding ? [action] : promotionVariants(state, piece, action)),
    );
  }

  const jumpTo = { r: piece.row + dir * 2, c: piece.col };
  const jumped = getPiece(state.board, piece.row + dir, piece.col);
  if (
    jumped &&
    LIFE_DEATH_PIECES.has(jumped.type) &&
    isValidSquare(jumpTo.r, jumpTo.c) &&
    !getPiece(state.board, jumpTo.r, jumpTo.c)
  ) {
    actions.push(
      ...promotionVariants(state, piece, {
        kind: "move",
        mode: "pawnLifeDeathJump",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to: jumpTo,
        jumpedPieceId: jumped.id,
        path: [{ r: jumped.row, c: jumped.col }],
        consumes: { standard: true, special: false },
      }),
    );
  }

  return actions.map(withActionId);
}

function generateFrontalFanPawnMoves(state, piece) {
  const actions = [];
  const maxStep = frontalFanPawnMaxStep(state, piece);

  for (const dc of [-1, 0, 1]) {
    for (let step = 1; step <= maxStep; step++) {
      if (
        dc !== 0 &&
        step > 1 &&
        isFrontalFanDiagonalLeapBlocked(state, piece)
      )
        continue;
      const to = pawnLaneSquare(state, piece, step, dc);
      if (!to) continue;
      const occupant = getPiece(state.board, to.r, to.c);
      const deathLanding = occupant?.type === PIECE_TYPES.DEATH;
      if (occupant && !deathLanding) continue;
      const path = pawnLanePath(state, piece, step, dc);
      if (!isPawnLanePathClear(state, path)) continue;
      const action = {
        kind: "move",
        mode: "pawnAdvance",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to,
        path,
        deathLanding,
        consumes: { standard: true, special: false },
        enPassantOpportunity:
          !deathLanding && step > 1
            ? {
                from: { r: piece.row, c: piece.col },
                to,
                crossed: path,
                eligibleColor: oppositeColor(piece.color),
              }
            : null,
      };
      actions.push(
        ...(deathLanding ? [action] : promotionVariants(state, piece, action)),
      );
    }
  }

  return actions.map(withActionId);
}

function isFrontalFanDiagonalLeapBlocked(state, piece) {
  const directlyForward = physicalSquareFromDelta(
    { r: piece.row, c: piece.col },
    pawnDirection(piece),
    0,
  );
  const blocker = directlyForward
    ? getPiece(state.board, directlyForward.r, directlyForward.c)
    : null;
  return Boolean(blocker && STANDARD_PIECES.has(blocker.type));
}

function frontalFanPawnMaxStep(state, piece) {
  if (piece.hasMoved) return 1;
  return pawnInitialMaxStep(state);
}

function isPawnForwardPathPassable(state, piece, step) {
  const dir = pawnDirection(piece);
  for (let i = 1; i < step; i++) {
    const occupant = getPiece(state.board, piece.row + dir * i, piece.col);
    if (occupant && !LIFE_DEATH_PIECES.has(occupant.type)) return false;
  }
  return true;
}

function isPawnLanePathClear(state, path) {
  return path.every((square) => {
    return !getPiece(state.board, square.r, square.c);
  });
}

function pawnPath(state, piece, step) {
  return pawnLanePath(state, piece, step, 0);
}

function pawnLanePath(state, piece, step, dc = 0, options = {}) {
  const path = [];
  for (let i = 1; i < step; i++) {
    const square = pawnLaneSquare(state, piece, i, dc, options);
    if (square) path.push(square);
  }
  return path;
}

function pawnLaneSquare(state, piece, step, dc = 0, options = {}) {
  const row = piece.row + pawnDirection(piece) * step;
  const rawCol = piece.col + dc;
  if (row < 0 || row >= BOARD_SIZE) return null;
  if (options.allowWrap !== false && usesWraparound(state))
    return { r: row, c: mod(rawCol, BOARD_SIZE) };
  if (rawCol < 0 || rawCol >= BOARD_SIZE) return null;
  return { r: row, c: rawCol };
}

function generateSlidingMoves(state, piece, directions) {
  const actions = [];
  const from = { r: piece.row, c: piece.col };
  for (const [dr, dc] of directions) {
    for (let distance = 1; distance < BOARD_SIZE; distance++) {
      const to = squareFromDelta(state, from, dr, dc, distance);
      if (!to) break;
      const occupant = getPiece(state.board, to.r, to.c);
      if (occupant) {
        if (occupant.type === PIECE_TYPES.DEATH) {
          actions.push(
            withActionId({
              kind: "move",
              mode: "slide",
              pieceId: piece.id,
              pieceType: piece.type,
              from,
              to,
              path: rayPath(state, from, dr, dc, distance),
              deathLanding: true,
              consumes: { standard: true, special: false },
            }),
          );
          continue;
        }
        if (occupant.type === PIECE_TYPES.LIFE) continue;
        break;
      }
      actions.push(
        withActionId({
          kind: "move",
          mode: "slide",
          pieceId: piece.id,
          pieceType: piece.type,
          from,
          to,
          path: rayPath(state, from, dr, dc, distance),
          consumes: { standard: true, special: false },
        }),
      );
    }
  }
  return preferEquivalentMoveRoutes(state, actions);
}

function generateKingMoves(state, piece) {
  const actions = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const to = physicalSquareFromDelta(
        { r: piece.row, c: piece.col },
        dr,
        dc,
      );
      if (!to) continue;
      const occupant = getPiece(state.board, to.r, to.c);
      if (occupant?.type === PIECE_TYPES.DEATH) continue;
      if (occupant) continue;
      actions.push(
        withActionId({
          kind: "move",
          mode: "kingStep",
          pieceId: piece.id,
          pieceType: piece.type,
          from: { r: piece.row, c: piece.col },
          to,
          path: [],
          deathLanding: false,
          consumes: { standard: true, special: false },
        }),
      );
    }
  }
  return actions;
}

function generateKnightMoves(state, piece) {
  if (usesOrthodoxKnightMoves(state))
    return generateOrthodoxKnightMoves(state, piece);
  return generateRampMoves(state, piece, "knightRamp");
}

function generateToadMoves(state, piece) {
  return [
    ...generateToadStepMoves(state, piece),
    ...generateRampMoves(state, piece, "toadRamp"),
  ];
}

function generateRampMoves(state, piece, mode) {
  const actions = [];
  for (const jump of rampDestinations(state, piece)) {
    actions.push(
      withActionId({
        kind: "move",
        mode,
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to: { r: jump.r, c: jump.c },
        rampSequence: jump.sequence,
        path: jump.sequence.map((step) => ({ ...step.ramp })),
        deathLanding: jump.deathLanding,
        shieldStrips:
          mode === "toadRamp"
            ? toadRampShieldStrips(state, piece, jump.sequence)
            : [],
        consumes: { standard: true, special: false },
      }),
    );
  }

  return dedupeActions(actions);
}

function generateOrthodoxKnightMoves(state, piece) {
  const actions = [];
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const to = squareFromDelta(state, { r: piece.row, c: piece.col }, dr, dc);
    if (!to) continue;
    const occupant = getPiece(state.board, to.r, to.c);
    const deathLanding = occupant?.type === PIECE_TYPES.DEATH;
    if (occupant && !deathLanding) continue;
    actions.push(
      withActionId({
        kind: "move",
        mode: "knightMove",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to,
        path: knightPassThroughSquares(state, piece, [dr, dc]),
        deathLanding,
        consumes: { standard: true, special: false },
      }),
    );
  }
  return actions;
}

function generateToadStepMoves(state, piece) {
  const actions = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const to = squareFromDelta(state, { r: piece.row, c: piece.col }, dr, dc);
      if (!to) continue;
      const occupant = getPiece(state.board, to.r, to.c);
      const deathLanding = occupant?.type === PIECE_TYPES.DEATH;
      if (occupant && !deathLanding) continue;
      actions.push(
        withActionId({
          kind: "move",
          mode: "toadStep",
          pieceId: piece.id,
          pieceType: piece.type,
          from: { r: piece.row, c: piece.col },
          to,
          path: [],
          deathLanding,
          consumes: { standard: true, special: false },
        }),
      );
    }
  }
  return actions;
}

function rampDestinations(state, piece) {
  const results = [];
  const seenRoutes = new Set();
  const original = { r: piece.row, c: piece.col };

  const pushRoute = (land, sequence) => {
    const key = rampSequenceKey(sequence);
    if (seenRoutes.has(key)) return;
    seenRoutes.add(key);
    results.push({
      ...land,
      deathLanding: sequence.at(-1)?.deathLanding ?? false,
      sequence: sequence.map((step) => ({
        ramp: { ...step.ramp },
        land: { ...step.land },
        rampType: step.rampType,
        rampPieceId: step.rampPieceId,
        deathLanding: step.deathLanding,
      })),
    });
  };

  const singleJumps = (from, visited) => {
    const jumps = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const ramp = squareFromDelta(state, from, dr, dc);
        const land = squareFromDelta(state, from, dr, dc, 2);
        if (!ramp || !land) continue;
        const rampPiece = getPiece(state.board, ramp.r, ramp.c);
        if (!rampPiece) continue;
        if (visited.has(squareKey(land))) continue;
        const landOccupant = getPiece(state.board, land.r, land.c);
        const deathLanding = landOccupant?.type === PIECE_TYPES.DEATH;
        if (landOccupant && !deathLanding) continue;
        jumps.push({
          land,
          ramp,
          rampType: rampPiece.type,
          rampPieceId: rampPiece.id,
          deathLanding,
        });
      }
    }
    return jumps;
  };

  const firstVisited = new Set([squareKey(original)]);
  for (const first of singleJumps(original, firstVisited)) {
    const firstKey = squareKey(first.land);
    pushRoute(first.land, [
      {
        ramp: first.ramp,
        land: first.land,
        rampType: first.rampType,
        rampPieceId: first.rampPieceId,
        deathLanding: first.deathLanding,
      },
    ]);

    if (first.deathLanding) continue;
    const secondVisited = new Set([squareKey(original), firstKey]);
    for (const second of singleJumps(first.land, secondVisited)) {
      pushRoute(second.land, [
        {
          ramp: first.ramp,
          land: first.land,
          rampType: first.rampType,
          rampPieceId: first.rampPieceId,
          deathLanding: first.deathLanding,
        },
        {
          ramp: second.ramp,
          land: second.land,
          rampType: second.rampType,
          rampPieceId: second.rampPieceId,
          deathLanding: second.deathLanding,
        },
      ]);
    }
  }
  return results;
}

function toadRampShieldStrips(state, piece, sequence) {
  return sequence
    .map((step, index) => {
      const rampPiece =
        (step.rampPieceId ? findPieceById(state, step.rampPieceId) : null) ??
        getPiece(state.board, step.ramp.r, step.ramp.c);
      if (
        !rampPiece ||
        rampPiece.isImmune ||
        !rampPiece.hasShield ||
        ownerOf(rampPiece) === ownerOf(piece)
      ) {
        return null;
      }
      return {
        pieceId: rampPiece.id,
        square: { ...step.ramp },
        pathIndex: index,
      };
    })
    .filter(Boolean);
}

function generateCastles(state, king) {
  if (king.hasMoved) return [];
  const actions = [];
  const row = king.row;
  for (const rookCol of [1, 8]) {
    const rook = getPiece(state.board, row, rookCol);
    if (
      !rook ||
      rook.type !== PIECE_TYPES.ROOK ||
      rook.color !== king.color ||
      rook.hasMoved
    )
      continue;
    const direction = Math.sign(rook.col - king.col);
    const kingTo = { r: row, c: king.col + direction * 2 };
    const rookTo = { r: row, c: kingTo.c - direction };
    if (
      !isValidSquare(kingTo.r, kingTo.c) ||
      !isValidSquare(rookTo.r, rookTo.c)
    )
      continue;
    if (
      getPiece(state.board, kingTo.r, kingTo.c) ||
      getPiece(state.board, rookTo.r, rookTo.c)
    )
      continue;

    let clear = true;
    for (
      let c = Math.min(king.col, rook.col) + 1;
      c < Math.max(king.col, rook.col);
      c++
    ) {
      if (getPiece(state.board, row, c)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;

    actions.push(
      withActionId({
        kind: "move",
        mode: "castle",
        pieceId: king.id,
        pieceType: king.type,
        rookId: rook.id,
        from: { r: king.row, c: king.col },
        to: kingTo,
        rookFrom: { r: rook.row, c: rook.col },
        rookTo,
        path: [],
        consumes: { standard: true, special: false },
      }),
    );
  }
  return actions;
}

function generateStandardAttacks(state, piece, options = {}) {
  if (piece.type === PIECE_TYPES.FOOL)
    return generateFoolAttacks(state, piece, options);
  return generateProfileAttacks(state, piece, piece.type, options);
}

function generateProfileAttacks(state, piece, profileType, options = {}) {
  if (profileType === PIECE_TYPES.PAWN) {
    return [
      ...generatePawnAttacks(state, piece, options),
      ...generateEnPassantActions(state, piece),
    ];
  }
  if (profileType === PIECE_TYPES.KING)
    return generateKingAttacks(state, piece, options);
  if (profileType === PIECE_TYPES.KNIGHT)
    return generateKnightAttacks(state, piece, options);
  if (profileType === PIECE_TYPES.ROOK)
    return generateSlidingAttacks(state, piece, ROOK_DIRS, options);
  if (profileType === PIECE_TYPES.BISHOP)
    return generateSlidingAttacks(state, piece, BISHOP_DIRS, options);
  if (profileType === PIECE_TYPES.QUEEN)
    return generateSlidingAttacks(
      state,
      piece,
      [...ROOK_DIRS, ...BISHOP_DIRS],
      options,
    );
  if (profileType === PIECE_TYPES.TOAD)
    return generateToadAttacks(state, piece, options);
  return [];
}

function generateFoolMoves(state, fool) {
  const profile = foolProfileForState(state, fool);
  if (!profile) return [];
  const proxy = profileProxy(fool, profile.type);
  return generateProfileMoves(state, proxy, profile.type).map((action) =>
    foolAction(action, profile),
  );
}

function generateFoolAttacks(state, fool, options = {}) {
  const profile = foolProfileForState(state, fool);
  if (!profile) return [];
  const proxy = profileProxy(fool, profile.type);
  const actions =
    profile.type === PIECE_TYPES.PAWN
      ? generatePawnAttacks(state, proxy, options)
      : generateProfileAttacks(state, proxy, profile.type, options);
  return actions.map((action) => foolAction(action, profile));
}

export function foolProfileForState(state, fool) {
  if (!state || !fool?.type || fool.type !== PIECE_TYPES.FOOL) return null;
  const profile = state.foolMemory?.[oppositeColor(fool.color)];
  if (!profile || profile.type === PIECE_TYPES.FOOL) return null;
  if (!STANDARD_PIECES.has(profile.type)) return null;
  return { type: profile.type };
}

function profileProxy(piece, type) {
  return {
    ...piece,
    type,
    copiedByFool: true,
  };
}

function foolAction(action, profile) {
  const next = {
    ...action,
    id: undefined,
    pieceType: PIECE_TYPES.FOOL,
    profileType: profile.type,
    copiedProfile: { type: profile.type },
  };
  delete next.id;
  delete next.promotionType;
  delete next.enPassantOpportunity;
  return withActionId(next);
}

function generatePawnAttacks(state, piece, options = {}) {
  if (usesFrontalFan2Pawns(state))
    return generateFrontalFanPawnAttacks(state, piece, options);
  return generateChessTwoPawnAttacks(state, piece, options);
}

function generateChessTwoPawnAttacks(state, piece, options = {}) {
  const actions = [];
  const dir = pawnDirection(piece);
  for (const dc of [-1, 1]) {
    const targetSquare = squareFromDelta(
      state,
      { r: piece.row, c: piece.col },
      dir,
      dc,
      1,
      { allowWrap: false },
    );
    const target = targetSquare
      ? getPiece(state.board, targetSquare.r, targetSquare.c)
      : null;
    if (!isAttackTarget(state, piece, target, options)) continue;
    actions.push(
      ...buildAttackActions(
        state,
        piece,
        target,
        {
          r: piece.row,
          c: piece.col,
        },
        {
          mode: "pawnAttack",
          path: [],
        },
      ),
    );
  }
  return actions;
}

function generateFrontalFanPawnAttacks(state, piece, options = {}) {
  const actions = [];
  const maxStep = frontalFanPawnMaxStep(state, piece);
  for (const dc of [-1, 0, 1]) {
    for (let step = 1; step <= maxStep; step++) {
      const targetSquare = pawnLaneSquare(state, piece, step, dc, {
        allowWrap: false,
      });
      if (!targetSquare) continue;
      const target = getPiece(state.board, targetSquare.r, targetSquare.c);
      if (!isAttackTarget(state, piece, target, options)) continue;
      const path = pawnLanePath(state, piece, step, dc, { allowWrap: false });
      if (!isPawnLanePathClear(state, path)) continue;
      const staging =
        step === 1
          ? { r: piece.row, c: piece.col }
          : pawnLaneSquare(state, piece, step - 1, dc, { allowWrap: false });
      if (!staging) continue;
      actions.push(
        ...buildAttackActions(state, piece, target, staging, {
          mode: "pawnAttack",
          path,
          killPath: path,
          recoil: true,
        }),
      );
    }
  }
  return actions;
}

function generateEnPassantActions(state, piece) {
  const ep = state.enPassant;
  if (
    !ep ||
    ep.eligibleColor !== ownerOf(piece) ||
    piece.type !== PIECE_TYPES.PAWN
  )
    return [];
  const target = findPieceById(state, ep.pieceId);
  if (
    !target ||
    target.type !== PIECE_TYPES.PAWN ||
    target.color === piece.color ||
    target.isImmune
  )
    return [];

  const actions = [];
  for (const crossed of ep.crossed) {
    if (!pawnCanAttackEnPassantSquare(state, piece, crossed)) continue;
    const crossedOccupant = getPiece(state.board, crossed.r, crossed.c);
    if (crossedOccupant && crossedOccupant.type !== PIECE_TYPES.DEATH) continue;
    actions.push(
      ...buildAttackActions(state, piece, target, crossed, {
        mode: "enPassant",
        path: [],
        killPath: crossedOccupant ? [{ r: crossed.r, c: crossed.c }] : [],
        recoil: usesFrontalFan2Pawns(state),
      }),
    );
  }
  return actions;
}

function pawnCanAttackEnPassantSquare(state, piece, square) {
  const dir = pawnDirection(piece);
  const dr = square.r - piece.row;
  const dc = square.c - piece.col;
  if (usesFrontalFan2Pawns(state)) {
    if (dr % dir !== 0) return false;
    const step = dr / dir;
    const maxStep = frontalFanPawnMaxStep(state, piece);
    if (step < 1 || step > maxStep) return false;
    if (![-1, 0, 1].includes(dc)) return false;
    return isPawnLanePathClear(state, pawnLanePath(state, piece, step, dc));
  }
  return dr === dir && Math.abs(dc) === 1;
}

function generateKingAttacks(state, piece, options = {}) {
  return generateAdjacentAttacks(state, piece, "kingAttack", {
    ...options,
    allowWrap: false,
  });
}

function generateToadAttacks(state, piece, options = {}) {
  return generateAdjacentAttacks(state, piece, "toadAttack", options);
}

function generateAdjacentAttacks(state, piece, mode, options = {}) {
  const actions = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const targetSquare = squareFromDelta(
        state,
        { r: piece.row, c: piece.col },
        dr,
        dc,
        1,
        { allowWrap: false },
      );
      const target = targetSquare
        ? getPiece(state.board, targetSquare.r, targetSquare.c)
        : null;
      if (!isAttackTarget(state, piece, target, options)) continue;
      actions.push(
        ...buildAttackActions(
          state,
          piece,
          target,
          {
            r: piece.row,
            c: piece.col,
          },
        {
          mode,
          path: [],
        },
      ),
    );
  }
  }
  return actions;
}

function generateKnightAttacks(state, piece, options = {}) {
  const actions = [];
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const targetSquare = squareFromDelta(
      state,
      { r: piece.row, c: piece.col },
      dr,
      dc,
      1,
      { allowWrap: false },
    );
    const target = targetSquare
      ? getPiece(state.board, targetSquare.r, targetSquare.c)
      : null;
    if (!isAttackTarget(state, piece, target, options)) continue;
    if (!target.hasShield) {
      actions.push(
        ...buildAttackActions(
          state,
          piece,
          target,
          {
            r: target.row,
            c: target.col,
          },
          {
            mode: "knightAttack",
            path: knightPassThroughSquares(state, piece, [dr, dc]),
          },
        ),
      );
      continue;
    }
    for (const staging of knightStagingSquares(state, piece, target, [dr, dc])) {
      actions.push(
        ...buildAttackActions(state, piece, target, staging, {
          mode: "knightAttack",
          path: knightPathToStaging(state, piece, staging, [dr, dc]),
        }),
      );
    }
  }
  return actions;
}

function generateSlidingAttacks(state, piece, directions, options = {}) {
  const actions = [];
  const from = { r: piece.row, c: piece.col };
  for (const [dr, dc] of directions) {
    for (let distance = 1; distance < BOARD_SIZE; distance++) {
      const targetSquare = squareFromDelta(state, from, dr, dc, distance, {
        allowWrap: false,
      });
      if (!targetSquare) break;
      const target = getPiece(state.board, targetSquare.r, targetSquare.c);
      if (!target) continue;
      if (LIFE_DEATH_PIECES.has(target.type)) continue;
      if (!isAttackTarget(state, piece, target, options)) break;

      const staging =
        distance === 1
          ? from
          : squareFromDelta(state, from, dr, dc, distance - 1, {
              allowWrap: false,
            });
      if (!staging) break;
      if (staging.r !== piece.row || staging.c !== piece.col) {
        const stagingOccupant = getPiece(state.board, staging.r, staging.c);
        if (target.hasShield) {
          if (stagingOccupant && stagingOccupant.type !== PIECE_TYPES.DEATH)
            break;
        } else if (
          stagingOccupant &&
          !LIFE_DEATH_PIECES.has(stagingOccupant.type)
        ) {
          break;
        }
      }
      actions.push(
        ...buildAttackActions(state, piece, target, staging, {
          mode: "rangedAttack",
          path: rayPath(state, from, dr, dc, distance - 1, {
            allowWrap: false,
          }),
          killPath: rayPath(state, from, dr, dc, distance, {
            allowWrap: false,
          }),
        }),
      );
      break;
    }
  }
  return actions;
}

function isAttackTarget(state, attacker, target, options = {}) {
  if (!target || target.isImmune) return false;
  if (LIFE_DEATH_PIECES.has(target.type)) return false;
  if (
    target.type === PIECE_TYPES.KING &&
    !options.allowKingTarget &&
    usesCheckmate(state)
  )
    return false;
  return ownerOf(target) !== ownerOf(attacker);
}

function buildAttackActions(state, attacker, target, staging, details) {
  if (!isValidSquare(staging.r, staging.c)) return [];
  const targetSquare = { r: target.row, c: target.col };
  const isKillingBlow = !target.hasShield;
  const attackPath = isKillingBlow
    ? (details.killPath ?? details.path ?? [])
    : (details.path ?? []);
  if (
    frameBlocksStandardAttack(
      state,
      attacker,
      target,
      staging,
      attackPath,
      details.mode,
    )
  )
    return [];
  const stagingOccupant = isKillingBlow
    ? null
    : getPiece(state.board, staging.r, staging.c);
  const isAdjacentStaging =
    staging.r === attacker.row && staging.c === attacker.col;
  const isDeathStaging =
    !isKillingBlow && stagingOccupant?.type === PIECE_TYPES.DEATH;
  if (
    !isKillingBlow &&
    !isAdjacentStaging &&
    stagingOccupant &&
    !isDeathStaging
  )
    return [];

  const base = {
    kind: "attack",
    mode: details.mode,
    pieceId: attacker.id,
    pieceType: attacker.type,
    targetId: target.id,
    target: {
      id: target.id,
      type: target.type,
      color: target.color,
      r: target.row,
      c: target.col,
      hadShield: target.hasShield,
      isIntimidated: target.isIntimidated,
      intimidationSuppressedShield: target.intimidationSuppressedShield,
    },
    from: { r: attacker.row, c: attacker.col },
    to: { r: target.row, c: target.col },
    path: attackPath,
    deathStaging: isDeathStaging,
    recoil: Boolean(details.recoil),
    consumes: { standard: true, special: false },
  };

  if (isDeathStaging) {
    return [
      withActionId({
        ...base,
        staging: { r: staging.r, c: staging.c },
      }),
    ];
  }

  if (!isKillingBlow) {
    return [
      withActionId({
        ...base,
        staging: { r: staging.r, c: staging.c },
        rest: { r: staging.r, c: staging.c },
      }),
    ];
  }

  return promotionVariants(state, attacker, {
    ...base,
    rest: targetSquare,
  }).map(withActionId);
}

function frameBlocksStandardAttack(
  state,
  attacker,
  target,
  staging,
  path = [],
  mode = "",
) {
  if (!usesFrame(state) || attacker.type === PIECE_TYPES.KING)
    return false;
  if (isFrameSquare(attacker.row, attacker.col)) return true;
  const isKnightFrameTarget =
    mode === "knightAttack" && isFrameSquare(target.row, target.col);
  if (
    path.some(
      (square) =>
        isFrameSquare(square.r, square.c) &&
        !(square.r === target.row && square.c === target.col) &&
        !isKnightFrameTarget,
    )
  )
    return true;
  const stagingIsOrigin =
    staging.r === attacker.row && staging.c === attacker.col;
  const stagingIsTarget =
    staging.r === target.row && staging.c === target.col;
  return (
    !stagingIsOrigin &&
    !stagingIsTarget &&
    isFrameSquare(staging.r, staging.c)
  );
}

function knightStagingSquares(state, knight, target, delta = null) {
  const dr = delta?.[0] ?? target.row - knight.row;
  const dc =
    delta?.[1] ??
    (usesWraparound(state)
      ? wrappedColDelta(knight.col, target.col)
      : target.col - knight.col);
  if (
    !(
      (Math.abs(dr) === 2 && Math.abs(dc) === 1) ||
      (Math.abs(dr) === 1 && Math.abs(dc) === 2)
    )
  ) {
    return [];
  }
  const candidates = [
    { r: target.row - Math.sign(dr), c: target.col },
    squareFromDelta(state, { r: target.row, c: target.col }, 0, -Math.sign(dc)),
  ];
  return candidates.filter((square) => {
    if (!square || !isValidSquare(square.r, square.c)) return false;
    if (square.r === knight.row && square.c === knight.col) return false;
    const occupant = getPiece(state.board, square.r, square.c);
    return !occupant || occupant.type === PIECE_TYPES.DEATH;
  });
}

function knightPassThroughSquares(state, knight, delta) {
  const dr = delta[0];
  const dc = delta[1];
  const rowStep = Math.sign(dr);
  const colStep = Math.sign(dc);
  let path = [];

  if (Math.abs(dr) === 2 && Math.abs(dc) === 1) {
    path = [
      squareFromDelta(state, { r: knight.row, c: knight.col }, rowStep, 0),
      squareFromDelta(
        state,
        { r: knight.row, c: knight.col },
        rowStep,
        colStep,
      ),
    ];
  } else if (Math.abs(dr) === 1 && Math.abs(dc) === 2) {
    path = [
      squareFromDelta(state, { r: knight.row, c: knight.col }, 0, colStep),
      squareFromDelta(
        state,
        { r: knight.row, c: knight.col },
        rowStep,
        colStep,
      ),
    ];
  }

  return path.filter((square) => square && isValidSquare(square.r, square.c));
}

function knightPathToStaging(state, knight, staging, delta) {
  return knightPassThroughSquares(state, knight, delta).filter(
    (square) => !(square.r === staging.r && square.c === staging.c),
  );
}

function generateLifeDeathMoves(state, piece) {
  const actions = [];
  for (const [dr, dc] of BISHOP_DIRS) {
    const to = squareFromDelta(state, { r: piece.row, c: piece.col }, dr, dc);
    if (!to) continue;
    if (getPiece(state.board, to.r, to.c)) continue;
    if (piece.type === PIECE_TYPES.LIFE && !isLightSquareForState(state, to.r, to.c))
      continue;
    if (piece.type === PIECE_TYPES.DEATH && !isDarkSquareForState(state, to.r, to.c))
      continue;
    actions.push(
      withActionId({
        kind: "move",
        mode: "lifeDeathMove",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to,
        path: [],
        consumes: { standard: false, special: true },
      }),
    );
  }
  return actions;
}

function generateLifeDeathSpecialActions(state, piece) {
  if (piece.type === PIECE_TYPES.LIFE)
    return generateLifeHealActions(state, piece);
  if (piece.type === PIECE_TYPES.DEATH)
    return generateDeathKillActions(state, piece);
  return [];
}

function generateLifeHealActions(state, piece) {
  if (!shieldsEnabledForState(state)) return [];
  const actions = [];
  for (const [dr, dc] of BISHOP_DIRS) {
    const targetSquare = squareFromDelta(
      state,
      { r: piece.row, c: piece.col },
      dr,
      dc,
      1,
      { allowWrap: false },
    );
    const target = targetSquare
      ? getPiece(state.board, targetSquare.r, targetSquare.c)
      : null;
    if (!target || !isLightSquareForState(state, target.row, target.col))
      continue;
    if (
      !canHaveShield(target.type) ||
      target.hasShield ||
      target.frameSuppressedShield ||
      target.isImmune ||
      target.isIntimidated
    )
      continue;
    actions.push(
      withActionId({
        kind: "special",
        mode: "heal",
        pieceId: piece.id,
        pieceType: piece.type,
        targetId: target.id,
        target: {
          id: target.id,
          type: target.type,
          color: target.color,
          r: target.row,
          c: target.col,
          hadShield: target.hasShield,
          frameSuppressedShield:
            usesFrame(state) && isFrameSquare(target.row, target.col),
        },
        from: { r: piece.row, c: piece.col },
        to: { r: target.row, c: target.col },
        consumes: { standard: true, special: true },
      }),
    );
  }
  return actions;
}

function generateDeathKillActions(state, piece) {
  const actions = [];
  for (const [dr, dc] of BISHOP_DIRS) {
    const targetSquare = squareFromDelta(
      state,
      { r: piece.row, c: piece.col },
      dr,
      dc,
      1,
      { allowWrap: false },
    );
    const target = targetSquare
      ? getPiece(state.board, targetSquare.r, targetSquare.c)
      : null;
    if (
      !target ||
      target.isImmune ||
      !isDarkSquareForState(state, target.row, target.col)
    )
      continue;
    if (
      (target.type === PIECE_TYPES.KING && usesCheckmate(state)) ||
      target.type === PIECE_TYPES.DEATH
    )
      continue;
    if (isProtectedFromDeath(target, state)) continue;
    actions.push(
      withActionId({
        kind: "special",
        mode: "kill",
        pieceId: piece.id,
        pieceType: piece.type,
        targetId: target.id,
        target: {
          id: target.id,
          type: target.type,
          color: target.color,
          r: target.row,
          c: target.col,
          hadShield: target.hasShield,
        },
        from: { r: piece.row, c: piece.col },
        to: { r: target.row, c: target.col },
        consumes: { standard: true, special: true },
      }),
    );
  }
  return actions;
}

function isProtectedFromDeath(target, state) {
  for (const [dr, dc] of ROOK_DIRS) {
    const square = squareFromDelta(
      state,
      { r: target.row, c: target.col },
      dr,
      dc,
      1,
      { allowWrap: false },
    );
    const protector = square ? getPiece(state.board, square.r, square.c) : null;
    if (protector && ownerOf(protector) === ownerOf(target)) return true;
  }
  return false;
}

export function applyAction(state, action, options = {}) {
  const recordHistoryEntry = options.recordHistory ?? true;
  const normalizeAfterAction = options.normalize ?? true;
  const next = cloneState(state, { preserveHistory: recordHistoryEntry });
  if (next.gameOver) return next;
  const actorColor = next.currentPlayer;
  const previousEnPassant = next.enPassant ? { ...next.enPassant } : null;

  if (action.kind === "move") applyMoveAction(next, action);
  if (action.kind === "attack") applyAttackAction(next, action);
  if (action.kind === "special") applySpecialAction(next, action);
  updateFoolMemory(next, action, actorColor);
  maybeNormalizeFrameShields(next);

  if (recordHistoryEntry) {
    next.lastAction = { ...structuredClone(action), color: actorColor };
    recordAction(next, next.lastAction);
  }

  if (next.gameOver) {
    clearIntimidation(next);
    maybeNormalizeFrameShields(next);
    return next;
  }

  applyTurnConsumption(next, action);
  updateEnPassant(next, action, previousEnPassant, actorColor);
  checkForAnnihilation(next);
  checkForMaterialDraw(next);
  if (normalizeAfterAction) {
    if (!next.gameOver) {
      updateIntimidation(next);
      maybeNormalizeFrameShields(next);
    }
    normalizeTurn(next);
  }

  return next;
}

function updateFoolMemory(state, action, actorColor) {
  if (!action.consumes?.standard || action.consumes?.special) return;
  if (!STANDARD_PIECES.has(action.pieceType)) return;
  const profile =
    action.pieceType === PIECE_TYPES.FOOL
      ? action.copiedProfile
      : { type: action.pieceType };
  if (!profile || profile.type === PIECE_TYPES.FOOL) return;
  if (!STANDARD_PIECES.has(profile.type)) return;
  state.foolMemory ??= { [COLORS.WHITE]: null, [COLORS.BLACK]: null };
  state.foolMemory[actorColor] = { type: profile.type };
}

function applyMoveAction(state, action) {
  const piece = findPieceById(state, action.pieceId);
  if (!piece) return;

  if (action.mode === "castle") {
    const rook = findPieceById(state, action.rookId);
    if (!rook) return;
    movePiece(state, piece, action.to.r, action.to.c);
    movePiece(state, rook, action.rookTo.r, action.rookTo.c);
    piece.hasMoved = true;
    rook.hasMoved = true;
    return;
  }

  const jumpedPiece = action.jumpedPieceId
    ? findPieceById(state, action.jumpedPieceId)
    : null;
  applyStaticShieldStrips(state, action, piece);
  const destroyed = applyPathEffects(
    state,
    piece,
    jumpedPiece
      ? [{ r: jumpedPiece.row, c: jumpedPiece.col }]
      : (action.path ?? []),
  );
  setPiece(state.board, piece.row, piece.col, null);
  piece.hasMoved = true;

  if (destroyed || action.deathLanding) {
    removePiece(state, piece);
    return;
  }

  setPiece(state.board, action.to.r, action.to.c, piece);
  maybePromote(state, piece, action.promotionType);
}

function applyAttackAction(state, action) {
  const attacker = findPieceById(state, action.pieceId);
  const target = findPieceById(state, action.targetId);
  if (!attacker || !target || target.isImmune) return;
  if (target.type === PIECE_TYPES.KING && usesCheckmate(state)) return;

  const attackerFrom = { r: attacker.row, c: attacker.col };
  const diesAfterAttack =
    applyPathEffects(state, attacker, action.path ?? []) || action.deathStaging;
  setPiece(state.board, attackerFrom.r, attackerFrom.c, null);
  attacker.hasMoved = true;

  const targetHadShield = target.hasShield;
  if (targetHadShield) {
    target.hasShield = false;
  } else {
    removePiece(state, target, ownerOf(attacker));
  }

  const finalSquare = targetHadShield ? action.staging : action.rest;
  if (diesAfterAttack) {
    removePiece(state, attacker);
    return;
  }

  setPiece(state.board, finalSquare.r, finalSquare.c, attacker);
  if (action.recoil && attacker.type === PIECE_TYPES.PAWN) {
    attacker.hasShield = false;
  }
  maybePromote(state, attacker, action.promotionType);
}

function applyStaticShieldStrips(state, action, movingPiece) {
  for (const strip of action.shieldStrips ?? []) {
    const target = findPieceById(state, strip.pieceId);
    if (
      !target ||
      target.isImmune ||
      !target.hasShield ||
      ownerOf(target) === ownerOf(movingPiece)
    ) {
      continue;
    }
    target.hasShield = false;
  }
}

function applySpecialAction(state, action) {
  const piece = findPieceById(state, action.pieceId);
  const target = findPieceById(state, action.targetId);
  if (!piece || !target) return;

  if (action.mode === "heal") {
    if (
      shieldsEnabledForState(state) &&
      canHaveShield(target.type) &&
      !target.hasShield &&
      !target.frameSuppressedShield &&
      !target.isImmune &&
      !target.isIntimidated &&
      isLightSquareForState(state, target.row, target.col)
    ) {
      if (usesFrame(state) && isFrameSquare(target.row, target.col)) {
        target.frameSuppressedShield = true;
      } else {
        target.hasShield = true;
      }
      target.isImmune = true;
      target.immunityGrantedBy = ownerOf(piece);
    }
    return;
  }

  if (
    action.mode === "kill" &&
    !target.isImmune &&
    (target.type !== PIECE_TYPES.KING || !usesCheckmate(state)) &&
    target.type !== PIECE_TYPES.DEATH &&
    isDarkSquareForState(state, target.row, target.col) &&
    !isProtectedFromDeath(target, state)
  ) {
    removePiece(state, target, ownerOf(piece));
    setPiece(state.board, piece.row, piece.col, null);
    setPiece(state.board, action.to.r, action.to.c, piece);
    piece.hasMoved = true;
  }
}

function applyPathEffects(state, movingPiece, path) {
  for (const square of path) {
    syncFrameShieldForSquare(state, movingPiece, square);
    const staticPiece = getPiece(state.board, square.r, square.c);
    if (
      !staticPiece ||
      !LIFE_DEATH_PIECES.has(staticPiece.type) ||
      movingPiece.isImmune
    )
      continue;
    if (staticPiece.type === PIECE_TYPES.LIFE) {
      if (
        shieldsEnabledForState(state) &&
        canHaveShield(movingPiece.type) &&
        !movingPiece.isIntimidated
      )
        movingPiece.hasShield = true;
    }
    if (staticPiece.type === PIECE_TYPES.DEATH) {
      if (movingPiece.hasShield) {
        movingPiece.hasShield = false;
      } else {
        return true;
      }
    }
    syncFrameShieldForSquare(state, movingPiece, square);
  }
  return false;
}

function maybePromote(state, piece, promotionType) {
  if (!isPromotionRank(piece)) return;
  const promotedType = PROMOTION_TYPES.includes(promotionType)
    ? promotionType
    : PIECE_TYPES.QUEEN;
  const inheritedShield = piece.hasShield;
  piece.type = promotedType;
  piece.hasShield =
    promotedType === PIECE_TYPES.QUEEN || !shieldsEnabledForState(state)
      ? false
      : inheritedShield;
}

function applyTurnConsumption(state, action) {
  if (action.consumes?.standard) state.turn.standardMoveMade = true;
  if (action.consumes?.special) state.turn.specialMoveMade = true;
}

function recordAction(state, action) {
  state.actionHistory = [
    ...(state.actionHistory ?? []),
    structuredClone(action),
  ];
}

function updateEnPassant(state, action, previousEnPassant, actorColor) {
  if (action.enPassantOpportunity) {
    const pawn = findPieceById(state, action.pieceId);
    state.enPassant = pawn
      ? {
          ...action.enPassantOpportunity,
          pieceId: pawn.id,
          color: pawn.color,
        }
      : null;
    return;
  }

  if (
    previousEnPassant &&
    previousEnPassant.eligibleColor === actorColor &&
    action.consumes?.standard
  ) {
    state.enPassant = null;
  }
}

export function normalizeTurn(state) {
  if (state.gameOver) return state;
  checkForMaterialDraw(state);
  if (state.gameOver) return state;
  if (usesCheckmate(state)) {
    if (applyCheckmateResult(state, state.currentPlayer)) return state;
    if (applyCheckmateResult(state, oppositeColor(state.currentPlayer)))
      return state;
  }
  let skipped = 0;
  while (!state.gameOver && generateLegalActions(state).length === 0) {
    skipped += 1;
    if (skipped > 1) {
      state.gameOver = {
        winner: null,
        reason: "No legal moves for either player",
      };
      break;
    }
    switchTurn(state);
    if (usesCheckmate(state)) {
      if (applyCheckmateResult(state, state.currentPlayer)) break;
      if (applyCheckmateResult(state, oppositeColor(state.currentPlayer))) break;
    }
  }
  return state;
}

function applyCheckmateResult(state, loser) {
  if (!usesCheckmate(state)) return false;
  if (!isCheckmate(state, loser)) return false;
  state.gameOver = {
    winner: oppositeColor(loser),
    reason: `${loser} king checkmated`,
  };
  return true;
}

function switchTurn(state) {
  const previousPlayer = state.currentPlayer;
  state.currentPlayer = oppositeColor(state.currentPlayer);
  state.turn = { standardMoveMade: false, specialMoveMade: false };
  if (previousPlayer === COLORS.BLACK && state.currentPlayer === COLORS.WHITE) {
    state.moveNumber += 1;
  }
  if (
    state.enPassant &&
    state.enPassant.eligibleColor !== state.currentPlayer
  ) {
    state.enPassant = null;
  }
  clearExpiredImmunity(state, state.currentPlayer);
}

function clearExpiredImmunity(state, playerAboutToMove) {
  for (const piece of allPieces(state)) {
    if (piece.isImmune && piece.immunityGrantedBy === playerAboutToMove) {
      piece.isImmune = false;
      piece.immunityGrantedBy = null;
    }
  }
}

function checkForAnnihilation(state) {
  const lifeDeath = allPieces(state).filter((piece) =>
    LIFE_DEATH_PIECES.has(piece.type),
  );
  const doomed = new Set();
  for (let i = 0; i < lifeDeath.length; i++) {
    for (let j = i + 1; j < lifeDeath.length; j++) {
      const a = lifeDeath[i];
      const b = lifeDeath[j];
      if (a.type === b.type) continue;
      const adjacentOrthogonal = arePhysicallyOrthogonal(a, b);
      if (adjacentOrthogonal) {
        doomed.add(a.id);
        doomed.add(b.id);
      }
    }
  }
  for (const id of doomed) {
    const piece = findPieceById(state, id);
    if (piece) removePiece(state, piece);
  }
}

function arePhysicallyOrthogonal(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function checkForMaterialDraw(state) {
  if (state.gameOver) return;
  const pieces = allPieces(state);
  const kings = pieces.filter((piece) => piece.type === PIECE_TYPES.KING);
  if (kings.length !== 2) return;
  const hasDestructionMaterial = pieces.some(
    (piece) =>
      piece.type !== PIECE_TYPES.KING && piece.type !== PIECE_TYPES.LIFE,
  );
  if (!hasDestructionMaterial) {
    state.gameOver = {
      winner: null,
      reason: "Only kings and Life pieces remain",
    };
  }
}

export function updateIntimidation(state) {
  if (!usesCheckmate(state)) {
    clearIntimidation(state);
    maybeNormalizeFrameShields(state);
    return;
  }

  const pieces = allPieces(state);

  for (const piece of pieces) {
    if (!piece.isIntimidated) continue;
    const enemyKing = findKing(state, oppositeColor(ownerOf(piece)));
    const stillChecking = enemyKing && attacksKing(state, piece, enemyKing);
    if (!stillChecking) {
      piece.isIntimidated = false;
      if (
        piece.intimidationSuppressedShield &&
        shieldsEnabledForState(state) &&
        canHaveShield(piece.type)
      )
        piece.hasShield = true;
      piece.intimidationSuppressedShield = false;
    }
  }

  for (const king of pieces.filter(
    (piece) => piece.type === PIECE_TYPES.KING,
  )) {
    for (const attacker of pieces) {
      if (ownerOf(attacker) === king.color) continue;
      if (!attacksKing(state, attacker, king)) continue;
      if (!attacker.isIntimidated) {
        attacker.intimidationSuppressedShield = attacker.hasShield;
        attacker.hasShield = false;
        attacker.isIntimidated = true;
      }
    }
  }
  maybeNormalizeFrameShields(state);
}

function maybeNormalizeFrameShields(state) {
  if (usesFrame(state)) normalizeFrameShields(state);
}

export function isKingInCheck(state, color) {
  if (!usesCheckmate(state)) return false;
  const king = findKing(state, color);
  if (!king) return false;
  return allPieces(state).some(
    (piece) => ownerOf(piece) !== color && attacksKing(state, piece, king),
  );
}

export function isCheckmate(state, color = state.currentPlayer) {
  if (!usesCheckmate(state)) return false;
  if (!isKingInCheck(state, color)) return false;
  return !hasLegalCheckEvasionSequence(checkmateProbeState(state, color), color);
}

function checkmateProbeState(state, color) {
  if (state.currentPlayer === color) return state;
  const probe = cloneState(state, { preserveHistory: false });
  probe.currentPlayer = color;
  probe.turn = { standardMoveMade: false, specialMoveMade: false };
  return probe;
}

function hasLegalCheckEvasionSequence(state, color, actions = null) {
  if (legalStandardCheckEvasionActions(state, color).length > 0) return true;
  return preparatoryLifeDeathActions(state, color, actions).some((action) =>
    preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action),
  );
}

function legalStandardCheckEvasionActions(state, color) {
  const king = findKing(state, color);
  if (!king) return [];
  return allPieces(state)
    .filter((piece) => ownerOf(piece) === color)
    .flatMap((piece) => generatePieceActions(state, piece))
    .filter(
      (action) =>
        isStandardCheckEvasionAction(action) &&
        !actionLeavesKingInCheck(state, action, color),
    );
}

function isStandardCheckEvasionAction(action) {
  return (
    action.consumes?.standard &&
    !action.consumes?.special &&
    action.mode !== "castle"
  );
}

function preparatoryLifeDeathActions(state, color, actions = null) {
  if (state.currentPlayer !== color) return [];
  if (state.turn.standardMoveMade || state.turn.specialMoveMade) return [];
  const candidates =
    actions ??
    allPieces(state).flatMap((piece) =>
      ownerOf(piece) === color ? generatePieceActions(state, piece) : [],
    );
  return candidates.filter((action) =>
    isPreparatoryLifeDeathMove(state, action),
  );
}

function isPreparatoryLifeDeathMove(state, action) {
  return (
    action.mode === "lifeDeathMove" &&
    !state.turn.standardMoveMade &&
    action.consumes?.special &&
    !action.consumes?.standard
  );
}

function preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action) {
  const next = applyAction(state, action, {
    recordHistory: false,
    normalize: false,
  });
  return legalStandardCheckEvasionActions(next, color).length > 0;
}

function clearIntimidation(state) {
  for (const piece of allPieces(state)) {
    if (!piece.isIntimidated) continue;
    piece.isIntimidated = false;
    if (
      piece.intimidationSuppressedShield &&
      shieldsEnabledForState(state) &&
      canHaveShield(piece.type)
    )
      piece.hasShield = true;
    piece.intimidationSuppressedShield = false;
  }
}

function attacksKing(state, piece, king) {
  if (!STANDARD_PIECES.has(piece.type)) return false;
  return generateStandardAttacks(state, piece, { allowKingTarget: true }).some(
    (action) => action.targetId === king.id,
  );
}

export function findKing(state, color) {
  return (
    allPieces(state).find(
      (piece) => piece.type === PIECE_TYPES.KING && piece.color === color,
    ) ?? null
  );
}

function promotionVariants(state, piece, action) {
  const destination = action.rest ?? action.to;
  if (piece.type !== PIECE_TYPES.PAWN) return [action];
  const promotionRow = piece.color === COLORS.WHITE ? 0 : BOARD_SIZE - 1;
  if (!destination || destination.r !== promotionRow) return [action];
  return PROMOTION_TYPES.map((promotionType) => ({
    ...action,
    promotionType,
  }));
}

function pawnDirection(piece) {
  return piece.color === COLORS.WHITE ? -1 : 1;
}

function squareFromDelta(state, from, dr, dc, multiplier = 1, options = {}) {
  const row = from.r + dr * multiplier;
  const rawCol = from.c + dc * multiplier;
  if (row < 0 || row >= BOARD_SIZE) return null;
  if (options.allowWrap !== false && usesWraparound(state)) {
    return { r: row, c: mod(rawCol, BOARD_SIZE) };
  }
  if (rawCol < 0 || rawCol >= BOARD_SIZE) return null;
  return { r: row, c: rawCol };
}

function physicalSquareFromDelta(from, dr, dc, multiplier = 1) {
  const row = from.r + dr * multiplier;
  const col = from.c + dc * multiplier;
  if (!isValidSquare(row, col)) return null;
  return { r: row, c: col };
}

function rayPath(state, from, dr, dc, exclusiveDistance, options = {}) {
  const path = [];
  for (let distance = 1; distance < exclusiveDistance; distance++) {
    const square = squareFromDelta(state, from, dr, dc, distance, options);
    if (!square) return [];
    path.push(square);
  }
  return path;
}

function wrappedColDelta(fromCol, toCol) {
  const direct = toCol - fromCol;
  if (Math.abs(direct) <= BOARD_SIZE / 2) return direct;
  return direct > 0 ? direct - BOARD_SIZE : direct + BOARD_SIZE;
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = actionKey(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function preferEquivalentMoveRoutes(state, actions) {
  const bestByDestination = new Map();
  for (const action of actions) {
    if (!action.to || action.kind !== "move") continue;
    const key = [
      action.kind,
      action.mode,
      action.pieceId,
      squareKey(action.from),
      squareKey(action.to),
      action.promotionType ?? "",
    ].join("|");
    const current = bestByDestination.get(key);
    if (
      !current ||
      compareRoutePreference(state, action, current) > 0
    ) {
      bestByDestination.set(key, action);
    }
  }
  return actions.filter((action) => {
    if (!action.to || action.kind !== "move") return true;
    const key = [
      action.kind,
      action.mode,
      action.pieceId,
      squareKey(action.from),
      squareKey(action.to),
      action.promotionType ?? "",
    ].join("|");
    return bestByDestination.get(key) === action;
  });
}

function compareRoutePreference(state, a, b) {
  const routeA = routePreference(state, a);
  const routeB = routePreference(state, b);
  return (
    routeA.lifeOnlyBonus - routeB.lifeOnlyBonus ||
    routeA.deathPenalty - routeB.deathPenalty ||
    routeA.lifeCount - routeB.lifeCount ||
    routeB.pathLength - routeA.pathLength ||
    a.id.localeCompare(b.id) * -1
  );
}

function routePreference(state, action) {
  let lifeCount = 0;
  let deathCount = 0;
  for (const square of action.path ?? []) {
    const occupant = getPiece(state.board, square.r, square.c);
    if (occupant?.type === PIECE_TYPES.LIFE) lifeCount += 1;
    if (occupant?.type === PIECE_TYPES.DEATH) deathCount += 1;
  }
  return {
    lifeOnlyBonus: lifeCount > 0 && deathCount === 0 ? 1 : 0,
    deathPenalty: -deathCount,
    lifeCount,
    pathLength: action.path?.length ?? 0,
  };
}

function rampSequenceKey(sequence = []) {
  return sequence
    .map((step) => `${squareKey(step.ramp)}>${squareKey(step.land)}`)
    .join(";");
}

function shieldStripKey(strips = []) {
  return strips
    .map((strip) => `${strip.pieceId}@${squareKey(strip.square)}`)
    .sort()
    .join(";");
}

function pathKey(path = []) {
  return path.map(squareKey).join(">");
}

export function sortActions(actions) {
  return [...dedupeActions(actions)].sort(
    (a, b) =>
      actionSortScore(b) - actionSortScore(a) || a.id.localeCompare(b.id),
  );
}

function actionSortScore(action) {
  let score = 0;
  if (action.kind === "attack")
    score += 1000 + (MATERIAL_VALUES[action.target?.type] ?? 0);
  if (action.mode === "kill")
    score += 1400 + (MATERIAL_VALUES[action.target?.type] ?? 0);
  if (action.mode === "heal") score += 120;
  if (action.mode === "castle") score += 80;
  if (action.promotionType) score += MATERIAL_VALUES[action.promotionType] ?? 0;
  if (action.target?.hadShield) score -= 150;
  return score;
}
