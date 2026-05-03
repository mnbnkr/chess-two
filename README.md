# Chess Two / Shield Chess / Chess: Shield & Scythe

Chess Two is a 10x10 chess variant about shields, staged attacks, Life and Death pieces, and checkmate under a two-slot turn structure.

**Full rules:** [RULES.md](RULES.md)

This repository contains the browser implementation. `RULES.md` should be treated as the source of truth for game logic and AI behavior.

## Quick Rules Summary

Chess Two inherits ordinary chess movement where the variant does not explicitly change it, but it does not use ordinary chess captures.

- The board uses files `a b c d e f g h j k`; the letter `i` is skipped.
- A turn has one standard-piece move slot and one Life/Death move slot. A Life heal or Death kill consumes both slots.
- Pawns, Rooks, Knights, and Bishops start shielded. Kings, Queens, Life, and Death are always unshielded.
- Attacks replace captures. Shield breaks use a staging square; killing blows skip staging and resolve on the destroyed piece's square.
- Check forces the checked side's standard move to end the check by moving the King, blocking, or removing the checking piece. A checking piece becomes Intimidated and cannot gain a Shield while it continues giving check.
- Pawns can advance up to three squares on their first move, have variant en passant as the immediate standard reply, and promote on the far rank.
- Pawns can jump over directly blocking Life or Death pieces from anywhere on the board, regardless of owner.
- Knights use L-shapes only to attack enemy pieces; they move to empty squares by ramp-jumping over adjacent pieces, including Life and Death pass-through effects.
- Life and Death are controlled by board half, not by original color. They move diagonally, can be passed through by standard pieces, and annihilate when orthogonally adjacent.
- Kings are not captured. A checked King with no legal check-evasion sequence is checkmated.
- If only Kings and Life pieces remain, the game is drawn.

## Implementation Defaults

- White starts.
- Human plays White against AI Black by default.
- Setting AI to `0` enables local self-play and unlocks side selection.
- After using the standard move slot, a player may skip the remaining Life/Death slot.
- Direct `index.html` launch uses the checked-in root `chess-two.bundle.js`; Vite builds use the identical
  `public/chess-two.bundle.js` copy so the bundle is copied into `dist`.

## Development

Requires Bun.

```sh
bun install
bun run dev
```

Useful commands:

```sh
bun test
bun run build
bun run check
```

`bun run check` runs the engine/UI tests, regenerates the direct-launch bundle, and builds the Vite production output.
