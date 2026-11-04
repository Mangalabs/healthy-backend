import { createHash, randomInt, timingSafeEqual } from 'crypto';

export const RESET_CODE_TTL_MINUTES = 15;
export const RESET_MAX_ATTEMPTS = 5;

/** Código numérico de 6 dígitos, gerado com fonte criptograficamente segura. */
export function generateResetCode(): string {
  return randomInt(100000, 1000000).toString();
}

/** O código nunca é guardado em texto puro no banco. */
export function hashResetCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function resetCodeMatches(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashResetCode(code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
