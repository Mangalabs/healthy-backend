import {
  IsString,
  IsInt,
  Min,
  IsOptional,
  MaxLength,
  IsTimeZone,
  IsIn,
  IsObject,
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
}
