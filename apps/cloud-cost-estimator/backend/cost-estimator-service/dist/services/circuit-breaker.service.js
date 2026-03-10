"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerCircuitBreaker = exports.CircuitBreakerService = exports.CircuitBreakerOpenError = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const FAILURE_THRESHOLD = Number(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? "3");
const FAILURE_WINDOW_MS = Number(process.env.CIRCUIT_BREAKER_FAILURE_WINDOW_MS ?? "60000");
const OPEN_COOLDOWN_MS = Number(process.env.CIRCUIT_BREAKER_OPEN_COOLDOWN_MS ?? "120000");
const nowMs = () => Date.now();
const createEntry = () => ({
    state: "CLOSED",
    failures: [],
    openedAtMs: null
});
const pruneFailures = (failures, now) => failures.filter((timestamp) => now - timestamp <= FAILURE_WINDOW_MS);
class CircuitBreakerOpenError extends Error {
    constructor(provider, retryAfterMs) {
        super(`Circuit is OPEN for ${provider}`);
        this.code = "CIRCUIT_OPEN";
        this.name = "CircuitBreakerOpenError";
        this.provider = provider;
        this.retryAfterMs = retryAfterMs;
    }
}
exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
class CircuitBreakerService {
    constructor() {
        this.entries = {
            azure: createEntry(),
            aws: createEntry(),
            gcp: createEntry()
        };
    }
    transition(provider, to) {
        const entry = this.entries[provider];
        const from = entry.state;
        if (from === to) {
            return;
        }
        entry.state = to;
        if (to === "OPEN") {
            entry.openedAtMs = nowMs();
        }
        else {
            entry.openedAtMs = null;
        }
        logger_1.default.warn("CIRCUIT_STATE_TRANSITION", {
            provider,
            from,
            to
        });
    }
    canExecute(provider) {
        const entry = this.entries[provider];
        const now = nowMs();
        if (entry.state !== "OPEN") {
            return;
        }
        const openedAt = entry.openedAtMs ?? now;
        const elapsed = now - openedAt;
        if (elapsed >= OPEN_COOLDOWN_MS) {
            this.transition(provider, "HALF_OPEN");
            entry.failures = [];
            return;
        }
        throw new CircuitBreakerOpenError(provider, OPEN_COOLDOWN_MS - elapsed);
    }
    recordSuccess(provider) {
        const entry = this.entries[provider];
        entry.failures = [];
        if (entry.state !== "CLOSED") {
            this.transition(provider, "CLOSED");
        }
    }
    recordFailure(provider) {
        const entry = this.entries[provider];
        const now = nowMs();
        if (entry.state === "HALF_OPEN") {
            entry.failures = [now];
            this.transition(provider, "OPEN");
            return;
        }
        entry.failures = pruneFailures(entry.failures, now);
        entry.failures.push(now);
        if (entry.failures.length > FAILURE_THRESHOLD) {
            this.transition(provider, "OPEN");
        }
    }
    getState(provider) {
        return this.entries[provider].state;
    }
}
exports.CircuitBreakerService = CircuitBreakerService;
exports.providerCircuitBreaker = new CircuitBreakerService();
