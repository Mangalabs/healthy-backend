import {
  IsString,
  IsInt,
  Min,
  IsOptional,
  MaxLength,
  IsTimeZone,
  IsIn,
  IsObject,
  IsBoolean,
  IsArray,
  ArrayUnique,
  IsNumber,
  Max,
} from 'class-validator';

export const PET_SPECIES = [
  'CAT',
  'DOG',
  'OTTER',
  'RABBIT',
  'HAMSTER',
  'FISH',
  'GIRAFFE',
] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const BODY_GOALS = [
  'LOSE',
  'DEFINE',
  'GAIN',
  'MAINTAIN',
  'RECOVER',
] as const;
export type BodyGoalValue = (typeof BODY_GOALS)[number];

export const TRACKED_MODULES = [
  'MEDICATION',
  'HYDRATION',
  'EXERCISE',
  'WEIGHT',
  'MEALS',
] as const;
export type TrackedModuleValue = (typeof TRACKED_MODULES)[number];

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsTimeZone({ message: 'Fuso horário inválido.' })
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsInt()
  @Min(500, { message: 'A meta de hidratação mínima é 500ml.' })
  @IsOptional()
  dailyHydrationGoal?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  petName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  petStatus?: string;

  @IsIn(PET_SPECIES, { message: 'Espécie de pet inválida.' })
  @IsOptional()
  petSpecies?: PetSpecies;

  /** Aparência do pet (cores, padrão, traços). Estrutura validada pelo app. */
  @IsObject()
  @IsOptional()
  petDna?: Record<string, unknown>;

  /** Altura em cm. `null` apaga. */
  @IsInt({ message: 'A altura deve ser um número inteiro em centímetros.' })
  @Min(100, { message: 'A altura mínima é 100 cm.' })
  @Max(250, { message: 'A altura máxima é 250 cm.' })
  @IsOptional()
  heightCm?: number | null;

  @IsIn(BODY_GOALS, { message: 'Objetivo inválido.' })
  @IsOptional()
  bodyGoal?: BodyGoalValue | null;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Peso meta inválido.' })
  @Min(25, { message: 'O peso meta mínimo é 25 kg.' })
  @Max(400, { message: 'O peso meta máximo é 400 kg.' })
  @IsOptional()
  targetWeightKg?: number | null;

  /** IMC mínimo saudável usado como piso das metas de peso. */
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'IMC de piso inválido.' })
  @Min(16, { message: 'O IMC de piso mínimo é 16.' })
  @Max(22, { message: 'O IMC de piso máximo é 22.' })
  @IsOptional()
  healthFloorBmi?: number;

  @IsArray()
  @ArrayUnique()
  @IsIn(TRACKED_MODULES, { each: true, message: 'Módulo inválido.' })
  @IsOptional()
  trackedModules?: TrackedModuleValue[];

  @IsBoolean()
  @IsOptional()
  bodyMirror?: boolean;

  /** Marca que a pessoa passou pelo "Sobre você" (mesmo pulando). */
  @IsBoolean()
  @IsOptional()
  setupCompleted?: boolean;
}
