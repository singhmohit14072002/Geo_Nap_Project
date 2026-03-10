import logger from "../utils/logger";

export type CircuitProviderName = "azure" | "aws" | "gcp";
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitProviderEntry {
  state: CircuitState;
  failures: number[];
  openedAtMs: number | null;
}

const FAILURE_THRESHOLD = Number(
  process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? "3"
);
const FAILURE_WINDOW_MS = Number(
  process.env.CIRCUIT_BREAKER_FAILURE_WINDOW_MS ?? "60000"
);
const OPEN_COOLDOWN_MS = Number(
  process.env.CIRCUIT_BREAKER_OPEN_COOLDOWN_MS ?? "120000"
);

const nowMs = (): number => Date.now();

const createEntry = (): CircuitProviderEntry => ({
  state: "CLOSED",
  failures: [],
  openedAtMs: null
});

const pruneFailures = (failures: number[], now: number): number[] =>
  failures.filter((timestamp) => now - timestamp <= FAILURE_WINDOW_MS);

export class CircuitBreakerOpenError extends Error {
  readonly code = "CIRCUIT_OPEN";
  readonly provider: CircuitProviderName;
  readonly retryAfterMs: number;

  constructor(provider: CircuitProviderName, retryAfterMs: number) {
    super(`Circuit is OPEN for ${provider}`);
    this.name = "CircuitBreakerOpenError";
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

export class CircuitBreakerService {
  private readonly entries: Record<CircuitProviderName, CircuitProviderEntry> = {
    azure: createEntry(),
    aws: createEntry(),
    gcp: createEntry()
  };

  private transition(provider: CircuitProviderName, to: CircuitState): void {
    const entry = this.entries[provider];
    const from = entry.state;
    if (from === to) {
      return;
    }

    entry.state = to;
    if (to === "OPEN") {
      entry.openedAtMs = nowMs();
    } else {
      entry.openedAtMs = null;
    }

    logger.warn("CIRCUIT_STATE_TRANSITION", {
      provider,
      from,
      to
    });
  }

  canExecute(provider: CircuitProviderName): void {
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

  recordSuccess(provider: CircuitProviderName): void {
    const entry = this.entries[provider];
    entry.failures = [];
    if (entry.state !== "CLOSED") {
      this.transition(provider, "CLOSED");
    }
  }

  recordFailure(provider: CircuitProviderName): void {
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

  getState(provider: CircuitProviderName): CircuitState {
    return this.entries[provider].state;
  }
}

export const providerCircuitBreaker = new CircuitBreakerService();

