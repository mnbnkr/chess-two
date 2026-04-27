export const ANIMATION_TIMING = Object.freeze({
  effectDurationMs: 520,
  moveDurationMs: 700,
  doubleRampHopDurationMs: 550,
  newPieceDurationMs: 260,
  removedPieceDurationMs: 420,
  panelPulseDurationMs: 420,
  turnAdvanceDelayMs: 430,
});

const {
  effectDurationMs: EFFECT_DURATION,
  moveDurationMs: MOVE_DURATION,
  doubleRampHopDurationMs: DOUBLE_RAMP_HOP_DURATION,
  newPieceDurationMs: NEW_PIECE_DURATION,
  removedPieceDurationMs: REMOVED_PIECE_DURATION,
  panelPulseDurationMs: PANEL_PULSE_DURATION,
} = ANIMATION_TIMING;

const MOVE_EASING = "cubic-bezier(.18,.82,.22,1)";

export function moveAnimationDurationForAction(action = null) {
  const hopCount = action?.mode === "knightRamp"
    ? Math.max(1, action.rampSequence?.length ?? 1)
    : 1;
  if (action?.mode === "knightRamp" && hopCount > 1) {
    return DOUBLE_RAMP_HOP_DURATION * hopCount;
  }
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
    for (const squareEl of this.boardEl.querySelectorAll?.(".square") ?? []) {
      if (typeof squareEl.getBoundingClientRect !== "function") continue;
      squares.set(
        squareKey(squareEl.dataset),
        squareEl.getBoundingClientRect(),
      );
    }
    for (const pieceEl of this.boardEl.querySelectorAll?.("[data-piece-id]") ??
      []) {
      if (typeof pieceEl.getBoundingClientRect !== "function") continue;
      const squareEl = pieceEl.closest?.(".square");
      pieces.set(pieceEl.dataset.pieceId, {
        rect: pieceEl.getBoundingClientRect(),
        className: pieceEl.className,
        textContent: pieceEl.textContent,
        square: squareEl
          ? { r: Number(squareEl.dataset.row), c: Number(squareEl.dataset.col) }
          : null,
      });
    }
    return { pieces, squares };
  }

  animate(previous, action, enabled) {
    if (!enabled || this.prefersReducedMotion) return;
    const snapshot = normalizeSnapshot(previous);
    this.animateMovement(snapshot, action);
    this.animateRemovedPieces(snapshot);
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

      if (action?.mode === "knightRamp" && action.pieceId === pieceEl.dataset.pieceId) {
        if (this.animateKnightRamp(pieceEl, old, action, previous)) continue;
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
          { transform: "translate(0, 0) scale(0.98)", offset: 0.82 },
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
        pieceEl.classList.remove("is-moving");
        squareEl?.classList.remove("is-animating");
      };
      animation.finished?.then(cleanup, cleanup);
    }
  }

  animateKnightRamp(pieceEl, old, action, previous) {
    if (!Array.isArray(action.rampSequence) || action.rampSequence.length === 0) {
      return false;
    }
    if (typeof pieceEl.getBoundingClientRect !== "function" || typeof pieceEl.animate !== "function") {
      return false;
    }

    const finalRect = pieceEl.getBoundingClientRect();
    const routeRects = action.rampSequence.map((step) => previous.squares.get(squareKey(step.land)));
    if (routeRects.some((rect) => !rect)) return false;

    const squareEl = pieceEl.closest?.(".square");
    const hopCount = routeRects.length;
    const points = [old.rect, ...routeRects];

    if (hopCount > 1) {
      this.animateKnightRampSequence(pieceEl, squareEl, points, finalRect);
      return true;
    }

    squareEl?.classList.add("is-animating");
    pieceEl.classList.add("is-moving");
    const animation = pieceEl.animate(normalMoveKeyframes(points[0], points[1], finalRect), {
      duration: moveAnimationDurationForAction(action),
      easing: MOVE_EASING,
      fill: "none",
    });
    const cleanup = () => {
      pieceEl.classList.remove("is-moving");
      squareEl?.classList.remove("is-animating");
    };
    animation.finished?.then(cleanup, cleanup);
    return true;
  }

  animateKnightRampSequence(pieceEl, squareEl, points, finalRect) {
    squareEl?.classList.add("is-animating");
    pieceEl.classList.add("is-moving");
    const animations = [];
    const cleanup = () => {
      for (const animation of animations) animation.cancel?.();
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
        doubleRampHopKeyframes(points[index], points[index + 1], finalRect, isFinalHop),
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

  animateRemovedPieces(previous) {
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
      const ghost = globalThis.document.createElement("span");
      ghost.className = `piece-ghost ${old.className}`;
      ghost.textContent = old.textContent;
      ghost.style.left = `${old.rect.left - boardRect.left}px`;
      ghost.style.top = `${old.rect.top - boardRect.top}px`;
      ghost.style.width = `${old.rect.width}px`;
      ghost.style.height = `${old.rect.height}px`;
      this.boardEl.appendChild(ghost);
      const animation = ghost.animate?.(
        [
          { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
          { opacity: 0.85, transform: "scale(1.16)", offset: 0.34 },
          {
            opacity: 0,
            transform: "scale(0.66) rotate(5deg)",
            filter: "blur(2px)",
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

  animateEffects(action) {
    if (!action) return;
    if (action.kind === "move") this.pulseSquare(action.to, "move-land");
    if (action.kind === "attack") {
      this.pulseSquare(
        action.to,
        action.target?.hadShield ? "shield-hit" : "death-burst",
      );
      this.pulseSquare(action.rest, "rest-settle");
    }
    if (action.mode === "heal") this.pulseSquare(action.to, "life-glow");
    if (action.mode === "kill") this.pulseSquare(action.to, "death-burst");
    if (action.mode === "lifeDeathMove")
      this.pulseSquare(action.to, "life-glow");
    if (action.mode === "skipSpecial") this.pulsePanel();
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

  pulsePanel() {
    const panel = this.boardEl
      .closest?.("#game-container")
      ?.querySelector?.("#status-panel");
    if (!panel) return;
    panel.classList.add("skip-pulse");
    globalThis.setTimeout?.(
      () => panel.classList.remove("skip-pulse"),
      PANEL_PULSE_DURATION,
    );
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
      offset: 0.82,
      transform: transformForRect(to, finalRect, 0.98),
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
