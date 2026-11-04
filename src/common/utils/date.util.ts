const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function safeTimezone(timezone?: string | null): string {
  if (!timezone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Data local (YYYY-MM-DD) de um instante no fuso informado. */
export function localDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Soma (ou subtrai) dias a uma chave YYYY-MM-DD, sem depender de fuso. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
}

function offsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante UTC em que começa o dia local `key` no fuso informado. */
export function startOfLocalDay(key: string, timezone: string): Date {
  const tz = safeTimezone(timezone);
  const [y, m, d] = key.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);

  let result = guess - offsetMs(new Date(guess), tz);
  // segunda passada para corrigir mudanças de horário de verão
  result = guess - offsetMs(new Date(result), tz);
  return new Date(result);
}

/** Intervalo [start, end) do dia local que contém `reference`. */
export function localDayRange(
  timezone: string,
  reference: Date = new Date(),
): { key: string; start: Date; end: Date } {
  const tz = safeTimezone(timezone);
  const key = localDateKey(reference, tz);
  return {
    key,
    start: startOfLocalDay(key, tz),
    end: startOfLocalDay(addDaysToKey(key, 1), tz),
  };
}
