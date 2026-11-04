import { createHash, randomBytes } from 'crypto';

const DEFAULT_TTL_DAYS = 30;

/** Validade do refresh token, em dias (`REFRESH_TOKEN_TTL_DAYS`, padrão 30). */
export function refreshTtlDays(raw = process.env.REFRESH_TOKEN_TTL_DAYS): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_DAYS;
}

/** Token opaco de 384 bits, seguro para URL/JSON. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** O token nunca é guardado em texto puro no banco. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry(from = new Date(), ttlDays = refreshTtlDays()): Date {
  return new Date(from.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
