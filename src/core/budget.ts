export type BudgetState = "ok" | "degraded" | "exhausted";

export interface BudgetConfig {
  softUsd: number;
  hardUsd: number;
  spentUsd?: number;
  onChange?: (spentUsd: number, state: BudgetState) => void;
}

/** In-memory spend meter for one period. Persistence (per month, in the DB) is wired in a later milestone. */
export class Budget {
  readonly softUsd: number;
  readonly hardUsd: number;
  private spent: number;
  private readonly onChange: BudgetConfig["onChange"];

  constructor(config: BudgetConfig) {
    if (config.softUsd > config.hardUsd) throw new Error("soft cap must not exceed hard cap");
    this.softUsd = config.softUsd;
    this.hardUsd = config.hardUsd;
    this.spent = config.spentUsd ?? 0;
    this.onChange = config.onChange;
  }

  get spentUsd(): number {
    return this.spent;
  }

  state(): BudgetState {
    if (this.spent >= this.hardUsd) return "exhausted";
    if (this.spent >= this.softUsd) return "degraded";
    return "ok";
  }

  record(costUsd: number): BudgetState {
    if (costUsd < 0 || !Number.isFinite(costUsd)) throw new Error(`invalid cost ${costUsd}`);
    this.spent += costUsd;
    const state = this.state();
    this.onChange?.(this.spent, state);
    return state;
  }
}
