export const DEFAULT_SETTINGS = {
    aiLevel: 3,
    animationsEnabled: true,
    playerSide: 'white',
};

const STORAGE_KEY = 'chess-two-settings';

const AI_LEVELS = {
    0: { label: 'Off (self-play)', maxDepth: 0, maxActions: 0, thinkDelay: 0 },
    1: { label: 'Level 1', maxDepth: 1, maxActions: 14, maxTacticalActions: 4, quiescenceDepth: 0, tacticalWeight: 0.45, thinkDelay: 45, timeLimitMs: 100, hardTimeLimitMs: 160 },
    2: { label: 'Level 2', maxDepth: 2, maxActions: 20, maxTacticalActions: 6, quiescenceDepth: 1, tacticalWeight: 0.75, thinkDelay: 35, timeLimitMs: 280, hardTimeLimitMs: 460 },
    3: { label: 'Level 3', maxDepth: 3, maxActions: 24, maxTacticalActions: 8, quiescenceDepth: 1, tacticalWeight: 1, thinkDelay: 30, timeLimitMs: 950, hardTimeLimitMs: 1650 },
    4: { label: 'Level 4', maxDepth: 4, maxActions: 20, maxTacticalActions: 7, quiescenceDepth: 1, tacticalWeight: 1.25, thinkDelay: 25, timeLimitMs: 1200, hardTimeLimitMs: 2000 },
    5: { label: 'Level 5', maxDepth: 5, maxActions: 30, maxTacticalActions: 12, quiescenceDepth: 2, tacticalWeight: 1.9, thinkDelay: 15, timeLimitMs: 2600, hardTimeLimitMs: 4200 },
};

export function loadSettings(storage = globalThis.localStorage) {
    if (!storage) return { ...DEFAULT_SETTINGS };
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        return normalizeSettings(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
    const normalized = normalizeSettings(settings);
    if (storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
}

export function normalizeSettings(settings) {
    const aiLevel = Number(settings?.aiLevel);
    const playerSide = settings?.playerSide === 'black' ? 'black' : DEFAULT_SETTINGS.playerSide;
    return {
        aiLevel: Number.isInteger(aiLevel) && aiLevel >= 0 && aiLevel <= 5 ? aiLevel : DEFAULT_SETTINGS.aiLevel,
        animationsEnabled: typeof settings?.animationsEnabled === 'boolean'
            ? settings.animationsEnabled
            : DEFAULT_SETTINGS.animationsEnabled,
        playerSide,
    };
}

export function aiOptionsForLevel(level) {
    return AI_LEVELS[normalizeSettings({ aiLevel: level }).aiLevel];
}

export function aiLabelForLevel(level) {
    return aiOptionsForLevel(level).label;
}

export function isAiEnabled(settings) {
    return normalizeSettings(settings).aiLevel > 0;
}

export function effectivePlayerSide(settings) {
    const normalized = normalizeSettings(settings);
    return isAiEnabled(normalized) ? DEFAULT_SETTINGS.playerSide : normalized.playerSide;
}
