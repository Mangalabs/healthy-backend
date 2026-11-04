import {
  generateResetCode,
  hashResetCode,
  resetCodeMatches,
} from './reset-code.util';

describe('reset-code.util', () => {
  it('gera códigos de 6 dígitos', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateResetCode()).toMatch(/^[1-9]\d{5}$/);
    }
  });

  it('não guarda o código em texto puro', () => {
    const hash = hashResetCode('123456');
    expect(hash).not.toContain('123456');
    expect(hash).toHaveLength(64);
  });

  it('confere o código certo e rejeita o errado', () => {
    const hash = hashResetCode('123456');
    expect(resetCodeMatches('123456', hash)).toBe(true);
    expect(resetCodeMatches('654321', hash)).toBe(false);
    expect(resetCodeMatches('', hash)).toBe(false);
  });

  it('rejeita um hash armazenado malformado sem lançar', () => {
    expect(resetCodeMatches('123456', 'xyz')).toBe(false);
  });
});
