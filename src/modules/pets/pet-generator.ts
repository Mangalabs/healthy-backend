import { PetLook } from './pet-look';

/** Token de injeção do gerador (permite trocar por um falso nos testes). */
export const PET_GENERATOR = Symbol('PET_GENERATOR');

export interface PetGenerationInput {
  /** Valor de `PetSpecies` (CAT, DOG…); a IA não muda a espécie. */
  species: string;
  /** Descrição livre da pessoa, já sem espaços nas pontas. */
  description: string;
}

/** O modelo recusou ou devolveu algo que não dá para usar. */
export class PetGenerationError extends Error {
  constructor(
    readonly reason: 'refused' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'PetGenerationError';
  }
}

export interface PetGenerator {
  /** `false` quando não há chave configurada. */
  readonly available: boolean;
  generate(input: PetGenerationInput): Promise<PetLook>;
}
