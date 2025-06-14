import { BOARD_SIZE } from './game.js';

class Renderer {
    constructor(boardEl, statusPanel) {
        this.boardEl = boardEl;
        this.statusPanel = statusPanel;
        this.playerTurnEl = statusPanel.querySelector('#player-turn');
        this.standardMoveStatusEl = statusPanel.querySelector('#standard-move-status');
        this.specialMoveStatusEl = statusPanel.querySelector('#special-move-status');
        this.phaseInfoEl = statusPanel.querySelector('#phase-info');
    }

    render(gameState, game) {
        this.boardEl.innerHTML = '';
        const { getPiece } = gameState;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.dataset.r = r;
                square.dataset.c = c;
                square.classList.add('square', (r + c) % 2 === 0 ? 'dark' : 'light');

                const piece = getPiece(r, c);
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.classList.add('piece', piece.color);
                    if (piece.type === 'Life') pieceEl.classList.add('life-piece');
                    if (piece.type === 'Death') pieceEl.classList.add('death-piece');
                    if (piece.hasShield) pieceEl.classList.add('has-shield');
                    if (piece.isImmune) pieceEl.classList.add('is-immune');
                    pieceEl.textContent = piece.symbol;
                    square.appendChild(pieceEl);
                }

                const overlay = this.createHighlightOverlay(r, c, gameState);
                if (overlay) square.appendChild(overlay);

                this.boardEl.appendChild(square);
            }
        }
        this.updateStatus(gameState, game);
    }

    createHighlightOverlay(r, c, gameState) {
        const overlay = document.createElement('div');
        overlay.classList.add('highlight-overlay');
        let highlighted = false;

        if (gameState.selectedPiece?.row === r && gameState.selectedPiece?.col === c) {
            overlay.classList.add('selected');
            highlighted = true;
        }
        if (gameState.validMoves.some(m => m.r === r && m.c === c)) {
            overlay.classList.add('valid-move');
            highlighted = true;
        }
        if (gameState.validAttacks.some(a => a.r === r && a.c === c) ||
            gameState.validSpecialActions.some(s => s.r === r && s.c === c)) {
            overlay.classList.add('valid-attack');
            highlighted = true;
        }
        if (gameState.stagingOptions.some(s => s.r === r && s.c === c)) {
            overlay.classList.add('valid-staging');
            highlighted = true;
        }
        if (gameState.restingOptions.some(s => s.r === r && s.c === c)) {
            overlay.classList.add('valid-resting');
            highlighted = true;
        }

        return highlighted ? overlay : null;
    }

    updateStatus(gameState, game) {
        const currentPlayerName = gameState.currentPlayer.charAt(0).toUpperCase() + gameState.currentPlayer.slice(1);
        this.playerTurnEl.textContent = currentPlayerName;
        this.playerTurnEl.className = 'player-turn ' + gameState.currentPlayer;

        const stdMoveStatus = gameState.turn.standardMoveMade ? 'Used' : 'Available';
        this.standardMoveStatusEl.textContent = stdMoveStatus;
        this.standardMoveStatusEl.className = 'status-' + stdMoveStatus.toLowerCase();

        const spcMoveAvailable = game.playerHasPossibleMoves('special');
        let spcMoveStatus, spcMoveClass;
        if (gameState.turn.specialMoveMade) {
            spcMoveStatus = 'Used';
            spcMoveClass = 'status-used';
        } else if (spcMoveAvailable) {
            spcMoveStatus = 'Available';
            spcMoveClass = 'status-available';
        } else {
            spcMoveStatus = 'Unavailable';
            spcMoveClass = 'status-unavailable';
        }
        this.specialMoveStatusEl.textContent = spcMoveStatus;
        this.specialMoveStatusEl.className = spcMoveClass;

        if (gameState.phase === 'SELECT_PIECE' && !gameState.phaseInfo.includes('turn')) {
            this.phaseInfoEl.textContent = `${currentPlayerName}'s turn. Select a piece to move.`;
        } else {
            this.phaseInfoEl.textContent = gameState.phaseInfo || ' ';
        }
    }
}

class InputHandler {
    constructor(game) {
        this.game = game;
        this.game.renderer.boardEl.addEventListener('click', (e) => {
            const square = e.target.closest('.square');
            if (square) {
                const r = parseInt(square.dataset.r);
                const c = parseInt(square.dataset.c);
                if (!isNaN(r) && !isNaN(c)) {
                    this.game.handleSquareClick(r, c);
                }
            }
        });
    }
}

export { Renderer, InputHandler };
