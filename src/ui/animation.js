const EFFECT_DURATION = 440;
const MOVE_DURATION = 260;

export class BoardAnimator {
    constructor(boardEl, options = {}) {
        this.boardEl = boardEl;
        this.prefersReducedMotion = options.prefersReducedMotion
            ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ?? false;
    }

    snapshot() {
        const pieces = new Map();
        const squares = new Map();
        for (const squareEl of this.boardEl.querySelectorAll?.('.square') ?? []) {
            if (typeof squareEl.getBoundingClientRect !== 'function') continue;
            squares.set(squareKey(squareEl.dataset), squareEl.getBoundingClientRect());
        }
        for (const pieceEl of this.boardEl.querySelectorAll?.('[data-piece-id]') ?? []) {
            if (typeof pieceEl.getBoundingClientRect !== 'function') continue;
            const squareEl = pieceEl.closest?.('.square');
            pieces.set(pieceEl.dataset.pieceId, {
                rect: pieceEl.getBoundingClientRect(),
                className: pieceEl.className,
                textContent: pieceEl.textContent,
                square: squareEl ? { r: Number(squareEl.dataset.row), c: Number(squareEl.dataset.col) } : null,
            });
        }
        return { pieces, squares };
    }

    animate(previous, action, enabled) {
        if (!enabled || this.prefersReducedMotion) return;
        const snapshot = normalizeSnapshot(previous);
        this.animateMovement(snapshot);
        this.animateRemovedPieces(snapshot);
        this.animateEffects(action);
    }

    animateMovement(previous) {
        for (const pieceEl of this.boardEl.querySelectorAll?.('[data-piece-id]') ?? []) {
            const old = previous.pieces.get(pieceEl.dataset.pieceId);
            if (!old || typeof pieceEl.getBoundingClientRect !== 'function' || typeof pieceEl.animate !== 'function') {
                this.animateNewPiece(pieceEl);
                continue;
            }
            const newRect = pieceEl.getBoundingClientRect();
            const dx = old.rect.left - newRect.left;
            const dy = old.rect.top - newRect.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

            const squareEl = pieceEl.closest?.('.square');
            squareEl?.classList.add('is-animating');
            pieceEl.classList.add('is-moving');
            const animation = pieceEl.animate([
                {
                    transform: `translate(${dx}px, ${dy}px) scale(1.05)`,
                    filter: 'drop-shadow(0 14px 12px rgba(0,0,0,0.48))',
                },
                { transform: 'translate(0, 0) scale(0.98)', offset: 0.82 },
                { transform: 'translate(0, 0) scale(1)', filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' },
            ], {
                duration: MOVE_DURATION,
                easing: 'cubic-bezier(.18,.82,.22,1)',
                fill: 'none',
            });
            const cleanup = () => {
                pieceEl.classList.remove('is-moving');
                squareEl?.classList.remove('is-animating');
            };
            animation.finished?.then(cleanup, cleanup);
        }
    }

    animateNewPiece(pieceEl) {
        if (typeof pieceEl.animate !== 'function') return;
        pieceEl.animate([
            { opacity: 0, transform: 'scale(0.72) translateY(-8%)', filter: 'blur(2px)' },
            { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
        ], {
            duration: 210,
            easing: 'cubic-bezier(.2,.8,.22,1)',
        });
    }

    animateRemovedPieces(previous) {
        const currentPieces = [...(this.boardEl.querySelectorAll?.('[data-piece-id]') ?? [])];
        const currentIds = new Set(currentPieces.map((pieceEl) => pieceEl.dataset.pieceId));
        const boardRect = this.boardEl.getBoundingClientRect?.();
        if (!boardRect || !globalThis.document) return;

        for (const [id, old] of previous.pieces) {
            if (currentIds.has(id)) continue;
            const ghost = globalThis.document.createElement('span');
            ghost.className = `piece-ghost ${old.className}`;
            ghost.textContent = old.textContent;
            ghost.style.left = `${old.rect.left - boardRect.left}px`;
            ghost.style.top = `${old.rect.top - boardRect.top}px`;
            ghost.style.width = `${old.rect.width}px`;
            ghost.style.height = `${old.rect.height}px`;
            this.boardEl.appendChild(ghost);
            const animation = ghost.animate?.([
                { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
                { opacity: 0.85, transform: 'scale(1.16)', offset: 0.34 },
                { opacity: 0, transform: 'scale(0.66) rotate(5deg)', filter: 'blur(2px)' },
            ], {
                duration: 320,
                easing: 'cubic-bezier(.2,.8,.22,1)',
                fill: 'forwards',
            });
            if (animation?.finished) {
                animation.finished.then(() => ghost.remove(), () => ghost.remove());
            } else {
                globalThis.setTimeout?.(() => ghost.remove(), 320);
            }
            if (old.square) this.pulseSquare(old.square, 'death-burst');
        }
    }

    animateEffects(action) {
        if (!action) return;
        for (const square of action.path ?? []) this.pulseSquare(square, 'path-spark', 300);
        if (action.kind === 'move') this.pulseSquare(action.to, 'move-land');
        if (action.kind === 'attack') {
            this.pulseSquare(action.to, action.target?.hadShield ? 'shield-hit' : 'death-burst');
            this.pulseSquare(action.rest, 'rest-settle');
        }
        if (action.mode === 'heal') this.pulseSquare(action.to, 'life-glow');
        if (action.mode === 'kill') this.pulseSquare(action.to, 'death-burst');
        if (action.mode === 'lifeDeathMove') this.pulseSquare(action.to, 'life-glow');
        if (action.mode === 'skipSpecial') this.pulsePanel();
    }

    pulseSquare(square, className, duration = EFFECT_DURATION) {
        if (!square || !className) return;
        const el = this.boardEl.querySelector?.(`[data-row="${square.r}"][data-col="${square.c}"]`);
        if (!el) return;
        const squareRect = el.getBoundingClientRect?.();
        const boardRect = this.boardEl.getBoundingClientRect?.();
        if (!squareRect || !boardRect || !globalThis.document) return;

        const effect = globalThis.document.createElement('span');
        const inset = className === 'path-spark' ? 0.22 : 0.08;
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
        const panel = this.boardEl.closest?.('#game-container')?.querySelector?.('#status-panel');
        if (!panel) return;
        panel.classList.add('skip-pulse');
        globalThis.setTimeout?.(() => panel.classList.remove('skip-pulse'), 360);
    }
}

function normalizeSnapshot(previous) {
    if (previous?.pieces) return previous;
    return {
        pieces: previous instanceof Map
            ? new Map([...previous].map(([id, rect]) => [id, { rect, className: '', textContent: '', square: null }]))
            : new Map(),
        squares: new Map(),
    };
}

function squareKey(dataset) {
    return `${dataset.row},${dataset.col}`;
}
