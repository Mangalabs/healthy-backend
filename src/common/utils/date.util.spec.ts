import {
  addDaysToKey,
  localDateKey,
  localDayRange,
  startOfLocalDay,
} from './date.util';

describe('date.util', () => {
  const sp = 'America/Sao_Paulo';

  it('usa o dia local, não o dia UTC (22h em São Paulo ainda é "hoje")', () => {
    const at22h = new Date('2026-10-26T01:00:00Z'); // 22h de 25/10 em SP
    expect(localDateKey(at22h, sp)).toBe('2026-10-25');
    expect(localDateKey(at22h, 'UTC')).toBe('2026-10-26');
  });

  it('começa o dia local à meia-noite do fuso', () => {
    expect(startOfLocalDay('2026-10-25', sp).toISOString()).toBe(
      '2026-10-25T03:00:00.000Z',
    );
  });

  it('o intervalo do dia cobre 24h e contém a referência', () => {
    const ref = new Date('2026-10-26T01:00:00Z');
    const { key, start, end } = localDayRange(sp, ref);
    expect(key).toBe('2026-10-25');
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
    expect(ref >= start && ref < end).toBe(true);
  });

  it('soma dias atravessando mês e ano', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('cai em São Paulo para fuso inválido', () => {
    expect(startOfLocalDay('2026-10-25', 'Nada/Valido').toISOString()).toBe(
      '2026-10-25T03:00:00.000Z',
    );
  });
});
