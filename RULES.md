# Chess Two Rules

This file is the canonical rule prompt for Chess Two. Game logic, UI behavior, tests, and AI evaluation should follow this file first. Apply normal chess movement only where this document does not override it. Do not implement ordinary chess capture; Chess Two uses the attack, Shield, staging, and resting system described below.

## Core Defaults

- White starts.
- The board is 10x10.
- Files are `a b c d e f g h j k`; there is no `i` file.
- White begins on ranks 1 and 2. Black begins on ranks 9 and 10.
- Human-vs-AI mode defaults to human White against AI Black.
- AI level `0` means no AI; the same local player may play both sides.
- After using the standard move slot, a player may skip the remaining Life/Death slot. This is an intentional game rule, not merely a UI shortcut.

## Board And Setup

The board has alternating light and dark squares. Each player has the usual King, Queen, two Rooks, two Bishops, two Knights, and ten Pawns, plus one Life piece and one Death piece.

Back-rank order how it visually appears from the White side:

- Black: Death, Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook, Life.
- White: Life, Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook, Death.

Pawns fill the second rank for each side.

## Turn Structure

A player's turn can contain two independent slots, taken in either order:

1. One standard move with a Pawn, Rook, Knight, Bishop, Queen, or King.
2. One Life/Death move with a Life or Death piece currently controlled by that player.

Life and Death also have special actions:

- Life heal.
- Death kill.

A Life heal or Death kill consumes both the standard slot and the Life/Death slot, so it is legal only when both slots are still unused.

If a player has no legal action in the remaining slots, the engine advances the turn. If neither player has any legal action, the game is a draw.

If only the two Kings and any number of Life pieces remain, the game is a draw. Life pieces can repair Shields but cannot destroy a King by themselves, so they do not count as remaining destruction material.

## Shields, Immunity, And Intimidation

- Pawns, Rooks, Knights, and Bishops start with one Shield.
- Kings, Queens, Life pieces, and Death pieces can never have Shields.
- A Shield absorbs the first successful attack. The target remains on the board and loses only the Shield.
- A later successful attack against that now-unshielded piece removes it.
- Life healing gives an eligible shieldless piece one Shield and one-turn immunity.
- Immunity blocks attack damage, Death kills, and Life/Death pass-through damage until it expires.
- A piece that gives check to a King becomes Intimidated.
- An Intimidated checking piece loses its Shield while it continues to give check.
- An Intimidated piece cannot gain a Shield from Life healing or Life pass-through.
- Once that piece no longer gives check, its intimidation ends and its Shield is restored if the rules say it should return.
- Check is status and intimidation only. It does not restrict legal moves and does not create checkmate.
- Removing any King immediately wins the game for the opposing side.

## Standard Piece Movement

Standard pieces use ordinary chess movement patterns unless changed here.

- Standard pieces never capture by moving onto an enemy piece.
- Enemy pieces are damaged or removed only through the attack system.
- Standard pieces may move or attack through Life and Death pieces as if their squares were empty.
- Passing through Life or Death triggers the matching pass-through effect.
- A standard piece may not remain on a Life square after a normal move.
- A standard piece may choose a Death-occupied square as the final square of a normal move; the Death piece remains, and the moving piece is removed immediately after the move resolves.
- Any successful attack counts as moving the attacker for first-move and castling tracking, even when the attacker was already adjacent to the target.

## Pawns

- A Pawn that has not moved may advance 1, 2, or 3 empty squares forward.
- If a Pawn advanced only one square from its home rank and is on rank 3 for White or rank 8 for Black, it may still advance 1 or 2 empty squares forward.
- Pawns can advance through Life and Death pieces as pass-through squares. Their final landing square must be empty unless it is a Death-occupied square chosen as a fatal final square.
- Pawn attacks are diagonal and use the attack system.
- Variant en passant is available only as the immediate standard reply. The eligible player may use a Life/Death action first, but the en passant right expires if that player takes any other standard action before using it. If a Pawn advanced multiple squares and crossed an enemy Pawn's diagonal attack square, that enemy Pawn may attack it. The crossed square is the staging square for a Shield break, or a pass-through square on a killing blow.
- On the opponent's half of the board, a Pawn directly blocked by an enemy-controlled Life or Death piece may jump over it to the empty square immediately beyond it. The jumped Life/Death piece applies its pass-through effect.
- Promotion is mandatory when a surviving Pawn ends on the far rank. The player chooses Queen, Rook, Bishop, or Knight.
- A promoted piece inherits the Pawn's immunity and Shield state, except a promoted Queen is always unshielded.

Pawn jump example:

- A White Pawn is on `d6`, an enemy-controlled Death piece is on `d7`, and `d8` is empty.
- The Pawn may jump from `d6` to `d8`.
- Because it passed through Death, it loses its Shield. If it had no Shield and no immunity, it is destroyed after the move resolves.

## Knights

Knights have two standard-action modes (mutually exclusive):

1. L-shaped attack: the usual Knight L shape is legal only when attacking an enemy piece through the attack system.
2. Ramp jump: a non-attacking jump over an adjacent piece to the empty square immediately beyond it.

Ramp rules:

- The ramp piece may be friendly or enemy.
- Life and Death pieces may be used as ramps, and their pass-through effects apply to the Knight.
- If multiple ramp routes reach the same destination, routes that avoid Death ramps are preferred even when they take an extra jump; routes over Life ramps are preferred even when a neutral route is available.
- A Knight may make up to two ramp jumps in one standard move.
- A Knight cannot land on a square it already occupied during the current move.
- Knights cannot use their L-shaped pattern to move to an empty square. Their non-attacking moves to empty squares come only from ramp jumps.

## Castling And Check

- Castling uses the nearest Rooks on the b-file and j-file of the 10x10 board.
- The castling move consumes the standard move slot.
- Use normal castling no-move and empty-path prerequisites unless this document overrides them.
- Check is only intimidation/status in this variant. It does not create normal checkmate, check-evasion, or castling-through-check restrictions.

## Life And Death

Life and Death are special pieces. Their owner is determined by board half, not by original color.

- White controls Life and Death pieces on ranks 1-5.
- Black controls Life and Death pieces on ranks 6-10.
- Moving a Life/Death piece across the center transfers control immediately.
- Life moves one square diagonally and may only move to, or exist on, light squares.
- Death moves one square diagonally and may only move to, or exist on, dark squares.
- If any Life and any Death become orthogonally adjacent, both are immediately removed by annihilation.

Pass-through effects:

- Passing through Life gives the moving piece a Shield only if it can have a Shield, does not already have one, is not immune, and is not Intimidated.
- Passing through Death removes the moving piece's Shield. If it has no Shield and no immunity during a normal move, the piece is destroyed during path resolution.
- During an attack, Death pass-through does not stop the blow. The attack resolves first, then the attacker is removed if Death destroyed it on the way.
- A Death-occupied square may be used as a Shield-break staging square. The attack resolves, then the attacker is removed from the board regardless of Shield.

Special actions:

- Life heal targets an adjacent diagonal piece on a light square, friendly or enemy.
- The Life heal target must be shieldless, able to have a Shield, not immune, and not Intimidated.
- Life heal gives the target a Shield and one-turn immunity.
- Death kill targets an adjacent diagonal piece on a dark square, friendly or enemy.
- The Death kill target must not be immune and must not be another Death piece.
- Death kill is blocked if the target has an allied protector orthogonally adjacent to it.
- Death moves onto the target square and destroys the target.

## Attack, Staging, And Resting

Attacks replace normal chess capture.

To attack, a player selects a piece and then an enemy target that lies on that piece's attack line or attack pattern.

General attack rules:

- A Shield break needs a valid staging square.
- A staging square is usually an empty square adjacent to the target that the attacker can use to deliver the Shield break.
- A Death-occupied square can also be chosen as a Shield-break staging square; this is always fatal to the attacker after the attack resolves.
- For sliding Shield breaks, the staging square is along the attack line next to the target.
- For Pawn and King Shield breaks, the attacker may already be the staging piece from its current square.
- For Knight Shield breaks, the game finds valid empty or Death-occupied staging squares adjacent to the target from which the Knight could deliver its L-shaped attack.
- If multiple Shield-break staging squares work, the player chooses one.
- A killing blow against an unshielded target does not choose a staging square. The attack is performed on the target's square, the target is removed, and the attacker rests on that vacated square.
- Life and Death pass-through effects still apply along the attack path before the target square. Death can remove the attacker only after the killing blow resolves.

Shielded target:

1. The player selects the attacker and target.
2. The target loses its Shield.
3. The attacker ends on the staging square, unless the staging square was Death-occupied and removes the attacker after the Shield break resolves.

Unshielded target:

1. The player selects the attacker and target.
2. No staging square is chosen.
3. The target is removed.
4. The attacker must rest on the target's vacated square, unless Death pass-through removes the attacker after the blow resolves.

Rook attack example:

- A White Rook on `b1` attacks a shieldless Black Rook on `b8`.
- The White player selects the Rook on `b1`, then the target on `b8`.
- The path to `b8` must be clear except for pass-through Life or Death pieces.
- The Black Rook is removed.
- The attacking Rook rests on the vacated `b8`, concluding the move.

Knight attack example:

- A White Knight on `c2` attacks a Black Pawn on `d4`.
- The possible staging squares adjacent to `d4` from which a Knight could deliver that L-shaped attack are `c4` and `d3`.
- The White player selects the Knight on `c2`, then the target on `d4`.
- At least one of `c4` or `d3` must be empty or Death-occupied.
- If more than one staging square is valid and the Pawn is shielded, the player must first choose which staging square to use.
- If the Pawn on `d4` has a Shield, the Shield is removed and the Knight ends on the chosen staging square.
- If the Pawn on `d4` has no Shield, no staging choice is made. The Pawn is removed and the Knight must rest on `d4`.
- If the Knight's killing-blow path crosses Life or Death squares, those pass-through effects still apply. For example, a Knight attacking from `c5` to a shieldless target on `d7` passes through `c6` and `d6`; Death on `c6` removes the Knight's Shield or destroys it after the target is removed.

## AI And Engine Expectations

The AI must reason over Chess Two legality, not normal chess capture rules. In particular, it must understand:

- Two-slot turns.
- Hybrid standard and Life/Death actions.
- Skipping a remaining Life/Death slot after the standard slot has been used.
- Shield-break staging and target-square killing blows.
- Shields, immunity, intimidation, and pass-through effects.
- Shields as second-life material: cheap attacks that remove Shields from valuable pieces are often real tactical gains, unless Life can promptly repair them.
- Death pass-through and Death-staging attacks resolving before attacker removal.
- Life/Death ownership transfer by board half.
- King destruction as the terminal win condition.
- Draw/no-move safety.

The rule source of truth is this document, followed by the engine tests.
