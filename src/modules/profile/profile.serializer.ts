import { Prisma, Profile } from '@prisma/client';

type WithDecimals = Pick<
  Profile,
  'targetWeightKg' | 'healthFloorBmi' | 'setupCompletedAt'
>;

const toNumber = (value: Prisma.Decimal | null) =>
  value === null ? null : Number(value);

/**
 * Perfil como o app consome: campos Decimal viram número e `setupCompleted`
 * diz se a pessoa já passou pelo "Sobre você".
 */
export function serializeProfile<T extends WithDecimals>(profile: T) {
  return {
    ...profile,
    targetWeightKg: toNumber(profile.targetWeightKg),
    healthFloorBmi: Number(profile.healthFloorBmi),
    setupCompleted: profile.setupCompletedAt !== null,
  };
}

/**
 * Módulos que valem para a pessoa. Conta antiga (sem "Sobre você") acompanha
 * tudo, menos refeições, que só entram se a pessoa pedir.
 */
export function activeModules(profile: {
  trackedModules: string[];
  setupCompletedAt: Date | null;
}): string[] {
  if (
    profile.setupCompletedAt === null &&
    profile.trackedModules.length === 0
  ) {
    return ['MEDICATION', 'HYDRATION', 'EXERCISE', 'WEIGHT'];
  }
  return profile.trackedModules;
}
