# Frame Chess Delta Rules

`TOAD_FOOL_RULES.md` is the parent rule set. Frame Chess inherits Toad-Fool Chess except where this file says otherwise.

## Setup

- Variant id: `frame-chess`.
- Normalized FEN: `d3qk3l/2rbtfnr2/1pppppppp1/91/91/91/91/1PPPPPPPP1/2RNTFBR2/L3QK3D w - - 0 1`.
- Remove the `a`-file and `k`-file pawns from both sides.
- Default rule overrides:
  - check pattern: `standard`
  - pawn behavior: `frontalFan`
  - pawn initial max step: `2`
  - Knight movement: `orthodox`
  - shields enabled: `true`
  - frame enabled: `true`
  - wrap-around enabled: `true`
  - checkmate enabled: `true`

## Frame

- The outer ranks and files are frame squares. They remain normal playable board squares except for the restrictions below.
- A shielded piece on a frame square temporarily loses its active shield. The latent shield is restored when it leaves the frame if shields are enabled and no other suppression applies.
- Life healing a piece on a frame square grants a latent frame shield and immunity, not an active shield.
- Disabling shields clears both active and latent frame shields.
- Non-King standard pieces cannot attack from a frame square.
- Non-King standard attacks are illegal when their attack path or staging square touches the frame.
- Interior pieces may attack targets on frame squares; the target square itself does not count as path or staging, and those targets have no active shield while they remain on the frame.
- Knight L-attacks into frame targets may use frame bend squares for Life/Death pass-through effects; those bend squares do not by themselves block the attack.
- Kings may attack from frame squares.
- Life and Death special actions may be used from frame squares.

## Wrap-Around

- When wrap-around is enabled, columns wrap horizontally between the `a` and `k` files. Rows never wrap.
- Wrapped movement applies to non-King standard pieces, Pawns, Toad and Fool profiles, ramp hops, Knights, and Life/Death movement. Kings do not use wrap-around movement or attacks.
- Attacks, Life heals, and Death kills do not target through the `a`/`k` wrap boundary; a piece must attack or use a special target action through physical board geometry.
- If two orthogonal routes can reach the same destination, movement prefers a Life pass-through route, avoids Death pass-through routes, and otherwise uses the shortest path.
- Passive Life/Death annihilation uses physical orthogonal adjacency only; the `a` and `k` files do not annihilate through the wrap boundary.
- Sliding rays are capped before they can loop around the board.
- Non-King standard attacks that cross the frame are still blocked by the frame attack rule.
- Wrapped movement remains legal when the destination and path are otherwise legal.
- Wrapped Knight L-moves keep their two bend-square Life/Death pass-through path, including through the `a`/`k` wrap boundary. Knight L-attacks do not wrap to target the opposite side of the board.
