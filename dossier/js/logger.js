const STORAGE_KEY = "darkpit.debugLogs";
const QUERY_KEY = "debugLogs";

const nativeConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

const noop = () => {};

function getStoredValue() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function setStoredValue(value) {
    try {
        if (value) {
            localStorage.setItem(STORAGE_KEY, "1");
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Keep logging control non-blocking if storage is unavailable.
    }
}

function readQueryToggle() {
    try {
        return new URLSearchParams(window.location.search).get(QUERY_KEY);
    } catch {
        return null;
    }
}

const queryToggle = readQueryToggle();
const state = {
    enabled: queryToggle === "1" || (queryToggle !== "0" && getStoredValue() === "1"),
};

if (queryToggle === "1") setStoredValue(true);
if (queryToggle === "0") setStoredValue(false);

function applyConsoleState() {
    console.log = state.enabled ? nativeConsole.log : noop;
    console.info = state.enabled ? nativeConsole.info : noop;
    console.debug = state.enabled ? nativeConsole.debug : noop;
    console.warn = nativeConsole.warn;
    console.error = nativeConsole.error;
}

const api = Object.freeze({
    enable() {
        state.enabled = true;
        setStoredValue(true);
        applyConsoleState();
        nativeConsole.info("DarkPit debug logs enabled.");
    },
    disable() {
        state.enabled = false;
        setStoredValue(false);
        applyConsoleState();
        nativeConsole.info("DarkPit debug logs disabled.");
    },
    isEnabled() {
        return state.enabled;
    },
    native: nativeConsole,
});

applyConsoleState();

Object.defineProperty(window, "DarkPitLogs", {
    value: api,
    writable: false,
    configurable: false,
});
