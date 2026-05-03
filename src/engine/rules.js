import {
  BOARD_SIZE,
  COLORS,
  LIFE_DEATH_PIECES,
  MATERIAL_VALUES,
  PIECE_TYPES,
  PROMOTION_TYPES,
  STANDARD_PIECES,
  canHaveShield,
  isDarkSquare,
  isLightSquare,
  isPromotionRank,
  oppositeColor,
} from "./constants.js";
import {
  allPieces,
  cloneState,
  createInitialState,
  findPieceById,
  getPiece,
  isValidSquare,
  movePiece,
  ownerOf,
  removePiece,
  setPiece,
} from "./state.js";

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

export function createGameState() {
  const state = createInitialState();
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
    action.rookId ?? "",
    action.deathLanding ? "deathLanding" : "",
    rampSequenceKey(action.rampSequence),
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
  if (isKingInCheck(state, color)) return false;
  if (!state.turn.standardMoveMade || state.turn.specialMoveMade) return false;
  return actions.some((action) => action.consumes?.special);
}

function filterCheckLegalActions(state, color, actions) {
  const inCheck = isKingInCheck(state, color);
  if (inCheck && !hasLegalCheckEvasionSequence(state, color, actions))
    return [];
  return actions.filter((action) =>
    isActionLegalRegardingCheck(state, color, action, inCheck),
  );
}

function isActionLegalRegardingCheck(state, color, action, inCheck) {
  if (action.target?.type === PIECE_TYPES.KING) return false;

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
  switch (piece.type) {
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
    default:
      return [];
  }
}

function generatePawnMoves(state, piece) {
  const actions = [];
  const dir = pawnDirection(piece);
  const startRow = piece.color === COLORS.WHITE ? 8 : 1;
  const continuationRow = piece.color === COLORS.WHITE ? 7 : 2;
  const maxStep = !piece.hasMoved ? 3 : piece.row === continuationRow ? 2 : 1;

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
      path: pawnPath(piece, step),
      deathLanding,
      consumes: { standard: true, special: false },
      enPassantOpportunity:
        !deathLanding && step > 1
          ? {
              from: { r: piece.row, c: piece.col },
              to,
              crossed: pawnPath(piece, step),
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

function isPawnForwardPathPassable(state, piece, step) {
  const dir = pawnDirection(piece);
  for (let i = 1; i < step; i++) {
    const occupant = getPiece(state.board, piece.row + dir * i, piece.col);
    if (occupant && !LIFE_DEATH_PIECES.has(occupant.type)) return false;
  }
  return true;
}

function pawnPath(piece, step) {
  const dir = pawnDirection(piece);
  const path = [];
  for (let i = 1; i < step; i++) {
    path.push({ r: piece.row + dir * i, c: piece.col });
  }
  return path;
}

function generateSlidingMoves(state, piece, directions) {
  const actions = [];
  for (const [dr, dc] of directions) {
    for (let distance = 1; distance < BOARD_SIZE; distance++) {
      const to = { r: piece.row + dr * distance, c: piece.col + dc * distance };
      if (!isValidSquare(to.r, to.c)) break;
      const occupant = getPiece(state.board, to.r, to.c);
      if (occupant) {
        if (occupant.type === PIECE_TYPES.DEATH) {
          actions.push(
            withActionId({
              kind: "move",
              mode: "slide",
              pieceId: piece.id,
              pieceType: piece.type,
              from: { r: piece.row, c: piece.col },
              to,
              path: linePath({ r: piece.row, c: piece.col }, to),
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
          from: { r: piece.row, c: piece.col },
          to,
          path: linePath({ r: piece.row, c: piece.col }, to),
          consumes: { standard: true, special: false },
        }),
      );
    }
  }
  return actions;
}

function generateKingMoves(state, piece) {
  const actions = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const to = { r: piece.row + dr, c: piece.col + dc };
      if (!isValidSquare(to.r, to.c)) continue;
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
  const actions = [];
  for (const jump of knightRampDestinations(state, piece)) {
    actions.push(
      withActionId({
        kind: "move",
        mode: "knightRamp",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to: { r: jump.r, c: jump.c },
        rampSequence: jump.sequence,
        path: jump.sequence.map((step) => ({ ...step.ramp })),
        consumes: { standard: true, special: false },
      }),
    );
  }

  return dedupeActions(actions);
}

function knightRampDestinations(state, piece) {
  const results = [];
  const seenRoutes = new Set();
  const original = { r: piece.row, c: piece.col };

  const pushRoute = (land, sequence) => {
    const key = rampSequenceKey(sequence);
    if (seenRoutes.has(key)) return;
    seenRoutes.add(key);
    results.push({
      ...land,
      sequence: sequence.map((step) => ({
        ramp: { ...step.ramp },
        land: { ...step.land },
        rampType: step.rampType,
      })),
    });
  };

  const singleJumps = (from, visited) => {
    const jumps = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const ramp = { r: from.r + dr, c: from.c + dc };
        const land = { r: from.r + dr * 2, c: from.c + dc * 2 };
        if (!isValidSquare(ramp.r, ramp.c) || !isValidSquare(land.r, land.c))
          continue;
        const rampPiece = getPiece(state.board, ramp.r, ramp.c);
        if (!rampPiece) continue;
        if (visited.has(squareKey(land))) continue;
        if (getPiece(state.board, land.r, land.c)) continue;
        jumps.push({ land, ramp, rampType: rampPiece.type });
      }
    }
    return jumps;
  };

  const firstVisited = new Set([squareKey(original)]);
  for (const first of singleJumps(original, firstVisited)) {
    const firstKey = squareKey(first.land);
    pushRoute(first.land, [
      { ramp: first.ramp, land: first.land, rampType: first.rampType },
    ]);

    const secondVisited = new Set([squareKey(original), firstKey]);
    for (const second of singleJumps(first.land, secondVisited)) {
      pushRoute(second.land, [
        { ramp: first.ramp, land: first.land, rampType: first.rampType },
        { ramp: second.ramp, land: second.land, rampType: second.rampType },
      ]);
    }
  }
  return results;
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
  if (piece.type === PIECE_TYPES.PAWN) {
    return [
      ...generatePawnAttacks(state, piece, options),
      ...generateEnPassantActions(state, piece),
    ];
  }
  if (piece.type === PIECE_TYPES.KING)
    return generateKingAttacks(state, piece, options);
  if (piece.type === PIECE_TYPES.KNIGHT)
    return generateKnightAttacks(state, piece, options);
  if (piece.type === PIECE_TYPES.ROOK)
    return generateSlidingAttacks(state, piece, ROOK_DIRS, options);
  if (piece.type === PIECE_TYPES.BISHOP)
    return generateSlidingAttacks(state, piece, BISHOP_DIRS, options);
  if (piece.type === PIECE_TYPES.QUEEN)
    return generateSlidingAttacks(
      state,
      piece,
      [...ROOK_DIRS, ...BISHOP_DIRS],
      options,
    );
  return [];
}

function generatePawnAttacks(state, piece, options = {}) {
  const actions = [];
  const dir = pawnDirection(piece);
  for (const dc of [-1, 1]) {
    const target = getPiece(state.board, piece.row + dir, piece.col + dc);
    if (!isAttackTarget(piece, target, options)) continue;
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
  const dir = pawnDirection(piece);
  for (const crossed of ep.crossed) {
    if (crossed.r !== piece.row + dir || Math.abs(crossed.c - piece.col) !== 1)
      continue;
    const crossedOccupant = getPiece(state.board, crossed.r, crossed.c);
    if (crossedOccupant && crossedOccupant.type !== PIECE_TYPES.DEATH) continue;
    actions.push(
      ...buildAttackActions(state, piece, target, crossed, {
        mode: "enPassant",
        path: [],
        killPath: crossedOccupant ? [{ r: crossed.r, c: crossed.c }] : [],
      }),
    );
  }
  return actions;
}

function generateKingAttacks(state, piece, options = {}) {
  const actions = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const target = getPiece(state.board, piece.row + dr, piece.col + dc);
      if (!isAttackTarget(piece, target, options)) continue;
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
            mode: "kingAttack",
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
    const target = getPiece(state.board, piece.row + dr, piece.col + dc);
    if (!isAttackTarget(piece, target, options)) continue;
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
            path: knightPassThroughSquares(piece, target),
          },
        ),
      );
      continue;
    }
    for (const staging of knightStagingSquares(state, piece, target)) {
      actions.push(
        ...buildAttackActions(state, piece, target, staging, {
          mode: "knightAttack",
          path: linePath({ r: piece.row, c: piece.col }, staging),
        }),
      );
    }
  }
  return actions;
}

function generateSlidingAttacks(state, piece, directions, options = {}) {
  const actions = [];
  for (const [dr, dc] of directions) {
    for (let distance = 1; distance < BOARD_SIZE; distance++) {
      const target = getPiece(
        state.board,
        piece.row + dr * distance,
        piece.col + dc * distance,
      );
      if (!target) continue;
      if (LIFE_DEATH_PIECES.has(target.type)) continue;
      if (!isAttackTarget(piece, target, options)) break;

      const staging = {
        r: target.row - dr,
        c: target.col - dc,
      };
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
          path: linePath({ r: piece.row, c: piece.col }, staging),
          killPath: linePath(
            { r: piece.row, c: piece.col },
            { r: target.row, c: target.col },
          ),
        }),
      );
      break;
    }
  }
  return actions;
}

function isAttackTarget(attacker, target, options = {}) {
  if (!target || target.isImmune) return false;
  if (LIFE_DEATH_PIECES.has(target.type)) return false;
  if (target.type === PIECE_TYPES.KING && !options.allowKingTarget)
    return false;
  return ownerOf(target) !== ownerOf(attacker);
}

function buildAttackActions(state, attacker, target, staging, details) {
  if (!isValidSquare(staging.r, staging.c)) return [];
  const targetSquare = { r: target.row, c: target.col };
  const isKillingBlow = !target.hasShield;
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
    path: isKillingBlow
      ? (details.killPath ?? details.path ?? [])
      : (details.path ?? []),
    deathStaging: isDeathStaging,
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

function knightStagingSquares(state, knight, target) {
  const dr = target.row - knight.row;
  const dc = target.col - knight.col;
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
    { r: target.row, c: target.col - Math.sign(dc) },
  ];
  return candidates.filter((square) => {
    if (!isValidSquare(square.r, square.c)) return false;
    if (square.r === knight.row && square.c === knight.col) return false;
    const occupant = getPiece(state.board, square.r, square.c);
    return !occupant || occupant.type === PIECE_TYPES.DEATH;
  });
}

function knightPassThroughSquares(knight, target) {
  const dr = target.row - knight.row;
  const dc = target.col - knight.col;
  const rowStep = Math.sign(dr);
  const colStep = Math.sign(dc);
  let path = [];

  if (Math.abs(dr) === 2 && Math.abs(dc) === 1) {
    path = [
      { r: knight.row + rowStep, c: knight.col },
      { r: knight.row + rowStep, c: knight.col + colStep },
    ];
  } else if (Math.abs(dr) === 1 && Math.abs(dc) === 2) {
    path = [
      { r: knight.row, c: knight.col + colStep },
      { r: knight.row + rowStep, c: knight.col + colStep },
    ];
  }

  return path.filter((square) => isValidSquare(square.r, square.c));
}

function generateLifeDeathMoves(state, piece) {
  const actions = [];
  for (const [dr, dc] of BISHOP_DIRS) {
    const to = { r: piece.row + dr, c: piece.col + dc };
    if (!isValidSquare(to.r, to.c)) continue;
    if (getPiece(state.board, to.r, to.c)) continue;
    if (piece.type === PIECE_TYPES.LIFE && !isLightSquare(to.r, to.c)) continue;
    if (piece.type === PIECE_TYPES.DEATH && !isDarkSquare(to.r, to.c)) continue;
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
  const actions = [];
  for (const [dr, dc] of BISHOP_DIRS) {
    const target = getPiece(state.board, piece.row + dr, piece.col + dc);
    if (!target || !isLightSquare(target.row, target.col)) continue;
    if (
      !canHaveShield(target.type) ||
      target.hasShield ||
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
    const target = getPiece(state.board, piece.row + dr, piece.col + dc);
    if (!target || target.isImmune || !isDarkSquare(target.row, target.col))
      continue;
    if (target.type === PIECE_TYPES.KING || target.type === PIECE_TYPES.DEATH)
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
    const protector = getPiece(state.board, target.row + dr, target.col + dc);
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

  if (recordHistoryEntry) {
    next.lastAction = { ...structuredClone(action), color: actorColor };
    recordAction(next, next.lastAction);
  }

  if (next.gameOver) {
    clearIntimidation(next);
    return next;
  }

  applyTurnConsumption(next, action);
  updateEnPassant(next, action, previousEnPassant, actorColor);
  checkForAnnihilation(next);
  checkForMaterialDraw(next);
  if (normalizeAfterAction) {
    if (!next.gameOver) updateIntimidation(next);
    normalizeTurn(next);
  }

  return next;
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
  maybePromote(piece, action.promotionType);
}

function applyAttackAction(state, action) {
  const attacker = findPieceById(state, action.pieceId);
  const target = findPieceById(state, action.targetId);
  if (!attacker || !target || target.isImmune) return;
  if (target.type === PIECE_TYPES.KING) return;

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
  maybePromote(attacker, action.promotionType);
}

function applySpecialAction(state, action) {
  const piece = findPieceById(state, action.pieceId);
  const target = findPieceById(state, action.targetId);
  if (!piece || !target) return;

  if (action.mode === "heal") {
    if (
      canHaveShield(target.type) &&
      !target.hasShield &&
      !target.isImmune &&
      !target.isIntimidated &&
      isLightSquare(target.row, target.col)
    ) {
      target.hasShield = true;
      target.isImmune = true;
      target.immunityGrantedBy = ownerOf(piece);
    }
    return;
  }

  if (
    action.mode === "kill" &&
    !target.isImmune &&
    target.type !== PIECE_TYPES.KING &&
    target.type !== PIECE_TYPES.DEATH &&
    isDarkSquare(target.row, target.col) &&
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
    const staticPiece = getPiece(state.board, square.r, square.c);
    if (
      !staticPiece ||
      !LIFE_DEATH_PIECES.has(staticPiece.type) ||
      movingPiece.isImmune
    )
      continue;
    if (staticPiece.type === PIECE_TYPES.LIFE) {
      if (canHaveShield(movingPiece.type) && !movingPiece.isIntimidated)
        movingPiece.hasShield = true;
    }
    if (staticPiece.type === PIECE_TYPES.DEATH) {
      if (movingPiece.hasShield) {
        movingPiece.hasShield = false;
      } else {
        return true;
      }
    }
  }
  return false;
}

function maybePromote(piece, promotionType) {
  if (!isPromotionRank(piece)) return;
  const promotedType = PROMOTION_TYPES.includes(promotionType)
    ? promotionType
    : PIECE_TYPES.QUEEN;
  const inheritedShield = piece.hasShield;
  piece.type = promotedType;
  piece.hasShield =
    promotedType === PIECE_TYPES.QUEEN ? false : inheritedShield;
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
  if (applyCheckmateResult(state, state.currentPlayer)) return state;
  if (applyCheckmateResult(state, oppositeColor(state.currentPlayer)))
    return state;
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
    if (applyCheckmateResult(state, state.currentPlayer)) break;
    if (applyCheckmateResult(state, oppositeColor(state.currentPlayer))) break;
  }
  return state;
}

function applyCheckmateResult(state, loser) {
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
      const adjacentOrthogonal =
        Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
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
  const pieces = allPieces(state);

  for (const piece of pieces) {
    if (!piece.isIntimidated) continue;
    const enemyKing = findKing(state, oppositeColor(ownerOf(piece)));
    const stillChecking = enemyKing && attacksKing(state, piece, enemyKing);
    if (!stillChecking) {
      piece.isIntimidated = false;
      if (piece.intimidationSuppressedShield && canHaveShield(piece.type))
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
}

export function isKingInCheck(state, color) {
  const king = findKing(state, color);
  if (!king) return false;
  return allPieces(state).some(
    (piece) => ownerOf(piece) !== color && attacksKing(state, piece, king),
  );
}

export function isCheckmate(state, color = state.currentPlayer) {
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
    if (piece.intimidationSuppressedShield && canHaveShield(piece.type))
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

function linePath(from, to) {
  const dr = Math.sign(to.r - from.r);
  const dc = Math.sign(to.c - from.c);
  const path = [];
  let r = from.r + dr;
  let c = from.c + dc;
  while (r !== to.r || c !== to.c) {
    if (!isValidSquare(r, c)) return [];
    path.push({ r, c });
    r += dr;
    c += dc;
  }
  return path;
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

function rampSequenceKey(sequence = []) {
  return sequence
    .map((step) => `${squareKey(step.ramp)}>${squareKey(step.land)}`)
    .join(";");
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
