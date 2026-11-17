import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PET_SPECIES, type PetSpecies } from '../../profile/dto/update-profile.dto';

export class GeneratePetDto {
  @IsIn(PET_SPECIES, { message: 'Espécie de pet inválida.' })
  species: PetSpecies;

  /** Como a pessoa imagina o pet ("gatinho laranja com olhos brilhantes"). */
  @IsString()
  @MinLength(3, { message: 'Descreva o pet com pelo menos 3 letras.' })
  @MaxLength(200, { message: 'A descrição pode ter até 200 caracteres.' })
  description: string;
}
