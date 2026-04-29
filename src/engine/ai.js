import { BOARD_SIZE, COLORS, MATERIAL_VALUES, PIECE_TYPES, PROMOTION_TYPES, canHaveShield, oppositeColor } from './constants.js';
import { allPieces, findPieceById, getPiece, ownerOf } from './state.js';
import { applyAction, findKing, generateLegalActions, sortActions } from './rules.js';

const DEFAULT_OPTIONS = {
    maxDepth: 3,
    maxActions: 36,
    maxTacticalActions: 8,
    quiescenceDepth: 0,
    tacticalWeight: 1,
    transpositionLimit: 25000,
    timeLimitMs: 0,
    hardTimeLimitMs: 0,
    depthStartMargin: 1.75,
};

const LIFE_DEATH_STRATEGIC_VALUES = {
    [PIECE_TYPES.LIFE]: 460,
    [PIECE_TYPES.DEATH]: 760,
};

export function chooseAiAction(state, color = 'black', options = {}) {
    const settings = { ...DEFAULT_OPTIONS, ...options };
    settings.transposition = new Map();
    settings.startedAt = now();
    settings.softDeadline = settings.timeLimitMs > 0 ? settings.startedAt + settings.timeLimitMs : Number.POSITIVE_INFINITY;
    settings.deadline = hardDeadline(settings);
    settings.timedOut = false;
    const actions = selectSearchActions(state, generateLegalActions(state, color), color, settings);
    if (actions.length === 0) return null;

    let best = { action: actions[0], score: Number.NEGATIVE_INFINITY };
    const maxDepth = Math.max(1, settings.maxDepth);
    let lastDepthMs = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
        if (!shouldStartDepth(settings, depth, lastDepthMs, maxDepth)) break;
        settings.timedOut = false;
        const depthStartedAt = now();
        const result = searchRoot(state, color, settings, actions, depth);
        const depthElapsed = now() - depthStartedAt;
        if (result.action && (result.completed || depth === 1)) best = result;
        if (result.completed) lastDepthMs = depthElapsed;
        if (!result.completed || isSoftTimeUp(settings)) break;
    }

    return best.action;
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
        const score = (depth <= 1 ? evaluateState(next, color) : minimax(next, depth - 1, alpha, beta, color, settings))
            + actionHeuristic(state, action, color) * rootHeuristicWeight(depth)
            + rootTacticalScore(state, next, action, color, settings);
        if (score > bestScore || (score === bestScore && compareAiActions(state, action, bestAction, color) < 0)) {
            bestScore = score;
            bestAction = action;
        }
        alpha = Math.max(alpha, bestScore);
    }

    return { action: bestAction, score: bestScore, completed: !settings.timedOut };
}

function minimax(state, depth, alpha, beta, aiColor, settings) {
    if (state.gameOver) return evaluateState(state, aiColor);
    if (depth <= 0) return quiescence(state, settings.quiescenceDepth, alpha, beta, aiColor, settings);
    if (isTimeUp(settings)) {
        settings.timedOut = true;
        return evaluateState(state, aiColor);
    }

    const cacheKey = stateKey(state, depth, aiColor);
    const cached = settings.transposition?.get(cacheKey);
    if (cached !== undefined) return cached;

    const actions = selectSearchActions(state, generateLegalActions(state, state.currentPlayer), aiColor, settings);
    if (actions.length === 0) return evaluateState(state, aiColor);

    const maximizing = state.currentPlayer === aiColor;
    if (maximizing) {
        let value = Number.NEGATIVE_INFINITY;
        for (const action of actions) {
            value = Math.max(value, minimax(applySearchAction(state, action), depth - 1, alpha, beta, aiColor, settings));
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        if (!settings.timedOut) cacheValue(settings, cacheKey, value);
        return value;
    }

    let value = Number.POSITIVE_INFINITY;
    for (const action of actions) {
        value = Math.min(value, minimax(applySearchAction(state, action), depth - 1, alpha, beta, aiColor, settings));
        beta = Math.min(beta, value);
        if (alpha >= beta) break;
    }
    if (!settings.timedOut) cacheValue(settings, cacheKey, value);
    return value;
}

function quiescence(state, depth, alpha, beta, aiColor, settings) {
    const standPat = evaluateState(state, aiColor);
    if (state.gameOver || depth <= 0 || isTimeUp(settings)) {
        if (isTimeUp(settings)) settings.timedOut = true;
        return standPat;
    }

    const actions = selectSearchActions(
        state,
        generateLegalActions(state, state.currentPlayer).filter(isForcingAction),
        aiColor,
        { ...settings, maxActions: settings.maxTacticalActions },
    );
    if (actions.length === 0) return standPat;

    const maximizing = state.currentPlayer === aiColor;
    if (maximizing) {
        let value = standPat;
        alpha = Math.max(alpha, value);
        for (const action of actions) {
            value = Math.max(value, quiescence(applySearchAction(state, action), depth - 1, alpha, beta, aiColor, settings));
            alpha = Math.max(alpha, value);
            if (isTimeUp(settings)) settings.timedOut = true;
            if (alpha >= beta || settings.timedOut) break;
        }
        return value;
    }

    let value = standPat;
    beta = Math.min(beta, value);
    for (const action of actions) {
        value = Math.min(value, quiescence(applySearchAction(state, action), depth - 1, alpha, beta, aiColor, settings));
        beta = Math.min(beta, value);
        if (isTimeUp(settings)) settings.timedOut = true;
        if (alpha >= beta || settings.timedOut) break;
    }
    return value;
}

function applySearchAction(state, action) {
    return applyAction(state, action, { recordHistory: false });
}

export function evaluateState(state, color = 'black') {
    if (state.gameOver) {
        if (!state.gameOver.winner) return 0;
        return state.gameOver.winner === color ? 1_000_000 : -1_000_000;
    }

    let score = 0;
    const lifeCounts = lifeCountsByOwner(state);
    for (const piece of allPieces(state)) {
        const sign = ownerOf(piece) === color ? 1 : -1;
        let value = materialValue(piece.type);
        if (piece.hasShield) value += shieldValueForType(piece.type);
        if (piece.isImmune) value += 45;
        if (piece.isIntimidated) value -= 85;
        if (piece.type === PIECE_TYPES.PAWN) value += pawnProgress(piece) * 9;
        value += positionalValue(piece, state, color);
        if (piece.type === PIECE_TYPES.LIFE || piece.type === PIECE_TYPES.DEATH) value += lifeDeathPositionValue(piece);
        value += shieldRepairContextValue(piece, lifeCounts.get(ownerOf(piece)) ?? 0);
        score += sign * value;
    }

    const ownKing = findKing(state, color);
    const enemyKing = findKing(state, color === 'white' ? 'black' : 'white');
    if (!ownKing) score -= 900_000;
    if (!enemyKing) score += 900_000;

    const enemy = oppositeColor(color);
    const currentActions = generateLegalActions(state, state.currentPlayer);
    const ownActions = generateLegalActions(state, color, { respectTurn: false });
    const enemyActions = generateLegalActions(state, enemy, { respectTurn: false });
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

function orderAiActions(state, actions, color, settings, context = buildActionContext(state)) {
    const direction = state.currentPlayer === color ? 1 : -1;
    const scores = new Map(actions.map((action) => [action.id, actionHeuristic(state, action, color, settings, context)]));
    return [...actions].sort((a, b) => (
        direction * (scores.get(b.id) - scores.get(a.id))
        || a.id.localeCompare(b.id)
    ));
}

function selectSearchActions(state, actions, color, settings) {
    const context = buildActionContext(state);
    const ordered = orderAiActions(state, sortActions(actions), color, settings, context);
    const selected = ordered.slice(0, settings.maxActions);
    const selectedIds = new Set(selected.map((action) => action.id));
    for (const action of ordered) {
        if (!isPriorityAction(action, context) || selectedIds.has(action.id)) continue;
        selected.push(action);
        selectedIds.add(action.id);
    }
    return selected;
}

function compareAiActions(state, a, b, color) {
    return actionHeuristic(state, b, color) - actionHeuristic(state, a, color) || a.id.localeCompare(b.id);
}

function buildActionContext(state) {
    const mover = state.currentPlayer;
    const opponent = oppositeColor(mover);
    const threats = exposureByTarget(generateLegalActions(state, opponent, { respectTurn: false }), mover);
    return {
        mover,
        threats,
        threatenedIds: new Set(threats.keys()),
    };
}

function actionHeuristic(state, action, color, settings = DEFAULT_OPTIONS, context = buildActionContext(state)) {
    let score = 0;
    const pathReport = pathEffectReport(state, action);
    const targetOwner = action.target ? ownerFromSnapshot(action.target) : null;
    const targetSign = targetOwner === color ? -1 : 1;
    if (action.target?.type === PIECE_TYPES.KING) score += targetSign * 80_000;
    if (action.kind === 'attack') score += targetSign * attackActionValue(action);
    if (action.kind === 'attack' && action.target?.isIntimidated) {
        score += targetSign * intimidatedTargetActionValue(action);
    }
    if (action.mode === 'kill') {
        const targetValue = targetActionValue(action);
        score += targetSign * (850 + targetValue * 2.4);
        if (targetOwner === color) score -= 900 + targetValue * 1.35;
    }
    if (action.mode === 'heal') score += healActionValue(state, action, color);

    const actor = findPieceById(state, action.pieceId);
    const actorColor = actor ? ownerOf(actor) : action.color;
    const actorPerspective = actorColor ?? color;
    const actorSign = actorColor && actorColor !== color ? -1 : 1;
    const destination = actionDestination(action);
    if (action.mode === 'castle') score += actorSign * 90;
    if (action.promotionType) score += actorSign * materialValue(action.promotionType);
    if (destination) score += actorSign * squareQuality(destination.r, destination.c, actorPerspective) * 5;
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
    if (action.target?.hadShield && action.target?.type !== PIECE_TYPES.KING) score -= targetSign * 18;
    return score;
}

function defensiveActionOrderingScore(state, action, color, context) {
    const actor = findPieceById(state, action.pieceId);
    const actorOwner = actor ? ownerOf(actor) : action.color ?? state.currentPlayer;
    const sign = actorOwner === color ? 1 : -1;
    let score = 0;

    const actorRisk = context?.threats?.get(action.pieceId)?.risk ?? 0;
    if (actorRisk > 0 && (action.kind === 'move' || action.kind === 'attack')) {
        score += sign * Math.min(950, actorRisk * 0.85 + pieceStake(actor) * 0.16);
    }

    const targetRisk = context?.threats?.get(action.targetId)?.risk ?? 0;
    const targetOwner = action.target ? ownerFromSnapshot(action.target) : null;
    if (action.mode === 'heal' && targetRisk > 0 && targetOwner === actorOwner) {
        score += sign * Math.min(600, targetRisk * 0.7 + shieldValueForType(action.target?.type));
    }

    return score;
}

function rootTacticalScore(before, after, action, color, settings) {
    const actor = findPieceById(before, action.pieceId);
    if (!actor || ownerOf(actor) !== color) return 0;
    let score = 0;
    if (action.kind === 'attack') {
        score += captureTacticalBonus(actor, action);
        score += intimidatedTargetTacticalBonus(action, color);
        score += shieldBreakTacticalBonus(after, actor, action, color);
        score += shieldTradeDiscipline(actor, action);
    }
    if (action.mode === 'kill') score += deathKillTacticalBonus(action, color);
    if (action.mode === 'heal') score += healTacticalBonus(action, color);
    score += lifeDeathTransferScore(before, action, color) * 0.85;
    score += lifeDeathAnnihilationScore(before, action, color) * 0.9;
    score += defensiveRootScore(before, after, actor, action, color);
    score += teamSafetyDeltaScore(before, after, color);
    score -= postActionExposurePenalty(after, action, color);
    return score * (settings.tacticalWeight ?? 1);
}

function captureTacticalBonus(actor, action) {
    if (action.kind !== 'attack' || action.target?.hadShield || action.target?.type === PIECE_TYPES.KING) return 0;
    const targetValue = materialValue(action.target?.type);
    const actorValue = materialValue(actor?.type);
    const favorableTrade = Math.max(0, targetValue - actorValue * 0.55);
    return 260 + targetValue * 0.92 + favorableTrade * 0.34;
}

function intimidatedTargetActionValue(action) {
    const targetValue = targetActionValue(action);
    const suppressedShield = action.target?.intimidationSuppressedShield
        ? shieldValueForType(action.target.type)
        : 0;
    return 260 + targetValue * 0.38 + suppressedShield * 0.85;
}

function intimidatedTargetTacticalBonus(action, color) {
    if (action.kind !== 'attack' || !action.target?.isIntimidated) return 0;
    const sign = ownerFromSnapshot(action.target) === color ? -1 : 1;
    const targetValue = targetActionValue(action);
    const suppressedShield = action.target?.intimidationSuppressedShield
        ? shieldValueForType(action.target.type)
        : 0;
    return sign * (360 + targetValue * 0.92 + suppressedShield * 1.1);
}

function shieldTradeDiscipline(actor, action) {
    if (!action.target?.hadShield || action.target?.type === PIECE_TYPES.KING) return 0;
    const actorStake = materialValue(actor.type) + (actor.hasShield ? shieldValueForType(actor.type) : 0);
    const shieldGain = shieldPressureValue(action.target);
    return -Math.max(0, actorStake - shieldGain * 3.1) * 0.18;
}

function shieldBreakTacticalBonus(after, actor, action, color) {
    if (!action.target?.hadShield || action.target?.type === PIECE_TYPES.KING) return 0;
    const targetBase = materialValue(action.target.type);
    const actorBase = materialValue(actor.type);
    const targetShield = shieldPressureValue(action.target);
    const cheapness = Math.max(0, targetBase - actorBase * 0.6);
    const pawnLever = actor.type === PIECE_TYPES.PAWN ? 80 : 0;
    let bonus = 90 + targetShield * 1.45 + targetBase * 0.16 + cheapness * 0.55 + pawnLever;

    const targetAfter = findPieceById(after, action.targetId);
    if (targetAfter) bonus *= shieldRepairMultiplier(after, targetAfter, oppositeColor(color));
    return bonus;
}

function defensiveRootScore(before, after, actor, action, color) {
    if (!actor || ownerOf(actor) !== color || after.gameOver) return 0;
    const beforeRisk = pieceExposureRisk(before, actor.id, ownerOf(actor));
    if (beforeRisk <= 0) return 0;

    const afterActor = findPieceById(after, action.pieceId);
    if (!afterActor) return -beforeRisk * 0.45;

    const afterRisk = pieceExposureRisk(after, afterActor.id, ownerOf(afterActor));
    const saved = Math.max(0, beforeRisk - afterRisk);
    const worsened = Math.max(0, afterRisk - beforeRisk);
    const savedWeight = actor.type === PIECE_TYPES.KING ? 0.32 : 0.95;
    const worsenedWeight = actor.type === PIECE_TYPES.KING ? 1.05 : 0.75;
    return saved * savedWeight - worsened * worsenedWeight;
}

function teamSafetyDeltaScore(before, after, color) {
    if (after.gameOver) return 0;
    const beforeExposure = exposureSummary(generateLegalActions(before, oppositeColor(color), { respectTurn: false }), color);
    const afterExposure = exposureSummary(generateLegalActions(after, oppositeColor(color), { respectTurn: false }), color);
    const totalDelta = beforeExposure.total - afterExposure.total;
    const urgentDelta = beforeExposure.urgent - afterExposure.urgent;
    return totalDelta * 0.18 + urgentDelta * 0.72;
}

function postActionExposurePenalty(state, action, color) {
    const actor = findPieceById(state, action.pieceId);
    if (!actor || ownerOf(actor) !== color || state.gameOver) return 0;

    let worstReply = 0;
    for (const reply of generateLegalActions(state, oppositeColor(color), { respectTurn: false })) {
        if (reply.targetId !== actor.id) continue;
        worstReply = Math.max(worstReply, actionExposureValue(reply));
    }
    if (worstReply <= 0) return 0;

    const immediateGain = action.kind === 'attack'
        ? (action.target?.hadShield ? shieldPressureValue(action.target) : targetActionValue(action))
        : 0;
    const exposureWeight = immediateGain >= worstReply ? 0.35 : 0.85;
    return worstReply * exposureWeight;
}

function isForcingAction(action) {
    return action.kind === 'attack'
        || action.mode === 'kill'
        || action.mode === 'heal'
        || Boolean(action.promotionType);
}

function isPriorityAction(action, context) {
    return action.kind === 'skip'
        || action.target?.type === PIECE_TYPES.KING
        || action.kind === 'attack'
        || action.mode === 'lifeDeathMove'
        || action.mode === 'kill'
        || action.mode === 'heal'
        || Boolean(action.promotionType)
        || context?.threatenedIds?.has(action.pieceId)
        || context?.threatenedIds?.has(action.targetId);
}

function deathKillTacticalBonus(action, color) {
    if (action.mode !== 'kill') return 0;
    const targetValue = targetActionValue(action);
    if (ownerFromSnapshot(action.target) === color) {
        return -(1800 + targetValue * 1.4);
    }
    return 320 + targetValue * 0.9;
}

function healTacticalBonus(action, color) {
    if (action.mode !== 'heal') return 0;
    const sign = ownerFromSnapshot(action.target) === color ? 1 : -1;
    return sign * (80 + shieldValueForType(action.target?.type) * 1.1);
}

function pawnMoveQuality(state, action, color) {
    if (action.pieceType !== PIECE_TYPES.PAWN || action.mode !== 'pawnAdvance') return 0;
    const fromHome = action.from.r === (color === COLORS.BLACK ? 1 : 8);
    const fileQuality = centerFileValue(action.to.c);
    const isGate = isLifeDeathGateFile(action.from.c);
    const edgePenalty = isGate ? 18 : (fileQuality <= 1.5 ? 120 : (fileQuality <= 2.5 ? 42 : 0));
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
        diesAfterAction: false,
        deathStaging: Boolean(action.deathStaging),
        deathLanding: Boolean(action.deathLanding),
        lifeCount: 0,
        deathCount: 0,
        actorValue: actor ? materialValue(actor.type) : 0,
        shieldValue: actor?.hasShield ? shieldValueForType(actor.type) : 0,
    };
    if (!actor) return report;

    if (!actor.isImmune) {
        let hasShield = actor.hasShield;
        for (const square of action.path ?? []) {
            const piece = getPiece(state.board, square.r, square.c);
            if (!piece || (piece.type !== PIECE_TYPES.LIFE && piece.type !== PIECE_TYPES.DEATH)) continue;
            if (piece.type === PIECE_TYPES.LIFE) {
                report.lifeCount += 1;
                if (canHaveShield(actor.type) && !hasShield && !actor.isIntimidated) {
                    hasShield = true;
                    report.shieldGained = true;
                }
            }
            if (piece.type === PIECE_TYPES.DEATH) {
                report.deathCount += 1;
                if (hasShield) {
                    hasShield = false;
                    report.shieldLost = true;
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
    if (report.shieldGained) score += 78;
    if (report.shieldLost) score -= report.shieldValue + 38;
    if (report.diesAfterAction) {
        const shieldDestroyedWithActor = report.shieldLost ? 0 : report.shieldValue;
        score -= report.actorValue + shieldDestroyedWithActor + (report.deathStaging || report.deathLanding ? 760 : 520);
    }
    score += report.lifeCount * 8;
    score -= report.deathCount * 12;
    return score;
}

function actionDestination(action) {
    return action.rest ?? action.to ?? null;
}

function developmentDelta(action, color) {
    const destination = actionDestination(action);
    if (!action.from || !destination) return 0;
    const before = squareQuality(action.from.r, action.from.c, color);
    const after = squareQuality(destination.r, destination.c, color);
    let score = (after - before) * 7;
    if ([PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP].includes(action.pieceType)) {
        const homeRow = color === COLORS.BLACK ? 0 : BOARD_SIZE - 1;
        if (action.from.r === homeRow) score += 28;
    }
    return score;
}

function positionalValue(piece, state, color) {
    let value = squareQuality(piece.row, piece.col, ownerOf(piece)) * 4;
    if ([PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP].includes(piece.type)) {
        const homeRow = piece.color === COLORS.BLACK ? 0 : BOARD_SIZE - 1;
        if (piece.row !== homeRow) value += 24;
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
    const threats = new Map();
    for (const action of actions) {
        if ((action.kind === 'attack' || action.mode === 'kill') && action.target) {
            const risk = action.target?.type === PIECE_TYPES.KING
                ? 2600
                : actionExposureValue(action) * (action.target?.hadShield ? 0.42 : 0.38);
            const previous = threats.get(action.target.id) ?? 0;
            if (risk > previous) threats.set(action.target.id, risk);
        }
        if (action.mode === 'heal') {
            const previous = threats.get(action.id) ?? 0;
            threats.set(action.id, Math.max(previous, 22));
        }
    }
    let score = 0;
    for (const risk of threats.values()) score += risk;
    return Math.min(score, 3600);
}

function shieldPressureValue(target) {
    return 26 + shieldValueForType(target?.type) * 1.08 + materialValue(target?.type) * 0.1;
}

function controlScore(ownActions, enemyActions, color) {
    let score = 0;
    const enemy = oppositeColor(color);
    for (const action of ownActions) {
        if (action.to) score += squareQuality(action.to.r, action.to.c, color);
        if (action.target?.type === PIECE_TYPES.KING) score += 220;
    }
    for (const action of enemyActions) {
        if (action.to) score -= squareQuality(action.to.r, action.to.c, enemy) * 0.85;
        if (action.target?.type === PIECE_TYPES.KING) score -= 220;
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
        if (piece.col !== col || piece.type !== PIECE_TYPES.PAWN) continue;
        if (piece.color === color) ownPawns += 1;
        else enemyPawns += 1;
    }
    if (ownPawns === 0 && enemyPawns === 0) return 2;
    if (ownPawns === 0) return 1;
    return 0;
}

function pawnProgress(piece) {
    if (piece.color === 'white') return 8 - piece.row;
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
    if (action.mode !== 'lifeDeathMove') return 0;
    const piece = findPieceById(state, action.pieceId);
    if (!piece || !action.to) return 0;

    const fromDepth = lifeDeathDepthForColor(action.from.r, color);
    const toDepth = lifeDeathDepthForColor(action.to.r, color);
    const advancement = toDepth - fromDepth;
    const mobilityDelta = lifeDeathMobilityFromSquare(state, piece, action.to, action) - lifeDeathMobilityFromSquare(state, piece, action.from, action);
    const centerDelta = centerFileValue(action.to.c) - centerFileValue(action.from.c);
    const tempo = state.turn.standardMoveMade && !state.turn.specialMoveMade ? 95 : 34;
    const homeRetreatPenalty = toDepth === 0 && fromDepth > 0 ? 90 : 0;
    const boundaryPenalty = toDepth === 4 ? 38 : 0;
    const threatValue = lifeDeathMoveThreatValue(state, piece, action.to, color);

    return tempo
        + advancement * 72
        + mobilityDelta * 32
        + centerDelta * 12
        + threatValue
        - homeRetreatPenalty
        - boundaryPenalty;
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
            if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) continue;
            if (piece.type === PIECE_TYPES.DEATH && isLightSquare(row, col)) continue;
            if (piece.type === PIECE_TYPES.LIFE && !isLightSquare(row, col)) continue;
            const occupant = getPiece(state.board, row, col);
            if (occupant && occupant.id !== action?.pieceId) continue;
            count += 1;
        }
    }
    return count;
}

function lifeDeathMoveThreatValue(state, piece, square, color) {
    if (piece.type === PIECE_TYPES.DEATH) return deathMoveThreatValue(state, square, color);
    if (piece.type === PIECE_TYPES.LIFE) return lifeMoveHealValue(state, square, color);
    return 0;
}

function deathMoveThreatValue(state, square, color) {
    let value = 0;
    for (const dr of [-1, 1]) {
        for (const dc of [-1, 1]) {
            const target = getPiece(state.board, square.r + dr, square.c + dc);
            if (!target || target.isImmune || target.type === PIECE_TYPES.DEATH || isLightSquare(target.row, target.col)) continue;
            if (isProtectedFromDeathLike(state, target)) continue;
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
            if (
                !target
                || !isLightSquare(target.row, target.col)
                || !canHaveShield(target.type)
                || target.hasShield
                || target.isImmune
                || target.isIntimidated
            ) {
                continue;
            }
            const sign = ownerOf(target) === color ? 1 : -0.75;
            value += sign * (72 + shieldValueForType(target.type) * 0.95 + materialValue(target.type) * 0.08);
        }
    }
    return value;
}

function isProtectedFromDeathLike(state, target) {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const protector = getPiece(state.board, target.row + dr, target.col + dc);
        if (protector && ownerOf(protector) === ownerOf(target)) return true;
    }
    return false;
}

function promotionPressure(state, color) {
    let pressure = 0;
    for (const piece of allPieces(state)) {
        if (piece.type !== PIECE_TYPES.PAWN) continue;
        const sign = ownerOf(piece) === color ? 1 : -1;
        const distance = piece.color === 'white' ? piece.row : 9 - piece.row;
        if (distance <= 2) {
            pressure += sign * (PROMOTION_TYPES.length * 12 + (2 - distance) * 35);
        }
    }
    return pressure;
}

function targetActionValue(action) {
    const base = materialValue(action.target?.type);
    if (action.target?.type === PIECE_TYPES.KING) return 100_000;
    return base + (action.target?.hadShield ? shieldValueForType(action.target.type) : 0);
}

function materialValue(type) {
    return LIFE_DEATH_STRATEGIC_VALUES[type] ?? MATERIAL_VALUES[type] ?? 0;
}

function pieceStake(piece) {
    if (!piece) return 0;
    return materialValue(piece.type) + (piece.hasShield ? shieldValueForType(piece.type) : 0);
}

function attackActionValue(action) {
    const base = targetActionValue(action);
    if (action.target?.type === PIECE_TYPES.KING) return 100_000;
    if (action.target?.hadShield) return shieldPressureValue(action.target);
    return 180 + base * 1.15;
}

function shieldValueForType(type) {
    if (type === PIECE_TYPES.PAWN) return 58;
    if (type === PIECE_TYPES.ROOK) return 210;
    if (type === PIECE_TYPES.BISHOP || type === PIECE_TYPES.KNIGHT) return 165;
    return 0;
}

function healActionValue(state, action, color) {
    const targetValue = materialValue(action.target?.type);
    const value = 150 + shieldValueForType(action.target?.type) * 2 + targetValue * 0.1;
    return ownerFromSnapshot(action.target) === color ? value : -value * 0.9;
}

function lifeDeathTransferScore(state, action, color) {
    if (!isLifeDeathType(action.pieceType)) return 0;
    const actor = findPieceById(state, action.pieceId);
    if (!actor || !action.to) return 0;
    if (lifeDeathAnnihilationDoomed(state, action).length > 1) return 0;

    const beforeOwner = ownerOf(actor);
    const afterOwner = ownerAtRow(action.to.r);
    if (beforeOwner === afterOwner) return 0;
    if (action.target?.type === PIECE_TYPES.KING && ownerFromSnapshot(action.target) !== beforeOwner) return 120_000;

    const specialValue = materialValue(action.pieceType);
    const handoffPenalty = specialValue * (action.mode === 'kill' ? 7.2 : 6.2)
        + (action.mode === 'kill' ? 1300 : 900);
    if (beforeOwner === color && afterOwner !== color) return -handoffPenalty;
    if (beforeOwner !== color && afterOwner === color) return handoffPenalty;
    return 0;
}

function lifeDeathAnnihilationScore(state, action, color) {
    const doomed = lifeDeathAnnihilationDoomed(state, action);
    if (doomed.length <= 1 || action.target?.type === PIECE_TYPES.KING) return 0;

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
    if (!isLifeDeathType(action.pieceType)) return [];
    const actor = findPieceById(state, action.pieceId);
    const destination = actionDestination(action);
    if (!actor || !destination) return [];

    const doomed = new Map([[actor.id, actor]]);
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const neighbor = getPiece(state.board, destination.r + dr, destination.c + dc);
        if (!neighbor || neighbor.id === actor.id || !isLifeDeathType(neighbor.type)) continue;
        if (neighbor.type === action.pieceType) continue;
        doomed.set(neighbor.id, neighbor);
    }
    return [...doomed.values()];
}

function isLifeDeathType(type) {
    return type === PIECE_TYPES.LIFE || type === PIECE_TYPES.DEATH;
}

function lifeDeathGateMoveBonus(state, action, color) {
    if (action.pieceType !== PIECE_TYPES.PAWN || action.mode !== 'pawnAdvance') return 0;
    if (!isLifeDeathGateFile(action.from.c)) return 0;
    const actor = findPieceById(state, action.pieceId);
    if (!actor || actor.color !== color) return 0;

    const homeRow = color === COLORS.BLACK ? 1 : BOARD_SIZE - 2;
    if (action.from.r !== homeRow) return 0;
    const step = Math.abs(action.to.r - action.from.r);
    const adjacentSpecial = action.from.c === 1
        ? getPiece(state.board, color === COLORS.BLACK ? 0 : BOARD_SIZE - 1, 0)
        : getPiece(state.board, color === COLORS.BLACK ? 0 : BOARD_SIZE - 1, BOARD_SIZE - 1);
    const opensSpecialPiece = adjacentSpecial
        && (adjacentSpecial.type === PIECE_TYPES.LIFE || adjacentSpecial.type === PIECE_TYPES.DEATH)
        && ownerOf(adjacentSpecial) === color;
    if (!opensSpecialPiece) return 0;

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
        if ((piece.type !== PIECE_TYPES.LIFE && piece.type !== PIECE_TYPES.DEATH) || ownerOf(piece) !== color) continue;
        const ownHalfDepth = color === COLORS.BLACK ? piece.row : BOARD_SIZE - 1 - piece.row;
        score += lifeDeathMobility(state, piece) * 58;
        score += Math.max(0, ownHalfDepth) * 34;
        if (ownHalfDepth === 4) score -= 90;
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
            if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) continue;
            if (getPiece(state.board, row, col)) continue;
            const dark = (row + col) % 2 === 0;
            if (piece.type === PIECE_TYPES.DEATH && dark) count += 1;
            if (piece.type === PIECE_TYPES.LIFE && !dark) count += 1;
        }
    }
    return count;
}

function kingSafetyScore(state, color) {
    const ownKing = findKing(state, color);
    const enemyKing = findKing(state, oppositeColor(color));
    let score = 0;
    if (ownKing) score += nearbyAlliedProtection(state, ownKing, color) * 18;
    if (enemyKing) score -= nearbyAlliedProtection(state, enemyKing, oppositeColor(color)) * 12;
    return score;
}

function materialSafetyScore(ownActions, enemyActions, color) {
    const ownExposure = exposureSummary(enemyActions, color);
    const enemyExposure = exposureSummary(ownActions, oppositeColor(color));
    return enemyExposure.total * 0.34
        + enemyExposure.urgent * 0.2
        - ownExposure.total * 1.82
        - ownExposure.urgent * 1.2;
}

function healPotentialScore(state, color) {
    let score = 0;
    for (const piece of allPieces(state)) {
        if (!canBeHealedByOwner(state, piece, ownerOf(piece))) continue;
        const sign = ownerOf(piece) === color ? 1 : -1;
        score += sign * (30 + shieldValueForType(piece.type) * 0.45);
    }
    return score;
}

function lifeCountsByOwner(state) {
    const counts = new Map([
        [COLORS.WHITE, 0],
        [COLORS.BLACK, 0],
    ]);
    for (const piece of allPieces(state)) {
        if (piece.type !== PIECE_TYPES.LIFE) continue;
        counts.set(ownerOf(piece), (counts.get(ownerOf(piece)) ?? 0) + 1);
    }
    return counts;
}

function shieldRepairContextValue(piece, alliedLifeCount) {
    if (
        alliedLifeCount <= 0
        || !canHaveShield(piece.type)
        || !isLightSquare(piece.row, piece.col)
        || piece.isIntimidated
    ) {
        return 0;
    }

    const typeWeight = piece.type === PIECE_TYPES.BISHOP
        ? 1.35
        : (piece.type === PIECE_TYPES.ROOK ? 1.1 : (piece.type === PIECE_TYPES.PAWN ? 0.75 : 1));
    const shieldNeedWeight = piece.hasShield ? 0.42 : 1;
    return (18 + Math.min(2, alliedLifeCount) * 16 + shieldValueForType(piece.type) * 0.18)
        * typeWeight
        * shieldNeedWeight;
}

function shieldRepairMultiplier(state, target, targetOwner) {
    if (
        !target
        || !canHaveShield(target.type)
        || target.hasShield
        || target.isImmune
        || target.isIntimidated
        || !isLightSquare(target.row, target.col)
    ) {
        return 1;
    }
    if (canBeHealedByOwner(state, target, targetOwner)) return 0.48;

    const alliedLifeCount = lifeCountForOwner(state, targetOwner);
    if (alliedLifeCount <= 0) return 1;

    let multiplier = 0.88 - Math.min(2, alliedLifeCount) * 0.08;
    if (target.type === PIECE_TYPES.BISHOP) multiplier -= 0.08;
    if (target.type === PIECE_TYPES.ROOK) multiplier -= 0.04;
    return Math.max(0.62, multiplier);
}

function lifeCountForOwner(state, color) {
    let count = 0;
    for (const piece of allPieces(state)) {
        if (piece.type === PIECE_TYPES.LIFE && ownerOf(piece) === color) count += 1;
    }
    return count;
}

function canBeHealedByOwner(state, target, healerOwner) {
    if (
        !target
        || !canHaveShield(target.type)
        || target.hasShield
        || target.isImmune
        || target.isIntimidated
        || !isLightSquare(target.row, target.col)
    ) {
        return false;
    }

    for (const life of allPieces(state)) {
        if (life.type !== PIECE_TYPES.LIFE || ownerOf(life) !== healerOwner) continue;
        if (Math.abs(life.row - target.row) === 1 && Math.abs(life.col - target.col) === 1) return true;
    }
    return false;
}

function exposureSummary(attackerActions, defenderColor) {
    const exposure = exposureByTarget(attackerActions, defenderColor);
    let total = 0;
    let urgent = 0;
    for (const { risk, action } of exposure.values()) {
        total += risk;
        if (action.mode === 'kill' || !action.target?.hadShield) {
            urgent += risk;
        } else if (risk >= 180) {
            urgent += risk * 0.35;
        }
    }
    return {
        total: Math.min(total, 3400),
        urgent: Math.min(urgent, 2800),
        exposure,
    };
}

function exposureByTarget(attackerActions, defenderColor) {
    const exposure = new Map();
    for (const action of attackerActions) {
        const target = action.target;
        if (!target || ownerFromSnapshot(target) !== defenderColor) continue;
        const risk = actionExposureValue(action);
        const previous = exposure.get(target.id)?.risk ?? 0;
        if (risk > previous) exposure.set(target.id, { risk, action });
    }
    return exposure;
}

function pieceExposureRisk(state, pieceId, defenderColor) {
    const attacker = oppositeColor(defenderColor);
    const exposure = exposureByTarget(generateLegalActions(state, attacker, { respectTurn: false }), defenderColor);
    return exposure.get(pieceId)?.risk ?? 0;
}

function actionExposureValue(action) {
    if (action.target?.type === PIECE_TYPES.KING) return 2200;
    const base = materialValue(action.target?.type);
    const shield = action.target?.hadShield ? shieldValueForType(action.target.type) : 0;
    if (action.mode === 'kill') return base * 1.08 + shield + 130;
    if (action.kind === 'attack') {
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
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const piece = getPiece(state.board, king.row + dr, king.col + dc);
            if (piece && ownerOf(piece) === color) count += 1;
        }
    }
    return count;
}

function stateKey(state, depth, color) {
    const pieces = allPieces(state)
        .map((piece) => [
            piece.id,
            piece.type,
            piece.color,
            piece.row,
            piece.col,
            piece.hasShield ? 1 : 0,
            piece.hasMoved ? 1 : 0,
            piece.isImmune ? 1 : 0,
            piece.immunityGrantedBy ?? '',
            piece.isIntimidated ? 1 : 0,
            piece.intimidationSuppressedShield ? 1 : 0,
            ownerOf(piece),
        ].join(':'))
        .sort()
        .join('|');
    return [
        depth,
        color,
        state.currentPlayer,
        state.turn.standardMoveMade ? 1 : 0,
        state.turn.specialMoveMade ? 1 : 0,
        state.enPassant?.pieceId ?? '',
        state.enPassant?.eligibleColor ?? '',
        state.enPassant?.crossed?.map((square) => `${square.r},${square.c}`).join(';') ?? '',
        pieces,
    ].join('~');
}

function cacheValue(settings, key, value) {
    if (!settings.transposition) return;
    if (settings.transposition.size > settings.transpositionLimit) settings.transposition.clear();
    settings.transposition.set(key, value);
}

function rootHeuristicWeight(depth) {
    if (depth >= 5) return 0.2;
    if (depth >= 4) return 0.24;
    if (depth >= 3) return 0.3;
    return 0.28;
}

function shouldStartDepth(settings, depth, lastDepthMs, maxDepth) {
    if (depth <= 1 || settings.timeLimitMs <= 0) return true;
    if (depth === maxDepth && lastDepthMs <= 0) return true;
    const remaining = settings.softDeadline - now();
    if (remaining <= 0) return false;
    const depthGrowth = depth >= 5 ? settings.depthStartMargin * 1.35 : settings.depthStartMargin;
    return remaining >= Math.max(40, lastDepthMs * depthGrowth);
}

function hardDeadline(settings) {
    if (settings.hardTimeLimitMs > 0) return settings.startedAt + settings.hardTimeLimitMs;
    if (settings.timeLimitMs > 0) return settings.startedAt + Math.ceil(settings.timeLimitMs * 1.55);
    return Number.POSITIVE_INFINITY;
}

function ownerFromSnapshot(piece) {
    if (!piece) return null;
    if (piece.type === PIECE_TYPES.LIFE || piece.type === PIECE_TYPES.DEATH) return ownerAtRow(piece.r);
    return piece.color;
}

function ownerAtRow(row) {
    return row >= BOARD_SIZE / 2 ? COLORS.WHITE : COLORS.BLACK;
}

function isLightSquare(row, col) {
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
