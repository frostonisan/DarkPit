let adminSession = null;
// Module initializers can write before the asynchronous paused checkpoint loads.
// Keep those bootstrap writes temporary; restore replaces them with the saved session.
let pausedBootstrap = window.sessionStorage.getItem('DarkPitPausedCombat:available') === '1'
    ? readPersistentSnapshot() : null;
const activeSession = () => adminSession || pausedBootstrap;

function readPersistentSnapshot() {
    const snapshot = new Map();
    for (let index = 0; index < window.localStorage.length; index++) {
        const key = window.localStorage.key(index);
        snapshot.set(key, window.localStorage.getItem(key));
    }
    return snapshot;
}

export function beginAdminSession() {
    if (adminSession) return;
    adminSession = readPersistentSnapshot();
    adminSession.delete('DarkPitAdminMenuState');
    adminSession.delete('DarkPitAdminInvincibleMode');
}

export function isAdminSessionActive() {
    return adminSession !== null;
}

// Rebuild the ordinary map from saved data while keeping its setup writes temporary.
export function restorePersistentSession() {
    if (adminSession) adminSession = readPersistentSnapshot();
}

export function endAdminSession() {
    adminSession = null;
}

// The game uses one storage API; admin sessions never call persistent write methods.
export const gameStorage = {
    get length() { return activeSession()?.size ?? window.localStorage.length; },
    key(index) { return activeSession() ? [...activeSession().keys()][index] ?? null : window.localStorage.key(index); },
    getItem(key) { return activeSession() ? activeSession().get(String(key)) ?? null : window.localStorage.getItem(key); },
    setItem(key, value) {
        if (activeSession()) activeSession().set(String(key), String(value));
        else window.localStorage.setItem(key, value);
    },
    removeItem(key) {
        if (activeSession()) activeSession().delete(String(key));
        else window.localStorage.removeItem(key);
    },
    clear() {
        if (activeSession()) activeSession().clear();
        else window.localStorage.clear();
    },
};

export function captureAdminSession() { return adminSession ? [...adminSession] : null; }
export function restoreAdminSession(entries) { adminSession = entries ? new Map(entries) : null; pausedBootstrap = null; }
