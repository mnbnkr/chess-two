import { canHaveShield } from "../engine/constants.js";

export const ANIMATION_TIMING = Object.freeze({
  effectDurationMs: 520,
  moveDurationMs: 800,
  doubleRampHopDurationMs: 600,
  newPieceDurationMs: 260,
  removedPieceDurationMs: 560,
  turnAdvanceDelayMs: 430,
});

const {
  effectDurationMs: EFFECT_DURATION,
  moveDurationMs: MOVE_DURATION,
  doubleRampHopDurationMs: DOUBLE_RAMP_HOP_DURATION,
  newPieceDurationMs: NEW_PIECE_DURATION,
  removedPieceDurationMs: REMOVED_PIECE_DURATION,
} = ANIMATION_TIMING;

const MOVE_EASING = "cubic-bezier(.18,.82,.22,1)";
const MOVE_EASING_X1 = 0.18;
const MOVE_EASING_Y1 = 0.82;
const MOVE_EASING_X2 = 0.22;
const MOVE_EASING_Y2 = 1;
const NORMAL_MOVE_FINAL_OFFSET = 0.82;
const NORMAL_MOVE_STABLE_OFFSET = 0.86;
const MIN_PATH_EVENT_DELAY = 42;

export function moveAnimationDurationForAction(action = null) {
  const hopCount =
    action?.mode === "knightRamp"
      ? Math.max(1, action.rampSequence?.length ?? 1)
      : 1;
  if (action?.mode === "knightRamp") return DOUBLE_RAMP_HOP_DURATION * hopCount;
  return MOVE_DURATION;
}

export class BoardAnimator {
  constructor(boardEl, options = {}) {
    this.boardEl = boardEl;
    this.prefersReducedMotion =
      options.prefersReducedMotion ??
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;
  }

  snapshot() {
    const pieces = new Map();
    const squares = new Map();
    const squarePieces = new Map();
    for (const squareEl of this.boardEl.querySelectorAll?.(".square") ?? []) {
      if (typeof squareEl.getBoundingClientRect !== "function") continue;
      const key = squareKey(squareEl.dataset);
      squares.set(key, squareEl.getBoundingClientRect());
      const pieceEl = squareEl.querySelector?.("[data-piece-id]");
      if (pieceEl) {
        squarePieces.set(key, {
          className: pieceEl.className,
          textContent: pieceEl.textContent,
        });
      }
    }
    for (const pieceEl of this.boardEl.querySelectorAll?.("[data-piece-id]") ??
      []) {
      if (typeof pieceEl.getBoundingClientRect !== "function") continue;
      const squareEl = pieceEl.closest?.(".square");
      pieces.set(pieceEl.dataset.pieceId, {
        rect: pieceEl.getBoundingClientRect(),
        className: pieceEl.className,
        textContent: pieceEl.textContent,
        html: pieceEl.innerHTML ?? "",
        square: squareEl
          ? { r: Number(squareEl.dataset.row), c: Number(squareEl.dataset.col) }
          : null,
      });
    }
    return { pieces, squares, squarePieces };
  }

  animate(previous, action, enabled) {
    if (!enabled || this.prefersReducedMotion) return;
    const snapshot = normalizeSnapshot(previous);
    this.animateMovement(snapshot, action);
    this.animateRemovedPieces(snapshot, action);
    this.animateEffects(action);
  }

  animateMovement(previous, action = null) {
    for (const pieceEl of this.boardEl.querySelectorAll?.("[data-piece-id]") ??
      []) {
      const old = previous.pieces.get(pieceEl.dataset.pieceId);
      if (
        !old ||
        typeof pieceEl.getBoundingClientRect !== "function" ||
        typeof pieceEl.animate !== "function"
      ) {
        this.animateNewPiece(pieceEl);
        continue;
      }
      const newRect = pieceEl.getBoundingClientRect();
      const dx = old.rect.left - newRect.left;
      const dy = old.rect.top - newRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      const shieldCleanup =
        action?.pieceId === pieceEl.dataset.pieceId
          ? this.preparePathShieldAnimation(pieceEl, old, action, previous)
          : null;
      const landingStatusCleanup =
        action?.pieceId === pieceEl.dataset.pieceId
          ? this.prepareLandingStatusAnimation(
              pieceEl,
              old,
              action,
              landingStatusDelayForAction(action),
            )
          : null;

      if (
        action?.mode === "knightRamp" &&
        action.pieceId === pieceEl.dataset.pieceId
      ) {
        if (
          this.animateKnightRamp(
            pieceEl,
            old,
            action,
            previous,
            composeCleanups(shieldCleanup, landingStatusCleanup),
          )
        )
          continue;
      }

      const squareEl = pieceEl.closest?.(".square");
      squareEl?.classList.add("is-animating");
      pieceEl.classList.add("is-moving");
      const animation = pieceEl.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) scale(1.05)`,
            filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48))",
          },
          {
            transform: "translate(0, 0) scale(1)",
            offset: NORMAL_MOVE_STABLE_OFFSET,
          },
          {
            transform: "translate(0, 0) scale(1)",
            filter: "drop-shadow(0 0 0 rgba(0,0,0,0))",
          },
        ],
        {
          duration: MOVE_DURATION,
          easing: MOVE_EASING,
          fill: "none",
        },
      );
      const cleanup = () => {
        shieldCleanup?.();
        landingStatusCleanup?.();
        pieceEl.classList.remove("is-moving");
        squareEl?.classList.remove("is-animating");
      };
      animation.finished?.then(cleanup, cleanup);
    }
  }

  preparePathShieldAnimation(pieceEl, old, action, previous) {
    const finalShielded = hasClass(pieceEl.className, "has-shield");
    const plan = pathShieldTransitionPlan(action, old, previous, finalShielded);
    if (!plan) return null;

    setShieldClass(pieceEl, plan.initialShielded);
    const timers = plan.events.map((event) =>
      globalThis.setTimeout?.(() => {
        setShieldClass(pieceEl, event.shielded);
        this.pulseSquare(event.square, event.effectClass);
      }, event.time),
    );

    return () => {
      for (const timer of timers) globalThis.clearTimeout?.(timer);
      setShieldClass(pieceEl, finalShielded);
    };
  }

  prepareLandingStatusAnimation(pieceEl, old, action, landingDelay) {
    const finalClassName = pieceEl.className;
    const gainedIntimidation =
      hasClass(finalClassName, "is-intimidated") &&
      !hasClass(old.className, "is-intimidated");
    if (!gainedIntimidation) return null;

    pieceEl.classList.remove("is-intimidated", "intimidation-framed");
    if (
      canHaveShield(action?.pieceType) &&
      hasClass(old.className, "has-shield") &&
      !hasClass(finalClassName, "has-shield")
    ) {
      pieceEl.classList.add("has-shield");
    }

    let applied = false;
    const timer = globalThis.setTimeout?.(() => {
      applied = true;
      applyLandingClassName(pieceEl, finalClassName);
      this.pulseSquare(action.rest ?? action.to, "intimidation-glow");
    }, landingDelay);

    return () => {
      if (timer) globalThis.clearTimeout?.(timer);
      if (applied) return;
      applied = true;
      pieceEl.className = finalClassName;
      this.pulseSquare(action.rest ?? action.to, "intimidation-glow");
    };
  }

  animateKnightRamp(pieceEl, old, action, previous, shieldCleanup = null) {
    if (
      !Array.isArray(action.rampSequence) ||
      action.rampSequence.length === 0
    ) {
      return false;
    }
    if (
      typeof pieceEl.getBoundingClientRect !== "function" ||
      typeof pieceEl.animate !== "function"
    ) {
      return false;
    }

    const finalRect = pieceEl.getBoundingClientRect();
    const routeRects = action.rampSequence.map((step) =>
      previous.squares.get(squareKey(step.land)),
    );
    if (routeRects.some((rect) => !rect)) return false;

    const squareEl = pieceEl.closest?.(".square");
    const hopCount = routeRects.length;
    const points = [old.rect, ...routeRects];

    if (hopCount > 1) {
      this.animateKnightRampSequence(
        pieceEl,
        squareEl,
        points,
        finalRect,
        shieldCleanup,
      );
      return true;
    }

    squareEl?.classList.add("is-animating");
    pieceEl.classList.add("is-moving");
    const animation = pieceEl.animate(
      normalMoveKeyframes(points[0], points[1], finalRect),
      {
        duration: moveAnimationDurationForAction(action),
        easing: MOVE_EASING,
        fill: "none",
      },
    );
    const cleanup = () => {
      shieldCleanup?.();
      pieceEl.classList.remove("is-moving");
      squareEl?.classList.remove("is-animating");
    };
    animation.finished?.then(cleanup, cleanup);
    return true;
  }

  animateKnightRampSequence(
    pieceEl,
    squareEl,
    points,
    finalRect,
    shieldCleanup = null,
  ) {
    squareEl?.classList.add("is-animating");
    pieceEl.classList.add("is-moving");
    const animations = [];
    const cleanup = () => {
      for (const animation of animations) animation.cancel?.();
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
      const animation = pieceEl.animate(
        doubleRampHopKeyframes(
          points[index],
          points[index + 1],
          finalRect,
          isFinalHop,
        ),
        {
          duration: DOUBLE_RAMP_HOP_DURATION,
          easing: MOVE_EASING,
          fill: "forwards",
        },
      );
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
    if (typeof pieceEl.animate !== "function") return;
    pieceEl.animate(
      [
        {
          opacity: 0,
          transform: "scale(0.72) translateY(-8%)",
          filter: "blur(2px)",
        },
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
      ],
      {
        duration: NEW_PIECE_DURATION,
        easing: "cubic-bezier(.2,.8,.22,1)",
      },
    );
  }

  animateRemovedPieces(previous, action = null) {
    const currentPieces = [
      ...(this.boardEl.querySelectorAll?.("[data-piece-id]") ?? []),
    ];
    const currentIds = new Set(
      currentPieces.map((pieceEl) => pieceEl.dataset.pieceId),
    );
    const boardRect = this.boardEl.getBoundingClientRect?.();
    if (!boardRect || !globalThis.document) return;

    for (const [id, old] of previous.pieces) {
      if (currentIds.has(id)) continue;
      if (
        id === action?.pieceId &&
        this.animateRemovedMovingPiece(previous, old, action, boardRect)
      ) {
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
      const animation = ghost.animate?.(
        [
          {
            opacity: 1,
            transform: "scale(1) translateY(0)",
            filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.42)) blur(0)",
          },
          {
            opacity: 0.92,
            transform: "scale(1.08) translateY(-4%)",
            filter:
              "drop-shadow(0 12px 16px rgba(0,0,0,0.46)) brightness(1.08)",
            offset: 0.3,
          },
          {
            opacity: 0.42,
            transform: "scale(0.82) translateY(-10%) rotate(-2deg)",
            filter:
              "drop-shadow(0 5px 12px rgba(0,0,0,0.36)) blur(0.8px) saturate(0.9)",
            offset: 0.68,
          },
          {
            opacity: 0,
            transform: "scale(0.44) translateY(-18%) rotate(8deg)",
            filter: "blur(4px) saturate(0.45)",
          },
        ],
        {
          duration: REMOVED_PIECE_DURATION,
          easing: "cubic-bezier(.2,.8,.22,1)",
          fill: "forwards",
        },
      );
      if (animation?.finished) {
        animation.finished.then(
          () => ghost.remove(),
          () => ghost.remove(),
        );
      } else {
        globalThis.setTimeout?.(() => ghost.remove(), REMOVED_PIECE_DURATION);
      }
      if (old.square) this.pulseSquare(old.square, "death-burst");
    }
  }

  animateRemovedMovingPiece(previous, old, action, boardRect) {
    const plan = removedMovingPiecePlan(action, old, previous);
    if (!plan || !globalThis.document) return false;

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
    const animation = ghost.animate?.(
      removedMovingPieceKeyframes(old.rect, plan),
      {
        duration: plan.duration,
        easing: MOVE_EASING,
        fill: "forwards",
      },
    );
    const cleanup = () => {
      if (pulseTimer) globalThis.clearTimeout?.(pulseTimer);
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
    if (!action) return;
    if (action.kind === "attack") {
      this.pulseSquare(
        action.to,
        action.target?.hadShield ? "shield-hit" : "death-burst",
      );
    }
    if (action.mode === "heal") this.pulseSquare(action.to, "life-glow");
    if (action.mode === "kill") this.pulseSquare(action.to, "death-burst");
    if (action.mode === "lifeDeathMove") {
      this.pulseSquare(
        action.to,
        action.pieceType === "Death" ? "death-move-glow" : "life-glow",
      );
    }
  }

  pulseSquare(square, className, duration = EFFECT_DURATION) {
    if (!square || !className) return;
    const el = this.boardEl.querySelector?.(
      `[data-row="${square.r}"][data-col="${square.c}"]`,
    );
    if (!el) return;
    const squareRect = el.getBoundingClientRect?.();
    const boardRect = this.boardEl.getBoundingClientRect?.();
    if (!squareRect || !boardRect || !globalThis.document) return;

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
  if (previous?.pieces) return previous;
  return {
    pieces:
      previous instanceof Map
        ? new Map(
            [...previous].map(([id, rect]) => [
              id,
              { rect, className: "", textContent: "", square: null },
            ]),
          )
        : new Map(),
    squares: new Map(),
    squarePieces: new Map(),
  };
}

function squareKey(dataset) {
  return `${dataset.row ?? dataset.r},${dataset.col ?? dataset.c}`;
}

function normalMoveKeyframes(from, to, finalRect) {
  return [
    {
      offset: 0,
      transform: transformForRect(from, finalRect, 1.05),
      filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48))",
    },
    {
      offset: NORMAL_MOVE_STABLE_OFFSET,
      transform: transformForRect(to, finalRect, 1),
    },
    {
      offset: 1,
      transform: transformForRect(to, finalRect, 1),
      filter: "drop-shadow(0 0 0 rgba(0,0,0,0))",
    },
  ];
}

function doubleRampHopKeyframes(from, to, finalRect, isFinalHop) {
  return [
    {
      offset: 0,
      transform: transformForRect(from, finalRect, 1.05),
      filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48))",
    },
    {
      offset: 1,
      transform: transformForRect(to, finalRect, isFinalHop ? 1 : 1.05),
      filter: isFinalHop
        ? "drop-shadow(0 0 0 rgba(0,0,0,0))"
        : "drop-shadow(0 14px 12px rgba(0,0,0,0.48))",
    },
  ];
}

function transformForRect(rect, finalRect, scale) {
  return `translate(${rect.left - finalRect.left}px, ${rect.top - finalRect.top}px) scale(${scale})`;
}

function landingStatusDelayForAction(action) {
  if (action?.mode === "knightRamp" && Array.isArray(action.rampSequence)) {
    const hopCount = Math.max(1, action.rampSequence.length);
    const hopDuration = DOUBLE_RAMP_HOP_DURATION;
    if (hopCount > 1) return hopCount * hopDuration;
    return Math.round(
      easedTimeForProgress(NORMAL_MOVE_FINAL_OFFSET, hopDuration),
    );
  }
  return Math.round(
    easedTimeForProgress(
      NORMAL_MOVE_FINAL_OFFSET,
      moveAnimationDurationForAction(action),
    ),
  );
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
  if (wasMoving) pieceEl.classList.add("is-moving");
}

function pathShieldTransitionPlan(action, old, previous, finalShielded) {
  if (!action?.path?.length || hasClass(old.className, "is-immune")) {
    return null;
  }

  let shielded = hasClass(old.className, "has-shield");
  const initialShielded = shielded;
  const shieldEligible = canHaveShield(action?.pieceType);
  const events = [];
  for (let index = 0; index < action.path.length; index++) {
    const square = action.path[index];
    const occupant = previous.squarePieces?.get(squareKey(square));
    if (!occupant) continue;

    if (hasClass(occupant.className, "life-piece")) {
      if (
        !shieldEligible ||
        shielded ||
        hasClass(old.className, "is-intimidated")
      )
        continue;
      shielded = true;
      events.push({
        square,
        shielded,
        effectClass: "life-glow",
        time: pathEventTime(action, square, index),
      });
    }

    if (hasClass(occupant.className, "death-piece")) {
      if (!shielded) continue;
      shielded = false;
      events.push({
        square,
        shielded,
        effectClass: "death-move-glow",
        time: pathEventTime(action, square, index),
      });
    }
  }

  if (events.length === 0 && initialShielded === finalShielded) return null;
  return { initialShielded, events };
}

function removedMovingPiecePlan(action, old, previous) {
  if (!action || !old?.rect) return null;
  const path = action.path ?? [];
  const shieldEligible = canHaveShield(action.pieceType);
  const immune = hasClass(old.className, "is-immune");
  const intimidated = hasClass(old.className, "is-intimidated");
  let shielded = hasClass(old.className, "has-shield");
  let fadeSquare = null;
  let fadePathIndex = -1;

  if (!immune) {
    for (let index = 0; index < path.length; index++) {
      const square = path[index];
      const occupant = previous.squarePieces?.get(squareKey(square));
      if (!occupant) continue;

      if (
        hasClass(occupant.className, "life-piece") &&
        shieldEligible &&
        !shielded &&
        !intimidated
      ) {
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
  if (!fadeSquare) return null;

  const destination =
    action.kind === "attack" && !action.deathStaging
      ? (action.rest ?? action.to ?? fadeSquare)
      : fadeSquare;
  const destinationRect =
    previous.squares?.get(squareKey(destination)) ??
    previous.squares?.get(squareKey(fadeSquare));
  const fadeRect = previous.squares?.get(squareKey(fadeSquare));
  if (!destinationRect || !fadeRect) return null;

  const duration = moveAnimationDurationForAction(action);
  const fadeTime =
    fadePathIndex >= 0
      ? Math.min(
          duration - MIN_PATH_EVENT_DELAY,
          pathEventTime(action, fadeSquare, fadePathIndex),
        )
      : Math.round(duration * NORMAL_MOVE_FINAL_OFFSET);
  const fadeOffset = Math.max(0.08, Math.min(0.92, fadeTime / duration));

  return {
    destinationRect,
    duration,
    fadeOffset,
    fadeRect,
    fadeSquare,
    fadeTime,
  };
}

function removedMovingPieceKeyframes(fromRect, plan) {
  const beforeFadeOffset = Math.max(0, plan.fadeOffset - 0.04);
  return [
    {
      offset: 0,
      opacity: 1,
      transform: "translate(0px, 0px) scale(1.05)",
      filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.48)) blur(0)",
    },
    {
      offset: beforeFadeOffset,
      opacity: 1,
      transform: transformFromOrigin(fromRect, plan.fadeRect, 1.02),
      filter: "drop-shadow(0 14px 12px rgba(0,0,0,0.46)) blur(0)",
    },
    {
      offset: plan.fadeOffset,
      opacity: 0.76,
      transform: transformFromOrigin(fromRect, plan.fadeRect, 0.96),
      filter:
        "drop-shadow(0 10px 14px rgba(0,0,0,0.44)) blur(0.4px) saturate(0.82)",
    },
    {
      offset: 1,
      opacity: 0,
      transform: `${transformFromOrigin(fromRect, plan.destinationRect, 0.42)} rotate(7deg)`,
      filter: "blur(4px) saturate(0.45)",
    },
  ];
}

function transformFromOrigin(fromRect, toRect, scale) {
  return `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px) scale(${scale})`;
}

function pathEventTime(action, square, pathIndex) {
  if (action?.mode === "knightRamp" && Array.isArray(action.rampSequence)) {
    const hopIndex = action.rampSequence.findIndex(
      (step) => squareKey(step.ramp) === squareKey(square),
    );
    if (hopIndex >= 0) {
      const hopDuration =
        action.rampSequence.length > 1
          ? DOUBLE_RAMP_HOP_DURATION
          : MOVE_DURATION;
      return Math.round(
        hopIndex * hopDuration + easedTimeForProgress(0.5, hopDuration),
      );
    }
  }

  const pathLength = Math.max(1, action.path?.length ?? 1);
  const distanceProgress = (pathIndex + 1) / (pathLength + 1);
  return Math.round(
    easedTimeForProgress(
      distanceProgress * NORMAL_MOVE_FINAL_OFFSET,
      MOVE_DURATION,
    ),
  );
}

function easedTimeForProgress(progress, duration) {
  const clamped = Math.max(0, Math.min(1, progress));
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i++) {
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
  if (active.length === 0) return null;
  return () => {
    for (const cleanup of active) cleanup();
  };
}
