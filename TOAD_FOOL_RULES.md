# Toad-Fool Chess Delta Rules

`RULES.md` remains the source of truth for Chess Two. Toad-Fool Chess inherits those rules except where this file says otherwise.

`FRAME_CHESS_RULES.md` is a separate delta on top of these Toad-Fool rules.

## Setup

- Default variant id: `toad-fool`.
- Normalized FEN: `l8d/1rbtqkfnr1/pppppppppp/91/91/91/91/PPPPPPPPPP/1RNTQKFBR1/D8L w - - 0 1`.
- Default Toad-Fool Life and Death occupy swapped corners with the checker pattern inverted:
  - Black side: Life on `a10`, Death on `k10`.
  - White side: Death on `a1`, Life on `k1`.
- Pawns start one rank closer to the center: black pawns on rank 8, white pawns on rank 3.
- Each side has one Bishop and one Knight.
- Toad starts on the d-file next to the Queen.
- Fool starts on the g-file next to the King.
- Classic variant id: `toad-fool-classic`.
- Classic normalized FEN: `drbtqkfnrl/pppppppppp/91/91/91/91/91/91/PPPPPPPPPP/LRNTQKFBRD w - - 0 1`.
- Classic uses the standard checker pattern with the normalized FEN corners: black Death on `a10`, black Life on `k10`, white Life on `a1`, and white Death on `k1`.

## Rule Overrides

- Check pattern is inverted. This changes square coloring and Life/Death light/dark legality immediately.
- Pawn behavior uses the `frontalFan` preset. Legacy `forwardFan` override values normalize to `frontalFan`.
- `frontalFan2` is available as a manual Developer Panel preset for the legacy lane-attack/recoil behavior, but no current variant uses it by default.
- Pawn initial max step defaults to `2` for both Toad-Fool variants.
- Knight empty-square movement uses orthodox chess L-moves.
- Shields are enabled by default; the Developer Panel shield-less option is an override for manual testing.
- Frame and wrap-around are disabled by default in Toad-Fool Chess.
- Checkmate is enabled by default.

## Toad

- Toad is a standard shielded piece.
- Toad has two mutually exclusive standard move modes. A single Toad move is either a step or a ramp hop, never both combined.
- Step mode: Toad moves one square like a King to empty squares or Death-occupied fatal final squares.
- Ramp-hop mode: Toad moves by the Chess Two Knight ramp-hop logic, including one-hop and two-hop routes and Life/Death pass-through effects.
- Toad ramp hops remove Shields from shielded enemy pieces jumped over, unless that piece is immune.
- Toad attacks like a King against adjacent enemy standard pieces.

## Fool

- Fool is a standard shielded piece.
- Fool copies the last moved enemy standard piece profile.
- If the last moved enemy standard piece was a Fool, the copying Fool receives the profile that enemy Fool was imitating.
- Fool can copy Toad.
- If Fool copies Pawn, movement uses the Fool's own color direction.
- Fool never copies shield state.

## Knight

- Knight moves to empty squares by regular chess L-shaped movement.
- Knight attacks still use Chess Two's L-shaped staged attack and target-square killing-blow rules.
- Empty-square L-shaped Knight moves use the same two bend-square Life/Death pass-through effects as L-shaped Knight attacks.
- Knight no longer has ramp-hop movement in this variant.

## Pawns

- Pawns move in the three forward lanes: forward-left, forward, and forward-right.
- A pawn that has not moved may move up to the configured initial maximum, default `2`, in any forward lane if the path is clear.
- Frontal Fan pawns do not use Chess Two's direct Life/Death pawn jump.
- A pawn that has moved may move one square.
- `frontalFan` pawn attacks use orthodox one-square forward diagonals and do not apply pawn attack recoil.
- `frontalFan` en passant uses orthodox diagonal staging against the immediately eligible multi-square pawn move.
- `frontalFan2` pawn attacks use the legacy forward lanes and distance limit as movement.
- In `frontalFan2`, after a successful pawn attack, the attacking Pawn loses its shield if it had one. A shieldless attacking Pawn survives unless the normal target/path resolution destroys it.
- In `frontalFan2`, en passant is generalized to the active forward-lane pawn attack profile for multi-square pawn moves.
