/**
 * Limite por janela deslizante, em memória. Serve para proteger o custo da IA
 * de uso abusivo; com várias instâncias do servidor cada uma conta sozinha
 * (o teto real fica um pouco acima, o que é aceitável para este fim).
 */
export interface RateRule {
  /** Máximo de usos dentro da janela. */
  max: number;
  windowMs: number;
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly rules: RateRule[],
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Registra um uso para [key] e devolve `null` se foi permitido, ou quantos
   * milissegundos faltam até poder tentar de novo.
   */
  consume(key: string): number | null {
    const now = this.now();
    const longest = Math.max(...this.rules.map((r) => r.windowMs));
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < longest);

    for (const rule of this.rules) {
      const inWindow = recent.filter((t) => now - t < rule.windowMs);
      if (inWindow.length >= rule.max) {
        const oldest = Math.min(...inWindow);
        this.hits.set(key, recent);
        return oldest + rule.windowMs - now;
      }
    }

    recent.push(now);
    this.hits.set(key, recent);
    return null;
  }
}
