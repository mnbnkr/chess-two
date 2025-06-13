# Chess Two / Shield Chess / Chess: Shield & Scythe
(10x10 Chess with 2 hit points, Life and Death)

This is an unfinished 'draft repository'.

### Game Rules: "Chess Two" (FROM PROMPT)

*Apply standard chess rules for piece movement, castling, promotion and etc (but do not implement normal piece capture unless specified), except where explicitly modified by the rules below.*

#### **1. Board & Initial Setup**

*   **Board:** A 10x10 grid with alternating dark and light squares.
*   **Piece Health (Shields):** All pieces, **except for the King, Life, and Death pieces**, begin the game with one "Shield."
    *   A piece with a Shield can withstand one attack. The first attack removes the Shield.
    *   The second attack on a now-shieldless piece removes it from the board.
*   **Initial Layout:**
    *   **Rank 1 (Black):** Death, Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook, Life.
    *   **Rank 10 (White):** Life, Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook, Death.
*   **Pawns:** Each player has 10 Pawns, occupying their entire second rank (Rank 2 for Black, Rank 9 for White).

#### **2. Turn Structure**

A player's turn consists of up to two distinct moves, which can be performed in any order:
1.  **One Standard Move:** A single move with any standard piece (Pawn, Rook, Knight, Bishop, Queen, King).
2.  **One Special Move:** A single move with either a Life or a Death piece that you currently control.

The turn is not over until the player has made all possible moves (MUST make these moves if possible). This two-move structure prevents stalemate as long as a Life or Death piece can be moved.

#### **3. Piece-Specific Rules & Mechanics**

*   **Pawn:**
    *   **First Move:** A Pawn that has not yet moved can advance 1, 2, or 3 empty squares forward. If a Pawn has only moved 1 square (or is on rank 3 for Black or 8 for White) - it can still advance 1 or 2 empty squares forward.
    *   **Special Jump:** If a Pawn on the opponent's side of the board is directly blocked by an opponent's Life or Death piece, it may jump over that piece to the empty square immediately behind it. This jump triggers the "Pass-Through Effect" of the jumped piece.
        *   **Example:** A White Pawn is on d6, and an opponent's Death piece is on d7. If d8 is empty, the Pawn can jump from d6 to d8. Upon landing, the Pawn loses its shield (or life) due to passing through Death.

*   **Knight:**
    *   The Knight has two mutually exclusive move types for its "Standard Move."
    1.  **Normal Move:** The standard L-shaped move (capturing or non-capturing - or attacking or non-attacking).
    2.  **Ramp Jump:** A non-capturing (can never attack with this) move where the Knight uses an adjacent (also diagonal) piece as a "ramp." It jumps over this piece to land on the empty square immediately beyond it. Life and Death pieces cannot be used as ramps. A Knight can perform up to two Ramp Jumps in a single Standard Move, but cannot land on a square it has already occupied during the current move.
    *   **Automatic Move Selection:** When a Knight is selected, the UI should highlight all possible destinations for both Normal Moves and Ramp Jumps. The game automatically commits to the move type based on the square the player clicks.

*   **King:**
    *   **Health:** The King has only 1 life and can never have a Shield.
    *   **Intimidation:** When an opponent's move places the King in check, the piece or pieces delivering the check immediately lose their Shield (if they had one).

    **Queen:**
    *   **Health:** The Queen has only 1 life and can never have a Shield.

*   **Life & Death Pieces:**
    *   **Movement:** Move one square diagonally. **Life** can only move to and exist on **light-colored squares**. **Death** can only move to and exist on **dark-colored squares**.
    *   **Control Change:** Control is determined by board position. White controls any Life/Death piece on ranks 6-10. Black controls any Life/Death piece on ranks 1-5. If a player moves a piece onto the opponent's half, control immediately transfers to the opponent.
    *   **Annihilation:** If a Life piece and a Death piece (regardless of who controls them) become adjacent (horizontally or vertically), both are immediately removed from the board.
    *   **Pass-Through Effect (Immateriality):** Standard pieces can pass through Life and Death pieces as if their squares were empty. Doing so triggers an effect:
        *   Passing through **Life**: The moving piece gains a Shield (if it did not already have one).
        *   Passing through **Death**: The moving piece loses its Shield. If it has no Shield, it is destroyed and removed from the board (the move/attack still completes before the moving piece dies).
    *   **Special Actions:** Life and Death can perform special actions that use up the "Standard Move" AND the "Special Move" slot for the current turn (so the move can't be performed if BOTH moves are not available).
        *   **Life's Heal:** Can grant a Shield to an adjacent, friendly or foe piece on a diagonal light square (if the piece doesn't have one). This action also makes the piece immune to any damage for 1 turn.
        *   **Death's Kill:** Can destroy any piece (friend or foe) on an adjacent diagonal dark square - it can only do so by moving onto that square. **Condition:** This is only possible if the target piece is *not* "protected" by one of its allies on a square adjacent (horizontally or vertically (same as light-colored squares)) to it.

#### **4. Attack, Shield & Resting Mechanic**

This mechanic redefines how attacks are executed. To attack, a player selects their piece and then clicks an opponent's piece.

*   **Staging Square:** For an attack to be valid, there must be an empty square adjacent to the target that lies along the attacking piece's line of attack. This empty square is the "staging square." The attack cannot be made if no such square is available. (The staging square must *always* be between the attacker and the target (except a bit special case with Knight).)
*   **Attacking a Shielded Piece:**
    1.  The player selects their piece, then the target. The attack resolves.
    2.  The target piece's Shield is removed.
    3.  The attacker stays to the staging square, and its move ends.
*   **Delivering a Killing Blow (Attacking an Unshielded Piece):**
    1.  The player selects their piece, then the target. The attack resolves.
    2.  The target piece is removed from the board.
    3.  This triggers a **"Resting Phase."** The player must now click to choose where the attacker rests: either on the **staging square** or on the **vacated square** where the target piece was. The move is not complete until this choice is made.

*   **Rook Attack Example:** A White Rook on `b1` attacks a Black Rook on `b8` (no shield). The White player selects their Rook on `b1`, then the target on `b8`. Since the staging square (`b7`) is empty, the attack is valid. The Black Rook is removed. The UI must then prompt the White player to click on either the staging square (`b7`) or the vacated square (`b8`) to place their Rook, concluding the move.
*   **Knight Attack Example (unusual interaction!):** The Knight's attack requires identifying valid staging squares from which to launch the attack.
    *   **Scenario:** A White Knight on `c2` attacks a Black Pawn on `d4`. The potential staging squares adjacent to `d4` from which the Knight could theoretically launch its L-shaped attack are `c4` and `d3`.
    *   **Execution:** The player selects the White Knight on `c2`, then the target Pawn on `d4`. For the attack to be valid, at least one of these staging squares (`c4` or `d3`) must be empty. If both are empty, the player must first click which staging square to use for the attack.
    *   **Resolution (Shielded):** If the Pawn on `d4` had a shield, the shield is removed, and the White Knight ends its move resting on the chosen staging square (e.g., `c4`).
    *   **Resolution (Killing Blow):** If the Pawn on `d4` had no shield, it is removed from the board. The game enters the "Resting Phase," and the player must choose to place their Knight on either the chosen staging square (e.g., `c4`) or the target's now-vacant square (`d4`).

---
