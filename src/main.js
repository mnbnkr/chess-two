import { GameController } from './ui/controller.js';

function startChessTwo() {
    new GameController({
        boardEl: document.querySelector('#game-board'),
        coordinateEl: document.querySelector('#file-coordinates'),
        statusPanelEl: document.querySelector('#status-panel'),
        promotionEl: document.querySelector('#promotion-panel'),
        controlsEl: document.querySelector('#turn-controls'),
        settingsEl: document.querySelector('#settings-panel'),
        rulesEl: document.querySelector('#rules-panel'),
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startChessTwo, { once: true });
} else {
    startChessTwo();
}
