# Chess Two / Shield Chess / Chess: Shield & Scythe

Chess Two is a 10x10 chess variant about shields, staged attacks, Life and Death pieces, and checkmate under a two-slot turn structure.

- **Full Chess Two rules:** [RULES.md](RULES.md)
- **Toad-Fool delta rules:** [TOAD_FOOL_RULES.md](TOAD_FOOL_RULES.md)
- **Frame Chess delta rules:** [FRAME_CHESS_RULES.md](FRAME_CHESS_RULES.md)

This repository contains the browser implementation. `RULES.md` should be treated as the source of truth for Chess Two game logic and AI behavior. Experimental variants are deltas on top of that baseline, not replacements.

## Repository Map

- `src/engine/constants.js`: board size, colors, piece types, shield eligibility, symbols, material values, files.
- `src/engine/state.js`: board/state construction, cloning, FEN import/export, check-pattern square helpers, variant metadata.
- `src/engine/rules.js`: legal action generation, check/checkmate, Life/Death behavior, attacks, turn normalization, variant rule overrides.
- `src/engine/ai.js`: existing Chess Two search/evaluation. AI controls remain available, but experimental variants are built for manual self-play first.
- `src/variants/index.js`: variant registry, setup tables, default rule override presets.
- `src/ui/controller.js`: input flow, turns, undo, AI handoff, Developer Panel state mutations.
- `src/ui/renderer.js`: board/status rendering, assets, captured pieces, Developer Panel control sync.
- `src/ui/animation.js`: board motion, Life/Death effects, generic ramp-hop animation.
- `public/assets/pieces/`: source piece images served by Vite and copied into `dist`.
- `.github/workflows/pages.yml`: Bun-only GitHub Pages build/deploy workflow that publishes Vite `dist`.
- `test/engine.test.js`: engine, variant, and deterministic self-play coverage.
- `test/ui.test.js`: renderer, controller, settings, animation, and Developer Panel coverage.

## Variants

### Chess Two

- Variant id: `chess-two`.
- Default engine variant for direct `createGameState()` calls and existing tests.
- Rules source: [RULES.md](RULES.md).
- Setup and defaults live in `src/variants/index.js` under `VARIANT_IDS.CHESS_TWO`.
- Normalized setup FEN: `drnbqkbnrl/pppppppppp/91/91/91/91/91/91/PPPPPPPPPP/LRNBQKBNRD w - - 0 1`.
- Default rule overrides:
  - check pattern: `standard`
  - pawn behavior: `chessTwo`
  - pawn initial max step: `3`
  - Knight movement: `ramp`
  - shields enabled: `true`
  - frame enabled: `false`
  - wrap-around enabled: `false`
  - checkmate enabled: `true`

### Toad-Fool Chess

- Variant id: `toad-fool`.
- Delta rules source: [TOAD_FOOL_RULES.md](TOAD_FOOL_RULES.md).
- Setup and defaults live in `src/variants/index.js` under `VARIANT_IDS.TOAD_FOOL`.
- Normalized setup FEN: `l8d/1rbtqkfnr1/pppppppppp/91/91/91/91/PPPPPPPPPP/1RNTQKFBR1/D8L w - - 0 1`.
- Default rule overrides:
  - check pattern: `inverted`
  - pawn behavior: `frontalFan`
  - pawn initial max step: `2`
  - Knight movement: `orthodox`
  - shields enabled: `true`
  - frame enabled: `false`
  - wrap-around enabled: `false`
  - checkmate enabled: `true`
- Adds Toad and Fool pieces, swapped Life/Death corners, one Bishop and one Knight per side, pawns one rank closer to center, Frontal Fan movement, and orthodox diagonal pawn attacks.

### Frame Chess

- Variant id: `frame-chess`.
- Default browser/UI variant and persisted first-load mode.
- Delta rules source: [FRAME_CHESS_RULES.md](FRAME_CHESS_RULES.md).
- Inherits Toad-Fool rules with a wider back-rank setup, and keeps the `a`-file and `k`-file pawns removed for both sides.
- Normalized setup FEN: `d3qk3l/2rbtfnr2/1pppppppp1/91/91/91/91/1PPPPPPPP1/2RNTFBR2/L3QK3D w - - 0 1`.
- Default rule overrides:
  - check pattern: `standard`
  - pawn behavior: `frontalFan`
  - pawn initial max step: `2`
  - Knight movement: `orthodox`
  - shields enabled: `true`
  - frame enabled: `true`
  - wrap-around enabled: `true`
  - checkmate enabled: `true`
- Edge squares suppress active shields and non-King standard attacks; Life/Death special actions still work from the frame. Horizontal wrap-around is enabled through the `a` and `k` files.
  Kings do not use wrap-around movement.

### Frame Chess w/o LD

- Variant id: `frame-chess-without-ld`.
- Uses the old Frame Chess setup, but with all Life and Death pieces removed.
- Normalized setup FEN: `91/1rbtqkfnr1/1pppppppp1/91/91/91/91/1PPPPPPPP1/1RNTQKFBR1/91 w - - 0 1`.
- Keeps the same Frame and wrap-around rule defaults as Frame Chess, while retaining the old inverted check pattern.

### Toad-Fool Classic

- Variant id: `toad-fool-classic`.
- Uses Toad-Fool pieces, Frontal Fan pawns, and orthodox Knights on a denser Chess Two-like home-rank setup.
- Normalized setup FEN: `drbtqkfnrl/pppppppppp/91/91/91/91/91/91/PPPPPPPPPP/LRNTQKFBRD w - - 0 1`.
- Default rule overrides:
  - check pattern: `standard`
  - pawn behavior: `frontalFan`
  - pawn initial max step: `2`
  - Knight movement: `orthodox`
  - shields enabled: `true`
  - frame enabled: `false`
  - wrap-around enabled: `false`
  - checkmate enabled: `true`

## Developer Panel

The left Developer Panel is for manual self-play and rapid state testing. It supports variant selection, new game/default loading, shield-less testing, pawn-range/Knight/Frame/Wrap-around/King-capture override hot-swaps, auto-sizing wrapping FEN import/export with clipboard copy, current-player and turn-slot edits, and a separated Board Edit section with check-pattern/type/color/shield/immune/moved flags. The pawn preset dropdown includes `Orthodox`, `Frontal Fan`, and legacy `Frontal Fan 2`; legacy `forwardFan` override values are normalized on load. Developer status messages render outside the scrollable panel so layout does not shift.

## Quick Rules Summary

Chess Two inherits ordinary chess movement where the variant does not explicitly change it, but it does not use ordinary chess captures.

- The board uses files `a b c d e f g h j k`; the letter `i` is skipped.
- A turn has one standard-piece move slot and one Life/Death move slot. A Life heal or Death kill consumes both slots.
- Pawns, Rooks, Knights, and Bishops start shielded. Kings, Queens, Life, and Death are always unshielded.
- Attacks replace captures. Shield breaks use a staging square; killing blows skip staging and resolve on the destroyed piece's square.
- Check forces the checked side's standard move to end the check by moving the King, blocking, or removing the checking piece. A checking piece becomes Intimidated and cannot gain a Shield while it continues giving check.
- Chess Two pawns can advance up to three squares on their first move, have variant en passant as the immediate standard reply, promote on the far rank, and jump over directly blocking Life or Death pieces.
- Knights use L-shapes only to attack enemy pieces; they move to empty squares by ramp-jumping over adjacent pieces, including Life and Death pass-through effects.
- Toad-Fool Frontal Fan pawns move in fixed forward-left, forward, and forward-right lanes, attack by orthodox one-square diagonals, and do not use the Chess Two direct Life/Death pawn jump. `Frontal Fan 2` preserves the old lane attacks, generalized lane en passant, and pawn attack recoil for manual testing.
- Toad-Fool and Frame orthodox Knight L-moves use the same two bend-square Life/Death pass-through effects as Knight L-attacks.
- Toads choose one of two mutually exclusive standard move modes: a one-square King-like step, or a ramp hop. Ramp hops strip shields from shielded enemy pieces they hop over.
- Frame Chess edge squares suppress active shields and block non-King standard attacks from or through the frame. Interior attacks may still target frame squares, and Knight L-attacks into frame targets may use frame bend squares for Life/Death pass-through. Horizontal wrap-around connects the `a` and `k` files for movement only; attacks, Life heals, and Death kills do not target through the wrap boundary.
- Kings never use wrap-around movement. In Developer Panel King-capture mode, check/checkmate constraints are disabled and removing the enemy King wins.
- Life and Death are controlled by board half, not by original color. They move diagonally, can be passed through by standard pieces, and annihilate when orthogonally adjacent.
- Kings are not captured. A checked King with no legal check-evasion sequence is checkmated.
- If only Kings and Life pieces remain, the game is drawn.

## Implementation Defaults

- White starts.
- Browser first load starts in Frame Chess with AI level `0` for local self-play.
- Direct engine calls to `createGameState()` still create Chess Two / `chess-two` unless a `variantId` is supplied.
- Setting AI above `0` enables AI Black; AI is not tuned for experimental pieces.
- After using the standard move slot, a player may skip the remaining Life/Death slot.
- `index.html` uses the Vite module entry at `./src/main.js`; keep this entry relative so GitHub Pages project URLs under `/chess-two-dev/` can load source fallbacks, while the Pages workflow publishes Vite `dist`.
- GitHub Pages deployment is Bun-only: install with `bun install --frozen-lockfile`, validate with `bun test`, and publish `bun run build` output.
- `Ctrl+F5` inside the app clears persisted UI settings and runtime browser caches before reloading defaults.

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

`bun run check` runs the engine/UI tests and builds the Vite production output.
