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
  var PIECE_SYMBOLS = {
    white: {
      King: "♔",
      Queen: "♕",
      Rook: "♖",
      Bishop: "♗",
      Knight: "♘",
      Pawn: "♙",
      Life: "❤",
      Death: "\uD83D\uDC80"
    },
    black: {
      King: "♚",
      Queen: "♛",
      Rook: "♜",
      Bishop: "♝",
      Knight: "♞",
      Pawn: "♟",
      Life: "❤",
      Death: "\uD83D\uDC80"
    }
  };
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
  var FILES = "abcdefghjk";
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
  var nextGeneratedId = 1;
  function isValidSquare(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }
  function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }
  function createPiece(type, color, row, col, overrides = {}) {
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
      intimidationSuppressedShield: overrides.intimidationSuppressedShield ?? false
    };
    if (!canHaveShield(type))
      piece.hasShield = false;
    return piece;
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
      actionHistory: preserveHistory && state.actionHistory ? structuredClone(state.actionHistory) : [],
      capturedPieces: preserveHistory && state.capturedPieces ? structuredClone(state.capturedPieces) : []
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
  function placePiece(board, piece) {
    setPiece(board, piece.row, piece.col, piece);
    return piece;
  }
  function removePiece(state, piece, removedByColor = null) {
    if (!piece)
      return;
    recordCapturedPiece(state, piece, removedByColor);
    if (getPiece(state.board, piece.row, piece.col)?.id === piece.id) {
      setPiece(state.board, piece.row, piece.col, null);
    }
    if (piece.type === PIECE_TYPES.KING && !state.gameOver) {
      state.gameOver = {
        winner: removedByColor ?? (piece.color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE),
        reason: `${piece.color} king removed`
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
      moveNumber: state.moveNumber
    });
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
  function symbolFor(piece) {
    return PIECE_SYMBOLS[piece.color][piece.type];
  }
  function createInitialState() {
    const board = createBoard();
    const backRank = [
      PIECE_TYPES.ROOK,
      PIECE_TYPES.KNIGHT,
      PIECE_TYPES.BISHOP,
      PIECE_TYPES.QUEEN,
      PIECE_TYPES.KING,
      PIECE_TYPES.BISHOP,
      PIECE_TYPES.KNIGHT,
      PIECE_TYPES.ROOK
    ];
    placePiece(board, createPiece(PIECE_TYPES.DEATH, COLORS.BLACK, 0, 0, { id: "black-death-a" }));
    placePiece(board, createPiece(PIECE_TYPES.LIFE, COLORS.BLACK, 0, 9, { id: "black-life-j" }));
    backRank.forEach((type, index) => {
      placePiece(board, createPiece(type, COLORS.BLACK, 0, index + 1, {
        id: `black-${type.toLowerCase()}-${index + 1}`
      }));
    });
    for (let col = 0;col < BOARD_SIZE; col++) {
      placePiece(board, createPiece(PIECE_TYPES.PAWN, COLORS.BLACK, 1, col, {
        id: `black-pawn-${col}`
      }));
    }
    placePiece(board, createPiece(PIECE_TYPES.LIFE, COLORS.WHITE, 9, 0, { id: "white-life-a" }));
    placePiece(board, createPiece(PIECE_TYPES.DEATH, COLORS.WHITE, 9, 9, { id: "white-death-j" }));
    backRank.forEach((type, index) => {
      placePiece(board, createPiece(type, COLORS.WHITE, 9, index + 1, {
        id: `white-${type.toLowerCase()}-${index + 1}`
      }));
    });
    for (let col = 0;col < BOARD_SIZE; col++) {
      placePiece(board, createPiece(PIECE_TYPES.PAWN, COLORS.WHITE, 8, col, {
        id: `white-pawn-${col}`
      }));
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
      capturedPieces: []
    };
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
  function createGameState() {
    const state = createInitialState();
    updateIntimidation(state);
    normalizeTurn(state);
    return state;
  }
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
    const respectCheck = options.respectCheck ?? true;
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
    const legalActions = respectCheck ? filterCheckLegalActions(state, color, actions) : actions;
    if (respectTurn && options.includeSkip !== false && canSkipSpecialMoveFromActions(state, color, legalActions)) {
      legalActions.push(buildSkipSpecialAction(state, color));
    }
    return sortActions(legalActions);
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
  function getActionsForPiece(state, pieceId) {
    const piece = findPieceById(state, pieceId);
    if (!piece || ownerOf(piece) !== state.currentPlayer)
      return [];
    const legalIds = new Set(generateLegalActions(state).map((action) => action.id));
    return generatePieceActions(state, piece).filter((action) => legalIds.has(action.id));
  }
  function canSkipSpecialMove(state, color = state.currentPlayer) {
    return canSkipSpecialMoveFromActions(state, color, generateLegalActions(state, color, { includeSkip: false }));
  }
  function skipSpecialMove(state, color = state.currentPlayer) {
    const next = cloneState(state);
    if (!canSkipSpecialMove(next, color))
      return next;
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
      consumes: { standard: false, special: true }
    };
  }
  function canSkipSpecialMoveFromActions(state, color, actions) {
    if (state.gameOver || state.currentPlayer !== color)
      return false;
    if (isKingInCheck(state, color))
      return false;
    if (!state.turn.standardMoveMade || state.turn.specialMoveMade)
      return false;
    return actions.some((action) => action.consumes?.special);
  }
  function filterCheckLegalActions(state, color, actions) {
    const inCheck = isKingInCheck(state, color);
    if (inCheck && !hasLegalCheckEvasionSequence(state, color, actions))
      return [];
    return actions.filter((action) => isActionLegalRegardingCheck(state, color, action, inCheck));
  }
  function isActionLegalRegardingCheck(state, color, action, inCheck) {
    if (action.target?.type === PIECE_TYPES.KING)
      return false;
    if (inCheck) {
      if (isPreparatoryLifeDeathMove(state, action))
        return preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action);
      if (action.mode === "castle")
        return false;
      if (!isStandardCheckEvasionAction(action))
        return false;
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
      normalize: false
    });
    return isKingInCheck(next, color);
  }
  function castlingCrossesCheck(state, action, color) {
    if (action.mode !== "castle")
      return false;
    const king = findPieceById(state, action.pieceId);
    if (!king)
      return true;
    const direction = Math.sign(action.to.c - action.from.c);
    const kingPath = [
      { r: action.from.r, c: action.from.c },
      { r: action.from.r, c: action.from.c + direction },
      { r: action.to.r, c: action.to.c }
    ];
    return kingPath.some((square) => isKingInCheckAt(state, king, square));
  }
  function isKingInCheckAt(state, king, square) {
    const probe = cloneState(state, { preserveHistory: false });
    const probeKing = findPieceById(probe, king.id);
    if (!probeKing)
      return true;
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
    if (jumped && LIFE_DEATH_PIECES.has(jumped.type) && isValidSquare(jumpTo.r, jumpTo.c) && !getPiece(state.board, jumpTo.r, jumpTo.c)) {
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
        if (occupant?.type === PIECE_TYPES.DEATH)
          continue;
        if (occupant)
          continue;
        actions.push(withActionId({
          kind: "move",
          mode: "kingStep",
          pieceId: piece.id,
          pieceType: piece.type,
          from: { r: piece.row, c: piece.col },
          to,
          path: [],
          deathLanding: false,
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
  function generateStandardAttacks(state, piece, options = {}) {
    if (piece.type === PIECE_TYPES.PAWN) {
      return [
        ...generatePawnAttacks(state, piece, options),
        ...generateEnPassantActions(state, piece)
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
      return generateSlidingAttacks(state, piece, [...ROOK_DIRS, ...BISHOP_DIRS], options);
    return [];
  }
  function generatePawnAttacks(state, piece, options = {}) {
    const actions = [];
    const dir = pawnDirection(piece);
    for (const dc of [-1, 1]) {
      const target = getPiece(state.board, piece.row + dir, piece.col + dc);
      if (!isAttackTarget(piece, target, options))
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
  function generateKingAttacks(state, piece, options = {}) {
    const actions = [];
    for (let dr = -1;dr <= 1; dr++) {
      for (let dc = -1;dc <= 1; dc++) {
        if (dr === 0 && dc === 0)
          continue;
        const target = getPiece(state.board, piece.row + dr, piece.col + dc);
        if (!isAttackTarget(piece, target, options))
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
  function generateKnightAttacks(state, piece, options = {}) {
    const actions = [];
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const target = getPiece(state.board, piece.row + dr, piece.col + dc);
      if (!isAttackTarget(piece, target, options))
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
  function generateSlidingAttacks(state, piece, directions, options = {}) {
    const actions = [];
    for (const [dr, dc] of directions) {
      for (let distance = 1;distance < BOARD_SIZE; distance++) {
        const target = getPiece(state.board, piece.row + dr * distance, piece.col + dc * distance);
        if (!target)
          continue;
        if (LIFE_DEATH_PIECES.has(target.type))
          continue;
        if (!isAttackTarget(piece, target, options))
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
  function isAttackTarget(attacker, target, options = {}) {
    if (!target || target.isImmune)
      return false;
    if (LIFE_DEATH_PIECES.has(target.type))
      return false;
    if (target.type === PIECE_TYPES.KING && !options.allowKingTarget)
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
      if (target.type === PIECE_TYPES.KING || target.type === PIECE_TYPES.DEATH)
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
    const normalizeAfterAction = options.normalize ?? true;
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
    if (normalizeAfterAction) {
      if (!next.gameOver)
        updateIntimidation(next);
      normalizeTurn(next);
    }
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
    if (target.type === PIECE_TYPES.KING)
      return;
    const attackerFrom = { r: attacker.row, c: attacker.col };
    const diesAfterAttack = applyPathEffects(state, attacker, action.path ?? []) || action.deathStaging;
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
    if (action.mode === "kill" && !target.isImmune && target.type !== PIECE_TYPES.KING && target.type !== PIECE_TYPES.DEATH && isDarkSquare(target.row, target.col) && !isProtectedFromDeath(target, state)) {
      removePiece(state, target, ownerOf(piece));
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
    if (applyCheckmateResult(state, state.currentPlayer))
      return state;
    if (applyCheckmateResult(state, oppositeColor(state.currentPlayer)))
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
      if (applyCheckmateResult(state, state.currentPlayer))
        break;
      if (applyCheckmateResult(state, oppositeColor(state.currentPlayer)))
        break;
    }
    return state;
  }
  function applyCheckmateResult(state, loser) {
    if (!isCheckmate(state, loser))
      return false;
    state.gameOver = {
      winner: oppositeColor(loser),
      reason: `${loser} king checkmated`
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
  function isKingInCheck(state, color) {
    const king = findKing(state, color);
    if (!king)
      return false;
    return allPieces(state).some((piece) => ownerOf(piece) !== color && attacksKing(state, piece, king));
  }
  function isCheckmate(state, color = state.currentPlayer) {
    if (!isKingInCheck(state, color))
      return false;
    return !hasLegalCheckEvasionSequence(checkmateProbeState(state, color), color);
  }
  function checkmateProbeState(state, color) {
    if (state.currentPlayer === color)
      return state;
    const probe = cloneState(state, { preserveHistory: false });
    probe.currentPlayer = color;
    probe.turn = { standardMoveMade: false, specialMoveMade: false };
    return probe;
  }
  function hasLegalCheckEvasionSequence(state, color, actions = null) {
    if (legalStandardCheckEvasionActions(state, color).length > 0)
      return true;
    return preparatoryLifeDeathActions(state, color, actions).some((action) => preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action));
  }
  function legalStandardCheckEvasionActions(state, color) {
    const king = findKing(state, color);
    if (!king)
      return [];
    return allPieces(state).filter((piece) => ownerOf(piece) === color).flatMap((piece) => generatePieceActions(state, piece)).filter((action) => isStandardCheckEvasionAction(action) && !actionLeavesKingInCheck(state, action, color));
  }
  function isStandardCheckEvasionAction(action) {
    return action.consumes?.standard && !action.consumes?.special && action.mode !== "castle";
  }
  function preparatoryLifeDeathActions(state, color, actions = null) {
    if (state.currentPlayer !== color)
      return [];
    if (state.turn.standardMoveMade || state.turn.specialMoveMade)
      return [];
    const candidates = actions ?? allPieces(state).flatMap((piece) => ownerOf(piece) === color ? generatePieceActions(state, piece) : []);
    return candidates.filter((action) => isPreparatoryLifeDeathMove(state, action));
  }
  function isPreparatoryLifeDeathMove(state, action) {
    return action.mode === "lifeDeathMove" && !state.turn.standardMoveMade && action.consumes?.special && !action.consumes?.standard;
  }
  function preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action) {
    const next = applyAction(state, action, {
      recordHistory: false,
      normalize: false
    });
    return legalStandardCheckEvasionActions(next, color).length > 0;
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
    return generateStandardAttacks(state, piece, { allowKingTarget: true }).some((action) => action.targetId === king.id);
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
  var KING_CAPTURE_THREAT_VALUE = 140000;
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
    const kingThreatTactic = findImmediateKingThreatTactic(state, legalRootActions, color, settings);
    if (kingThreatTactic?.forceImmediate)
      return kingThreatTactic.action;
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
  function findImmediateKingThreatTactic(state, actions, color, settings) {
    if (!isKingInCheck(state, color))
      return null;
    let best = null;
    for (const action of actions) {
      const after = applySearchAction(state, action);
      const afterKing = findKing(after, color);
      if (!afterKing)
        continue;
      if (isKingInCheck(after, color))
        continue;
      const score = kingThreatResponseScore(action, color);
      if (!best || score > best.score || score === best.score && compareAiActions(state, action, best.action, color) < 0) {
        best = { action, score, forceImmediate: true };
      }
    }
    return best;
  }
  function kingThreatResponseScore(action, color) {
    if (action.target?.type === PIECE_TYPES.KING)
      return 1e6;
    if (!action.target) {
      return action.pieceType === PIECE_TYPES.KING ? 120 : 80;
    }
    const targetOwner = ownerFromSnapshot(action.target);
    const sign = targetOwner === color ? -1 : 1;
    const intimidationBonus = action.target.isIntimidated ? 420 : 0;
    const killBonus = action.mode === "kill" || !action.target.hadShield ? 520 : 0;
    return sign * (900 + targetActionValue(action) * 2.2 + intimidationBonus + killBonus);
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
    score += kingCheckPressure(state, color);
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
    const disciplinedActions = actions.filter((action) => !isBadFatalShieldBreak(state, action) && !isBadLifeDeathHandoff(state, action));
    const candidateActions = disciplinedActions.length > 0 ? disciplinedActions : actions;
    const nonDominatedActions = candidateActions.filter((action) => !isDominatedBySameDestinationAttack(candidateActions, action));
    const ordered = orderAiActions(state, sortActions(nonDominatedActions.length > 0 ? nonDominatedActions : candidateActions), color, settings, context);
    const selected = ordered.slice(0, settings.maxActions);
    const selectedIds = new Set(selected.map((action) => action.id));
    for (const action of [
      ...immediateKingThreatResponses(state, candidateActions, settings),
      ...forced
    ]) {
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
  function isDominatedBySameDestinationAttack(actions, action) {
    if (action.kind !== "move" || !action.to)
      return false;
    return actions.some((candidate) => candidate.kind === "attack" && candidate.pieceId === action.pieceId && candidate.target?.hadShield && candidate.rest && sameSquare(candidate.rest, action.to));
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
  function isBadLifeDeathHandoff(state, action) {
    if (!isLifeDeathType(action.pieceType) || !action.to)
      return false;
    if (action.target?.type === PIECE_TYPES.KING)
      return false;
    const actor = findPieceById(state, action.pieceId);
    if (!actor)
      return false;
    const beforeOwner = ownerOf(actor);
    const afterOwner = ownerAtRow(action.to.r);
    if (beforeOwner === afterOwner)
      return false;
    if (lifeDeathAnnihilationDoomed(state, action).length > 1)
      return false;
    return true;
  }
  function immediateKingThreatResponses(state, actions, settings) {
    const mover = state.currentPlayer;
    if (!findKing(state, mover) || !isKingInCheck(state, mover))
      return [];
    return actions.filter((action) => {
      const after = applySearchAction(state, action);
      const afterKing = findKing(after, mover);
      if (!afterKing)
        return false;
      return !isKingInCheck(after, mover);
    });
  }
  function compareAiActions(state, a, b, color) {
    return actionHeuristic(state, b, color) - actionHeuristic(state, a, color) || a.id.localeCompare(b.id);
  }
  function buildActionContext(state, settings = DEFAULT_OPTIONS) {
    const mover = state.currentPlayer;
    const opponent = oppositeColor(mover);
    const opponentActions = legalActionsForSearch(state, opponent, settings, {
      respectTurn: false
    });
    const threats = exposureByTarget(opponentActions, mover);
    const threateningAttackers = new Map;
    for (const action of opponentActions) {
      if (!action.target || ownerFromSnapshot(action.target) !== mover)
        continue;
      const risk = actionExposureValue(action);
      const previous = threateningAttackers.get(action.pieceId)?.risk ?? 0;
      if (risk > previous)
        threateningAttackers.set(action.pieceId, { risk });
    }
    return {
      mover,
      threats,
      threateningAttackers,
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
    if (isKingInCheck(state, state.currentPlayer)) {
      if (action.pieceType === PIECE_TYPES.KING)
        score += 2200;
      if (action.mode === "lifeDeathMove")
        score -= 520;
    }
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
    score += attackerSuppressionOrderingScore(action, color, context);
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
  function attackerSuppressionOrderingScore(action, color, context) {
    if (!action.targetId || !action.target)
      return 0;
    if (action.kind !== "attack" && action.mode !== "kill")
      return 0;
    const pressure = context?.threateningAttackers?.get(action.targetId)?.risk ?? 0;
    if (pressure <= 0)
      return 0;
    const targetOwner = ownerFromSnapshot(action.target);
    const sign = targetOwner === color ? -1 : 1;
    const resolutionWeight = action.mode === "kill" || !action.target.hadShield ? 1.2 : 0.72;
    const value = 240 + pressure * resolutionWeight + materialValue(action.target.type) * 0.22 + (action.target.hadShield ? shieldPressureValue(action.target) * 0.64 : 0);
    return sign * Math.min(1750, value);
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
      score += attackerSuppressionTacticalBonus(before, action, color, settings);
      score -= missedDeathKillPenalty(before, action, color, settings);
    }
    if (action.mode === "kill") {
      score += deathKillTacticalBonus(action, color);
      score += attackerSuppressionTacticalBonus(before, action, color, settings);
    }
    if (action.mode === "heal")
      score += healTacticalBonus(action, color);
    score += pathEffectScore(pathEffectReport(before, action)) * 0.72;
    score += lifeDeathTransferScore(before, action, color) * 0.85;
    score += lifeDeathAnnihilationScore(before, action, color) * 0.9;
    score += defensiveRootScore(before, after, actor, action, color, settings);
    score += teamSafetyDeltaScore(before, after, color, settings);
    score += threatCreationDeltaScore(before, after, color, settings);
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
  function attackerSuppressionTacticalBonus(state, action, color, settings) {
    if (!action.targetId || !action.target)
      return 0;
    if (ownerFromSnapshot(action.target) === color)
      return 0;
    let pressure = 0;
    for (const enemyAction of legalActionsForSearch(state, oppositeColor(color), settings, { respectTurn: false })) {
      if (enemyAction.pieceId !== action.targetId || !enemyAction.target || ownerFromSnapshot(enemyAction.target) !== color) {
        continue;
      }
      pressure = Math.max(pressure, actionExposureValue(enemyAction));
    }
    if (pressure <= 0)
      return 0;
    const resolutionWeight = action.mode === "kill" || !action.target.hadShield ? 1.16 : 0.68;
    return Math.min(1450, 190 + pressure * resolutionWeight + materialValue(action.target.type) * 0.18 + (action.target.hadShield ? shieldPressureValue(action.target) * 0.58 : 0));
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
  function threatCreationDeltaScore(before, after, color, settings) {
    if (after.gameOver)
      return 0;
    const enemy = oppositeColor(color);
    const beforePressure = exposureSummary(legalActionsForSearch(before, color, settings, { respectTurn: false }), enemy);
    const afterPressure = exposureSummary(legalActionsForSearch(after, color, settings, { respectTurn: false }), enemy);
    const totalDelta = afterPressure.total - beforePressure.total;
    const urgentDelta = afterPressure.urgent - beforePressure.urgent;
    return totalDelta * 0.12 + urgentDelta * 0.34;
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
  function kingCheckPressure(state, color) {
    const ownKingCheck = isKingInCheck(state, oppositeColor(color));
    const enemyKingCheck = isKingInCheck(state, color);
    return (ownKingCheck ? KING_CAPTURE_THREAT_VALUE * 0.18 : 0) - (enemyKingCheck ? KING_CAPTURE_THREAT_VALUE * 0.28 : 0);
  }
  function threatValue(actions) {
    const threats = new Map;
    for (const action of actions) {
      if ((action.kind === "attack" || action.mode === "kill") && action.target) {
        const risk = action.target?.type === PIECE_TYPES.KING ? KING_CAPTURE_THREAT_VALUE : actionExposureValue(action) * (action.target?.hadShield ? 0.42 : 0.38);
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
        if (!target || target.isImmune || target.type === PIECE_TYPES.KING || target.type === PIECE_TYPES.DEATH || isLightSquare2(target.row, target.col))
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
    let enemySpecialValue = 0;
    for (const piece of doomed) {
      if (ownerOf(piece) !== color)
        enemySpecialValue += materialValue(piece.type);
      materialDelta += ownerOf(piece) === color ? -materialValue(piece.type) : materialValue(piece.type);
    }
    const actor = findPieceById(state, action.pieceId);
    const actorValue = actor && ownerOf(actor) === color ? materialValue(actor.type) : 0;
    const tradeFriction = action.mode === "kill" ? actorValue > 0 ? Math.min(180, actorValue * 0.18) : 60 : actorValue > 0 ? Math.min(360, actorValue * 0.38) : 120;
    const killComboBonus = action.mode === "kill" ? 260 + enemySpecialValue * 0.48 + targetActionValue(action) * 0.34 : 0;
    return materialDelta - tradeFriction + killComboBonus;
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
      return KING_CAPTURE_THREAT_VALUE;
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
  // src/ui/renderer.js
  var PIECE_ASSET_BASE = "assets/pieces/";
  var PIECE_ASSET_CODES = {
    [PIECE_TYPES.KING]: "K",
    [PIECE_TYPES.QUEEN]: "Q",
    [PIECE_TYPES.ROOK]: "R",
    [PIECE_TYPES.BISHOP]: "B",
    [PIECE_TYPES.KNIGHT]: "N",
    [PIECE_TYPES.PAWN]: "P"
  };
  var PERMANENTLY_FLIPPED_PIECE_IDS = new Set([
    "black-knight-2",
    "black-bishop-3",
    "white-knight-2",
    "white-bishop-3"
  ]);
  var CAPTURED_ORDER = [
    PIECE_TYPES.QUEEN,
    PIECE_TYPES.ROOK,
    PIECE_TYPES.BISHOP,
    PIECE_TYPES.KNIGHT,
    PIECE_TYPES.PAWN,
    PIECE_TYPES.LIFE,
    PIECE_TYPES.DEATH,
    PIECE_TYPES.KING
  ];

  class Renderer {
    constructor({
      boardEl,
      coordinateEl,
      statusPanelEl,
      promotionEl,
      controlsEl,
      settingsEl,
      rulesEl,
      capturedTopEl,
      capturedBottomEl
    }) {
      this.boardEl = boardEl;
      this.coordinateEl = coordinateEl;
      this.statusPanelEl = statusPanelEl;
      this.promotionEl = promotionEl;
      this.controlsEl = controlsEl;
      this.settingsEl = settingsEl;
      this.rulesEl = rulesEl;
      this.capturedTopEl = capturedTopEl;
      this.capturedBottomEl = capturedBottomEl;
      this.actionHistoryRef = null;
      this.actionHistoryLength = -1;
      this.actionHistoryLastKey = "";
      this.actionHistoryScrollEl = null;
      this.renderedPlayer = null;
      this.boardRenderKey = "";
    }
    render(state2, view = {}) {
      this.renderBoard(state2, view);
      this.renderCoordinates(view);
      this.renderStatus(state2, view);
      this.renderControls(view);
      this.renderPromotion(view);
      this.renderSettings(view);
      this.renderRules(view);
      this.renderCapturedPieces(state2, view);
    }
    renderBoard(state2, view) {
      const highlights = view.highlights ?? emptyHighlights();
      const nextBoardRenderKey = boardRenderKey(state2, view, highlights);
      if (nextBoardRenderKey === this.boardRenderKey)
        return;
      this.boardRenderKey = nextBoardRenderKey;
      this.boardEl.innerHTML = "";
      const rowOrder = orderedIndexes(view.boardSide);
      const colOrder = orderedIndexes(view.boardSide);
      for (const r of rowOrder) {
        for (const c of colOrder) {
          const square = document.createElement("button");
          square.type = "button";
          square.className = `square ${(r + c) % 2 === 0 ? "dark" : "light"}`;
          square.dataset.row = String(r);
          square.dataset.col = String(c);
          square.setAttribute("aria-label", squareLabel(r, c));
          const piece = state2.board[r][c];
          if (piece) {
            square.classList.add("has-piece");
            square.appendChild(renderPiece(piece, state2));
          }
          const marker = markerForSquare(r, c, view, highlights);
          if (marker) {
            square.classList.add("is-actionable");
            square.appendChild(marker);
          }
          this.boardEl.appendChild(square);
        }
      }
    }
    renderStatus(state2, view) {
      const statusState = view.statusState ?? state2;
      const playerTurnEl = this.statusPanelEl.querySelector("#player-turn");
      const previousPlayer = this.renderedPlayer;
      const displayedPlayer = view.displayPlayer ?? statusState.currentPlayer;
      const playerSide = view.boardSide ?? COLORS.WHITE;
      const keepFlash = previousPlayer === displayedPlayer && playerTurnEl.className.includes("turn-start-flash");
      const shouldFlashTurn = previousPlayer && previousPlayer !== displayedPlayer && displayedPlayer === playerSide && !statusState.gameOver;
      playerTurnEl.textContent = playerName(displayedPlayer);
      playerTurnEl.className = `player-turn ${displayedPlayer}${keepFlash ? " turn-start-flash" : ""}`;
      if (shouldFlashTurn) {
        restartClassAnimation(playerTurnEl, "turn-start-flash");
      }
      this.renderedPlayer = displayedPlayer;
      this.renderActionHistory(state2);
      const legalActions = statusState.gameOver ? [] : generateLegalActions(statusState);
      const standardStatus = statusState.turn.standardMoveMade ? "Used" : legalActions.some((action) => action.consumes?.standard) ? "Available" : "Unavailable";
      const specialStatus = statusState.turn.specialMoveMade ? "Used" : legalActions.some((action) => action.consumes?.special) ? "Available" : "Unavailable";
      setStatus(this.statusPanelEl.querySelector("#standard-move-status"), standardStatus);
      setStatus(this.statusPanelEl.querySelector("#special-move-status"), specialStatus);
      const info = this.statusPanelEl.querySelector("#phase-info");
      if (state2.gameOver) {
        info.textContent = state2.gameOver.winner ? `${playerName(state2.gameOver.winner)} wins: ${state2.gameOver.reason}.` : `Draw: ${state2.gameOver.reason}.`;
      } else if (view.isAiAnimating) {
        info.textContent = "Black AI is finishing its move...";
      } else if (view.isAiThinking) {
        info.textContent = "Black AI is thinking...";
      } else {
        info.textContent = view.phaseInfo ?? `${playerName(statusState.currentPlayer)} to move.`;
      }
      const moveNumber = this.statusPanelEl.querySelector("#move-number");
      if (moveNumber)
        moveNumber.textContent = String(statusState.moveNumber);
    }
    renderActionHistory(state2) {
      const history = this.statusPanelEl.querySelector("#action-history ol");
      if (!history)
        return;
      this.bindActionHistoryScroll(history);
      const actions = state2.actionHistory ?? [];
      const lastKey = actionHistoryKey(actions.at(-1));
      if (this.actionHistoryRef === actions && this.actionHistoryLength === actions.length && this.actionHistoryLastKey === lastKey) {
        updateActionHistoryFade(history);
        return;
      }
      const previousLength = this.actionHistoryLength;
      const previousLastKey = this.actionHistoryLastKey;
      if (actions.length === 0) {
        history.innerHTML = "";
        const item = document.createElement("li");
        item.textContent = "None yet";
        item.className = "empty-history";
        history.appendChild(item);
        this.actionHistoryRef = actions;
        this.actionHistoryLength = 0;
        this.actionHistoryLastKey = lastKey;
        updateActionHistoryFade(history);
        return;
      }
      const canAppend = previousLength > 0 && actions.length > previousLength && history.children.length === previousLength && previousLastKey === actionHistoryKey(actions[previousLength - 1]);
      if (canAppend) {
        let previousColor = actionColor(actions[previousLength - 1]);
        for (let i = previousLength;i < actions.length; i++) {
          previousColor = appendActionHistoryItem(history, actions[i], previousColor);
        }
      } else {
        history.innerHTML = "";
        let previousColor = null;
        for (const action of actions) {
          previousColor = appendActionHistoryItem(history, action, previousColor);
        }
      }
      if (actions.length > previousLength)
        history.scrollTop = history.scrollHeight;
      this.actionHistoryRef = actions;
      this.actionHistoryLength = actions.length;
      this.actionHistoryLastKey = lastKey;
      updateActionHistoryFade(history);
    }
    bindActionHistoryScroll(history) {
      if (this.actionHistoryScrollEl === history)
        return;
      this.actionHistoryScrollEl = history;
      history.addEventListener("scroll", () => updateActionHistoryFade(history));
    }
    renderCoordinates(view) {
      if (!this.coordinateEl)
        return;
      this.coordinateEl.innerHTML = "";
      for (const col of orderedIndexes(view.boardSide)) {
        const label = document.createElement("span");
        label.textContent = FILES[col];
        this.coordinateEl.appendChild(label);
      }
    }
    renderPromotion(view) {
      this.promotionEl.innerHTML = "";
      const actions = view.promotionActions ?? [];
      if (actions.length === 0) {
        this.promotionEl.hidden = true;
        return;
      }
      this.promotionEl.hidden = false;
      this.promotionEl.className = "promotion-dialog";
      this.promotionEl.setAttribute("role", "dialog");
      this.promotionEl.setAttribute("aria-label", "Choose promotion piece");
      const title = document.createElement("p");
      title.textContent = "Promote pawn";
      this.promotionEl.appendChild(title);
      const options = document.createElement("div");
      options.className = "promotion-options";
      for (const type of PROMOTION_TYPES) {
        const action = actions.find((candidate) => candidate.promotionType === type);
        if (!action)
          continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "promotion-choice";
        button.dataset.promotion = type;
        button.textContent = type;
        options.appendChild(button);
      }
      this.promotionEl.appendChild(options);
    }
    renderControls(view) {
      if (!this.controlsEl)
        return;
      const skip = this.controlsEl.querySelector('[data-control="skip-special"]');
      const undo = this.controlsEl.querySelector('[data-control="undo-turn"]');
      const settings = this.controlsEl.querySelector('[data-control="settings"]');
      const rules2 = this.controlsEl.querySelector('[data-control="rules"]');
      if (skip) {
        skip.hidden = !view.canSkipSpecial;
        skip.disabled = !view.canSkipSpecial;
      }
      if (undo) {
        undo.disabled = !view.canUndo;
        undo.setAttribute("aria-disabled", view.canUndo ? "false" : "true");
      }
      if (settings) {
        settings.setAttribute("aria-expanded", view.settingsOpen ? "true" : "false");
      }
      if (rules2) {
        rules2.setAttribute("aria-expanded", view.rulesOpen ? "true" : "false");
      }
    }
    renderSettings(view) {
      if (!this.settingsEl)
        return;
      this.settingsEl.hidden = !view.settingsOpen;
      const aiValue = this.settingsEl.querySelector("#ai-level");
      const aiLabel = this.statusPanelEl.querySelector("#ai-level-label");
      const aiSettingLabel = this.settingsEl.querySelector("#ai-setting-label");
      const animationToggle = this.settingsEl.querySelector("#animations-enabled");
      const sideButtons = this.settingsEl.querySelectorAll("[data-side]");
      const sideLock = this.settingsEl.querySelector("#side-lock-note");
      const aiLevel = view.settings?.aiLevel ?? 3;
      const activeSide = view.boardSide ?? COLORS.WHITE;
      if (aiValue)
        aiValue.value = String(aiLevel);
      if (aiLabel)
        aiLabel.textContent = view.aiLabel ?? "Level 3";
      if (aiSettingLabel)
        aiSettingLabel.textContent = view.aiLabel ?? "Level 3";
      if (animationToggle)
        animationToggle.checked = view.settings?.animationsEnabled ?? true;
      for (const button of sideButtons) {
        const active = button.dataset.side === activeSide;
        button.disabled = Boolean(view.sideLocked);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (sideLock)
        sideLock.hidden = !view.sideLocked;
    }
    renderRules(view) {
      if (!this.rulesEl)
        return;
      this.rulesEl.hidden = !view.rulesOpen;
    }
    renderCapturedPieces(state2, view) {
      if (!this.capturedTopEl && !this.capturedBottomEl)
        return;
      const topColor = (view.boardSide ?? COLORS.WHITE) === COLORS.BLACK ? COLORS.WHITE : COLORS.BLACK;
      const bottomColor = topColor === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
      renderCapturedTray(this.capturedTopEl, state2, topColor, "top");
      renderCapturedTray(this.capturedBottomEl, state2, bottomColor, "bottom");
    }
  }
  function renderPiece(piece, state2) {
    const pieceEl = document.createElement("span");
    pieceEl.className = `piece ${piece.color} ${pieceAssetClass(piece)}`;
    pieceEl.dataset.pieceId = piece.id;
    pieceEl.setAttribute("aria-label", `${piece.color} ${piece.type}`);
    const pieceImage = document.createElement("img");
    pieceImage.className = "piece-image";
    pieceImage.src = pieceAssetPath(piece);
    pieceImage.alt = "";
    pieceImage.decoding = "async";
    pieceImage.draggable = false;
    const fallbackSymbol = document.createElement("span");
    fallbackSymbol.className = "piece-symbol";
    fallbackSymbol.textContent = symbolFor(piece);
    fallbackSymbol.hidden = true;
    pieceImage.addEventListener("error", () => {
      pieceImage.hidden = true;
      fallbackSymbol.hidden = false;
    });
    const statusOverlay = document.createElement("span");
    statusOverlay.className = "piece-status-overlay";
    statusOverlay.setAttribute("aria-hidden", "true");
    pieceEl.appendChild(pieceImage);
    pieceEl.appendChild(fallbackSymbol);
    pieceEl.appendChild(statusOverlay);
    const titleParts = [`${piece.color} ${piece.type}`];
    if (shouldFlipPieceImage(piece))
      pieceEl.classList.add("is-flipped");
    if (piece.hasShield)
      pieceEl.classList.add("has-shield");
    if (piece.isImmune) {
      pieceEl.classList.add("is-immune");
      titleParts.push("immune");
    }
    if (piece.isIntimidated) {
      pieceEl.classList.add("is-intimidated");
      if (piece.intimidationSuppressedShield)
        pieceEl.classList.add("intimidation-framed");
      titleParts.push(piece.intimidationSuppressedShield ? "intimidated: shield suppressed while checking the enemy king" : "intimidated while checking the enemy king");
    }
    if (state2.gameOver?.winner === piece.color && piece.type === "King") {
      pieceEl.classList.add("winning-king");
      titleParts.push("winner");
    }
    if (LIFE_DEATH_PIECES.has(piece.type)) {
      pieceEl.classList.add(piece.type === "Life" ? "life-piece" : "death-piece");
      const owner = ownerOf(piece);
      pieceEl.dataset.owner = owner;
      pieceEl.classList.add(`owner-${owner}`);
      titleParts.push(`${owner} controlled`);
    }
    pieceEl.title = titleParts.join(" - ");
    return pieceEl;
  }
  function pieceAssetPath(piece) {
    return `${PIECE_ASSET_BASE}${pieceAssetName(piece)}`;
  }
  function pieceAssetClass(piece) {
    return `piece-asset-${pieceAssetName(piece).replace(".webp", "")}`;
  }
  function pieceAssetName(piece) {
    if (piece.type === PIECE_TYPES.LIFE)
      return "wbL.webp";
    if (piece.type === PIECE_TYPES.DEATH)
      return "wbD.webp";
    const colorPrefix = piece.color === COLORS.WHITE ? "w" : "b";
    return `${colorPrefix}${PIECE_ASSET_CODES[piece.type]}.webp`;
  }
  function shouldFlipPieceImage(piece) {
    if (PERMANENTLY_FLIPPED_PIECE_IDS.has(piece.id))
      return true;
    return LIFE_DEATH_PIECES.has(piece.type) && ownerOf(piece) === COLORS.BLACK;
  }
  function markerForSquare(row, col, view, highlights) {
    const classes = [];
    const key = `${row},${col}`;
    const isResting = highlights.resting.has(key);
    if (view.selectedPiece?.row === row && view.selectedPiece?.col === col) {
      classes.push(view.phase === "resting" && !isResting ? "selected-muted" : "selected");
    }
    if (highlights.moves.has(key))
      classes.push("valid-move");
    if (highlights.deathMoves?.has(key))
      classes.push("valid-death-move");
    if (highlights.rampMoves?.has(key))
      classes.push("valid-ramp");
    if (highlights.deathRampMoves?.has(key))
      classes.push("valid-death-ramp");
    if (highlights.attacks.has(key))
      classes.push("valid-attack");
    if (highlights.specials.has(key)) {
      classes.push("valid-special");
      if (view.selectedPiece?.type === PIECE_TYPES.LIFE)
        classes.push("valid-life-special");
      if (view.selectedPiece?.type === PIECE_TYPES.DEATH)
        classes.push("valid-death-special");
    }
    if (highlights.staging.has(key))
      classes.push("valid-staging");
    if (isResting)
      classes.push("valid-resting");
    if (classes.length === 0)
      return null;
    const marker = document.createElement("span");
    marker.className = `highlight-overlay ${classes.join(" ")}`;
    return marker;
  }
  function emptyHighlights() {
    return {
      moves: new Set,
      deathMoves: new Set,
      rampMoves: new Set,
      deathRampMoves: new Set,
      attacks: new Set,
      specials: new Set,
      staging: new Set,
      resting: new Set
    };
  }
  function setStatus(element, value) {
    element.textContent = value;
    element.className = `status-${value.toLowerCase()}`;
  }
  function playerName(color) {
    return color === COLORS.WHITE ? "White" : "Black";
  }
  function squareLabel(row, col) {
    return `${FILES[col]}${BOARD_SIZE - row}`;
  }
  function orderedIndexes(boardSide = COLORS.WHITE) {
    const indexes = [...Array(BOARD_SIZE).keys()];
    return boardSide === COLORS.BLACK ? indexes.reverse() : indexes;
  }
  function renderCapturedTray(container, state2, color, position) {
    if (!container)
      return;
    container.innerHTML = "";
    container.dataset.side = color;
    container.dataset.position = position;
    container.setAttribute("aria-label", `${playerName(color)} captured pieces`);
    const label = document.createElement("span");
    label.className = "captured-label";
    label.textContent = playerName(color);
    container.appendChild(label);
    const list = document.createElement("div");
    list.className = "captured-piece-list";
    const captured = capturedPiecesForColor(state2, color);
    for (const piece of captured) {
      list.appendChild(renderCapturedPiece(piece));
    }
    container.classList.toggle("is-empty", captured.length === 0);
    container.appendChild(list);
  }
  function renderCapturedPiece(piece) {
    const pieceEl = document.createElement("span");
    pieceEl.className = `captured-piece ${piece.color} ${pieceAssetClass(piece)}`;
    pieceEl.dataset.pieceId = piece.id;
    pieceEl.dataset.type = piece.type;
    pieceEl.title = `${piece.color} ${piece.type}`;
    const image = document.createElement("img");
    image.src = pieceAssetPath(piece);
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    pieceEl.appendChild(image);
    return pieceEl;
  }
  function capturedPiecesForColor(state2, color) {
    return [...state2.capturedPieces ?? []].filter((piece) => (piece.owner ?? piece.color) === color).sort((a, b) => CAPTURED_ORDER.indexOf(a.type) - CAPTURED_ORDER.indexOf(b.type) || (a.moveNumber ?? 0) - (b.moveNumber ?? 0) || a.id.localeCompare(b.id));
  }
  function boardRenderKey(state2, view, highlights) {
    const pieceBits = [];
    for (let r = 0;r < BOARD_SIZE; r++) {
      for (let c = 0;c < BOARD_SIZE; c++) {
        const piece = state2.board[r][c];
        if (!piece)
          continue;
        pieceBits.push([
          r,
          c,
          piece.id,
          piece.type,
          piece.color,
          ownerOf(piece),
          piece.hasShield ? 1 : 0,
          piece.isImmune ? 1 : 0,
          piece.isIntimidated ? 1 : 0,
          piece.intimidationSuppressedShield ? 1 : 0,
          state2.gameOver?.winner === piece.color && piece.type === "King" ? 1 : 0
        ].join(":"));
      }
    }
    return [
      view.boardSide ?? COLORS.WHITE,
      view.phase ?? "",
      view.selectedPiece?.id ?? "",
      view.selectedPiece?.type ?? "",
      view.selectedPiece ? `${view.selectedPiece.row},${view.selectedPiece.col}` : "",
      setKey(highlights.moves),
      setKey(highlights.deathMoves),
      setKey(highlights.rampMoves),
      setKey(highlights.deathRampMoves),
      setKey(highlights.attacks),
      setKey(highlights.specials),
      setKey(highlights.staging),
      setKey(highlights.resting),
      state2.gameOver?.winner ?? "",
      state2.gameOver?.reason ?? "",
      pieceBits.join("|")
    ].join("~");
  }
  function setKey(values) {
    return [...values ?? []].sort().join(";");
  }
  function describeAction(action) {
    const piece = action.pieceType ?? "Piece";
    const from = action.from ? squareLabel(action.from.r, action.from.c) : "";
    const to = action.to ? squareLabel(action.to.r, action.to.c) : "";
    const suffix = action.promotionType ? `=${action.promotionType}` : "";
    if (action.kind === "skip")
      return "Skipped Life/Death";
    if (action.mode === "castle")
      return `King castles ${from}-${to}`;
    if (action.mode === "knightRamp") {
      const via = action.rampSequence?.slice(0, -1).map((step) => squareLabel(step.land.r, step.land.c)) ?? [];
      return `Knight ${from}-${to}${via.length ? ` via ${via.join(", ")}` : ""}`;
    }
    if (action.kind === "move") {
      const deathNote = action.deathLanding ? " into Death" : "";
      return `${piece} ${from}-${to}${deathNote}${suffix}`;
    }
    if (action.kind === "attack") {
      const target = `${action.target?.color ?? "enemy"} ${action.target?.type ?? "piece"}`;
      const hit = action.target?.hadShield ? "breaks shield on" : "takes";
      const deathStaging = action.deathStaging ? ", attacker dies on Death" : "";
      const rest = action.rest ? `, rests ${squareLabel(action.rest.r, action.rest.c)}` : "";
      return `${piece} ${hit} ${target} ${to}${deathStaging}${rest}${suffix}`;
    }
    if (action.mode === "heal") {
      return `Life shields ${action.target?.color ?? ""} ${action.target?.type ?? "piece"} ${to}`;
    }
    if (action.mode === "kill") {
      return `Death kills ${action.target?.color ?? ""} ${action.target?.type ?? "piece"} ${to}`;
    }
    return `${piece} action`;
  }
  function actionColor(action) {
    return action.color ?? action.target?.color ?? COLORS.WHITE;
  }
  function appendActionHistoryItem(history, action, previousColor) {
    const color = actionColor(action);
    const item = document.createElement("li");
    item.dataset.actionColor = color;
    if (previousColor && previousColor !== color)
      item.classList.add("player-break");
    item.textContent = describeAction(action);
    item.setAttribute("aria-label", `${playerName(color)}: ${item.textContent}`);
    history.appendChild(item);
    return color;
  }
  function updateActionHistoryFade(history) {
    const container = history.parentElement ?? history.parent;
    if (!container?.classList)
      return;
    const clientHeight = history.clientHeight ?? history.offsetHeight ?? 0;
    const hiddenBelow = clientHeight > 0 && history.scrollTop + clientHeight < history.scrollHeight - 1;
    container.classList.toggle("has-hidden-actions-below", hiddenBelow);
  }
  function restartClassAnimation(element, className) {
    element.classList.remove(className);
    element.offsetWidth;
    element.classList.add(className);
  }
  function actionHistoryKey(action) {
    if (!action)
      return "empty";
    return [
      action.color ?? "",
      action.kind ?? "",
      action.mode ?? "",
      action.pieceId ?? "",
      action.targetId ?? "",
      action.promotionType ?? "",
      action.deathStaging ? "death" : "",
      action.deathLanding ? "deathLanding" : "",
      rampSequenceKey2(action.rampSequence),
      actionSquareKey(action.from),
      actionSquareKey(action.to),
      actionSquareKey(action.staging),
      actionSquareKey(action.rest)
    ].join("|");
  }
  function actionSquareKey(square) {
    return square ? `${square.r},${square.c}` : "";
  }
  function rampSequenceKey2(sequence = []) {
    return sequence.map((step) => `${actionSquareKey(step.ramp)}>${actionSquareKey(step.land)}`).join(";");
  }

  // src/ui/animation.js
  var ANIMATION_TIMING = Object.freeze({
    effectDurationMs: 520,
    moveDurationMs: 800,
    doubleRampHopDurationMs: 600,
    newPieceDurationMs: 260,
    removedPieceDurationMs: 560,
    turnAdvanceDelayMs: 430
  });
  var {
    effectDurationMs: EFFECT_DURATION,
    moveDurationMs: MOVE_DURATION,
    doubleRampHopDurationMs: DOUBLE_RAMP_HOP_DURATION,
    newPieceDurationMs: NEW_PIECE_DURATION,
    removedPieceDurationMs: REMOVED_PIECE_DURATION
  } = ANIMATION_TIMING;
  var MOVE_EASING = "cubic-bezier(.18,.82,.22,1)";
  var MOVE_EASING_X1 = 0.18;
  var MOVE_EASING_Y1 = 0.82;
  var MOVE_EASING_X2 = 0.22;
  var MOVE_EASING_Y2 = 1;
  var NORMAL_MOVE_FINAL_OFFSET = 0.82;
  var NORMAL_MOVE_STABLE_OFFSET = 0.86;
  var MIN_PATH_EVENT_DELAY = 42;
  function moveAnimationDurationForAction(action = null) {
    const hopCount = action?.mode === "knightRamp" ? Math.max(1, action.rampSequence?.length ?? 1) : 1;
    if (action?.mode === "knightRamp")
      return DOUBLE_RAMP_HOP_DURATION * hopCount;
    return MOVE_DURATION;
  }

  class BoardAnimator {
    constructor(boardEl, options = {}) {
      this.boardEl = boardEl;
      this.prefersReducedMotion = options.prefersReducedMotion ?? globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    }
    snapshot() {
      const pieces = new Map;
      const squares = new Map;
      const squarePieces = new Map;
      for (const squareEl of this.boardEl.querySelectorAll?.(".square") ?? []) {
        if (typeof squareEl.getBoundingClientRect !== "function")
          continue;
        const key = squareKey2(squareEl.dataset);
        squares.set(key, squareEl.getBoundingClientRect());
        const pieceEl = squareEl.querySelector?.("[data-piece-id]");
        if (pieceEl) {
          squarePieces.set(key, {
            className: pieceEl.className,
            textContent: pieceEl.textContent
          });
        }
      }
      for (const pieceEl of this.boardEl.querySelectorAll?.("[data-piece-id]") ?? []) {
        if (typeof pieceEl.getBoundingClientRect !== "function")
          continue;
        const squareEl = pieceEl.closest?.(".square");
        pieces.set(pieceEl.dataset.pieceId, {
          rect: pieceEl.getBoundingClientRect(),
          className: pieceEl.className,
          textContent: pieceEl.textContent,
          html: pieceEl.innerHTML ?? "",
          square: squareEl ? { r: Number(squareEl.dataset.row), c: Number(squareEl.dataset.col) } : null
        });
      }
      return { pieces, squares, squarePieces };
    }
    animate(previous, action, enabled) {
      if (!enabled || this.prefersReducedMotion)
        return;
      const snapshot = normalizeSnapshot(previous);
      this.animateMovement(snapshot, action);
      this.animateRemovedPieces(snapshot, action);
      this.animateEffects(action);
    }
    animateMovement(previous, action = null) {
      for (const pieceEl of this.boardEl.querySelectorAll?.("[data-piece-id]") ?? []) {
        const old = previous.pieces.get(pieceEl.dataset.pieceId);
        if (!old || typeof pieceEl.getBoundingClientRect !== "function" || typeof pieceEl.animate !== "function") {
          this.animateNewPiece(pieceEl);
          continue;
        }
        const newRect = pieceEl.getBoundingClientRect();
        const dx = old.rect.left - newRect.left;
        const dy = old.rect.top - newRect.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1)
          continue;
        const shieldCleanup = action?.pieceId === pieceEl.dataset.pieceId ? this.preparePathShieldAnimation(pieceEl, old, action, previous) : null;
        const landingStatusCleanup = action?.pieceId === pieceEl.dataset.pieceId ? this.prepareLandingStatusAnimation(pieceEl, old, action, landingStatusDelayForAction(action)) : null;
        if (action?.mode === "knightRamp" && action.pieceId === pieceEl.dataset.pieceId) {
          if (this.animateKnightRamp(pieceEl, old, action, previous, composeCleanups(shieldCleanup, landingStatusCleanup)))
            continue;
        }
        if (action?.mode === "castle" && (action.pieceId === pieceEl.dataset.pieceId || action.rookId === pieceEl.dataset.pieceId) && this.animateCastlingPiece(pieceEl, old)) {
          continue;
        }
        const squareEl = pieceEl.closest?.(".square");
        const zIndexCleanup = raiseAnimatingSquare(squareEl, movementZIndexForAction(action, pieceEl.dataset.pieceId));
        squareEl?.classList.add("is-animating");
        pieceEl.classList.add("is-moving");
        const animation = pieceEl.animate([
          {
            transform: `translate(${dx}px, ${dy}px) scale(1.05)`,
            filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48))"
          },
          {
            transform: "translate(0, 0) scale(1)",
            offset: NORMAL_MOVE_STABLE_OFFSET
          },
          {
            transform: "translate(0, 0) scale(1)",
            filter: "drop-shadow(0 0 0 rgba(0,0,0,0))"
          }
        ], {
          duration: MOVE_DURATION,
          easing: MOVE_EASING,
          fill: "none"
        });
        const cleanup = () => {
          zIndexCleanup?.();
          shieldCleanup?.();
          landingStatusCleanup?.();
          pieceEl.classList.remove("is-moving");
          squareEl?.classList.remove("is-animating");
        };
        animation.finished?.then(cleanup, cleanup);
      }
    }
    animateCastlingPiece(pieceEl, old) {
      if (!globalThis.document || !pieceEl.style || typeof pieceEl.animate !== "function")
        return false;
      const boardRect = this.boardEl.getBoundingClientRect?.();
      const finalRect = pieceEl.getBoundingClientRect?.();
      if (!boardRect || !finalRect)
        return false;
      const ghost = globalThis.document.createElement("span");
      ghost.className = `piece-ghost ${old.className} castling-ghost`;
      setGhostContent(ghost, old);
      ghost.style.left = `${old.rect.left - boardRect.left}px`;
      ghost.style.top = `${old.rect.top - boardRect.top}px`;
      ghost.style.width = `${old.rect.width}px`;
      ghost.style.height = `${old.rect.height}px`;
      this.boardEl.appendChild(ghost);
      const previousVisibility = pieceEl.style.visibility;
      pieceEl.style.visibility = "hidden";
      pieceEl.classList.add("is-moving");
      const animation = ghost.animate?.(castlingGhostKeyframes(old.rect, finalRect), {
        duration: MOVE_DURATION,
        easing: MOVE_EASING,
        fill: "forwards"
      });
      const cleanup = () => {
        ghost.remove?.();
        pieceEl.style.visibility = previousVisibility;
        pieceEl.classList.remove("is-moving");
      };
      if (animation?.finished) {
        animation.finished.then(cleanup, cleanup);
      } else {
        globalThis.setTimeout?.(cleanup, MOVE_DURATION + 80);
      }
      return true;
    }
    preparePathShieldAnimation(pieceEl, old, action, previous) {
      const finalShielded = hasClass(pieceEl.className, "has-shield");
      const plan = pathShieldTransitionPlan(action, old, previous, finalShielded);
      if (!plan)
        return null;
      setShieldClass(pieceEl, plan.initialShielded);
      const timers = plan.events.map((event) => globalThis.setTimeout?.(() => {
        setShieldClass(pieceEl, event.shielded);
        this.pulseSquare(event.square, event.effectClass);
      }, event.time));
      return () => {
        for (const timer of timers)
          globalThis.clearTimeout?.(timer);
        setShieldClass(pieceEl, finalShielded);
      };
    }
    prepareLandingStatusAnimation(pieceEl, old, action, landingDelay) {
      const finalClassName = pieceEl.className;
      const gainedIntimidation = hasClass(finalClassName, "is-intimidated") && !hasClass(old.className, "is-intimidated");
      if (!gainedIntimidation)
        return null;
      pieceEl.classList.remove("is-intimidated", "intimidation-framed");
      if (canHaveShield(action?.pieceType) && hasClass(old.className, "has-shield") && !hasClass(finalClassName, "has-shield")) {
        pieceEl.classList.add("has-shield");
      }
      let applied = false;
      const timer = globalThis.setTimeout?.(() => {
        applied = true;
        applyLandingClassName(pieceEl, finalClassName);
        this.pulseSquare(action.rest ?? action.to, "intimidation-glow");
      }, landingDelay);
      return () => {
        if (timer)
          globalThis.clearTimeout?.(timer);
        if (applied)
          return;
        applied = true;
        pieceEl.className = finalClassName;
        this.pulseSquare(action.rest ?? action.to, "intimidation-glow");
      };
    }
    animateKnightRamp(pieceEl, old, action, previous, shieldCleanup = null) {
      if (!Array.isArray(action.rampSequence) || action.rampSequence.length === 0) {
        return false;
      }
      if (typeof pieceEl.getBoundingClientRect !== "function" || typeof pieceEl.animate !== "function") {
        return false;
      }
      const finalRect = pieceEl.getBoundingClientRect();
      const routeRects = action.rampSequence.map((step) => previous.squares.get(squareKey2(step.land)));
      if (routeRects.some((rect) => !rect))
        return false;
      const squareEl = pieceEl.closest?.(".square");
      const hopCount = routeRects.length;
      const points = [old.rect, ...routeRects];
      if (hopCount > 1) {
        this.animateKnightRampSequence(pieceEl, squareEl, points, finalRect, shieldCleanup);
        return true;
      }
      const zIndexCleanup = raiseAnimatingSquare(squareEl, movementZIndexForAction(action, pieceEl.dataset.pieceId));
      squareEl?.classList.add("is-animating");
      pieceEl.classList.add("is-moving");
      const animation = pieceEl.animate(normalMoveKeyframes(points[0], points[1], finalRect), {
        duration: moveAnimationDurationForAction(action),
        easing: MOVE_EASING,
        fill: "none"
      });
      const cleanup = () => {
        zIndexCleanup?.();
        shieldCleanup?.();
        pieceEl.classList.remove("is-moving");
        squareEl?.classList.remove("is-animating");
      };
      animation.finished?.then(cleanup, cleanup);
      return true;
    }
    animateKnightRampSequence(pieceEl, squareEl, points, finalRect, shieldCleanup = null) {
      squareEl?.classList.add("is-animating");
      const zIndexCleanup = raiseAnimatingSquare(squareEl, movementZIndexForAction({ mode: "knightRamp" }, pieceEl.dataset.pieceId));
      pieceEl.classList.add("is-moving");
      const animations = [];
      const cleanup = () => {
        for (const animation of animations)
          animation.cancel?.();
        zIndexCleanup?.();
        shieldCleanup?.();
        pieceEl.classList.remove("is-moving");
        squareEl?.classList.remove("is-animating");
      };
      const runHop = (index) => {
        if (index >= points.length - 1) {
          cleanup();
          return;
        }
        const isFinalHop = index === points.length - 2;
        const animation = pieceEl.animate(doubleRampHopKeyframes(points[index], points[index + 1], finalRect, isFinalHop), {
          duration: DOUBLE_RAMP_HOP_DURATION,
          easing: MOVE_EASING,
          fill: "forwards"
        });
        animations.push(animation);
        const next = () => runHop(index + 1);
        if (animation.finished) {
          animation.finished.then(next, cleanup);
        } else {
          globalThis.setTimeout?.(next, DOUBLE_RAMP_HOP_DURATION);
        }
      };
      runHop(0);
    }
    animateNewPiece(pieceEl) {
      if (typeof pieceEl.animate !== "function")
        return;
      pieceEl.animate([
        {
          opacity: 0,
          transform: "scale(0.72) translateY(-8%)",
          filter: "blur(2px)"
        },
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" }
      ], {
        duration: NEW_PIECE_DURATION,
        easing: "cubic-bezier(.2,.8,.22,1)"
      });
    }
    animateRemovedPieces(previous, action = null) {
      const currentPieces = [
        ...this.boardEl.querySelectorAll?.("[data-piece-id]") ?? []
      ];
      const currentIds = new Set(currentPieces.map((pieceEl) => pieceEl.dataset.pieceId));
      const boardRect = this.boardEl.getBoundingClientRect?.();
      if (!boardRect || !globalThis.document)
        return;
      for (const [id, old] of previous.pieces) {
        if (currentIds.has(id))
          continue;
        if (id === action?.pieceId && this.animateRemovedMovingPiece(previous, old, action, boardRect)) {
          continue;
        }
        const ghost = globalThis.document.createElement("span");
        ghost.className = `piece-ghost ${old.className}`;
        setGhostContent(ghost, old);
        ghost.style.left = `${old.rect.left - boardRect.left}px`;
        ghost.style.top = `${old.rect.top - boardRect.top}px`;
        ghost.style.width = `${old.rect.width}px`;
        ghost.style.height = `${old.rect.height}px`;
        this.boardEl.appendChild(ghost);
        const animation = ghost.animate?.([
          {
            opacity: 1,
            transform: "scale(1) translateY(0)",
            filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.42)) blur(0)"
          },
          {
            opacity: 0.92,
            transform: "scale(1.08) translateY(-4%)",
            filter: "drop-shadow(0 12px 16px rgba(0,0,0,0.46)) brightness(1.08)",
            offset: 0.3
          },
          {
            opacity: 0.42,
            transform: "scale(0.82) translateY(-10%) rotate(-2deg)",
            filter: "drop-shadow(0 5px 12px rgba(0,0,0,0.36)) blur(0.8px) saturate(0.9)",
            offset: 0.68
          },
          {
            opacity: 0,
            transform: "scale(0.44) translateY(-18%) rotate(8deg)",
            filter: "blur(4px) saturate(0.45)"
          }
        ], {
          duration: REMOVED_PIECE_DURATION,
          easing: "cubic-bezier(.2,.8,.22,1)",
          fill: "forwards"
        });
        if (animation?.finished) {
          animation.finished.then(() => ghost.remove(), () => ghost.remove());
        } else {
          globalThis.setTimeout?.(() => ghost.remove(), REMOVED_PIECE_DURATION);
        }
        if (old.square)
          this.pulseSquare(old.square, "death-burst");
      }
    }
    animateRemovedMovingPiece(previous, old, action, boardRect) {
      const plan = removedMovingPiecePlan(action, old, previous);
      if (!plan || !globalThis.document)
        return false;
      const ghost = globalThis.document.createElement("span");
      ghost.className = `piece-ghost ${old.className} is-moving-removal`;
      setGhostContent(ghost, old);
      ghost.style.left = `${old.rect.left - boardRect.left}px`;
      ghost.style.top = `${old.rect.top - boardRect.top}px`;
      ghost.style.width = `${old.rect.width}px`;
      ghost.style.height = `${old.rect.height}px`;
      this.boardEl.appendChild(ghost);
      const pulseTimer = globalThis.setTimeout?.(() => {
        this.pulseSquare(plan.fadeSquare, "death-move-glow");
      }, plan.fadeTime);
      const animation = ghost.animate?.(removedMovingPieceKeyframes(old.rect, plan), {
        duration: plan.duration,
        easing: MOVE_EASING,
        fill: "forwards"
      });
      const cleanup = () => {
        if (pulseTimer)
          globalThis.clearTimeout?.(pulseTimer);
        ghost.remove();
      };
      if (animation?.finished) {
        animation.finished.then(cleanup, cleanup);
      } else {
        globalThis.setTimeout?.(cleanup, plan.duration + 80);
      }
      return true;
    }
    animateEffects(action) {
      if (!action)
        return;
      if (action.kind === "attack") {
        this.pulseSquare(action.to, action.target?.hadShield ? "shield-hit" : "death-burst");
      }
      if (action.mode === "heal")
        this.pulseSquare(action.to, "life-glow");
      if (action.mode === "kill")
        this.pulseSquare(action.to, "death-burst");
      if (action.mode === "lifeDeathMove") {
        this.pulseSquare(action.to, action.pieceType === "Death" ? "death-move-glow" : "life-glow");
      }
    }
    pulseSquare(square, className, duration = EFFECT_DURATION) {
      if (!square || !className)
        return;
      const el = this.boardEl.querySelector?.(`[data-row="${square.r}"][data-col="${square.c}"]`);
      if (!el)
        return;
      const squareRect = el.getBoundingClientRect?.();
      const boardRect = this.boardEl.getBoundingClientRect?.();
      if (!squareRect || !boardRect || !globalThis.document)
        return;
      const effect = globalThis.document.createElement("span");
      const inset = 0.08;
      const left = squareRect.left - boardRect.left + squareRect.width * inset;
      const top = squareRect.top - boardRect.top + squareRect.height * inset;
      const size = squareRect.width * (1 - inset * 2);
      effect.className = `board-effect ${className}`;
      effect.style.left = `${left}px`;
      effect.style.top = `${top}px`;
      effect.style.width = `${size}px`;
      effect.style.height = `${size}px`;
      this.boardEl.appendChild(effect);
      const cleanup = () => effect.remove();
      effect.getAnimations?.()[0]?.finished.then(cleanup, cleanup);
      globalThis.setTimeout?.(cleanup, duration + 80);
    }
  }
  function normalizeSnapshot(previous) {
    if (previous?.pieces)
      return previous;
    return {
      pieces: previous instanceof Map ? new Map([...previous].map(([id, rect]) => [
        id,
        { rect, className: "", textContent: "", square: null }
      ])) : new Map,
      squares: new Map,
      squarePieces: new Map
    };
  }
  function squareKey2(dataset) {
    return `${dataset.row ?? dataset.r},${dataset.col ?? dataset.c}`;
  }
  function normalMoveKeyframes(from, to, finalRect) {
    return [
      {
        offset: 0,
        transform: transformForRect(from, finalRect, 1.05),
        filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48))"
      },
      {
        offset: NORMAL_MOVE_STABLE_OFFSET,
        transform: transformForRect(to, finalRect, 1)
      },
      {
        offset: 1,
        transform: transformForRect(to, finalRect, 1),
        filter: "drop-shadow(0 0 0 rgba(0,0,0,0))"
      }
    ];
  }
  function doubleRampHopKeyframes(from, to, finalRect, isFinalHop) {
    return [
      {
        offset: 0,
        transform: transformForRect(from, finalRect, 1.05),
        filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48))"
      },
      {
        offset: 1,
        transform: transformForRect(to, finalRect, isFinalHop ? 1 : 1.05),
        filter: isFinalHop ? "drop-shadow(0 0 0 rgba(0,0,0,0))" : "drop-shadow(0 14px 12px rgba(0,0,0,0.48))"
      }
    ];
  }
  function castlingGhostKeyframes(from, to) {
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const finalTransform = `translate(${dx}px, ${dy}px) scale(1)`;
    return [
      {
        offset: 0,
        transform: "translate(0, 0) scale(1.05)",
        filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48))"
      },
      {
        offset: NORMAL_MOVE_STABLE_OFFSET,
        transform: finalTransform
      },
      {
        offset: 1,
        transform: finalTransform,
        filter: "drop-shadow(0 0 0 rgba(0,0,0,0))"
      }
    ];
  }
  function transformForRect(rect, finalRect, scale) {
    return `translate(${rect.left - finalRect.left}px, ${rect.top - finalRect.top}px) scale(${scale})`;
  }
  function raiseAnimatingSquare(squareEl, zIndex) {
    if (!squareEl?.style)
      return null;
    const previous = squareEl.style.zIndex;
    squareEl.style.zIndex = String(zIndex);
    return () => {
      squareEl.style.zIndex = previous;
    };
  }
  function movementZIndexForAction(action, pieceId) {
    if (action?.mode !== "castle")
      return 24;
    return action.rookId === pieceId ? 28 : 30;
  }
  function landingStatusDelayForAction(action) {
    if (action?.mode === "knightRamp" && Array.isArray(action.rampSequence)) {
      const hopCount = Math.max(1, action.rampSequence.length);
      const hopDuration = DOUBLE_RAMP_HOP_DURATION;
      if (hopCount > 1)
        return hopCount * hopDuration;
      return Math.round(easedTimeForProgress(NORMAL_MOVE_FINAL_OFFSET, hopDuration));
    }
    return Math.round(easedTimeForProgress(NORMAL_MOVE_FINAL_OFFSET, moveAnimationDurationForAction(action)));
  }
  function setGhostContent(ghost, old) {
    if (old.html) {
      ghost.innerHTML = old.html;
      return;
    }
    ghost.textContent = old.textContent;
  }
  function applyLandingClassName(pieceEl, finalClassName) {
    const wasMoving = hasClass(pieceEl.className, "is-moving");
    pieceEl.className = finalClassName;
    if (wasMoving)
      pieceEl.classList.add("is-moving");
  }
  function pathShieldTransitionPlan(action, old, previous, finalShielded) {
    if (!action?.path?.length || hasClass(old.className, "is-immune")) {
      return null;
    }
    let shielded = hasClass(old.className, "has-shield");
    const initialShielded = shielded;
    const shieldEligible = canHaveShield(action?.pieceType);
    const events = [];
    for (let index = 0;index < action.path.length; index++) {
      const square = action.path[index];
      const occupant = previous.squarePieces?.get(squareKey2(square));
      if (!occupant)
        continue;
      if (hasClass(occupant.className, "life-piece")) {
        if (!shieldEligible || shielded || hasClass(old.className, "is-intimidated"))
          continue;
        shielded = true;
        events.push({
          square,
          shielded,
          effectClass: "life-glow",
          time: pathEventTime(action, square, index)
        });
      }
      if (hasClass(occupant.className, "death-piece")) {
        if (!shielded)
          continue;
        shielded = false;
        events.push({
          square,
          shielded,
          effectClass: "death-move-glow",
          time: pathEventTime(action, square, index)
        });
      }
    }
    if (events.length === 0 && initialShielded === finalShielded)
      return null;
    return { initialShielded, events };
  }
  function removedMovingPiecePlan(action, old, previous) {
    if (!action || !old?.rect)
      return null;
    const path = action.path ?? [];
    const shieldEligible = canHaveShield(action.pieceType);
    const immune = hasClass(old.className, "is-immune");
    const intimidated = hasClass(old.className, "is-intimidated");
    let shielded = hasClass(old.className, "has-shield");
    let fadeSquare = null;
    let fadePathIndex = -1;
    if (!immune) {
      for (let index = 0;index < path.length; index++) {
        const square = path[index];
        const occupant = previous.squarePieces?.get(squareKey2(square));
        if (!occupant)
          continue;
        if (hasClass(occupant.className, "life-piece") && shieldEligible && !shielded && !intimidated) {
          shielded = true;
        }
        if (hasClass(occupant.className, "death-piece")) {
          if (shielded) {
            shielded = false;
          } else {
            fadeSquare = square;
            fadePathIndex = index;
            break;
          }
        }
      }
    }
    if (action.deathStaging) {
      fadeSquare = action.staging;
      fadePathIndex = -1;
    }
    if (action.deathLanding) {
      fadeSquare = action.to;
      fadePathIndex = -1;
    }
    if (!fadeSquare)
      return null;
    const destination = action.kind === "attack" && !action.deathStaging ? action.rest ?? action.to ?? fadeSquare : fadeSquare;
    const destinationRect = previous.squares?.get(squareKey2(destination)) ?? previous.squares?.get(squareKey2(fadeSquare));
    const fadeRect = previous.squares?.get(squareKey2(fadeSquare));
    if (!destinationRect || !fadeRect)
      return null;
    const duration = moveAnimationDurationForAction(action);
    const fadeTime = fadePathIndex >= 0 ? Math.min(duration - MIN_PATH_EVENT_DELAY, pathEventTime(action, fadeSquare, fadePathIndex)) : Math.round(duration * NORMAL_MOVE_FINAL_OFFSET);
    const fadeOffset = Math.max(0.08, Math.min(0.92, fadeTime / duration));
    return {
      destinationRect,
      duration,
      fadeOffset,
      fadeRect,
      fadeSquare,
      fadeTime
    };
  }
  function removedMovingPieceKeyframes(fromRect, plan) {
    const beforeFadeOffset = Math.max(0, plan.fadeOffset - 0.04);
    return [
      {
        offset: 0,
        opacity: 1,
        transform: "translate(0px, 0px) scale(1.05)",
        filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48)) blur(0)"
      },
      {
        offset: beforeFadeOffset,
        opacity: 1,
        transform: transformFromOrigin(fromRect, plan.fadeRect, 1.02),
        filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.46)) blur(0)"
      },
      {
        offset: plan.fadeOffset,
        opacity: 0.76,
        transform: transformFromOrigin(fromRect, plan.fadeRect, 0.96),
        filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.44)) blur(0.4px) saturate(0.82)"
      },
      {
        offset: 1,
        opacity: 0,
        transform: `${transformFromOrigin(fromRect, plan.destinationRect, 0.42)} rotate(7deg)`,
        filter: "blur(4px) saturate(0.45)"
      }
    ];
  }
  function transformFromOrigin(fromRect, toRect, scale) {
    return `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px) scale(${scale})`;
  }
  function pathEventTime(action, square, pathIndex) {
    if (action?.mode === "knightRamp" && Array.isArray(action.rampSequence)) {
      const hopIndex = action.rampSequence.findIndex((step) => squareKey2(step.ramp) === squareKey2(square));
      if (hopIndex >= 0) {
        const hopDuration = action.rampSequence.length > 1 ? DOUBLE_RAMP_HOP_DURATION : MOVE_DURATION;
        return Math.round(hopIndex * hopDuration + easedTimeForProgress(0.5, hopDuration));
      }
    }
    const pathLength = Math.max(1, action.path?.length ?? 1);
    const distanceProgress = (pathIndex + 1) / (pathLength + 1);
    return Math.round(easedTimeForProgress(distanceProgress * NORMAL_MOVE_FINAL_OFFSET, MOVE_DURATION));
  }
  function easedTimeForProgress(progress, duration) {
    const clamped = Math.max(0, Math.min(1, progress));
    let low = 0;
    let high = 1;
    for (let i = 0;i < 18; i++) {
      const middle = (low + high) / 2;
      if (cubicBezier(middle, MOVE_EASING_Y1, MOVE_EASING_Y2) < clamped) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const parameter = (low + high) / 2;
    const timeProgress = cubicBezier(parameter, MOVE_EASING_X1, MOVE_EASING_X2);
    return Math.max(MIN_PATH_EVENT_DELAY, timeProgress * duration);
  }
  function cubicBezier(t, p1, p2) {
    const inv = 1 - t;
    return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
  }
  function setShieldClass(pieceEl, shielded) {
    pieceEl.classList?.toggle?.("has-shield", shielded);
  }
  function hasClass(className, needle) {
    return ` ${className ?? ""} `.includes(` ${needle} `);
  }
  function composeCleanups(...cleanups) {
    const active = cleanups.filter(Boolean);
    if (active.length === 0)
      return null;
    return () => {
      for (const cleanup of active)
        cleanup();
    };
  }

  // src/ui/settings.js
  var DEFAULT_SETTINGS = {
    aiLevel: 3,
    animationsEnabled: true,
    playerSide: "white"
  };
  var STORAGE_KEY = "chess-two-settings";
  var AI_LEVELS = {
    0: { label: "Off (self-play)", maxDepth: 0, maxActions: 0, thinkDelay: 0 },
    1: {
      label: "Level 1",
      maxDepth: 1,
      maxActions: 14,
      maxTacticalActions: 4,
      quiescenceDepth: 0,
      tacticalWeight: 0.45,
      thinkDelay: 45,
      timeLimitMs: 100,
      hardTimeLimitMs: 160
    },
    2: {
      label: "Level 2",
      maxDepth: 2,
      maxActions: 20,
      maxTacticalActions: 6,
      quiescenceDepth: 1,
      tacticalWeight: 0.75,
      thinkDelay: 35,
      timeLimitMs: 280,
      hardTimeLimitMs: 460
    },
    3: {
      label: "Level 3",
      maxDepth: 3,
      maxActions: 26,
      maxTacticalActions: 8,
      quiescenceDepth: 1,
      tacticalWeight: 1.05,
      thinkDelay: 30,
      timeLimitMs: 950,
      hardTimeLimitMs: 1650
    },
    4: {
      label: "Level 4",
      maxDepth: 4,
      maxActions: 32,
      maxTacticalActions: 10,
      quiescenceDepth: 2,
      tacticalWeight: 1.35,
      thinkDelay: 25,
      timeLimitMs: 1200,
      hardTimeLimitMs: 2000
    },
    5: {
      label: "Level 5",
      maxDepth: 8,
      maxActions: 54,
      maxTacticalActions: 26,
      quiescenceDepth: 4,
      tacticalWeight: 2.75,
      priorityOverflowLimit: 36,
      forcedRootTactics: 10,
      depthStartMargin: 1.25,
      thinkDelay: 0,
      timeLimitMs: 3000,
      hardTimeLimitMs: 4600
    }
  };
  function loadSettings(storage = globalThis.localStorage) {
    if (!storage)
      return { ...DEFAULT_SETTINGS };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw)
        return { ...DEFAULT_SETTINGS };
      return normalizeSettings(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  function saveSettings(settings, storage = globalThis.localStorage) {
    const normalized = normalizeSettings(settings);
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }
  function normalizeSettings(settings) {
    const aiLevel = Number(settings?.aiLevel);
    const playerSide = settings?.playerSide === "black" ? "black" : DEFAULT_SETTINGS.playerSide;
    return {
      aiLevel: Number.isInteger(aiLevel) && aiLevel >= 0 && aiLevel <= 5 ? aiLevel : DEFAULT_SETTINGS.aiLevel,
      animationsEnabled: typeof settings?.animationsEnabled === "boolean" ? settings.animationsEnabled : DEFAULT_SETTINGS.animationsEnabled,
      playerSide
    };
  }
  function aiOptionsForLevel(level) {
    return AI_LEVELS[normalizeSettings({ aiLevel: level }).aiLevel];
  }
  function aiLabelForLevel(level) {
    return aiOptionsForLevel(level).label;
  }
  function isAiEnabled(settings) {
    return normalizeSettings(settings).aiLevel > 0;
  }
  function effectivePlayerSide(settings) {
    const normalized = normalizeSettings(settings);
    return isAiEnabled(normalized) ? DEFAULT_SETTINGS.playerSide : normalized.playerSide;
  }

  // src/generated/ai-worker-source.js
  var AI_WORKER_SOURCE = `(() => {
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
      actionHistory: preserveHistory && state.actionHistory ? structuredClone(state.actionHistory) : [],
      capturedPieces: preserveHistory && state.capturedPieces ? structuredClone(state.capturedPieces) : []
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
    recordCapturedPiece(state, piece, removedByColor);
    if (getPiece(state.board, piece.row, piece.col)?.id === piece.id) {
      setPiece(state.board, piece.row, piece.col, null);
    }
    if (piece.type === PIECE_TYPES.KING && !state.gameOver) {
      state.gameOver = {
        winner: removedByColor ?? (piece.color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE),
        reason: \`\${piece.color} king removed\`
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
      moveNumber: state.moveNumber
    });
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
    return \`\${square.r},\${square.c}\`;
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
    const respectCheck = options.respectCheck ?? true;
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
    const legalActions = respectCheck ? filterCheckLegalActions(state, color, actions) : actions;
    if (respectTurn && options.includeSkip !== false && canSkipSpecialMoveFromActions(state, color, legalActions)) {
      legalActions.push(buildSkipSpecialAction(state, color));
    }
    return sortActions(legalActions);
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
      id: \`skip-special|\${color}|\${state.moveNumber}\`,
      kind: "skip",
      mode: "skipSpecial",
      color,
      consumes: { standard: false, special: true }
    };
  }
  function canSkipSpecialMoveFromActions(state, color, actions) {
    if (state.gameOver || state.currentPlayer !== color)
      return false;
    if (isKingInCheck(state, color))
      return false;
    if (!state.turn.standardMoveMade || state.turn.specialMoveMade)
      return false;
    return actions.some((action) => action.consumes?.special);
  }
  function filterCheckLegalActions(state, color, actions) {
    const inCheck = isKingInCheck(state, color);
    if (inCheck && !hasLegalCheckEvasionSequence(state, color, actions))
      return [];
    return actions.filter((action) => isActionLegalRegardingCheck(state, color, action, inCheck));
  }
  function isActionLegalRegardingCheck(state, color, action, inCheck) {
    if (action.target?.type === PIECE_TYPES.KING)
      return false;
    if (inCheck) {
      if (isPreparatoryLifeDeathMove(state, action))
        return preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action);
      if (action.mode === "castle")
        return false;
      if (!isStandardCheckEvasionAction(action))
        return false;
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
      normalize: false
    });
    return isKingInCheck(next, color);
  }
  function castlingCrossesCheck(state, action, color) {
    if (action.mode !== "castle")
      return false;
    const king = findPieceById(state, action.pieceId);
    if (!king)
      return true;
    const direction = Math.sign(action.to.c - action.from.c);
    const kingPath = [
      { r: action.from.r, c: action.from.c },
      { r: action.from.r, c: action.from.c + direction },
      { r: action.to.r, c: action.to.c }
    ];
    return kingPath.some((square) => isKingInCheckAt(state, king, square));
  }
  function isKingInCheckAt(state, king, square) {
    const probe = cloneState(state, { preserveHistory: false });
    const probeKing = findPieceById(probe, king.id);
    if (!probeKing)
      return true;
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
    if (jumped && LIFE_DEATH_PIECES.has(jumped.type) && isValidSquare(jumpTo.r, jumpTo.c) && !getPiece(state.board, jumpTo.r, jumpTo.c)) {
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
        if (occupant?.type === PIECE_TYPES.DEATH)
          continue;
        if (occupant)
          continue;
        actions.push(withActionId({
          kind: "move",
          mode: "kingStep",
          pieceId: piece.id,
          pieceType: piece.type,
          from: { r: piece.row, c: piece.col },
          to,
          path: [],
          deathLanding: false,
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
  function generateStandardAttacks(state, piece, options = {}) {
    if (piece.type === PIECE_TYPES.PAWN) {
      return [
        ...generatePawnAttacks(state, piece, options),
        ...generateEnPassantActions(state, piece)
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
      return generateSlidingAttacks(state, piece, [...ROOK_DIRS, ...BISHOP_DIRS], options);
    return [];
  }
  function generatePawnAttacks(state, piece, options = {}) {
    const actions = [];
    const dir = pawnDirection(piece);
    for (const dc of [-1, 1]) {
      const target = getPiece(state.board, piece.row + dir, piece.col + dc);
      if (!isAttackTarget(piece, target, options))
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
  function generateKingAttacks(state, piece, options = {}) {
    const actions = [];
    for (let dr = -1;dr <= 1; dr++) {
      for (let dc = -1;dc <= 1; dc++) {
        if (dr === 0 && dc === 0)
          continue;
        const target = getPiece(state.board, piece.row + dr, piece.col + dc);
        if (!isAttackTarget(piece, target, options))
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
  function generateKnightAttacks(state, piece, options = {}) {
    const actions = [];
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const target = getPiece(state.board, piece.row + dr, piece.col + dc);
      if (!isAttackTarget(piece, target, options))
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
  function generateSlidingAttacks(state, piece, directions, options = {}) {
    const actions = [];
    for (const [dr, dc] of directions) {
      for (let distance = 1;distance < BOARD_SIZE; distance++) {
        const target = getPiece(state.board, piece.row + dr * distance, piece.col + dc * distance);
        if (!target)
          continue;
        if (LIFE_DEATH_PIECES.has(target.type))
          continue;
        if (!isAttackTarget(piece, target, options))
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
  function isAttackTarget(attacker, target, options = {}) {
    if (!target || target.isImmune)
      return false;
    if (LIFE_DEATH_PIECES.has(target.type))
      return false;
    if (target.type === PIECE_TYPES.KING && !options.allowKingTarget)
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
      if (target.type === PIECE_TYPES.KING || target.type === PIECE_TYPES.DEATH)
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
    const normalizeAfterAction = options.normalize ?? true;
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
    if (normalizeAfterAction) {
      if (!next.gameOver)
        updateIntimidation(next);
      normalizeTurn(next);
    }
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
    if (target.type === PIECE_TYPES.KING)
      return;
    const attackerFrom = { r: attacker.row, c: attacker.col };
    const diesAfterAttack = applyPathEffects(state, attacker, action.path ?? []) || action.deathStaging;
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
    if (action.mode === "kill" && !target.isImmune && target.type !== PIECE_TYPES.KING && target.type !== PIECE_TYPES.DEATH && isDarkSquare(target.row, target.col) && !isProtectedFromDeath(target, state)) {
      removePiece(state, target, ownerOf(piece));
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
    if (applyCheckmateResult(state, state.currentPlayer))
      return state;
    if (applyCheckmateResult(state, oppositeColor(state.currentPlayer)))
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
      if (applyCheckmateResult(state, state.currentPlayer))
        break;
      if (applyCheckmateResult(state, oppositeColor(state.currentPlayer)))
        break;
    }
    return state;
  }
  function applyCheckmateResult(state, loser) {
    if (!isCheckmate(state, loser))
      return false;
    state.gameOver = {
      winner: oppositeColor(loser),
      reason: \`\${loser} king checkmated\`
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
  function isKingInCheck(state, color) {
    const king = findKing(state, color);
    if (!king)
      return false;
    return allPieces(state).some((piece) => ownerOf(piece) !== color && attacksKing(state, piece, king));
  }
  function isCheckmate(state, color = state.currentPlayer) {
    if (!isKingInCheck(state, color))
      return false;
    return !hasLegalCheckEvasionSequence(checkmateProbeState(state, color), color);
  }
  function checkmateProbeState(state, color) {
    if (state.currentPlayer === color)
      return state;
    const probe = cloneState(state, { preserveHistory: false });
    probe.currentPlayer = color;
    probe.turn = { standardMoveMade: false, specialMoveMade: false };
    return probe;
  }
  function hasLegalCheckEvasionSequence(state, color, actions = null) {
    if (legalStandardCheckEvasionActions(state, color).length > 0)
      return true;
    return preparatoryLifeDeathActions(state, color, actions).some((action) => preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action));
  }
  function legalStandardCheckEvasionActions(state, color) {
    const king = findKing(state, color);
    if (!king)
      return [];
    return allPieces(state).filter((piece) => ownerOf(piece) === color).flatMap((piece) => generatePieceActions(state, piece)).filter((action) => isStandardCheckEvasionAction(action) && !actionLeavesKingInCheck(state, action, color));
  }
  function isStandardCheckEvasionAction(action) {
    return action.consumes?.standard && !action.consumes?.special && action.mode !== "castle";
  }
  function preparatoryLifeDeathActions(state, color, actions = null) {
    if (state.currentPlayer !== color)
      return [];
    if (state.turn.standardMoveMade || state.turn.specialMoveMade)
      return [];
    const candidates = actions ?? allPieces(state).flatMap((piece) => ownerOf(piece) === color ? generatePieceActions(state, piece) : []);
    return candidates.filter((action) => isPreparatoryLifeDeathMove(state, action));
  }
  function isPreparatoryLifeDeathMove(state, action) {
    return action.mode === "lifeDeathMove" && !state.turn.standardMoveMade && action.consumes?.special && !action.consumes?.standard;
  }
  function preparatoryLifeDeathMoveAllowsCheckEvasion(state, color, action) {
    const next = applyAction(state, action, {
      recordHistory: false,
      normalize: false
    });
    return legalStandardCheckEvasionActions(next, color).length > 0;
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
    return generateStandardAttacks(state, piece, { allowKingTarget: true }).some((action) => action.targetId === king.id);
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
    return sequence.map((step) => \`\${squareKey(step.ramp)}>\${squareKey(step.land)}\`).join(";");
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
  var KING_CAPTURE_THREAT_VALUE = 140000;
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
    const kingThreatTactic = findImmediateKingThreatTactic(state, legalRootActions, color, settings);
    if (kingThreatTactic?.forceImmediate)
      return kingThreatTactic.action;
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
  function findImmediateKingThreatTactic(state, actions, color, settings) {
    if (!isKingInCheck(state, color))
      return null;
    let best = null;
    for (const action of actions) {
      const after = applySearchAction(state, action);
      const afterKing = findKing(after, color);
      if (!afterKing)
        continue;
      if (isKingInCheck(after, color))
        continue;
      const score = kingThreatResponseScore(action, color);
      if (!best || score > best.score || score === best.score && compareAiActions(state, action, best.action, color) < 0) {
        best = { action, score, forceImmediate: true };
      }
    }
    return best;
  }
  function kingThreatResponseScore(action, color) {
    if (action.target?.type === PIECE_TYPES.KING)
      return 1e6;
    if (!action.target) {
      return action.pieceType === PIECE_TYPES.KING ? 120 : 80;
    }
    const targetOwner = ownerFromSnapshot(action.target);
    const sign = targetOwner === color ? -1 : 1;
    const intimidationBonus = action.target.isIntimidated ? 420 : 0;
    const killBonus = action.mode === "kill" || !action.target.hadShield ? 520 : 0;
    return sign * (900 + targetActionValue(action) * 2.2 + intimidationBonus + killBonus);
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
    score += kingCheckPressure(state, color);
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
    const disciplinedActions = actions.filter((action) => !isBadFatalShieldBreak(state, action) && !isBadLifeDeathHandoff(state, action));
    const candidateActions = disciplinedActions.length > 0 ? disciplinedActions : actions;
    const nonDominatedActions = candidateActions.filter((action) => !isDominatedBySameDestinationAttack(candidateActions, action));
    const ordered = orderAiActions(state, sortActions(nonDominatedActions.length > 0 ? nonDominatedActions : candidateActions), color, settings, context);
    const selected = ordered.slice(0, settings.maxActions);
    const selectedIds = new Set(selected.map((action) => action.id));
    for (const action of [
      ...immediateKingThreatResponses(state, candidateActions, settings),
      ...forced
    ]) {
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
  function isDominatedBySameDestinationAttack(actions, action) {
    if (action.kind !== "move" || !action.to)
      return false;
    return actions.some((candidate) => candidate.kind === "attack" && candidate.pieceId === action.pieceId && candidate.target?.hadShield && candidate.rest && sameSquare(candidate.rest, action.to));
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
  function isBadLifeDeathHandoff(state, action) {
    if (!isLifeDeathType(action.pieceType) || !action.to)
      return false;
    if (action.target?.type === PIECE_TYPES.KING)
      return false;
    const actor = findPieceById(state, action.pieceId);
    if (!actor)
      return false;
    const beforeOwner = ownerOf(actor);
    const afterOwner = ownerAtRow(action.to.r);
    if (beforeOwner === afterOwner)
      return false;
    if (lifeDeathAnnihilationDoomed(state, action).length > 1)
      return false;
    return true;
  }
  function immediateKingThreatResponses(state, actions, settings) {
    const mover = state.currentPlayer;
    if (!findKing(state, mover) || !isKingInCheck(state, mover))
      return [];
    return actions.filter((action) => {
      const after = applySearchAction(state, action);
      const afterKing = findKing(after, mover);
      if (!afterKing)
        return false;
      return !isKingInCheck(after, mover);
    });
  }
  function compareAiActions(state, a, b, color) {
    return actionHeuristic(state, b, color) - actionHeuristic(state, a, color) || a.id.localeCompare(b.id);
  }
  function buildActionContext(state, settings = DEFAULT_OPTIONS) {
    const mover = state.currentPlayer;
    const opponent = oppositeColor(mover);
    const opponentActions = legalActionsForSearch(state, opponent, settings, {
      respectTurn: false
    });
    const threats = exposureByTarget(opponentActions, mover);
    const threateningAttackers = new Map;
    for (const action of opponentActions) {
      if (!action.target || ownerFromSnapshot(action.target) !== mover)
        continue;
      const risk = actionExposureValue(action);
      const previous = threateningAttackers.get(action.pieceId)?.risk ?? 0;
      if (risk > previous)
        threateningAttackers.set(action.pieceId, { risk });
    }
    return {
      mover,
      threats,
      threateningAttackers,
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
    if (isKingInCheck(state, state.currentPlayer)) {
      if (action.pieceType === PIECE_TYPES.KING)
        score += 2200;
      if (action.mode === "lifeDeathMove")
        score -= 520;
    }
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
    score += attackerSuppressionOrderingScore(action, color, context);
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
  function attackerSuppressionOrderingScore(action, color, context) {
    if (!action.targetId || !action.target)
      return 0;
    if (action.kind !== "attack" && action.mode !== "kill")
      return 0;
    const pressure = context?.threateningAttackers?.get(action.targetId)?.risk ?? 0;
    if (pressure <= 0)
      return 0;
    const targetOwner = ownerFromSnapshot(action.target);
    const sign = targetOwner === color ? -1 : 1;
    const resolutionWeight = action.mode === "kill" || !action.target.hadShield ? 1.2 : 0.72;
    const value = 240 + pressure * resolutionWeight + materialValue(action.target.type) * 0.22 + (action.target.hadShield ? shieldPressureValue(action.target) * 0.64 : 0);
    return sign * Math.min(1750, value);
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
      score += attackerSuppressionTacticalBonus(before, action, color, settings);
      score -= missedDeathKillPenalty(before, action, color, settings);
    }
    if (action.mode === "kill") {
      score += deathKillTacticalBonus(action, color);
      score += attackerSuppressionTacticalBonus(before, action, color, settings);
    }
    if (action.mode === "heal")
      score += healTacticalBonus(action, color);
    score += pathEffectScore(pathEffectReport(before, action)) * 0.72;
    score += lifeDeathTransferScore(before, action, color) * 0.85;
    score += lifeDeathAnnihilationScore(before, action, color) * 0.9;
    score += defensiveRootScore(before, after, actor, action, color, settings);
    score += teamSafetyDeltaScore(before, after, color, settings);
    score += threatCreationDeltaScore(before, after, color, settings);
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
  function attackerSuppressionTacticalBonus(state, action, color, settings) {
    if (!action.targetId || !action.target)
      return 0;
    if (ownerFromSnapshot(action.target) === color)
      return 0;
    let pressure = 0;
    for (const enemyAction of legalActionsForSearch(state, oppositeColor(color), settings, { respectTurn: false })) {
      if (enemyAction.pieceId !== action.targetId || !enemyAction.target || ownerFromSnapshot(enemyAction.target) !== color) {
        continue;
      }
      pressure = Math.max(pressure, actionExposureValue(enemyAction));
    }
    if (pressure <= 0)
      return 0;
    const resolutionWeight = action.mode === "kill" || !action.target.hadShield ? 1.16 : 0.68;
    return Math.min(1450, 190 + pressure * resolutionWeight + materialValue(action.target.type) * 0.18 + (action.target.hadShield ? shieldPressureValue(action.target) * 0.58 : 0));
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
  function threatCreationDeltaScore(before, after, color, settings) {
    if (after.gameOver)
      return 0;
    const enemy = oppositeColor(color);
    const beforePressure = exposureSummary(legalActionsForSearch(before, color, settings, { respectTurn: false }), enemy);
    const afterPressure = exposureSummary(legalActionsForSearch(after, color, settings, { respectTurn: false }), enemy);
    const totalDelta = afterPressure.total - beforePressure.total;
    const urgentDelta = afterPressure.urgent - beforePressure.urgent;
    return totalDelta * 0.12 + urgentDelta * 0.34;
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
  function kingCheckPressure(state, color) {
    const ownKingCheck = isKingInCheck(state, oppositeColor(color));
    const enemyKingCheck = isKingInCheck(state, color);
    return (ownKingCheck ? KING_CAPTURE_THREAT_VALUE * 0.18 : 0) - (enemyKingCheck ? KING_CAPTURE_THREAT_VALUE * 0.28 : 0);
  }
  function threatValue(actions) {
    const threats = new Map;
    for (const action of actions) {
      if ((action.kind === "attack" || action.mode === "kill") && action.target) {
        const risk = action.target?.type === PIECE_TYPES.KING ? KING_CAPTURE_THREAT_VALUE : actionExposureValue(action) * (action.target?.hadShield ? 0.42 : 0.38);
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
        if (!target || target.isImmune || target.type === PIECE_TYPES.KING || target.type === PIECE_TYPES.DEATH || isLightSquare2(target.row, target.col))
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
    let enemySpecialValue = 0;
    for (const piece of doomed) {
      if (ownerOf(piece) !== color)
        enemySpecialValue += materialValue(piece.type);
      materialDelta += ownerOf(piece) === color ? -materialValue(piece.type) : materialValue(piece.type);
    }
    const actor = findPieceById(state, action.pieceId);
    const actorValue = actor && ownerOf(actor) === color ? materialValue(actor.type) : 0;
    const tradeFriction = action.mode === "kill" ? actorValue > 0 ? Math.min(180, actorValue * 0.18) : 60 : actorValue > 0 ? Math.min(360, actorValue * 0.38) : 120;
    const killComboBonus = action.mode === "kill" ? 260 + enemySpecialValue * 0.48 + targetActionValue(action) * 0.34 : 0;
    return materialDelta - tradeFriction + killComboBonus;
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
      return KING_CAPTURE_THREAT_VALUE;
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
      state.enPassant?.crossed?.map((square) => \`\${square.r},\${square.c}\`).join(";") ?? "",
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
`;

  // src/ui/controller.js
  var AI_COLOR = COLORS.BLACK;
  var HUMAN_COLOR = COLORS.WHITE;

  class GameController {
    constructor({
      boardEl,
      coordinateEl,
      statusPanelEl,
      promotionEl,
      controlsEl,
      settingsEl,
      rulesEl,
      capturedTopEl,
      capturedBottomEl
    }) {
      this.renderer = new Renderer({
        boardEl,
        coordinateEl,
        statusPanelEl,
        promotionEl,
        controlsEl,
        settingsEl,
        rulesEl,
        capturedTopEl,
        capturedBottomEl
      });
      this.animator = new BoardAnimator(boardEl);
      this.state = createGameState();
      this.view = this.createEmptyView();
      this.isAiRunning = false;
      this.aiRunToken = 0;
      this.undoStack = [];
      this.lastUndoAnchorKey = null;
      this.settings = loadSettings();
      this.settingsOpen = false;
      this.rulesOpen = false;
      this.documentClickHandler = (event) => this.handleDocumentClick(event);
      this.boardContextMenuHandler = (event) => this.handleBoardContextMenu(event);
      boardEl.addEventListener("click", (event) => this.handleBoardClick(event));
      boardEl.addEventListener("contextmenu", this.boardContextMenuHandler);
      boardEl.addEventListener("auxclick", this.boardContextMenuHandler);
      promotionEl.addEventListener("click", (event) => this.handlePromotionClick(event));
      controlsEl?.addEventListener("click", (event) => this.handleControlClick(event));
      settingsEl?.addEventListener("click", (event) => this.handleSettingsClick(event));
      settingsEl?.addEventListener("input", (event) => this.handleSettingsInput(event));
      settingsEl?.addEventListener("change", (event) => this.handleSettingsInput(event));
      globalThis.document?.addEventListener?.("click", this.documentClickHandler, true);
      this.render();
      this.maybeRunAiTurn();
    }
    createEmptyView() {
      return {
        selectedPiece: null,
        selectedActions: [],
        phase: "select",
        phaseInfo: "White to move. Select a piece.",
        highlights: emptyHighlights(),
        attackCandidates: [],
        stagedAttackCandidates: [],
        promotionActions: [],
        isAiThinking: false
      };
    }
    handleBoardClick(event) {
      const square = event.target.closest(".square");
      if (!square || !this.canHumanAct())
        return;
      const row = Number(square.dataset.row);
      const col = Number(square.dataset.col);
      if (this.view.phase === "staging") {
        this.chooseStaging(row, col);
        return;
      }
      if (this.view.phase === "resting") {
        this.chooseResting(row, col);
        return;
      }
      const piece = this.state.board[row][col];
      if (this.view.selectedPiece) {
        if (this.view.selectedPiece.row === row && this.view.selectedPiece.col === col) {
          this.clearSelection();
          this.render();
          return;
        }
        if (this.tryDestination(row, col))
          return;
        if (this.trySpecial(row, col))
          return;
        if (this.tryAttack(row, col))
          return;
        if (piece && ownerOf(piece) === this.state.currentPlayer) {
          this.selectPiece(piece);
          return;
        }
        this.clearSelection();
        this.render();
        return;
      }
      if (piece && ownerOf(piece) === this.state.currentPlayer)
        this.selectPiece(piece);
    }
    handleBoardContextMenu(event) {
      if (event.button !== undefined && event.button !== 2)
        return;
      event.preventDefault?.();
      if (!this.view.selectedPiece)
        return;
      this.clearSelection();
      this.render();
    }
    handlePromotionClick(event) {
      const button = event.target.closest("[data-promotion]");
      if (!button || this.view.promotionActions.length === 0)
        return;
      const action = this.view.promotionActions.find((candidate) => candidate.promotionType === button.dataset.promotion);
      if (action)
        this.commitAction(action);
    }
    handleControlClick(event) {
      const control = event.target.closest("[data-control]");
      if (!control)
        return;
      if (control.dataset.control === "skip-special") {
        this.skipSpecialMove();
      }
      if (control.dataset.control === "undo-turn") {
        this.undoLastTurn();
      }
      if (control.dataset.control === "new-game") {
        this.newGame();
      }
      if (control.dataset.control === "settings") {
        this.settingsOpen = !this.settingsOpen;
        if (this.settingsOpen)
          this.rulesOpen = false;
        this.render();
      }
      if (control.dataset.control === "rules") {
        this.rulesOpen = !this.rulesOpen;
        if (this.rulesOpen)
          this.settingsOpen = false;
        this.render();
      }
    }
    handleSettingsInput(event) {
      const target = event.target;
      if (target.id === "ai-level") {
        const wasRunningAi = this.isAiRunning;
        if (wasRunningAi) {
          this.aiRunToken += 1;
          this.isAiRunning = false;
          cancelAiWorkerSearch();
        }
        this.settings = saveSettings({
          ...this.settings,
          aiLevel: Number(target.value)
        });
        this.clearSelection();
        this.render();
        this.maybeRunAiTurn();
      }
      if (target.id === "animations-enabled") {
        this.settings = saveSettings({
          ...this.settings,
          animationsEnabled: target.checked
        });
        this.render();
      }
    }
    handleSettingsClick(event) {
      const sideButton = event.target.closest?.("[data-side]");
      if (!sideButton || sideButton.disabled || this.isPlayingAgainstAi())
        return;
      this.settings = saveSettings({
        ...this.settings,
        playerSide: sideButton.dataset.side
      });
      this.render();
    }
    handleDocumentClick(event) {
      if (!this.settingsOpen && !this.rulesOpen)
        return;
      const target = event.target;
      const inSettings = this.renderer.settingsEl?.contains?.(target) || target.closest?.('[data-control="settings"]');
      const inRules = this.renderer.rulesEl?.contains?.(target) || target.closest?.('[data-control="rules"]');
      const nextSettingsOpen = this.settingsOpen && Boolean(inSettings);
      const nextRulesOpen = this.rulesOpen && Boolean(inRules);
      if (nextSettingsOpen === this.settingsOpen && nextRulesOpen === this.rulesOpen)
        return;
      this.settingsOpen = nextSettingsOpen;
      this.rulesOpen = nextRulesOpen;
      this.render();
    }
    canHumanAct() {
      if (this.state.gameOver || this.isAiRunning)
        return false;
      return !this.isPlayingAgainstAi() || this.state.currentPlayer === HUMAN_COLOR;
    }
    isPlayingAgainstAi() {
      return isAiEnabled(this.settings);
    }
    selectPiece(piece) {
      const actions = getActionsForPiece(this.state, piece.id);
      if (actions.length === 0) {
        this.view = this.createEmptyView();
        this.view.phaseInfo = "That piece has no legal action in the remaining turn slots.";
        this.render();
        return;
      }
      this.view = {
        ...this.createEmptyView(),
        selectedPiece: piece,
        selectedActions: actions,
        phaseInfo: `${piece.type} selected.`,
        highlights: highlightsForActions(this.state, actions, piece)
      };
      this.render();
    }
    tryDestination(row, col) {
      const candidates = this.view.selectedActions.filter((action) => {
        const square = action.to;
        return action.kind === "move" && square?.r === row && square?.c === col;
      });
      if (candidates.length === 0)
        return false;
      if (candidates[0]?.mode === "knightRamp") {
        this.commitOrPromote([chooseKnightRampAction(candidates)]);
      } else {
        this.commitOrPromote(candidates);
      }
      return true;
    }
    trySpecial(row, col) {
      const candidates = this.view.selectedActions.filter((action) => {
        const square = action.to;
        return action.kind === "special" && square?.r === row && square?.c === col;
      });
      if (candidates.length === 0)
        return false;
      this.commitAction(candidates[0]);
      return true;
    }
    tryAttack(row, col) {
      const candidates = this.view.selectedActions.filter((action) => {
        const square = action.to;
        return action.kind === "attack" && square?.r === row && square?.c === col;
      });
      if (candidates.length === 0)
        return false;
      const stagingKeys = uniqueSquareKeys(candidates.map((action) => action.staging));
      if (stagingKeys.length > 1) {
        this.view = {
          ...this.view,
          phase: "staging",
          attackCandidates: candidates,
          highlights: {
            ...emptyHighlights(),
            staging: new Set(stagingKeys)
          },
          phaseInfo: "Choose a staging square for the attack."
        };
        this.render();
        return true;
      }
      this.chooseAttackRest(candidates);
      return true;
    }
    chooseStaging(row, col) {
      const key = `${row},${col}`;
      const candidates = this.view.attackCandidates.filter((action) => squareKey(action.staging) === key);
      if (candidates.length === 0) {
        this.clearSelection();
        this.render();
        return;
      }
      this.chooseAttackRest(candidates);
    }
    chooseAttackRest(candidates) {
      const restKeys = uniqueSquareKeys(candidates.map((action) => action.rest));
      if (restKeys.length > 1) {
        this.view = {
          ...this.view,
          phase: "resting",
          stagedAttackCandidates: candidates,
          highlights: {
            ...emptyHighlights(),
            resting: new Set(restKeys)
          },
          phaseInfo: "Confirm the attacker rest square."
        };
        this.render();
        return;
      }
      this.commitOrPromote(candidates);
    }
    chooseResting(row, col) {
      const key = `${row},${col}`;
      const candidates = this.view.stagedAttackCandidates.filter((action) => squareKey(action.rest) === key);
      if (candidates.length === 0)
        return;
      this.commitOrPromote(candidates);
    }
    commitOrPromote(candidates) {
      const promotionActions = candidates.filter((action) => action.promotionType);
      if (promotionActions.length > 1) {
        this.view = {
          ...this.view,
          phase: "promotion",
          promotionActions,
          highlights: emptyHighlights(),
          phaseInfo: "Choose a promotion piece."
        };
        this.render();
        return;
      }
      this.commitAction(candidates[0]);
    }
    commitAction(action) {
      if (!isCurrentLegalAction(this.state, action)) {
        this.clearSelection();
        this.view.phaseInfo = "That action is no longer legal.";
        this.render();
        return;
      }
      this.rememberUndoAnchor();
      const previous = this.animator.snapshot();
      this.state = applyAction(this.state, action);
      this.clearSelection();
      this.render();
      this.animator.animate(previous, action, this.settings.animationsEnabled);
      this.maybeRunAiTurn({ startDelay: this.animationDelay(action) });
    }
    skipSpecialMove() {
      if (!this.canHumanAct() || !canSkipSpecialMove(this.state, this.state.currentPlayer))
        return;
      this.rememberUndoAnchor();
      const previous = this.animator.snapshot();
      this.state = skipSpecialMove(this.state, this.state.currentPlayer);
      this.clearSelection();
      this.render();
      this.animator.animate(previous, this.state.lastAction, this.settings.animationsEnabled);
      this.maybeRunAiTurn({
        startDelay: this.animationDelay(this.state.lastAction)
      });
    }
    newGame() {
      this.aiRunToken += 1;
      cancelAiWorkerSearch();
      this.state = createGameState();
      this.isAiRunning = false;
      this.undoStack = [];
      this.lastUndoAnchorKey = null;
      this.settingsOpen = false;
      this.rulesOpen = false;
      this.clearSelection();
      this.render();
      this.maybeRunAiTurn();
    }
    clearSelection() {
      this.view = this.createEmptyView();
      if (this.canHumanAct()) {
        this.view.phaseInfo = `${playerName2(this.state.currentPlayer)} to move. Select a piece.`;
      }
    }
    async maybeRunAiTurn({ startDelay = 0 } = {}) {
      if (!this.isPlayingAgainstAi() || this.isAiRunning || this.state.gameOver || this.state.currentPlayer !== AI_COLOR)
        return;
      const runToken = ++this.aiRunToken;
      this.isAiRunning = true;
      if (startDelay > 0)
        await delay(startDelay);
      if (runToken !== this.aiRunToken || !this.isPlayingAgainstAi() || this.state.gameOver || this.state.currentPlayer !== AI_COLOR) {
        this.isAiRunning = false;
        this.render();
        return;
      }
      this.view = { ...this.createEmptyView(), isAiThinking: true };
      this.render();
      while (this.isPlayingAgainstAi() && !this.state.gameOver && this.state.currentPlayer === AI_COLOR) {
        const aiOptions = aiOptionsForLevel(this.settings.aiLevel);
        await delay(aiOptions.thinkDelay);
        if (runToken !== this.aiRunToken || !this.isPlayingAgainstAi() || this.state.gameOver || this.state.currentPlayer !== AI_COLOR)
          break;
        let action = null;
        try {
          action = await chooseAiActionForUi(this.state, AI_COLOR, aiOptions);
        } catch {
          break;
        }
        if (runToken !== this.aiRunToken || !this.isPlayingAgainstAi() || this.state.gameOver || this.state.currentPlayer !== AI_COLOR)
          break;
        if (!action)
          break;
        const statusState = this.state;
        const previous = this.animator.snapshot();
        this.state = applyAction(this.state, action);
        const holdAiTurnStatus = !this.state.gameOver && this.state.currentPlayer !== AI_COLOR;
        this.view = {
          ...this.createEmptyView(),
          isAiThinking: this.state.currentPlayer === AI_COLOR,
          isAiAnimating: holdAiTurnStatus,
          statusState: holdAiTurnStatus ? statusState : null
        };
        this.render();
        this.animator.animate(previous, action, this.settings.animationsEnabled);
        await delay(this.animationDelay(action));
        if (runToken !== this.aiRunToken)
          break;
      }
      if (runToken !== this.aiRunToken)
        return;
      this.isAiRunning = false;
      this.clearSelection();
      this.render();
    }
    render() {
      const selected = this.view.selectedPiece ? findPieceById(this.state, this.view.selectedPiece.id) : null;
      this.renderer.render(this.state, {
        ...this.view,
        selectedPiece: selected,
        isAiThinking: this.isAiRunning || this.view.isAiThinking,
        canSkipSpecial: this.canShowSkip(),
        settings: this.settings,
        settingsOpen: this.settingsOpen,
        rulesOpen: this.rulesOpen,
        aiLabel: aiLabelForLevel(this.settings.aiLevel),
        boardSide: effectivePlayerSide(this.settings),
        sideLocked: this.isPlayingAgainstAi(),
        canUndo: this.canUndo()
      });
    }
    canShowSkip() {
      return this.canHumanAct() && canSkipSpecialMove(this.state, this.state.currentPlayer);
    }
    animationDelay(action = null) {
      if (!this.settings.animationsEnabled)
        return 0;
      return Math.max(ANIMATION_TIMING.turnAdvanceDelayMs, moveAnimationDurationForAction(action) + 60);
    }
    rememberUndoAnchor() {
      if (!this.canHumanAct())
        return;
      const key = turnUndoKey(this.state);
      if (this.lastUndoAnchorKey === key)
        return;
      this.undoStack.push({
        key,
        state: cloneState(this.state)
      });
      if (this.undoStack.length > 40)
        this.undoStack.shift();
      this.lastUndoAnchorKey = key;
    }
    canUndo() {
      return !this.isAiRunning && this.undoStack.length > 0;
    }
    undoLastTurn() {
      if (!this.canUndo())
        return;
      this.aiRunToken += 1;
      cancelAiWorkerSearch();
      const entry = this.undoStack.pop();
      this.state = cloneState(entry.state);
      this.lastUndoAnchorKey = null;
      this.isAiRunning = false;
      this.settingsOpen = false;
      this.rulesOpen = false;
      this.clearSelection();
      this.render();
    }
  }
  function highlightsForActions(state2, actions, selectedPiece) {
    const highlights = emptyHighlights();
    const moveActions = actions.filter((action) => action.kind === "move" && action.to);
    const moveGroups = groupByDestination(moveActions.filter((action) => action.mode !== "knightRamp"));
    const rampGroups = groupByDestination(moveActions.filter((action) => action.mode === "knightRamp"));
    for (const [key, candidates] of moveGroups) {
      if (candidates.every((action) => movePassesThroughDeath(state2, action)))
        highlights.deathMoves.add(key);
      else
        highlights.moves.add(key);
    }
    for (const [key, candidates] of rampGroups) {
      if (candidates.every((action) => movePassesThroughDeath(state2, action)))
        highlights.deathRampMoves.add(key);
      else
        highlights.rampMoves.add(key);
    }
    for (const action of actions) {
      if (action.kind === "attack")
        highlights.attacks.add(squareKey(action.to));
      if (action.kind === "special")
        highlights.specials.add(squareKey(action.to));
    }
    highlights.moves.delete(`${selectedPiece.row},${selectedPiece.col}`);
    highlights.rampMoves.delete(`${selectedPiece.row},${selectedPiece.col}`);
    highlights.deathMoves.delete(`${selectedPiece.row},${selectedPiece.col}`);
    highlights.deathRampMoves.delete(`${selectedPiece.row},${selectedPiece.col}`);
    return highlights;
  }
  function groupByDestination(actions) {
    const groups = new Map;
    for (const action of actions) {
      const key = squareKey(action.to);
      groups.set(key, [...groups.get(key) ?? [], action]);
    }
    return groups;
  }
  function movePassesThroughDeath(state2, action) {
    if (action.deathLanding)
      return true;
    return (action.path ?? []).some((square) => state2.board[square.r]?.[square.c]?.type === PIECE_TYPES.DEATH);
  }
  function chooseKnightRampAction(candidates) {
    const bestScore = Math.max(...candidates.map(knightRampRouteScore));
    const bestRoutes = candidates.filter((action) => knightRampRouteScore(action) === bestScore);
    const shortestLength = Math.min(...bestRoutes.map(knightRampRouteLength));
    const preferred = bestRoutes.filter((action) => knightRampRouteLength(action) === shortestLength);
    if (preferred.length === 1)
      return preferred[0];
    return preferred[Math.floor(Math.random() * preferred.length)];
  }
  function knightRampRouteLength(action) {
    return action.rampSequence?.length ?? 1;
  }
  function knightRampRouteScore(action) {
    let lifeCount = 0;
    let deathCount = 0;
    for (const step of action.rampSequence ?? []) {
      if (step.rampType === PIECE_TYPES.LIFE)
        lifeCount += 1;
      if (step.rampType === PIECE_TYPES.DEATH)
        deathCount += 1;
    }
    return lifeCount * 100 - deathCount * 1000;
  }
  function uniqueSquareKeys(squares) {
    return [
      ...new Set(squares.filter(Boolean).map((square) => squareKey(square)))
    ];
  }
  async function chooseAiActionForUi(state2, color, options) {
    if (typeof globalThis.Worker === "function") {
      const workerOptions = AI_WORKER_SOURCE ? { inlineSource: AI_WORKER_SOURCE } : {};
      try {
        return await chooseAiActionInWorker(state2, color, options, workerOptions);
      } catch (error) {
        if (isAiWorkerCancellation(error) || !isAiWorkerStartupFailure(error)) {
          throw error;
        }
      }
    }
    return chooseAiActionOnMainThread(state2, color, options);
  }
  function chooseAiActionInWorker(state2, color, options, { inlineSource } = {}) {
    return new Promise((resolve, reject) => {
      const workerUrl = inlineSource ? URL.createObjectURL(new Blob([inlineSource], { type: "text/javascript" })) : new URL("ai-worker.bundle.js", globalThis.location?.href).href;
      let worker = null;
      try {
        worker = new Worker(workerUrl);
      } catch (error) {
        if (inlineSource)
          URL.revokeObjectURL(workerUrl);
        reject(aiWorkerStartupError(error));
        return;
      }
      const id = globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const timeoutMs = Math.max(options?.hardTimeLimitMs ?? 0, options?.timeLimitMs ?? 0) + 1200;
      const timer = timeoutMs > 1200 ? setTimeout(() => {
        cleanupWorker(worker, workerUrl, inlineSource);
        reject(new Error("AI worker timed out"));
      }, timeoutMs) : null;
      activeAiWorker = {
        reject,
        timer,
        url: workerUrl,
        usesObjectUrl: Boolean(inlineSource),
        worker
      };
      worker.onmessage = (event) => {
        if (event.data?.id !== id)
          return;
        settled = true;
        if (timer)
          clearTimeout(timer);
        cleanupWorker(worker, workerUrl, inlineSource);
        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }
        resolve(event.data.action ?? null);
      };
      worker.onerror = (event) => {
        if (settled)
          return;
        settled = true;
        if (timer)
          clearTimeout(timer);
        cleanupWorker(worker, workerUrl, inlineSource);
        reject(event.error ?? new Error("AI worker failed"));
      };
      worker.postMessage({ id, state: state2, color, options });
    });
  }
  async function chooseAiActionOnMainThread(state2, color, options) {
    await delay(0);
    return chooseAiAction(state2, color, mainThreadAiOptions(options));
  }
  function mainThreadAiOptions(options = {}) {
    const timeLimitMs = options.timeLimitMs && options.timeLimitMs > 0 ? options.timeLimitMs : 650;
    const hardTimeLimitMs = options.hardTimeLimitMs && options.hardTimeLimitMs > 0 ? options.hardTimeLimitMs : 950;
    return {
      ...options,
      maxDepth: Math.min(options.maxDepth ?? 3, 5),
      maxActions: Math.min(options.maxActions ?? 36, 34),
      maxTacticalActions: Math.min(options.maxTacticalActions ?? 8, 14),
      quiescenceDepth: Math.min(options.quiescenceDepth ?? 0, 2),
      priorityOverflowLimit: Math.min(options.priorityOverflowLimit ?? 12, 12),
      timeLimitMs: Math.min(timeLimitMs, 650),
      hardTimeLimitMs: Math.min(hardTimeLimitMs, 950)
    };
  }
  function isAiWorkerCancellation(error) {
    return errorMessage(error).includes("cancelled");
  }
  function isAiWorkerStartupFailure(error) {
    return Boolean(error?.aiWorkerStartupFailed);
  }
  function aiWorkerStartupError(error) {
    const startupError = new Error(errorMessage(error) || "AI worker startup failed");
    startupError.cause = error;
    startupError.aiWorkerStartupFailed = true;
    return startupError;
  }
  function errorMessage(error) {
    return String(error?.message ?? error ?? "");
  }
  var activeAiWorker = null;
  function cancelAiWorkerSearch() {
    if (!activeAiWorker)
      return;
    const { reject, timer, url, usesObjectUrl, worker } = activeAiWorker;
    activeAiWorker = null;
    if (timer)
      clearTimeout(timer);
    worker.terminate();
    if (usesObjectUrl)
      URL.revokeObjectURL(url);
    reject(new Error("AI worker cancelled"));
  }
  function cleanupWorker(worker, url, inlineSource) {
    if (activeAiWorker?.worker === worker)
      activeAiWorker = null;
    worker.terminate();
    if (inlineSource)
      URL.revokeObjectURL(url);
  }
  function delay(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
  function playerName2(color) {
    return color === COLORS.WHITE ? "White" : "Black";
  }
  function turnUndoKey(state2) {
    return `${state2.currentPlayer}|${state2.moveNumber}`;
  }
  function isCurrentLegalAction(state2, action) {
    if (!action?.id)
      return false;
    return generateLegalActions(state2).some((candidate) => candidate.id === action.id);
  }

  // src/main.js
  function startChessTwo() {
    new GameController({
      boardEl: document.querySelector("#game-board"),
      coordinateEl: document.querySelector("#file-coordinates"),
      statusPanelEl: document.querySelector("#status-panel"),
      promotionEl: document.querySelector("#promotion-panel"),
      controlsEl: document.querySelector("#turn-controls"),
      settingsEl: document.querySelector("#settings-panel"),
      rulesEl: document.querySelector("#rules-panel"),
      capturedTopEl: document.querySelector("#captured-top"),
      capturedBottomEl: document.querySelector("#captured-bottom")
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startChessTwo, { once: true });
  } else {
    startChessTwo();
  }
})();
