import {
  ensureVisible,
  luminance,
  sanitizePetLook,
  sanitizePetName,
} from './pet-look';

describe('sanitizePetLook', () => {
  const valid = {
    primaryColor: '#e8a55c',
    secondaryColor: '#f8e3c4',
    pattern: 'stripes',
    eyeType: 'sparkle',
    mouthType: 'kitty',
    name: 'Mel',
  };

  it('aceita uma resposta válida e padroniza as cores em maiúsculas', () => {
    expect(sanitizePetLook(valid)).toEqual({
      primaryColor: '#E8A55C',
      secondaryColor: '#F8E3C4',
      pattern: 'stripes',
      eyeType: 'sparkle',
      mouthType: 'kitty',
      name: 'Mel',
    });
  });

  it.each([
    ['cor sem #', { ...valid, primaryColor: 'E8A55C' }],
    ['cor curta', { ...valid, secondaryColor: '#FFF' }],
    ['cor com nome', { ...valid, primaryColor: 'orange' }],
    ['cor ausente', { ...valid, primaryColor: undefined }],
    ['cor de apoio inválida', { ...valid, secondaryColor: '#GGGGGG' }],
  ])('descarta a resposta inteira com %s', (_label, raw) => {
    expect(sanitizePetLook(raw)).toBeNull();
  });

  it('descarta o que não é objeto', () => {
    expect(sanitizePetLook(null)).toBeNull();
    expect(sanitizePetLook('texto')).toBeNull();
    expect(sanitizePetLook(42)).toBeNull();
  });

  it('troca enumerações desconhecidas pelo valor neutro', () => {
    const look = sanitizePetLook({
      ...valid,
      pattern: 'glitter',
      eyeType: 'laser',
      mouthType: 'fangs',
    });
    expect(look).toMatchObject({
      pattern: 'none',
      eyeType: 'round',
      mouthType: 'smile',
    });
  });

  it('clareia um corpo quase preto para os olhos aparecerem', () => {
    const look = sanitizePetLook({ ...valid, primaryColor: '#000000' });
    expect(look).not.toBeNull();
    expect(luminance(look!.primaryColor)).toBeGreaterThanOrEqual(0.06);
  });
});

describe('ensureVisible', () => {
  it('não mexe em cores que já são legíveis', () => {
    expect(ensureVisible('#9AA5B1')).toBe('#9AA5B1');
  });

  it('chega a um tom legível a partir do preto', () => {
    expect(luminance(ensureVisible('#000000'))).toBeGreaterThanOrEqual(0.06);
  });
});

describe('sanitizePetName', () => {
  it('mantém nomes com acento e hífen', () => {
    expect(sanitizePetName('Pão-de-Mel')).toBe('Pão-de-Mel');
    expect(sanitizePetName('  Bolinha  ')).toBe('Bolinha');
  });

  it('remove emojis, links e símbolos', () => {
    expect(sanitizePetName('Mel 🐱')).toBe('Mel');
    expect(sanitizePetName('http://x.com/mel')).toBe('httpxcommel');
    expect(sanitizePetName('<b>Luna</b>')).toBe('bLunab');
  });

  it('limita o tamanho', () => {
    const name = sanitizePetName('Supercalifragilisticoespialidoso');
    expect(name).not.toBeNull();
    expect(name!.length).toBeLessThanOrEqual(16);
  });

  it('devolve null para vazio, curto demais ou tipo errado', () => {
    expect(sanitizePetName('')).toBeNull();
    expect(sanitizePetName('A')).toBeNull();
    expect(sanitizePetName('🐱🐱')).toBeNull();
    expect(sanitizePetName(undefined)).toBeNull();
    expect(sanitizePetName(7)).toBeNull();
  });
});
