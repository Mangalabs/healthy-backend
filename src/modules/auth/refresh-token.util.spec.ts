import {
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiry,
  refreshTtlDays,
} from './refresh-token.util';

describe('refresh-token.util', () => {
  it('gera tokens longos, únicos e seguros para URL', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('guarda só o hash (64 hex), determinístico', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashRefreshToken(token)).toBe(hash);
  });

  it('usa 30 dias quando a configuração é ausente ou inválida', () => {
    expect(refreshTtlDays(undefined)).toBe(30);
    expect(refreshTtlDays('abc')).toBe(30);
    expect(refreshTtlDays('0')).toBe(30);
    expect(refreshTtlDays('-5')).toBe(30);
    expect(refreshTtlDays('7')).toBe(7);
  });

  it('calcula a expiração a partir de uma data', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(refreshExpiry(from, 2).toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });
});
