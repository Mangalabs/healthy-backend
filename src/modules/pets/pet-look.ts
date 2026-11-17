/**
 * Aparência que a IA pode escolher para o pet. A espécie é decisão da pessoa
 * (o app tem um desenho por espécie); a IA escolhe só cores, padrão, olhos,
 * boca e um nome. Tudo o que volta do modelo passa por [sanitizePetLook] antes
 * de chegar ao app: o modelo sugere, o servidor decide o que é válido.
 */

export const PET_PATTERNS = ['none', 'spots', 'stripes', 'belly'] as const;
export const PET_EYES = [
  'round',
  'happy',
  'sparkle',
  'lashes',
  'dots',
  'wink',
] as const;
export const PET_MOUTHS = ['smile', 'open', 'kitty'] as const;

export type PetPattern = (typeof PET_PATTERNS)[number];
export type PetEyes = (typeof PET_EYES)[number];
export type PetMouth = (typeof PET_MOUTHS)[number];

export interface PetLook {
  primaryColor: string;
  secondaryColor: string;
  pattern: PetPattern;
  eyeType: PetEyes;
  mouthType: PetMouth;
  /** Nome sugerido; `null` quando o modelo não trouxe um nome aproveitável. */
  name: string | null;
}

/** Esquema da resposta estruturada (todos os campos obrigatórios). */
export const PET_LOOK_SCHEMA = {
  type: 'object',
  properties: {
    primaryColor: {
      type: 'string',
      description: 'Main body color as #RRGGBB.',
    },
    secondaryColor: {
      type: 'string',
      description: 'Lighter support color as #RRGGBB.',
    },
    pattern: { type: 'string', enum: [...PET_PATTERNS] },
    eyeType: { type: 'string', enum: [...PET_EYES] },
    mouthType: { type: 'string', enum: [...PET_MOUTHS] },
    name: {
      type: 'string',
      description: 'Short sweet pet name in Brazilian Portuguese.',
    },
  },
  required: [
    'primaryColor',
    'secondaryColor',
    'pattern',
    'eyeType',
    'mouthType',
    'name',
  ],
  additionalProperties: false,
} as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME_LENGTH = 16;

/** Luminância relativa (0 preto … 1 branco) de `#RRGGBB`. */
export function luminance(hex: string): number {
  const channel = (start: number) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function mixWithWhite(hex: string, amount: number): string {
  const part = (start: number) => {
    const c = parseInt(hex.slice(start, start + 2), 16);
    const mixed = Math.round(c + (255 - c) * amount);
    return mixed.toString(16).padStart(2, '0');
  };
  return `#${part(1)}${part(3)}${part(5)}`.toUpperCase();
}

/**
 * O app desenha olhos e boca em tom escuro: um corpo quase preto os esconderia.
 * Cores muito escuras são clareadas aos poucos até ficarem legíveis.
 */
export function ensureVisible(hex: string, minLuminance = 0.06): string {
  let current = hex.toUpperCase();
  for (let i = 0; i < 10 && luminance(current) < minLuminance; i++) {
    current = mixWithWhite(current, 0.15);
  }
  return current;
}

function pick<T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return allowed.find((item) => item === value) ?? fallback;
}

/** Só letras, números, espaço, hífen e apóstrofo; nada de links ou emojis. */
export function sanitizePetName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * Valida a resposta do modelo. Cores inválidas descartam o resultado inteiro
 * (devolve `null`): inventar uma cor no lugar esconderia o erro. Enumerações
 * desconhecidas caem no valor neutro.
 */
export function sanitizePetLook(raw: unknown): PetLook | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const primary = data.primaryColor;
  const secondary = data.secondaryColor;
  if (typeof primary !== 'string' || !HEX.test(primary)) return null;
  if (typeof secondary !== 'string' || !HEX.test(secondary)) return null;

  return {
    primaryColor: ensureVisible(primary),
    secondaryColor: secondary.toUpperCase(),
    pattern: pick(PET_PATTERNS, data.pattern, 'none'),
    eyeType: pick(PET_EYES, data.eyeType, 'round'),
    mouthType: pick(PET_MOUTHS, data.mouthType, 'smile'),
    name: sanitizePetName(data.name),
  };
}
