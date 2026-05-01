(() => {
  // src/engine/constants.js
  var BOARD_SIZE = 10;
  var COLORS = {
    WHITE: "white",
    BLACK: "black"
  };
  var PIECE_TYPES = {
    PAWN: "Pawn",
    ROOK: "Rook",
    KNIGHT: "Knight",
    BISHOP: "Bishop",
    QUEEN: "Queen",
    KING: "King",
    LIFE: "Life",
    DEATH: "Death"
  };
  var STANDARD_PIECES = new Set([
    PIECE_TYPES.PAWN,
    PIECE_TYPES.ROOK,
    PIECE_TYPES.KNIGHT,
    PIECE_TYPES.BISHOP,
    PIECE_TYPES.QUEEN,
    PIECE_TYPES.KING
  ]);
  var LIFE_DEATH_PIECES = new Set([PIECE_TYPES.LIFE, PIECE_TYPES.DEATH]);
  var SHIELDLESS_TYPES = new Set([
    PIECE_TYPES.KING,
    PIECE_TYPES.QUEEN,
    PIECE_TYPES.LIFE,
    PIECE_TYPES.DEATH
  ]);
  var PROMOTION_TYPES = [
    PIECE_TYPES.QUEEN,
    PIECE_TYPES.ROOK,
    PIECE_TYPES.BISHOP,
    PIECE_TYPES.KNIGHT
  ];
  var MATERIAL_VALUES = {
    King: 1e4,
    Queen: 900,
    Rook: 500,
    Bishop: 330,
    Knight: 320,
    Pawn: 100,
    Life: 190,
    Death: 220
  };
  function oppositeColor(color) {
    return color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
  }
  function isLightSquare(row, col) {
    return (row + col) % 2 !== 0;
  }
  function isDarkSquare(row, col) {
    return !isLightSquare(row, col);
  }
  function canHaveShield(type) {
    return !SHIELDLESS_TYPES.has(type);
  }
  function isPromotionRank(piece) {
    if (piece.type !== PIECE_TYPES.PAWN)
      return false;
    return piece.color === COLORS.WHITE ? piece.row === 0 : piece.row === BOARD_SIZE - 1;
  }

  // src/engine/state.js
  function isValidSquare(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }
  function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }
  function clonePiece(piece) {
    return piece ? { ...piece } : null;
  }
  function cloneState(state, options = {}) {
    const preserveHistory = options.preserveHistory ?? true;
    const board = createBoard();
    for (let r = 0;r < BOARD_SIZE; r++) {
      for (let c = 0;c < BOARD_SIZE; c++) {
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
        crossed: state.enPassant.crossed.map((sq) => ({ ...sq }))
      } : null,
      gameOver: state.gameOver ? { ...state.gameOver } : null,
      lastAction: preserveHistory && state.lastAction ? structuredClone(state.lastAction) : null,
      actionHistory: preserveHistory && state.actionHistory ? structuredClone(state.actionHistory) : []
    };
  }
  function getPiece(board, row, col) {
    if (!isValidSquare(row, col))
      return null;
    return board[row][col];
  }
  function setPiece(board, row, col, piece) {
    if (!isValidSquare(row, col))
      return;
    board[row][col] = piece;
    if (piece) {
      piece.row = row;
      piece.col = col;
    }
  }
  function removePiece(state, piece, removedByColor = null) {
    if (!piece)
      return;
    if (getPiece(state.board, piece.row, piece.col)?.id === piece.id) {
      setPiece(state.board, piece.row, piece.col, null);
    }
    if (piece.type === PIECE_TYPES.KING && !state.gameOver) {
      state.gameOver = {
        winner: removedByColor ?? (piece.color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE),
        reason: `${piece.color} king destroyed`
      };
    }
  }
  function movePiece(state, piece, toRow, toCol) {
    setPiece(state.board, piece.row, piece.col, null);
    setPiece(state.board, toRow, toCol, piece);
  }
  function findPieceById(state, id) {
    for (let r = 0;r < BOARD_SIZE; r++) {
      for (let c = 0;c < BOARD_SIZE; c++) {
        const piece = state.board[r][c];
        if (piece?.id === id)
          return piece;
      }
    }
    return null;
  }
  function allPieces(state) {
    const pieces = [];
    for (let r = 0;r < BOARD_SIZE; r++) {
      for (let c = 0;c < BOARD_SIZE; c++) {
        const piece = state.board[r][c];
        if (piece)
          pieces.push(piece);
      }
    }
    return pieces;
  }
  function ownerOf(piece) {
    if (!piece)
      return null;
    if (piece.type === PIECE_TYPES.LIFE || piece.type === PIECE_TYPES.DEATH) {
      return piece.row >= 5 ? COLORS.WHITE : COLORS.BLACK;
    }
    return piece.color;
  }

  // src/engine/rules.js
  var ROOK_DIRS = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0]
  ];
  var BISHOP_DIRS = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];
  var KNIGHT_DELTAS = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1]
  ];
  function squareKey(square) {
    return `${square.r},${square.c}`;
  }
  function actionKey(action) {
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
      rampSequenceKey(action.rampSequence)
    ];
    return bits.join("|");
  }
  function withActionId(action) {
    action.id = actionKey(action);
    return action;
  }
  function generateLegalActions(state, color = state.currentPlayer, options = {}) {
    const respectTurn = options.respectTurn ?? true;
    if (state.gameOver)
      return [];
    if (respectTurn && color !== state.currentPlayer)
      return [];
    const actions = [];
    for (const piece of allPieces(state)) {
      if (ownerOf(piece) !== color)
        continue;
      actions.push(...generatePieceActions(state, piece, { respectTurn }));
    }
    if (respectTurn && options.includeSkip !== false && canSkipSpecialMoveFromActions(state, color, actions)) {
      actions.push(buildSkipSpecialAction(state, color));
    }
    return sortActions(actions);
  }
  function generatePieceActions(state, piece, options = {}) {
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
  function buildSkipSpecialAction(state, color) {
    return {
      id: `skip-special|${color}|${state.moveNumber}`,
      kind: "skip",
      mode: "skipSpecial",
      color,
      consumes: { standard: false, special: true }
    };
  }
  function canSkipSpecialMoveFromActions(state, color, actions) {
    if (state.gameOver || state.currentPlayer !== color)
      return false;
    if (!state.turn.standardMoveMade || state.turn.specialMoveMade)
      return false;
    return actions.some((action) => action.consumes?.special);
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
    for (let step = 1;step <= maxStep; step++) {
      const to = { r: piece.row + dir * step, c: piece.col };
      if (!isValidSquare(to.r, to.c))
        continue;
      const occupant = getPiece(state.board, to.r, to.c);
      const deathLanding = occupant?.type === PIECE_TYPES.DEATH;
      if (occupant && !deathLanding)
        continue;
      if (step === 3 && piece.row !== startRow)
        continue;
      if (!isPawnForwardPathPassable(state, piece, step))
        continue;
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
        enPassantOpportunity: !deathLanding && step > 1 ? {
          from: { r: piece.row, c: piece.col },
          to,
          crossed: pawnPath(piece, step),
          eligibleColor: oppositeColor(piece.color)
        } : null
      };
      actions.push(...deathLanding ? [action] : promotionVariants(state, piece, action));
    }
    const jumpTo = { r: piece.row + dir * 2, c: piece.col };
    const jumped = getPiece(state.board, piece.row + dir, piece.col);
    const onOpponentSide = piece.color === COLORS.WHITE && piece.row <= 4 || piece.color === COLORS.BLACK && piece.row >= 5;
    if (onOpponentSide && jumped && LIFE_DEATH_PIECES.has(jumped.type) && ownerOf(jumped) !== ownerOf(piece) && isValidSquare(jumpTo.r, jumpTo.c) && !getPiece(state.board, jumpTo.r, jumpTo.c)) {
      actions.push(...promotionVariants(state, piece, {
        kind: "move",
        mode: "pawnLifeDeathJump",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to: jumpTo,
        jumpedPieceId: jumped.id,
        path: [{ r: jumped.row, c: jumped.col }],
        consumes: { standard: true, special: false }
      }));
    }
    return actions.map(withActionId);
  }
  function isPawnForwardPathPassable(state, piece, step) {
    const dir = pawnDirection(piece);
    for (let i = 1;i < step; i++) {
      const occupant = getPiece(state.board, piece.row + dir * i, piece.col);
      if (occupant && !LIFE_DEATH_PIECES.has(occupant.type))
        return false;
    }
    return true;
  }
  function pawnPath(piece, step) {
    const dir = pawnDirection(piece);
    const path = [];
    for (let i = 1;i < step; i++) {
      path.push({ r: piece.row + dir * i, c: piece.col });
    }
    return path;
  }
  function generateSlidingMoves(state, piece, directions) {
    const actions = [];
    for (const [dr, dc] of directions) {
      for (let distance = 1;distance < BOARD_SIZE; distance++) {
        const to = { r: piece.row + dr * distance, c: piece.col + dc * distance };
        if (!isValidSquare(to.r, to.c))
          break;
        const occupant = getPiece(state.board, to.r, to.c);
        if (occupant) {
          if (occupant.type === PIECE_TYPES.DEATH) {
            actions.push(withActionId({
              kind: "move",
              mode: "slide",
              pieceId: piece.id,
              pieceType: piece.type,
              from: { r: piece.row, c: piece.col },
              to,
              path: linePath({ r: piece.row, c: piece.col }, to),
              deathLanding: true,
              consumes: { standard: true, special: false }
            }));
            continue;
          }
          if (occupant.type === PIECE_TYPES.LIFE)
            continue;
          break;
        }
        actions.push(withActionId({
          kind: "move",
          mode: "slide",
          pieceId: piece.id,
          pieceType: piece.type,
          from: { r: piece.row, c: piece.col },
          to,
          path: linePath({ r: piece.row, c: piece.col }, to),
          consumes: { standard: true, special: false }
        }));
      }
    }
    return actions;
  }
  function generateKingMoves(state, piece) {
    const actions = [];
    for (let dr = -1;dr <= 1; dr++) {
      for (let dc = -1;dc <= 1; dc++) {
        if (dr === 0 && dc === 0)
          continue;
        const to = { r: piece.row + dr, c: piece.col + dc };
        if (!isValidSquare(to.r, to.c))
          continue;
        const occupant = getPiece(state.board, to.r, to.c);
        const deathLanding = occupant?.type === PIECE_TYPES.DEATH;
        if (occupant && !deathLanding)
          continue;
        actions.push(withActionId({
          kind: "move",
          mode: "kingStep",
          pieceId: piece.id,
          pieceType: piece.type,
          from: { r: piece.row, c: piece.col },
          to,
          path: [],
          deathLanding,
          consumes: { standard: true, special: false }
        }));
      }
    }
    return actions;
  }
  function generateKnightMoves(state, piece) {
    const actions = [];
    for (const jump of knightRampDestinations(state, piece)) {
      actions.push(withActionId({
        kind: "move",
        mode: "knightRamp",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to: { r: jump.r, c: jump.c },
        rampSequence: jump.sequence,
        path: jump.sequence.map((step) => ({ ...step.ramp })),
        consumes: { standard: true, special: false }
      }));
    }
    return dedupeActions(actions);
  }
  function knightRampDestinations(state, piece) {
    const results = [];
    const seenRoutes = new Set;
    const original = { r: piece.row, c: piece.col };
    const pushRoute = (land, sequence) => {
      const key = rampSequenceKey(sequence);
      if (seenRoutes.has(key))
        return;
      seenRoutes.add(key);
      results.push({
        ...land,
        sequence: sequence.map((step) => ({
          ramp: { ...step.ramp },
          land: { ...step.land },
          rampType: step.rampType
        }))
      });
    };
    const singleJumps = (from, visited) => {
      const jumps = [];
      for (let dr = -1;dr <= 1; dr++) {
        for (let dc = -1;dc <= 1; dc++) {
          if (dr === 0 && dc === 0)
            continue;
          const ramp = { r: from.r + dr, c: from.c + dc };
          const land = { r: from.r + dr * 2, c: from.c + dc * 2 };
          if (!isValidSquare(ramp.r, ramp.c) || !isValidSquare(land.r, land.c))
            continue;
          const rampPiece = getPiece(state.board, ramp.r, ramp.c);
          if (!rampPiece)
            continue;
          if (visited.has(squareKey(land)))
            continue;
          if (getPiece(state.board, land.r, land.c))
            continue;
          jumps.push({ land, ramp, rampType: rampPiece.type });
        }
      }
      return jumps;
    };
    const firstVisited = new Set([squareKey(original)]);
    for (const first of singleJumps(original, firstVisited)) {
      const firstKey = squareKey(first.land);
      pushRoute(first.land, [
        { ramp: first.ramp, land: first.land, rampType: first.rampType }
      ]);
      const secondVisited = new Set([squareKey(original), firstKey]);
      for (const second of singleJumps(first.land, secondVisited)) {
        pushRoute(second.land, [
          { ramp: first.ramp, land: first.land, rampType: first.rampType },
          { ramp: second.ramp, land: second.land, rampType: second.rampType }
        ]);
      }
    }
    return results;
  }
  function generateCastles(state, king) {
    if (king.hasMoved)
      return [];
    const actions = [];
    const row = king.row;
    for (const rookCol of [1, 8]) {
      const rook = getPiece(state.board, row, rookCol);
      if (!rook || rook.type !== PIECE_TYPES.ROOK || rook.color !== king.color || rook.hasMoved)
        continue;
      const direction = Math.sign(rook.col - king.col);
      const kingTo = { r: row, c: king.col + direction * 2 };
      const rookTo = { r: row, c: kingTo.c - direction };
      if (!isValidSquare(kingTo.r, kingTo.c) || !isValidSquare(rookTo.r, rookTo.c))
        continue;
      if (getPiece(state.board, kingTo.r, kingTo.c) || getPiece(state.board, rookTo.r, rookTo.c))
        continue;
      let clear = true;
      for (let c = Math.min(king.col, rook.col) + 1;c < Math.max(king.col, rook.col); c++) {
        if (getPiece(state.board, row, c)) {
          clear = false;
          break;
        }
      }
      if (!clear)
        continue;
      actions.push(withActionId({
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
        consumes: { standard: true, special: false }
      }));
    }
    return actions;
  }
  function generateStandardAttacks(state, piece) {
    if (piece.type === PIECE_TYPES.PAWN) {
      return [
        ...generatePawnAttacks(state, piece),
        ...generateEnPassantActions(state, piece)
      ];
    }
    if (piece.type === PIECE_TYPES.KING)
      return generateKingAttacks(state, piece);
    if (piece.type === PIECE_TYPES.KNIGHT)
      return generateKnightAttacks(state, piece);
    if (piece.type === PIECE_TYPES.ROOK)
      return generateSlidingAttacks(state, piece, ROOK_DIRS);
    if (piece.type === PIECE_TYPES.BISHOP)
      return generateSlidingAttacks(state, piece, BISHOP_DIRS);
    if (piece.type === PIECE_TYPES.QUEEN)
      return generateSlidingAttacks(state, piece, [...ROOK_DIRS, ...BISHOP_DIRS]);
    return [];
  }
  function generatePawnAttacks(state, piece) {
    const actions = [];
    const dir = pawnDirection(piece);
    for (const dc of [-1, 1]) {
      const target = getPiece(state.board, piece.row + dir, piece.col + dc);
      if (!isAttackTarget(piece, target))
        continue;
      actions.push(...buildAttackActions(state, piece, target, {
        r: piece.row,
        c: piece.col
      }, {
        mode: "pawnAttack",
        path: []
      }));
    }
    return actions;
  }
  function generateEnPassantActions(state, piece) {
    const ep = state.enPassant;
    if (!ep || ep.eligibleColor !== ownerOf(piece) || piece.type !== PIECE_TYPES.PAWN)
      return [];
    const target = findPieceById(state, ep.pieceId);
    if (!target || target.type !== PIECE_TYPES.PAWN || target.color === piece.color || target.isImmune)
      return [];
    const actions = [];
    const dir = pawnDirection(piece);
    for (const crossed of ep.crossed) {
      if (crossed.r !== piece.row + dir || Math.abs(crossed.c - piece.col) !== 1)
        continue;
      const crossedOccupant = getPiece(state.board, crossed.r, crossed.c);
      if (crossedOccupant && crossedOccupant.type !== PIECE_TYPES.DEATH)
        continue;
      actions.push(...buildAttackActions(state, piece, target, crossed, {
        mode: "enPassant",
        path: [],
        killPath: crossedOccupant ? [{ r: crossed.r, c: crossed.c }] : []
      }));
    }
    return actions;
  }
  function generateKingAttacks(state, piece) {
    const actions = [];
    for (let dr = -1;dr <= 1; dr++) {
      for (let dc = -1;dc <= 1; dc++) {
        if (dr === 0 && dc === 0)
          continue;
        const target = getPiece(state.board, piece.row + dr, piece.col + dc);
        if (!isAttackTarget(piece, target))
          continue;
        actions.push(...buildAttackActions(state, piece, target, {
          r: piece.row,
          c: piece.col
        }, {
          mode: "kingAttack",
          path: []
        }));
      }
    }
    return actions;
  }
  function generateKnightAttacks(state, piece) {
    const actions = [];
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const target = getPiece(state.board, piece.row + dr, piece.col + dc);
      if (!isAttackTarget(piece, target))
        continue;
      if (!target.hasShield) {
        actions.push(...buildAttackActions(state, piece, target, {
          r: target.row,
          c: target.col
        }, {
          mode: "knightAttack",
          path: knightPassThroughSquares(piece, target)
        }));
        continue;
      }
      for (const staging of knightStagingSquares(state, piece, target)) {
        actions.push(...buildAttackActions(state, piece, target, staging, {
          mode: "knightAttack",
          path: linePath({ r: piece.row, c: piece.col }, staging)
        }));
      }
    }
    return actions;
  }
  function generateSlidingAttacks(state, piece, directions) {
    const actions = [];
    for (const [dr, dc] of directions) {
      for (let distance = 1;distance < BOARD_SIZE; distance++) {
        const target = getPiece(state.board, piece.row + dr * distance, piece.col + dc * distance);
        if (!target)
          continue;
        if (LIFE_DEATH_PIECES.has(target.type))
          continue;
        if (!isAttackTarget(piece, target))
          break;
        const staging = {
          r: target.row - dr,
          c: target.col - dc
        };
        if (staging.r !== piece.row || staging.c !== piece.col) {
          const stagingOccupant = getPiece(state.board, staging.r, staging.c);
          if (target.hasShield) {
            if (stagingOccupant && stagingOccupant.type !== PIECE_TYPES.DEATH)
              break;
          } else if (stagingOccupant && !LIFE_DEATH_PIECES.has(stagingOccupant.type)) {
            break;
          }
        }
        actions.push(...buildAttackActions(state, piece, target, staging, {
          mode: "rangedAttack",
          path: linePath({ r: piece.row, c: piece.col }, staging),
          killPath: linePath({ r: piece.row, c: piece.col }, { r: target.row, c: target.col })
        }));
        break;
      }
    }
    return actions;
  }
  function isAttackTarget(attacker, target) {
    if (!target || target.isImmune)
      return false;
    if (LIFE_DEATH_PIECES.has(target.type))
      return false;
    return ownerOf(target) !== ownerOf(attacker);
  }
  function buildAttackActions(state, attacker, target, staging, details) {
    if (!isValidSquare(staging.r, staging.c))
      return [];
    const targetSquare = { r: target.row, c: target.col };
    const isKillingBlow = !target.hasShield;
    const stagingOccupant = isKillingBlow ? null : getPiece(state.board, staging.r, staging.c);
    const isAdjacentStaging = staging.r === attacker.row && staging.c === attacker.col;
    const isDeathStaging = !isKillingBlow && stagingOccupant?.type === PIECE_TYPES.DEATH;
    if (!isKillingBlow && !isAdjacentStaging && stagingOccupant && !isDeathStaging)
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
        intimidationSuppressedShield: target.intimidationSuppressedShield
      },
      from: { r: attacker.row, c: attacker.col },
      to: { r: target.row, c: target.col },
      path: isKillingBlow ? details.killPath ?? details.path ?? [] : details.path ?? [],
      deathStaging: isDeathStaging,
      consumes: { standard: true, special: false }
    };
    if (isDeathStaging) {
      return [
        withActionId({
          ...base,
          staging: { r: staging.r, c: staging.c }
        })
      ];
    }
    if (!isKillingBlow) {
      return [
        withActionId({
          ...base,
          staging: { r: staging.r, c: staging.c },
          rest: { r: staging.r, c: staging.c }
        })
      ];
    }
    return promotionVariants(state, attacker, {
      ...base,
      rest: targetSquare
    }).map(withActionId);
  }
  function knightStagingSquares(state, knight, target) {
    const dr = target.row - knight.row;
    const dc = target.col - knight.col;
    if (!(Math.abs(dr) === 2 && Math.abs(dc) === 1 || Math.abs(dr) === 1 && Math.abs(dc) === 2)) {
      return [];
    }
    const candidates = [
      { r: target.row - Math.sign(dr), c: target.col },
      { r: target.row, c: target.col - Math.sign(dc) }
    ];
    return candidates.filter((square) => {
      if (!isValidSquare(square.r, square.c))
        return false;
      if (square.r === knight.row && square.c === knight.col)
        return false;
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
        { r: knight.row + rowStep, c: knight.col + colStep }
      ];
    } else if (Math.abs(dr) === 1 && Math.abs(dc) === 2) {
      path = [
        { r: knight.row, c: knight.col + colStep },
        { r: knight.row + rowStep, c: knight.col + colStep }
      ];
    }
    return path.filter((square) => isValidSquare(square.r, square.c));
  }
  function generateLifeDeathMoves(state, piece) {
    const actions = [];
    for (const [dr, dc] of BISHOP_DIRS) {
      const to = { r: piece.row + dr, c: piece.col + dc };
      if (!isValidSquare(to.r, to.c))
        continue;
      if (getPiece(state.board, to.r, to.c))
        continue;
      if (piece.type === PIECE_TYPES.LIFE && !isLightSquare(to.r, to.c))
        continue;
      if (piece.type === PIECE_TYPES.DEATH && !isDarkSquare(to.r, to.c))
        continue;
      actions.push(withActionId({
        kind: "move",
        mode: "lifeDeathMove",
        pieceId: piece.id,
        pieceType: piece.type,
        from: { r: piece.row, c: piece.col },
        to,
        path: [],
        consumes: { standard: false, special: true }
      }));
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
      if (!target || !isLightSquare(target.row, target.col))
        continue;
      if (!canHaveShield(target.type) || target.hasShield || target.isImmune || target.isIntimidated)
        continue;
      actions.push(withActionId({
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
          hadShield: target.hasShield
        },
        from: { r: piece.row, c: piece.col },
        to: { r: target.row, c: target.col },
        consumes: { standard: true, special: true }
      }));
    }
    return actions;
  }
  function generateDeathKillActions(state, piece) {
    const actions = [];
    for (const [dr, dc] of BISHOP_DIRS) {
      const target = getPiece(state.board, piece.row + dr, piece.col + dc);
      if (!target || target.isImmune || !isDarkSquare(target.row, target.col))
        continue;
      if (target.type === PIECE_TYPES.DEATH)
        continue;
      if (isProtectedFromDeath(target, state))
        continue;
      actions.push(withActionId({
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
          hadShield: target.hasShield
        },
        from: { r: piece.row, c: piece.col },
        to: { r: target.row, c: target.col },
        consumes: { standard: true, special: true }
      }));
    }
    return actions;
  }
  function isProtectedFromDeath(target, state) {
    for (const [dr, dc] of ROOK_DIRS) {
      const protector = getPiece(state.board, target.row + dr, target.col + dc);
      if (protector && ownerOf(protector) === ownerOf(target))
        return true;
    }
    return false;
  }
  function applyAction(state, action, options = {}) {
    const recordHistoryEntry = options.recordHistory ?? true;
    const next = cloneState(state, { preserveHistory: recordHistoryEntry });
    if (next.gameOver)
      return next;
    const actorColor = next.currentPlayer;
    const previousEnPassant = next.enPassant ? { ...next.enPassant } : null;
    if (action.kind === "move")
      applyMoveAction(next, action);
    if (action.kind === "attack")
      applyAttackAction(next, action);
    if (action.kind === "special")
      applySpecialAction(next, action);
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
    if (!next.gameOver)
      updateIntimidation(next);
    normalizeTurn(next);
    return next;
  }
  function applyMoveAction(state, action) {
    const piece = findPieceById(state, action.pieceId);
    if (!piece)
      return;
    if (action.mode === "castle") {
      const rook = findPieceById(state, action.rookId);
      if (!rook)
        return;
      movePiece(state, piece, action.to.r, action.to.c);
      movePiece(state, rook, action.rookTo.r, action.rookTo.c);
      piece.hasMoved = true;
      rook.hasMoved = true;
      return;
    }
    const jumpedPiece = action.jumpedPieceId ? findPieceById(state, action.jumpedPieceId) : null;
    const destroyed = applyPathEffects(state, piece, jumpedPiece ? [{ r: jumpedPiece.row, c: jumpedPiece.col }] : action.path ?? []);
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
    if (!attacker || !target || target.isImmune)
      return;
    const attackerFrom = { r: attacker.row, c: attacker.col };
    const diesAfterAttack = applyPathEffects(state, attacker, action.path ?? []) || action.deathStaging;
    setPiece(state.board, attackerFrom.r, attackerFrom.c, null);
    attacker.hasMoved = true;
    const targetHadShield = target.hasShield;
    if (targetHadShield) {
      target.hasShield = false;
    } else {
      removePiece(state, target);
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
    if (!piece || !target)
      return;
    if (action.mode === "heal") {
      if (canHaveShield(target.type) && !target.hasShield && !target.isImmune && !target.isIntimidated && isLightSquare(target.row, target.col)) {
        target.hasShield = true;
        target.isImmune = true;
        target.immunityGrantedBy = ownerOf(piece);
      }
      return;
    }
    if (action.mode === "kill" && !target.isImmune && target.type !== PIECE_TYPES.DEATH && isDarkSquare(target.row, target.col) && !isProtectedFromDeath(target, state)) {
      removePiece(state, target);
      setPiece(state.board, piece.row, piece.col, null);
      setPiece(state.board, action.to.r, action.to.c, piece);
      piece.hasMoved = true;
    }
  }
  function applyPathEffects(state, movingPiece, path) {
    for (const square of path) {
      const staticPiece = getPiece(state.board, square.r, square.c);
      if (!staticPiece || !LIFE_DEATH_PIECES.has(staticPiece.type) || movingPiece.isImmune)
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
    if (!isPromotionRank(piece))
      return;
    const promotedType = PROMOTION_TYPES.includes(promotionType) ? promotionType : PIECE_TYPES.QUEEN;
    const inheritedShield = piece.hasShield;
    piece.type = promotedType;
    piece.hasShield = promotedType === PIECE_TYPES.QUEEN ? false : inheritedShield;
  }
  function applyTurnConsumption(state, action) {
    if (action.consumes?.standard)
      state.turn.standardMoveMade = true;
    if (action.consumes?.special)
      state.turn.specialMoveMade = true;
  }
  function recordAction(state, action) {
    state.actionHistory = [
      ...state.actionHistory ?? [],
      structuredClone(action)
    ];
  }
  function updateEnPassant(state, action, previousEnPassant, actorColor) {
    if (action.enPassantOpportunity) {
      const pawn = findPieceById(state, action.pieceId);
      state.enPassant = pawn ? {
        ...action.enPassantOpportunity,
        pieceId: pawn.id,
        color: pawn.color
      } : null;
      return;
    }
    if (previousEnPassant && previousEnPassant.eligibleColor === actorColor && action.consumes?.standard) {
      state.enPassant = null;
    }
  }
  function normalizeTurn(state) {
    if (state.gameOver)
      return state;
    checkForMaterialDraw(state);
    if (state.gameOver)
      return state;
    let skipped = 0;
    while (!state.gameOver && generateLegalActions(state).length === 0) {
      skipped += 1;
      if (skipped > 1) {
        state.gameOver = {
          winner: null,
          reason: "No legal moves for either player"
        };
        break;
      }
      switchTurn(state);
    }
    return state;
  }
  function switchTurn(state) {
    const previousPlayer = state.currentPlayer;
    state.currentPlayer = oppositeColor(state.currentPlayer);
    state.turn = { standardMoveMade: false, specialMoveMade: false };
    if (previousPlayer === COLORS.BLACK && state.currentPlayer === COLORS.WHITE) {
      state.moveNumber += 1;
    }
    if (state.enPassant && state.enPassant.eligibleColor !== state.currentPlayer) {
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
    const lifeDeath = allPieces(state).filter((piece) => LIFE_DEATH_PIECES.has(piece.type));
    const doomed = new Set;
    for (let i = 0;i < lifeDeath.length; i++) {
      for (let j = i + 1;j < lifeDeath.length; j++) {
        const a = lifeDeath[i];
        const b = lifeDeath[j];
        if (a.type === b.type)
          continue;
        const adjacentOrthogonal = Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
        if (adjacentOrthogonal) {
          doomed.add(a.id);
          doomed.add(b.id);
        }
      }
    }
    for (const id of doomed) {
      const piece = findPieceById(state, id);
      if (piece)
        removePiece(state, piece);
    }
  }
  function checkForMaterialDraw(state) {
    if (state.gameOver)
      return;
    const pieces = allPieces(state);
    const kings = pieces.filter((piece) => piece.type === PIECE_TYPES.KING);
    if (kings.length !== 2)
      return;
    const hasDestructionMaterial = pieces.some((piece) => piece.type !== PIECE_TYPES.KING && piece.type !== PIECE_TYPES.LIFE);
    if (!hasDestructionMaterial) {
      state.gameOver = {
        winner: null,
        reason: "Only kings and Life pieces remain"
      };
    }
  }
  function updateIntimidation(state) {
    const pieces = allPieces(state);
    for (const piece of pieces) {
      if (!piece.isIntimidated)
        continue;
      const enemyKing = findKing(state, oppositeColor(ownerOf(piece)));
      const stillChecking = enemyKing && attacksKing(state, piece, enemyKing);
      if (!stillChecking) {
        piece.isIntimidated = false;
        if (piece.intimidationSuppressedShield && canHaveShield(piece.type))
          piece.hasShield = true;
        piece.intimidationSuppressedShield = false;
      }
    }
    for (const king of pieces.filter((piece) => piece.type === PIECE_TYPES.KING)) {
      for (const attacker of pieces) {
        if (ownerOf(attacker) === king.color)
          continue;
        if (!attacksKing(state, attacker, king))
          continue;
        if (!attacker.isIntimidated) {
          attacker.intimidationSuppressedShield = attacker.hasShield;
          attacker.hasShield = false;
          attacker.isIntimidated = true;
        }
      }
    }
  }
  function clearIntimidation(state) {
    for (const piece of allPieces(state)) {
      if (!piece.isIntimidated)
        continue;
      piece.isIntimidated = false;
      if (piece.intimidationSuppressedShield && canHaveShield(piece.type))
        piece.hasShield = true;
      piece.intimidationSuppressedShield = false;
    }
  }
  function attacksKing(state, piece, king) {
    if (!STANDARD_PIECES.has(piece.type))
      return false;
    return generateStandardAttacks(state, piece).some((action) => action.targetId === king.id);
  }
  function findKing(state, color) {
    return allPieces(state).find((piece) => piece.type === PIECE_TYPES.KING && piece.color === color) ?? null;
  }
  function promotionVariants(state, piece, action) {
    const destination = action.rest ?? action.to;
    if (piece.type !== PIECE_TYPES.PAWN)
      return [action];
    const promotionRow = piece.color === COLORS.WHITE ? 0 : BOARD_SIZE - 1;
    if (!destination || destination.r !== promotionRow)
      return [action];
    return PROMOTION_TYPES.map((promotionType) => ({
      ...action,
      promotionType
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
      if (!isValidSquare(r, c))
        return [];
      path.push({ r, c });
      r += dr;
      c += dc;
    }
    return path;
  }
  function dedupeActions(actions) {
    const seen = new Set;
    return actions.filter((action) => {
      const key = actionKey(action);
      if (seen.has(key))
        return false;
      seen.add(key);
      return true;
    });
  }
  function rampSequenceKey(sequence = []) {
    return sequence.map((step) => `${squareKey(step.ramp)}>${squareKey(step.land)}`).join(";");
  }
  function sortActions(actions) {
    return [...dedupeActions(actions)].sort((a, b) => actionSortScore(b) - actionSortScore(a) || a.id.localeCompare(b.id));
  }
  function actionSortScore(action) {
    let score = 0;
    if (action.kind === "attack")
      score += 1000 + (MATERIAL_VALUES[action.target?.type] ?? 0);
    if (action.mode === "kill")
      score += 1400 + (MATERIAL_VALUES[action.target?.type] ?? 0);
    if (action.mode === "heal")
      score += 120;
    if (action.mode === "castle")
      score += 80;
    if (action.promotionType)
      score += MATERIAL_VALUES[action.promotionType] ?? 0;
    if (action.target?.hadShield)
      score -= 150;
    return score;
  }

  // src/engine/ai.js
  var DEFAULT_OPTIONS = {
    maxDepth: 3,
    maxActions: 36,
    maxTacticalActions: 8,
    quiescenceDepth: 0,
    tacticalWeight: 1,
    transpositionLimit: 50000,
    evaluationLimit: 50000,
    actionCacheLimit: 50000,
    timeLimitMs: 0,
    hardTimeLimitMs: 0,
    depthStartMargin: 1.75,
    priorityOverflowLimit: 12,
    forcedRootTactics: 6
  };
  var LIFE_DEATH_STRATEGIC_VALUES = {
    [PIECE_TYPES.LIFE]: 460,
    [PIECE_TYPES.DEATH]: 760
  };
  function chooseAiAction(state, color = "black", options = {}) {
    const settings = { ...DEFAULT_OPTIONS, ...options };
    settings.transposition = new Map;
    settings.evaluations = new Map;
    settings.actionCache = new Map;
    settings.startedAt = now();
    settings.softDeadline = settings.timeLimitMs > 0 ? settings.startedAt + settings.timeLimitMs : Number.POSITIVE_INFINITY;
    settings.deadline = hardDeadline(settings);
    settings.timedOut = false;
    const legalRootActions = legalActionsForSearch(state, color, settings);
    const rootTactics = findRootTactics(state, legalRootActions, color, settings);
    const dominantTactic = rootTactics[0] ?? null;
    if (dominantTactic?.forceImmediate)
      return dominantTactic.action;
    let actions = selectSearchActions(state, legalRootActions, color, settings, rootTactics.map((tactic) => tactic.action));
    if (actions.length === 0)
      return null;
    let best = { action: actions[0], score: Number.NEGATIVE_INFINITY };
    const maxDepth = Math.max(1, settings.maxDepth);
    let lastDepthMs = 0;
    for (let depth = 1;depth <= maxDepth; depth++) {
      if (!shouldStartDepth(settings, depth, lastDepthMs, maxDepth))
        break;
      settings.timedOut = false;
      const depthStartedAt = now();
      const result = searchRoot(state, color, settings, actions, depth);
      const depthElapsed = now() - depthStartedAt;
      if (result.action && (result.completed || depth === 1)) {
        best = result;
        actions = promoteAction(actions, result.action);
      }
      if (result.completed)
        lastDepthMs = depthElapsed;
      if (!result.completed || isSoftTimeUp(settings))
        break;
    }
    return maybePreferDominantTactic(state, best.action, dominantTactic, color, settings);
  }
  function searchRoot(state, color, settings, actions, depth) {
    let bestAction = actions[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    let alpha = Number.NEGATIVE_INFINITY;
    const beta = Number.POSITIVE_INFINITY;
    for (const action of actions) {
      if (isTimeUp(settings) && bestScore > Number.NEGATIVE_INFINITY) {
        settings.timedOut = true;
        return { action: bestAction, score: bestScore, completed: false };
      }
      const next = applySearchAction(state, action);
      const nextDepth = nextDepthAfterAction(state, next, depth);
      const score = (nextDepth <= 0 ? evaluateForSearch(next, color, settings) : minimax(next, nextDepth, alpha, beta, color, settings)) + actionHeuristic(state, action, color) * rootHeuristicWeight(depth) + rootTacticalScore(state, next, action, color, settings);
      if (score > bestScore || score === bestScore && compareAiActions(state, action, bestAction, color) < 0) {
        bestScore = score;
        bestAction = action;
      }
      alpha = Math.max(alpha, bestScore);
    }
    return {
      action: bestAction,
      score: bestScore,
      completed: !settings.timedOut
    };
  }
  function minimax(state, depth, alpha, beta, aiColor, settings) {
    if (state.gameOver)
      return evaluateForSearch(state, aiColor, settings);
    if (depth <= 0)
      return quiescence(state, settings.quiescenceDepth, alpha, beta, aiColor, settings);
    if (isTimeUp(settings)) {
      settings.timedOut = true;
      return evaluateForSearch(state, aiColor, settings);
    }
    const cacheKey = stateKey(state, depth, aiColor);
    const alphaStart = alpha;
    const betaStart = beta;
    const cached = settings.transposition?.get(cacheKey);
    if (cached) {
      if (cached.flag === "exact")
        return cached.value;
      if (cached.flag === "lower")
        alpha = Math.max(alpha, cached.value);
      if (cached.flag === "upper")
        beta = Math.min(beta, cached.value);
      if (alpha >= beta)
        return cached.value;
    }
    const legalActions = legalActionsForSearch(state, state.currentPlayer, settings);
    const cachedAction = cached?.bestActionId ? legalActions.find((action) => action.id === cached.bestActionId) : null;
    const actions = selectSearchActions(state, legalActions, aiColor, settings, cachedAction ? [cachedAction] : []);
    if (actions.length === 0)
      return evaluateForSearch(state, aiColor, settings);
    const maximizing = state.currentPlayer === aiColor;
    if (maximizing) {
      let value2 = Number.NEGATIVE_INFINITY;
      let bestActionId2 = actions[0]?.id ?? null;
      for (const action of actions) {
        const next = applySearchAction(state, action);
        const score = minimax(next, nextDepthAfterAction(state, next, depth), alpha, beta, aiColor, settings) + transitionTacticalScore(state, next, action, aiColor, settings) * continuationTacticalWeight(depth);
        if (score > value2) {
          value2 = score;
          bestActionId2 = action.id;
        }
        alpha = Math.max(alpha, value2);
        if (alpha >= beta) {
          break;
        }
      }
      if (!settings.timedOut)
        cacheValue(settings, cacheKey, value2, alphaStart, betaStart, bestActionId2);
      return value2;
    }
    let value = Number.POSITIVE_INFINITY;
    let bestActionId = actions[0]?.id ?? null;
    for (const action of actions) {
      const next = applySearchAction(state, action);
      const score = minimax(next, nextDepthAfterAction(state, next, depth), alpha, beta, aiColor, settings) + transitionTacticalScore(state, next, action, aiColor, settings) * continuationTacticalWeight(depth);
      if (score < value) {
        value = score;
        bestActionId = action.id;
      }
      beta = Math.min(beta, value);
      if (alpha >= beta) {
        break;
      }
    }
    if (!settings.timedOut)
      cacheValue(settings, cacheKey, value, alphaStart, betaStart, bestActionId);
    return value;
  }
  function quiescence(state, depth, alpha, beta, aiColor, settings) {
    const standPat = evaluateForSearch(state, aiColor, settings);
    if (state.gameOver || depth <= 0 || isTimeUp(settings)) {
      if (isTimeUp(settings))
        settings.timedOut = true;
      return standPat;
    }
    const actions = selectSearchActions(state, legalActionsForSearch(state, state.currentPlayer, settings).filter(isForcingAction), aiColor, { ...settings, maxActions: settings.maxTacticalActions });
    if (actions.length === 0)
      return standPat;
    const maximizing = state.currentPlayer === aiColor;
    if (maximizing) {
      let value2 = standPat;
      alpha = Math.max(alpha, value2);
      for (const action of actions) {
        const next = applySearchAction(state, action);
        value2 = Math.max(value2, quiescence(next, nextDepthAfterAction(state, next, depth), alpha, beta, aiColor, settings) + transitionTacticalScore(state, next, action, aiColor, settings) * continuationTacticalWeight(depth));
        alpha = Math.max(alpha, value2);
        if (isTimeUp(settings))
          settings.timedOut = true;
        if (alpha >= beta || settings.timedOut)
          break;
      }
      return value2;
    }
    let value = standPat;
    beta = Math.min(beta, value);
    for (const action of actions) {
      const next = applySearchAction(state, action);
      value = Math.min(value, quiescence(next, nextDepthAfterAction(state, next, depth), alpha, beta, aiColor, settings) + transitionTacticalScore(state, next, action, aiColor, settings) * continuationTacticalWeight(depth));
      beta = Math.min(beta, value);
      if (isTimeUp(settings))
        settings.timedOut = true;
      if (alpha >= beta || settings.timedOut)
        break;
    }
    return value;
  }
  function applySearchAction(state, action) {
    return applyAction(state, action, { recordHistory: false });
  }
  function nextDepthAfterAction(before, after, depth) {
    if (depth <= 0 || after.gameOver)
      return 0;
    return after.currentPlayer === before.currentPlayer ? depth : depth - 1;
  }
  function promoteAction(actions, preferred) {
    if (!preferred || actions[0]?.id === preferred.id)
      return actions;
    const index = actions.findIndex((action) => action.id === preferred.id);
    if (index <= 0)
      return actions;
    return [
      actions[index],
      ...actions.slice(0, index),
      ...actions.slice(index + 1)
    ];
  }
  function evaluateForSearch(state, color, settings) {
    const key = stateKey(state, 0, color);
    const cached = settings.evaluations?.get(key);
    if (cached !== undefined)
      return cached;
    const value = evaluateState(state, color, {
      actionsProvider: (targetState, targetColor, actionOptions = {}) => legalActionsForSearch(targetState, targetColor, settings, actionOptions)
    });
    cacheLimitedValue(settings.evaluations, settings.evaluationLimit, key, value);
    return value;
  }
  function legalActionsForSearch(state, color = state.currentPlayer, settings = DEFAULT_OPTIONS, options = {}) {
    const respectTurn = options.respectTurn ?? true;
    const includeSkip = options.includeSkip ?? true;
    const key = [
      stateKey(state, 0, color),
      respectTurn ? 1 : 0,
      includeSkip ? 1 : 0
    ].join("~actions~");
    const cached = settings.actionCache?.get(key);
    if (cached)
      return cached;
    const actions = generateLegalActions(state, color, {
      ...options,
      respectTurn,
      includeSkip
    });
    cacheLimitedValue(settings.actionCache, settings.actionCacheLimit, key, actions);
    return actions;
  }
  function findRootTactics(state, actions, color, settings) {
    if ((settings.tacticalWeight ?? 1) < 1.4)
      return [];
    const tactics = [];
    for (const action of actions) {
      const score = safeRootTacticalScore(state, action, color, settings);
      if (score <= 0)
        continue;
      tactics.push({ action, score, forceImmediate: false });
    }
    tactics.sort((a, b) => b.score - a.score || compareAiActions(state, a.action, b.action, color));
    if (tactics.length === 0)
      return [];
    for (const tactic of tactics) {
      if (tactic.action.target?.type === PIECE_TYPES.KING) {
        tactic.forceImmediate = true;
      }
      if (tactic.action.mode === "kill" && tactic.score >= 980 && hasInferiorShieldBreakOnSameTarget(actions, tactic.action)) {
        tactic.forceImmediate = true;
      }
    }
    return tactics.slice(0, settings.forcedRootTactics ?? 6);
  }
  function maybePreferDominantTactic(state, bestAction, dominantTactic, color, settings) {
    if (!dominantTactic || bestAction.id === dominantTactic.action.id)
      return bestAction;
    const bestImmediateScore = safeRootTacticalScore(state, bestAction, color, settings);
    const margin = dominantTacticMargin(dominantTactic.action);
    if (dominantTactic.score > bestImmediateScore + margin && dominantTactic.score >= dominantTacticThreshold(dominantTactic.action)) {
      return dominantTactic.action;
    }
    return bestAction;
  }
  function safeRootTacticalScore(state, action, color, settings) {
    const immediate = immediateTacticalScore(state, action, color);
    if (immediate <= 0)
      return 0;
    const actor = findPieceById(state, action.pieceId);
    const after = applySearchAction(state, action);
    const exposure = postActionExposurePenalty(after, action, color, settings);
    const destruction = selfDestructionPenalty(after, actor, action, color);
    return Math.max(0, immediate - exposure * 0.65 - destruction * 0.8);
  }
  function dominantTacticMargin(action) {
    if (action.mode === "kill")
      return 220;
    if (action.kind === "attack" && !action.target?.hadShield)
      return 180;
    return 420;
  }
  function dominantTacticThreshold(action) {
    if (action.target?.type === PIECE_TYPES.KING)
      return 1;
    if (action.mode === "kill")
      return 760;
    if (action.kind === "attack" && !action.target?.hadShield)
      return 620;
    return 980;
  }
  function immediateTacticalScore(state, action, color) {
    if (!action?.target)
      return 0;
    const targetOwner = ownerFromSnapshot(action.target);
    if (targetOwner === color)
      return 0;
    if (action.target.type === PIECE_TYPES.KING)
      return 1e6;
    let score = 0;
    if (action.mode === "kill") {
      score = 760 + targetActionValue(action) * 2.25 + (action.target.hadShield ? 260 + shieldValueForType(action.target.type) * 1.25 : 0);
    } else if (action.kind === "attack" && !action.target.hadShield) {
      score = 340 + targetActionValue(action) * 1.65;
    } else if (action.kind === "attack" && action.target.hadShield) {
      score = shieldPressureValue(action.target) * 1.15;
    }
    if (score <= 0)
      return 0;
    score += lifeDeathTransferScore(state, action, color);
    score += lifeDeathAnnihilationScore(state, action, color);
    const actor = findPieceById(state, action.pieceId);
    const after = applySearchAction(state, action);
    if (actor && action.target.type !== PIECE_TYPES.KING && !findPieceById(after, action.pieceId)) {
      score -= pieceStake(actor) * 1.15;
    }
    return Math.max(0, score);
  }
  function hasInferiorShieldBreakOnSameTarget(actions, tactic) {
    return actions.some((action) => action.id !== tactic.id && action.kind === "attack" && action.targetId === tactic.targetId && action.target?.hadShield);
  }
  function evaluateState(state, color = "black", options = {}) {
    if (state.gameOver) {
      if (!state.gameOver.winner)
        return 0;
      return state.gameOver.winner === color ? 1e6 : -1e6;
    }
    const actionsFor = options.actionsProvider ?? ((targetState, targetColor, actionOptions) => generateLegalActions(targetState, targetColor, actionOptions));
    let score = 0;
    const lifeCounts = lifeCountsByOwner(state);
    for (const piece of allPieces(state)) {
      const sign = ownerOf(piece) === color ? 1 : -1;
      let value = materialValue(piece.type);
      if (piece.hasShield)
        value += shieldValueForType(piece.type);
      if (piece.isImmune)
        value += 45;
      if (piece.isIntimidated)
        value -= 85;
      if (piece.type === PIECE_TYPES.PAWN)
        value += pawnProgress(piece) * 9;
      value += positionalValue(piece, state, color);
      if (piece.type === PIECE_TYPES.LIFE || piece.type === PIECE_TYPES.DEATH)
        value += lifeDeathPositionValue(piece);
      value += shieldRepairContextValue(piece, lifeCounts.get(ownerOf(piece)) ?? 0);
      score += sign * value;
    }
    const ownKing = findKing(state, color);
    const enemyKing = findKing(state, color === "white" ? "black" : "white");
    if (!ownKing)
      score -= 900000;
    if (!enemyKing)
      score += 900000;
    const enemy = oppositeColor(color);
    const currentActions = actionsFor(state, state.currentPlayer);
    const ownActions = actionsFor(state, color, { respectTurn: false });
    const enemyActions = actionsFor(state, enemy, {
      respectTurn: false
    });
    score += (state.currentPlayer === color ? 1 : -1) * Math.min(currentActions.length, 20) * 2;
    score += threatPressure(ownActions, enemyActions);
    score += controlScore(ownActions, enemyActions, color);
    score += promotionPressure(state, color);
    score += lifeDeathAccessScore(state, color);
    score += kingSafetyScore(state, color);
    score += materialSafetyScore(ownActions, enemyActions, color);
    score += healPotentialScore(state, color);
    return score;
  }
  function orderAiActions(state, actions, color, settings, context = buildActionContext(state, settings)) {
    const direction = state.currentPlayer === color ? 1 : -1;
    const scores = new Map(actions.map((action) => [
      action.id,
      actionHeuristic(state, action, color, settings, context)
    ]));
    return [...actions].sort((a, b) => direction * (scores.get(b.id) - scores.get(a.id)) || a.id.localeCompare(b.id));
  }
  function selectSearchActions(state, actions, color, settings, forced = []) {
    const context = buildActionContext(state, settings);
    const disciplinedActions = actions.filter((action) => !isBadFatalShieldBreak(state, action));
    const candidateActions = disciplinedActions.length > 0 ? disciplinedActions : actions;
    const nonDominatedActions = candidateActions.filter((action) => !isDominatedBySameRestShieldBreak(candidateActions, action));
    const ordered = orderAiActions(state, sortActions(nonDominatedActions.length > 0 ? nonDominatedActions : candidateActions), color, settings, context);
    const selected = ordered.slice(0, settings.maxActions);
    const selectedIds = new Set(selected.map((action) => action.id));
    for (const action of forced) {
      if (action && !selectedIds.has(action.id)) {
        selected.push(action);
        selectedIds.add(action.id);
      }
    }
    const priorityLimit = settings.maxActions + (settings.priorityOverflowLimit ?? 12);
    for (const action of ordered) {
      if (selected.length >= priorityLimit)
        break;
      if (!isPriorityAction(action, context) || selectedIds.has(action.id))
        continue;
      selected.push(action);
      selectedIds.add(action.id);
    }
    return selected;
  }
  function isDominatedBySameRestShieldBreak(actions, action) {
    if (action.kind !== "move" || action.mode !== "slide" || !action.to)
      return false;
    return actions.some((candidate) => candidate.kind === "attack" && candidate.mode === "rangedAttack" && candidate.pieceId === action.pieceId && candidate.target?.hadShield && candidate.rest && sameSquare(candidate.rest, action.to));
  }
  function isBadFatalShieldBreak(state, action) {
    if (action.kind !== "attack" || !action.target?.hadShield || action.target?.type === PIECE_TYPES.KING) {
      return false;
    }
    const actor = findPieceById(state, action.pieceId);
    if (!actor || !pathEffectReport(state, action).diesAfterAction)
      return false;
    return pieceStake(actor) > shieldPressureValue(action.target) * 1.4;
  }
  function compareAiActions(state, a, b, color) {
    return actionHeuristic(state, b, color) - actionHeuristic(state, a, color) || a.id.localeCompare(b.id);
  }
  function buildActionContext(state, settings = DEFAULT_OPTIONS) {
    const mover = state.currentPlayer;
    const opponent = oppositeColor(mover);
    const threats = exposureByTarget(legalActionsForSearch(state, opponent, settings, { respectTurn: false }), mover);
    return {
      mover,
      threats,
      threatenedIds: new Set(threats.keys())
    };
  }
  function actionHeuristic(state, action, color, settings = DEFAULT_OPTIONS, context = buildActionContext(state, settings)) {
    let score = 0;
    const pathReport = pathEffectReport(state, action);
    const targetOwner = action.target ? ownerFromSnapshot(action.target) : null;
    const targetSign = targetOwner === color ? -1 : 1;
    if (action.target?.type === PIECE_TYPES.KING)
      score += targetSign * 80000;
    if (action.kind === "attack")
      score += targetSign * attackActionValue(action);
    if (action.kind === "attack" && action.target?.isIntimidated) {
      score += targetSign * intimidatedTargetActionValue(action);
    }
    if (action.mode === "kill") {
      const targetValue = targetActionValue(action);
      const shieldExecutionBonus = action.target?.hadShield ? 260 + shieldValueForType(action.target.type) * 1.4 : 0;
      score += targetSign * (950 + targetValue * 2.7 + shieldExecutionBonus);
      if (targetOwner === color)
        score -= 900 + targetValue * 1.35;
    }
    if (action.mode === "heal")
      score += healActionValue(state, action, color);
    const actor = findPieceById(state, action.pieceId);
    const actorColor = actor ? ownerOf(actor) : action.color;
    const actorPerspective = actorColor ?? color;
    const actorSign = actorColor && actorColor !== color ? -1 : 1;
    const destination = actionDestination(action);
    if (action.mode === "castle")
      score += actorSign * 90;
    if (action.promotionType)
      score += actorSign * materialValue(action.promotionType);
    if (destination)
      score += actorSign * squareQuality(destination.r, destination.c, actorPerspective) * 5;
    if (action.from && destination) {
      score += actorSign * developmentDelta(action, actorPerspective);
      score += actorSign * pawnMoveQuality(state, action, actorPerspective);
      score += actorSign * lifeDeathGateMoveBonus(state, action, actorPerspective);
      score += actorSign * lifeDeathMoveActionValue(state, action, actorPerspective);
      score += lifeDeathTransferScore(state, action, color);
      score += lifeDeathAnnihilationScore(state, action, color);
      score += actorSign * pathEffectScore(pathReport);
    }
    score += defensiveActionOrderingScore(state, action, color, context);
    if (action.target?.hadShield && action.target?.type !== PIECE_TYPES.KING)
      score -= targetSign * 18;
    return score;
  }
  function defensiveActionOrderingScore(state, action, color, context) {
    const actor = findPieceById(state, action.pieceId);
    const actorOwner = actor ? ownerOf(actor) : action.color ?? state.currentPlayer;
    const sign = actorOwner === color ? 1 : -1;
    let score = 0;
    const actorRisk = context?.threats?.get(action.pieceId)?.risk ?? 0;
    if (actorRisk > 0 && (action.kind === "move" || action.kind === "attack")) {
      score += sign * Math.min(950, actorRisk * 0.85 + pieceStake(actor) * 0.16);
    }
    const targetRisk = context?.threats?.get(action.targetId)?.risk ?? 0;
    const targetOwner = action.target ? ownerFromSnapshot(action.target) : null;
    if (action.mode === "heal" && targetRisk > 0 && targetOwner === actorOwner) {
      score += sign * Math.min(600, targetRisk * 0.7 + shieldValueForType(action.target?.type));
    }
    return score;
  }
  function rootTacticalScore(before, after, action, color, settings) {
    const actor = findPieceById(before, action.pieceId);
    if (!actor || ownerOf(actor) !== color)
      return 0;
    let score = 0;
    if (action.kind === "attack") {
      score += captureTacticalBonus(actor, action);
      score += intimidatedTargetTacticalBonus(action, color);
      score += shieldBreakTacticalBonus(after, actor, action, color);
      score += shieldTradeDiscipline(actor, action);
      score -= missedDeathKillPenalty(before, action, color, settings);
    }
    if (action.mode === "kill")
      score += deathKillTacticalBonus(action, color);
    if (action.mode === "heal")
      score += healTacticalBonus(action, color);
    score += pathEffectScore(pathEffectReport(before, action)) * 0.72;
    score += lifeDeathTransferScore(before, action, color) * 0.85;
    score += lifeDeathAnnihilationScore(before, action, color) * 0.9;
    score += defensiveRootScore(before, after, actor, action, color, settings);
    score += teamSafetyDeltaScore(before, after, color, settings);
    score -= selfDestructionPenalty(after, actor, action, color);
    score -= postActionExposurePenalty(after, action, color, settings);
    return score * (settings.tacticalWeight ?? 1);
  }
  function transitionTacticalScore(before, after, action, aiColor, settings) {
    const actor = findPieceById(before, action.pieceId);
    if (!actor)
      return 0;
    const actorOwner = ownerOf(actor);
    const score = rootTacticalScore(before, after, action, actorOwner, settings);
    return actorOwner === aiColor ? score : -score;
  }
  function continuationTacticalWeight(depth) {
    if (depth >= 6)
      return 0.16;
    if (depth >= 4)
      return 0.2;
    return 0.26;
  }
  function captureTacticalBonus(actor, action) {
    if (action.kind !== "attack" || action.target?.hadShield || action.target?.type === PIECE_TYPES.KING)
      return 0;
    const targetValue = materialValue(action.target?.type);
    const actorValue = materialValue(actor?.type);
    const favorableTrade = Math.max(0, targetValue - actorValue * 0.55);
    return 260 + targetValue * 0.92 + favorableTrade * 0.34;
  }
  function intimidatedTargetActionValue(action) {
    const targetValue = targetActionValue(action);
    const suppressedShield = action.target?.intimidationSuppressedShield ? shieldValueForType(action.target.type) : 0;
    return 260 + targetValue * 0.38 + suppressedShield * 0.85;
  }
  function intimidatedTargetTacticalBonus(action, color) {
    if (action.kind !== "attack" || !action.target?.isIntimidated)
      return 0;
    const sign = ownerFromSnapshot(action.target) === color ? -1 : 1;
    const targetValue = targetActionValue(action);
    const suppressedShield = action.target?.intimidationSuppressedShield ? shieldValueForType(action.target.type) : 0;
    return sign * (360 + targetValue * 0.92 + suppressedShield * 1.1);
  }
  function shieldTradeDiscipline(actor, action) {
    if (!action.target?.hadShield || action.target?.type === PIECE_TYPES.KING)
      return 0;
    const actorStake = materialValue(actor.type) + (actor.hasShield ? shieldValueForType(actor.type) : 0);
    const shieldGain = shieldPressureValue(action.target);
    return -Math.max(0, actorStake - shieldGain * 3.1) * 0.18;
  }
  function shieldBreakTacticalBonus(after, actor, action, color) {
    if (!action.target?.hadShield || action.target?.type === PIECE_TYPES.KING)
      return 0;
    const targetBase = materialValue(action.target.type);
    const actorBase = materialValue(actor.type);
    const targetShield = shieldPressureValue(action.target);
    const cheapness = Math.max(0, targetBase - actorBase * 0.6);
    const pawnLever = actor.type === PIECE_TYPES.PAWN ? 80 : 0;
    let bonus = 90 + targetShield * 1.45 + targetBase * 0.16 + cheapness * 0.55 + pawnLever;
    const targetAfter = findPieceById(after, action.targetId);
    if (targetAfter)
      bonus *= shieldRepairMultiplier(after, targetAfter, oppositeColor(color));
    return bonus;
  }
  function defensiveRootScore(before, after, actor, action, color, settings) {
    if (!actor || ownerOf(actor) !== color || after.gameOver)
      return 0;
    const beforeRisk = pieceExposureRisk(before, actor.id, ownerOf(actor), settings);
    if (beforeRisk <= 0)
      return 0;
    const afterActor = findPieceById(after, action.pieceId);
    if (!afterActor)
      return -beforeRisk * 0.45;
    const afterRisk = pieceExposureRisk(after, afterActor.id, ownerOf(afterActor), settings);
    const saved = Math.max(0, beforeRisk - afterRisk);
    const worsened = Math.max(0, afterRisk - beforeRisk);
    const savedWeight = actor.type === PIECE_TYPES.KING ? 0.32 : 0.95;
    const worsenedWeight = actor.type === PIECE_TYPES.KING ? 1.05 : 0.75;
    return saved * savedWeight - worsened * worsenedWeight;
  }
  function teamSafetyDeltaScore(before, after, color, settings) {
    if (after.gameOver)
      return 0;
    const beforeExposure = exposureSummary(legalActionsForSearch(before, oppositeColor(color), settings, {
      respectTurn: false
    }), color);
    const afterExposure = exposureSummary(legalActionsForSearch(after, oppositeColor(color), settings, {
      respectTurn: false
    }), color);
    const totalDelta = beforeExposure.total - afterExposure.total;
    const urgentDelta = beforeExposure.urgent - afterExposure.urgent;
    return totalDelta * 0.18 + urgentDelta * 0.72;
  }
  function selfDestructionPenalty(after, actor, action, color) {
    if (!actor || ownerOf(actor) !== color)
      return 0;
    if (after.gameOver?.winner === color || action.target?.type === PIECE_TYPES.KING)
      return 0;
    if (findPieceById(after, action.pieceId))
      return 0;
    const stake = pieceStake(actor);
    let penalty = 420 + stake * 1.55;
    if (action.deathStaging || action.deathLanding)
      penalty += 680;
    if (action.kind === "attack" && action.target?.hadShield) {
      penalty += 980 + stake * 0.35;
    }
    const immediateGain = action.kind === "attack" && action.target ? action.target.hadShield ? shieldPressureValue(action.target) : targetActionValue(action) : 0;
    penalty -= Math.min(immediateGain * 0.35, stake * 0.5);
    return Math.max(0, penalty);
  }
  function postActionExposurePenalty(state, action, color, settings) {
    const actor = findPieceById(state, action.pieceId);
    if (!actor || ownerOf(actor) !== color || state.gameOver)
      return 0;
    let worstReply = 0;
    for (const reply of legalActionsForSearch(state, oppositeColor(color), settings, { respectTurn: false })) {
      if (reply.targetId !== actor.id)
        continue;
      worstReply = Math.max(worstReply, actionExposureValue(reply));
    }
    if (worstReply <= 0)
      return 0;
    const immediateGain = action.kind === "attack" ? action.target?.hadShield ? shieldPressureValue(action.target) : targetActionValue(action) : 0;
    const exposureWeight = immediateGain >= worstReply ? 0.35 : action.target?.hadShield ? 1.1 : 0.85;
    return worstReply * exposureWeight;
  }
  function isForcingAction(action) {
    return action.kind === "attack" || action.mode === "kill" || action.mode === "heal" || Boolean(action.promotionType);
  }
  function isPriorityAction(action, context) {
    return action.kind === "skip" || action.target?.type === PIECE_TYPES.KING || action.kind === "attack" || action.mode === "lifeDeathMove" || action.mode === "kill" || action.mode === "heal" || Boolean(action.promotionType) || context?.threatenedIds?.has(action.pieceId) || context?.threatenedIds?.has(action.targetId);
  }
  function deathKillTacticalBonus(action, color) {
    if (action.mode !== "kill")
      return 0;
    const targetValue = targetActionValue(action);
    if (ownerFromSnapshot(action.target) === color) {
      return -(1800 + targetValue * 1.4);
    }
    const shieldExecutionBonus = action.target?.hadShield ? 240 + shieldValueForType(action.target.type) * 1.2 : 0;
    return 420 + targetValue * 1.08 + shieldExecutionBonus;
  }
  function missedDeathKillPenalty(state, action, color, settings) {
    if (action.kind !== "attack" || !action.target?.hadShield || action.target?.type === PIECE_TYPES.KING) {
      return 0;
    }
    let bestKillValue = 0;
    let sameTargetKillValue = 0;
    for (const candidate of legalActionsForSearch(state, color, settings)) {
      if (candidate.mode !== "kill")
        continue;
      if (ownerFromSnapshot(candidate.target) === color)
        continue;
      const transfer = lifeDeathTransferScore(state, candidate, color);
      if (transfer < -900)
        continue;
      const annihilation = lifeDeathAnnihilationScore(state, candidate, color);
      const killValue = targetActionValue(candidate) + deathKillTacticalBonus(candidate, color) + transfer + annihilation;
      bestKillValue = Math.max(bestKillValue, killValue);
      if (candidate.targetId === action.targetId) {
        sameTargetKillValue = Math.max(sameTargetKillValue, killValue);
      }
    }
    if (sameTargetKillValue > 0)
      return 820 + sameTargetKillValue * 0.55;
    const shieldBreakValue = shieldPressureValue(action.target);
    if (bestKillValue > shieldBreakValue * 3) {
      return Math.min(780, bestKillValue * 0.34);
    }
    return 0;
  }
  function healTacticalBonus(action, color) {
    if (action.mode !== "heal")
      return 0;
    const sign = ownerFromSnapshot(action.target) === color ? 1 : -1;
    return sign * (80 + shieldValueForType(action.target?.type) * 1.1);
  }
  function pawnMoveQuality(state, action, color) {
    if (action.pieceType !== PIECE_TYPES.PAWN || action.mode !== "pawnAdvance")
      return 0;
    const fromHome = action.from.r === (color === COLORS.BLACK ? 1 : 8);
    const fileQuality = centerFileValue(action.to.c);
    const isGate = isLifeDeathGateFile(action.from.c);
    const edgePenalty = isGate ? 18 : fileQuality <= 1.5 ? 120 : fileQuality <= 2.5 ? 42 : 0;
    const step = Math.abs(action.to.r - action.from.r);
    const overextensionPenalty = step === 3 && fileQuality <= 2.5 && !isGate ? 38 : 0;
    const centralAdvance = fileQuality * (step === 1 ? 9 : 14);
    const blockedCenterBonus = fromHome && fileQuality >= 3.5 ? 18 : 0;
    return centralAdvance + blockedCenterBonus - edgePenalty - overextensionPenalty;
  }
  function pathEffectReport(state, action) {
    const actor = findPieceById(state, action.pieceId);
    const report = {
      shieldGained: false,
      shieldLost: false,
      ownDeathShieldLoss: false,
      knightDeathShieldLoss: false,
      diesAfterAction: false,
      deathStaging: Boolean(action.deathStaging),
      deathLanding: Boolean(action.deathLanding),
      lifeCount: 0,
      deathCount: 0,
      ownDeathCount: 0,
      enemyDeathCount: 0,
      knightDeathRampCount: 0,
      ownKnightDeathRampCount: 0,
      lateKnightDeathRamp: false,
      actorValue: actor ? materialValue(actor.type) : 0,
      shieldValue: actor?.hasShield ? shieldValueForType(actor.type) : 0
    };
    if (!actor)
      return report;
    if (!actor.isImmune) {
      let hasShield = actor.hasShield;
      const actorOwner = ownerOf(actor);
      for (const [index, square] of (action.path ?? []).entries()) {
        const piece = getPiece(state.board, square.r, square.c);
        if (!piece || piece.type !== PIECE_TYPES.LIFE && piece.type !== PIECE_TYPES.DEATH)
          continue;
        if (piece.type === PIECE_TYPES.LIFE) {
          report.lifeCount += 1;
          if (canHaveShield(actor.type) && !hasShield && !actor.isIntimidated) {
            hasShield = true;
            report.shieldGained = true;
          }
        }
        if (piece.type === PIECE_TYPES.DEATH) {
          const deathOwner = ownerOf(piece);
          const ownDeath = deathOwner === actorOwner;
          report.deathCount += 1;
          if (ownDeath)
            report.ownDeathCount += 1;
          else
            report.enemyDeathCount += 1;
          if (action.mode === "knightRamp") {
            report.knightDeathRampCount += 1;
            if (ownDeath)
              report.ownKnightDeathRampCount += 1;
            if (index > 0)
              report.lateKnightDeathRamp = true;
          }
          if (hasShield) {
            hasShield = false;
            report.shieldLost = true;
            if (ownDeath)
              report.ownDeathShieldLoss = true;
            if (action.mode === "knightRamp")
              report.knightDeathShieldLoss = true;
          } else {
            report.diesAfterAction = true;
            return report;
          }
        }
      }
    }
    if (action.deathStaging) {
      report.deathCount += 1;
      report.diesAfterAction = true;
    }
    if (action.deathLanding) {
      report.deathCount += 1;
      report.diesAfterAction = true;
    }
    return report;
  }
  function pathEffectScore(report) {
    let score = 0;
    if (report.shieldGained)
      score += 68;
    if (report.shieldLost)
      score -= report.shieldValue + 128;
    if (report.ownDeathShieldLoss)
      score -= 92;
    if (report.knightDeathShieldLoss)
      score -= 96;
    if (report.lateKnightDeathRamp)
      score -= 116;
    score -= report.ownKnightDeathRampCount * 142;
    score -= report.knightDeathRampCount * 72;
    if (report.diesAfterAction) {
      const shieldDestroyedWithActor = report.shieldLost ? 0 : report.shieldValue;
      score -= report.actorValue + shieldDestroyedWithActor + (report.deathStaging || report.deathLanding ? 760 : 520);
    }
    score += report.lifeCount * 8;
    score -= report.deathCount * 26;
    score -= report.ownDeathCount * 34;
    return score;
  }
  function actionDestination(action) {
    return action.rest ?? action.to ?? null;
  }
  function developmentDelta(action, color) {
    const destination = actionDestination(action);
    if (!action.from || !destination)
      return 0;
    const before = squareQuality(action.from.r, action.from.c, color);
    const after = squareQuality(destination.r, destination.c, color);
    let score = (after - before) * 7;
    if ([PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP].includes(action.pieceType)) {
      const homeRow = color === COLORS.BLACK ? 0 : BOARD_SIZE - 1;
      if (action.from.r === homeRow)
        score += 28;
    }
    return score;
  }
  function positionalValue(piece, state, color) {
    let value = squareQuality(piece.row, piece.col, ownerOf(piece)) * 4;
    if ([PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP].includes(piece.type)) {
      const homeRow = piece.color === COLORS.BLACK ? 0 : BOARD_SIZE - 1;
      if (piece.row !== homeRow)
        value += 24;
    }
    if (piece.type === PIECE_TYPES.ROOK) {
      value += openFileValue(state, piece.col, piece.color) * 8;
    }
    if (piece.type === PIECE_TYPES.PAWN) {
      value += centerFileValue(piece.col) * 6;
      if (!isLifeDeathGateFile(piece.col) && centerFileValue(piece.col) <= 1.5 && Math.abs(piece.row - (piece.color === COLORS.BLACK ? 1 : 8)) >= 2) {
        value -= 55;
      }
    }
    return value;
  }
  function threatPressure(ownActions, enemyActions) {
    const ownThreats = threatValue(ownActions);
    const enemyThreats = threatValue(enemyActions);
    return ownThreats - enemyThreats * 1.25;
  }
  function threatValue(actions) {
    const threats = new Map;
    for (const action of actions) {
      if ((action.kind === "attack" || action.mode === "kill") && action.target) {
        const risk = action.target?.type === PIECE_TYPES.KING ? 2600 : actionExposureValue(action) * (action.target?.hadShield ? 0.42 : 0.38);
        const previous = threats.get(action.target.id) ?? 0;
        if (risk > previous)
          threats.set(action.target.id, risk);
      }
      if (action.mode === "heal") {
        const previous = threats.get(action.id) ?? 0;
        threats.set(action.id, Math.max(previous, 22));
      }
    }
    let score = 0;
    for (const risk of threats.values())
      score += risk;
    return Math.min(score, 3600);
  }
  function shieldPressureValue(target) {
    return 26 + shieldValueForType(target?.type) * 1.08 + materialValue(target?.type) * 0.1;
  }
  function controlScore(ownActions, enemyActions, color) {
    let score = 0;
    const enemy = oppositeColor(color);
    for (const action of ownActions) {
      if (action.to)
        score += squareQuality(action.to.r, action.to.c, color);
      if (action.target?.type === PIECE_TYPES.KING)
        score += 220;
    }
    for (const action of enemyActions) {
      if (action.to)
        score -= squareQuality(action.to.r, action.to.c, enemy) * 0.85;
      if (action.target?.type === PIECE_TYPES.KING)
        score -= 220;
    }
    return score * 0.8;
  }
  function squareQuality(row, col, color) {
    const file = centerFileValue(col);
    const rankProgress = color === COLORS.BLACK ? row : BOARD_SIZE - 1 - row;
    const centerRank = 4.5 - Math.abs(row - 4.5);
    return file * 1.8 + centerRank * 1.1 + rankProgress * 0.45;
  }
  function centerFileValue(col) {
    return 4.5 - Math.abs(col - 4.5);
  }
  function openFileValue(state, col, color) {
    let ownPawns = 0;
    let enemyPawns = 0;
    for (const piece of allPieces(state)) {
      if (piece.col !== col || piece.type !== PIECE_TYPES.PAWN)
        continue;
      if (piece.color === color)
        ownPawns += 1;
      else
        enemyPawns += 1;
    }
    if (ownPawns === 0 && enemyPawns === 0)
      return 2;
    if (ownPawns === 0)
      return 1;
    return 0;
  }
  function pawnProgress(piece) {
    if (piece.color === "white")
      return 8 - piece.row;
    return piece.row - 1;
  }
  function lifeDeathPositionValue(piece) {
    const owner = ownerOf(piece);
    const centrality = 8 - Math.abs(piece.row - 4.5) - Math.abs(piece.col - 4.5);
    const ownHalfDepth = owner === COLORS.BLACK ? piece.row : BOARD_SIZE - 1 - piece.row;
    const boundaryRisk = ownHalfDepth === 4 ? 36 : 0;
    return centrality * 8 + ownHalfDepth * 22 - boundaryRisk;
  }
  function lifeDeathMoveActionValue(state, action, color) {
    if (action.mode !== "lifeDeathMove")
      return 0;
    const piece = findPieceById(state, action.pieceId);
    if (!piece || !action.to)
      return 0;
    const fromDepth = lifeDeathDepthForColor(action.from.r, color);
    const toDepth = lifeDeathDepthForColor(action.to.r, color);
    const advancement = toDepth - fromDepth;
    const mobilityDelta = lifeDeathMobilityFromSquare(state, piece, action.to, action) - lifeDeathMobilityFromSquare(state, piece, action.from, action);
    const centerDelta = centerFileValue(action.to.c) - centerFileValue(action.from.c);
    const tempo = state.turn.standardMoveMade && !state.turn.specialMoveMade ? 95 : 34;
    const homeRetreatPenalty = toDepth === 0 && fromDepth > 0 ? 90 : 0;
    const boundaryPenalty = toDepth === 4 ? 38 : 0;
    const threatValue2 = lifeDeathMoveThreatValue(state, piece, action.to, color);
    return tempo + advancement * 72 + mobilityDelta * 32 + centerDelta * 12 + threatValue2 - homeRetreatPenalty - boundaryPenalty;
  }
  function lifeDeathDepthForColor(row, color) {
    return color === COLORS.BLACK ? row : BOARD_SIZE - 1 - row;
  }
  function lifeDeathMobilityFromSquare(state, piece, square, action = null) {
    let count = 0;
    for (const dr of [-1, 1]) {
      for (const dc of [-1, 1]) {
        const row = square.r + dr;
        const col = square.c + dc;
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
          continue;
        if (piece.type === PIECE_TYPES.DEATH && isLightSquare2(row, col))
          continue;
        if (piece.type === PIECE_TYPES.LIFE && !isLightSquare2(row, col))
          continue;
        const occupant = getPiece(state.board, row, col);
        if (occupant && occupant.id !== action?.pieceId)
          continue;
        count += 1;
      }
    }
    return count;
  }
  function lifeDeathMoveThreatValue(state, piece, square, color) {
    if (piece.type === PIECE_TYPES.DEATH)
      return deathMoveThreatValue(state, square, color);
    if (piece.type === PIECE_TYPES.LIFE)
      return lifeMoveHealValue(state, square, color);
    return 0;
  }
  function deathMoveThreatValue(state, square, color) {
    let value = 0;
    for (const dr of [-1, 1]) {
      for (const dc of [-1, 1]) {
        const target = getPiece(state.board, square.r + dr, square.c + dc);
        if (!target || target.isImmune || target.type === PIECE_TYPES.DEATH || isLightSquare2(target.row, target.col))
          continue;
        if (isProtectedFromDeathLike(state, target))
          continue;
        const sign = ownerOf(target) === color ? -1 : 1;
        value += sign * (110 + materialValue(target.type) * 0.34 + (target.hasShield ? shieldValueForType(target.type) * 0.55 : 0));
      }
    }
    return value;
  }
  function lifeMoveHealValue(state, square, color) {
    let value = 0;
    for (const dr of [-1, 1]) {
      for (const dc of [-1, 1]) {
        const target = getPiece(state.board, square.r + dr, square.c + dc);
        if (!target || !isLightSquare2(target.row, target.col) || !canHaveShield(target.type) || target.hasShield || target.isImmune || target.isIntimidated) {
          continue;
        }
        const sign = ownerOf(target) === color ? 1 : -0.75;
        value += sign * (72 + shieldValueForType(target.type) * 0.95 + materialValue(target.type) * 0.08);
      }
    }
    return value;
  }
  function isProtectedFromDeathLike(state, target) {
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0]
    ]) {
      const protector = getPiece(state.board, target.row + dr, target.col + dc);
      if (protector && ownerOf(protector) === ownerOf(target))
        return true;
    }
    return false;
  }
  function promotionPressure(state, color) {
    let pressure = 0;
    for (const piece of allPieces(state)) {
      if (piece.type !== PIECE_TYPES.PAWN)
        continue;
      const sign = ownerOf(piece) === color ? 1 : -1;
      const distance = piece.color === "white" ? piece.row : 9 - piece.row;
      if (distance <= 2) {
        pressure += sign * (PROMOTION_TYPES.length * 12 + (2 - distance) * 35);
      }
    }
    return pressure;
  }
  function targetActionValue(action) {
    const base = materialValue(action.target?.type);
    if (action.target?.type === PIECE_TYPES.KING)
      return 1e5;
    return base + (action.target?.hadShield ? shieldValueForType(action.target.type) : 0);
  }
  function materialValue(type) {
    return LIFE_DEATH_STRATEGIC_VALUES[type] ?? MATERIAL_VALUES[type] ?? 0;
  }
  function pieceStake(piece) {
    if (!piece)
      return 0;
    return materialValue(piece.type) + (piece.hasShield ? shieldValueForType(piece.type) : 0);
  }
  function attackActionValue(action) {
    const base = targetActionValue(action);
    if (action.target?.type === PIECE_TYPES.KING)
      return 1e5;
    if (action.target?.hadShield)
      return shieldPressureValue(action.target);
    return 180 + base * 1.15;
  }
  function shieldValueForType(type) {
    if (type === PIECE_TYPES.PAWN)
      return 58;
    if (type === PIECE_TYPES.ROOK)
      return 210;
    if (type === PIECE_TYPES.BISHOP || type === PIECE_TYPES.KNIGHT)
      return 165;
    return 0;
  }
  function healActionValue(state, action, color) {
    const targetValue = materialValue(action.target?.type);
    const value = 150 + shieldValueForType(action.target?.type) * 2 + targetValue * 0.1;
    return ownerFromSnapshot(action.target) === color ? value : -value * 0.9;
  }
  function lifeDeathTransferScore(state, action, color) {
    if (!isLifeDeathType(action.pieceType))
      return 0;
    const actor = findPieceById(state, action.pieceId);
    if (!actor || !action.to)
      return 0;
    if (lifeDeathAnnihilationDoomed(state, action).length > 1)
      return 0;
    const beforeOwner = ownerOf(actor);
    const afterOwner = ownerAtRow(action.to.r);
    if (beforeOwner === afterOwner)
      return 0;
    if (action.target?.type === PIECE_TYPES.KING && ownerFromSnapshot(action.target) !== beforeOwner)
      return 120000;
    const specialValue = materialValue(action.pieceType);
    const handoffPenalty = specialValue * (action.mode === "kill" ? 7.2 : 6.2) + (action.mode === "kill" ? 1300 : 900);
    if (beforeOwner === color && afterOwner !== color)
      return -handoffPenalty;
    if (beforeOwner !== color && afterOwner === color)
      return handoffPenalty;
    return 0;
  }
  function lifeDeathAnnihilationScore(state, action, color) {
    const doomed = lifeDeathAnnihilationDoomed(state, action);
    if (doomed.length <= 1 || action.target?.type === PIECE_TYPES.KING)
      return 0;
    let materialDelta = 0;
    for (const piece of doomed) {
      materialDelta += ownerOf(piece) === color ? -materialValue(piece.type) : materialValue(piece.type);
    }
    const actor = findPieceById(state, action.pieceId);
    const actorValue = actor && ownerOf(actor) === color ? materialValue(actor.type) : 0;
    const tradeFriction = actorValue > 0 ? Math.min(360, actorValue * 0.38) : 120;
    return materialDelta - tradeFriction;
  }
  function lifeDeathAnnihilationDoomed(state, action) {
    if (!isLifeDeathType(action.pieceType))
      return [];
    const actor = findPieceById(state, action.pieceId);
    const destination = actionDestination(action);
    if (!actor || !destination)
      return [];
    const doomed = new Map([[actor.id, actor]]);
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0]
    ]) {
      const neighbor = getPiece(state.board, destination.r + dr, destination.c + dc);
      if (!neighbor || neighbor.id === actor.id || !isLifeDeathType(neighbor.type))
        continue;
      if (neighbor.type === action.pieceType)
        continue;
      doomed.set(neighbor.id, neighbor);
    }
    return [...doomed.values()];
  }
  function isLifeDeathType(type) {
    return type === PIECE_TYPES.LIFE || type === PIECE_TYPES.DEATH;
  }
  function lifeDeathGateMoveBonus(state, action, color) {
    if (action.pieceType !== PIECE_TYPES.PAWN || action.mode !== "pawnAdvance")
      return 0;
    if (!isLifeDeathGateFile(action.from.c))
      return 0;
    const actor = findPieceById(state, action.pieceId);
    if (!actor || actor.color !== color)
      return 0;
    const homeRow = color === COLORS.BLACK ? 1 : BOARD_SIZE - 2;
    if (action.from.r !== homeRow)
      return 0;
    const step = Math.abs(action.to.r - action.from.r);
    const adjacentSpecial = action.from.c === 1 ? getPiece(state.board, color === COLORS.BLACK ? 0 : BOARD_SIZE - 1, 0) : getPiece(state.board, color === COLORS.BLACK ? 0 : BOARD_SIZE - 1, BOARD_SIZE - 1);
    const opensSpecialPiece = adjacentSpecial && (adjacentSpecial.type === PIECE_TYPES.LIFE || adjacentSpecial.type === PIECE_TYPES.DEATH) && ownerOf(adjacentSpecial) === color;
    if (!opensSpecialPiece)
      return 0;
    const sameTurnSpecialTempo = state.turn.specialMoveMade ? 0 : 280;
    return 760 + step * 70 + earlyGameBonus(state) + sameTurnSpecialTempo;
  }
  function earlyGameBonus(state) {
    const totalMoves = Math.max(0, state.moveNumber - 1);
    return Math.max(0, 120 - totalMoves * 14);
  }
  function isLifeDeathGateFile(col) {
    return col === 1 || col === BOARD_SIZE - 2;
  }
  function lifeDeathAccessScore(state, color) {
    return sideLifeDeathAccess(state, color) - sideLifeDeathAccess(state, oppositeColor(color)) * 0.95;
  }
  function sideLifeDeathAccess(state, color) {
    let score = 0;
    const homeRow = color === COLORS.BLACK ? 0 : BOARD_SIZE - 1;
    const gateRow = color === COLORS.BLACK ? 1 : BOARD_SIZE - 2;
    for (const piece of allPieces(state)) {
      if (piece.type !== PIECE_TYPES.LIFE && piece.type !== PIECE_TYPES.DEATH || ownerOf(piece) !== color)
        continue;
      const ownHalfDepth = color === COLORS.BLACK ? piece.row : BOARD_SIZE - 1 - piece.row;
      score += lifeDeathMobility(state, piece) * 58;
      score += Math.max(0, ownHalfDepth) * 34;
      if (ownHalfDepth === 4)
        score -= 90;
      if (piece.row === homeRow && (piece.col === 0 || piece.col === BOARD_SIZE - 1)) {
        const gateCol = piece.col === 0 ? 1 : BOARD_SIZE - 2;
        const gate = getPiece(state.board, gateRow, gateCol);
        score += gate ? -340 : 170;
      }
    }
    return score;
  }
  function lifeDeathMobility(state, piece) {
    let count = 0;
    for (const dr of [-1, 1]) {
      for (const dc of [-1, 1]) {
        const row = piece.row + dr;
        const col = piece.col + dc;
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
          continue;
        if (getPiece(state.board, row, col))
          continue;
        const dark = (row + col) % 2 === 0;
        if (piece.type === PIECE_TYPES.DEATH && dark)
          count += 1;
        if (piece.type === PIECE_TYPES.LIFE && !dark)
          count += 1;
      }
    }
    return count;
  }
  function kingSafetyScore(state, color) {
    const ownKing = findKing(state, color);
    const enemyKing = findKing(state, oppositeColor(color));
    let score = 0;
    if (ownKing)
      score += nearbyAlliedProtection(state, ownKing, color) * 18;
    if (enemyKing)
      score -= nearbyAlliedProtection(state, enemyKing, oppositeColor(color)) * 12;
    return score;
  }
  function materialSafetyScore(ownActions, enemyActions, color) {
    const ownExposure = exposureSummary(enemyActions, color);
    const enemyExposure = exposureSummary(ownActions, oppositeColor(color));
    return enemyExposure.total * 0.34 + enemyExposure.urgent * 0.2 - ownExposure.total * 1.82 - ownExposure.urgent * 1.2;
  }
  function healPotentialScore(state, color) {
    let score = 0;
    for (const piece of allPieces(state)) {
      if (!canBeHealedByOwner(state, piece, ownerOf(piece)))
        continue;
      const sign = ownerOf(piece) === color ? 1 : -1;
      score += sign * (30 + shieldValueForType(piece.type) * 0.45);
    }
    return score;
  }
  function lifeCountsByOwner(state) {
    const counts = new Map([
      [COLORS.WHITE, 0],
      [COLORS.BLACK, 0]
    ]);
    for (const piece of allPieces(state)) {
      if (piece.type !== PIECE_TYPES.LIFE)
        continue;
      counts.set(ownerOf(piece), (counts.get(ownerOf(piece)) ?? 0) + 1);
    }
    return counts;
  }
  function shieldRepairContextValue(piece, alliedLifeCount) {
    if (alliedLifeCount <= 0 || !canHaveShield(piece.type) || !isLightSquare2(piece.row, piece.col) || piece.isIntimidated) {
      return 0;
    }
    const typeWeight = piece.type === PIECE_TYPES.BISHOP ? 1.35 : piece.type === PIECE_TYPES.ROOK ? 1.1 : piece.type === PIECE_TYPES.PAWN ? 0.75 : 1;
    const shieldNeedWeight = piece.hasShield ? 0.42 : 1;
    return (18 + Math.min(2, alliedLifeCount) * 16 + shieldValueForType(piece.type) * 0.18) * typeWeight * shieldNeedWeight;
  }
  function shieldRepairMultiplier(state, target, targetOwner) {
    if (!target || !canHaveShield(target.type) || target.hasShield || target.isImmune || target.isIntimidated || !isLightSquare2(target.row, target.col)) {
      return 1;
    }
    if (canBeHealedByOwner(state, target, targetOwner))
      return 0.66;
    const alliedLifeCount = lifeCountForOwner(state, targetOwner);
    if (alliedLifeCount <= 0)
      return 1;
    let multiplier = 0.88 - Math.min(2, alliedLifeCount) * 0.08;
    if (target.type === PIECE_TYPES.BISHOP)
      multiplier -= 0.08;
    if (target.type === PIECE_TYPES.ROOK)
      multiplier -= 0.04;
    return Math.max(0.62, multiplier);
  }
  function lifeCountForOwner(state, color) {
    let count = 0;
    for (const piece of allPieces(state)) {
      if (piece.type === PIECE_TYPES.LIFE && ownerOf(piece) === color)
        count += 1;
    }
    return count;
  }
  function sameSquare(a, b) {
    return Boolean(a && b && a.r === b.r && a.c === b.c);
  }
  function canBeHealedByOwner(state, target, healerOwner) {
    if (!target || !canHaveShield(target.type) || target.hasShield || target.isImmune || target.isIntimidated || !isLightSquare2(target.row, target.col)) {
      return false;
    }
    for (const life of allPieces(state)) {
      if (life.type !== PIECE_TYPES.LIFE || ownerOf(life) !== healerOwner)
        continue;
      if (Math.abs(life.row - target.row) === 1 && Math.abs(life.col - target.col) === 1)
        return true;
    }
    return false;
  }
  function exposureSummary(attackerActions, defenderColor) {
    const exposure = exposureByTarget(attackerActions, defenderColor);
    let total = 0;
    let urgent = 0;
    for (const { risk, action } of exposure.values()) {
      total += risk;
      if (action.mode === "kill" || !action.target?.hadShield) {
        urgent += risk;
      } else if (risk >= 180) {
        urgent += risk * 0.35;
      }
    }
    return {
      total: Math.min(total, 3400),
      urgent: Math.min(urgent, 2800),
      exposure
    };
  }
  function exposureByTarget(attackerActions, defenderColor) {
    const exposure = new Map;
    for (const action of attackerActions) {
      const target = action.target;
      if (!target || ownerFromSnapshot(target) !== defenderColor)
        continue;
      const risk = actionExposureValue(action);
      const previous = exposure.get(target.id)?.risk ?? 0;
      if (risk > previous)
        exposure.set(target.id, { risk, action });
    }
    return exposure;
  }
  function pieceExposureRisk(state, pieceId, defenderColor, settings = DEFAULT_OPTIONS) {
    const attacker = oppositeColor(defenderColor);
    const exposure = exposureByTarget(legalActionsForSearch(state, attacker, settings, { respectTurn: false }), defenderColor);
    return exposure.get(pieceId)?.risk ?? 0;
  }
  function actionExposureValue(action) {
    if (action.target?.type === PIECE_TYPES.KING)
      return 2200;
    const base = materialValue(action.target?.type);
    const shield = action.target?.hadShield ? shieldValueForType(action.target.type) : 0;
    if (action.mode === "kill")
      return base * 1.08 + shield + 130;
    if (action.kind === "attack") {
      if (action.target?.hadShield) {
        const attackerBase = materialValue(action.pieceType);
        const cheapAttackerLeverage = Math.max(0, base - attackerBase) * 0.28;
        const pawnLever = action.pieceType === PIECE_TYPES.PAWN ? 130 : 0;
        return shieldPressureValue(action.target) + cheapAttackerLeverage + pawnLever;
      }
      return base * 1.04 + 80;
    }
    return 0;
  }
  function nearbyAlliedProtection(state, king, color) {
    let count = 0;
    for (let dr = -1;dr <= 1; dr++) {
      for (let dc = -1;dc <= 1; dc++) {
        if (dr === 0 && dc === 0)
          continue;
        const piece = getPiece(state.board, king.row + dr, king.col + dc);
        if (piece && ownerOf(piece) === color)
          count += 1;
      }
    }
    return count;
  }
  function stateKey(state, depth, color) {
    const pieces = allPieces(state).map((piece) => [
      piece.id,
      piece.type,
      piece.color,
      piece.row,
      piece.col,
      piece.hasShield ? 1 : 0,
      piece.hasMoved ? 1 : 0,
      piece.isImmune ? 1 : 0,
      piece.immunityGrantedBy ?? "",
      piece.isIntimidated ? 1 : 0,
      piece.intimidationSuppressedShield ? 1 : 0,
      ownerOf(piece)
    ].join(":")).sort().join("|");
    return [
      depth,
      color,
      state.currentPlayer,
      state.turn.standardMoveMade ? 1 : 0,
      state.turn.specialMoveMade ? 1 : 0,
      state.enPassant?.pieceId ?? "",
      state.enPassant?.eligibleColor ?? "",
      state.enPassant?.crossed?.map((square) => `${square.r},${square.c}`).join(";") ?? "",
      pieces
    ].join("~");
  }
  function cacheValue(settings, key, value, alphaStart, betaStart, bestActionId) {
    if (!settings.transposition)
      return;
    if (settings.transposition.size > settings.transpositionLimit)
      settings.transposition.clear();
    const flag = value <= alphaStart ? "upper" : value >= betaStart ? "lower" : "exact";
    settings.transposition.set(key, { value, flag, bestActionId });
  }
  function cacheLimitedValue(cache, limit, key, value) {
    if (!cache)
      return;
    if (cache.size > limit)
      cache.clear();
    cache.set(key, value);
  }
  function rootHeuristicWeight(depth) {
    if (depth >= 5)
      return 0.2;
    if (depth >= 4)
      return 0.24;
    if (depth >= 3)
      return 0.3;
    return 0.28;
  }
  function shouldStartDepth(settings, depth, lastDepthMs, maxDepth) {
    if (depth <= 1 || settings.timeLimitMs <= 0)
      return true;
    if (depth === maxDepth && lastDepthMs <= 0)
      return true;
    const remaining = settings.softDeadline - now();
    if (remaining <= 0)
      return false;
    const depthGrowth = depth >= 5 ? settings.depthStartMargin * 1.35 : settings.depthStartMargin;
    return remaining >= Math.max(40, lastDepthMs * depthGrowth);
  }
  function hardDeadline(settings) {
    if (settings.hardTimeLimitMs > 0)
      return settings.startedAt + settings.hardTimeLimitMs;
    if (settings.timeLimitMs > 0)
      return settings.startedAt + Math.ceil(settings.timeLimitMs * 1.55);
    return Number.POSITIVE_INFINITY;
  }
  function ownerFromSnapshot(piece) {
    if (!piece)
      return null;
    if (piece.type === PIECE_TYPES.LIFE || piece.type === PIECE_TYPES.DEATH)
      return ownerAtRow(piece.r);
    return piece.color;
  }
  function ownerAtRow(row) {
    return row >= BOARD_SIZE / 2 ? COLORS.WHITE : COLORS.BLACK;
  }
  function isLightSquare2(row, col) {
    return (row + col) % 2 !== 0;
  }
  function isTimeUp(settings) {
    return now() >= settings.deadline;
  }
  function isSoftTimeUp(settings) {
    return now() >= settings.softDeadline;
  }
  function now() {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  // src/ai-worker.js
  globalThis.onmessage = (event) => {
    const { id, state, color, options } = event.data ?? {};
    try {
      const action = chooseAiAction(state, color, options);
      globalThis.postMessage({ id, action });
    } catch (error) {
      globalThis.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
})();
