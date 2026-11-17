import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  PET_GENERATOR,
  PetGenerationError,
  PetGenerator,
} from './pet-generator';
import { SlidingWindowLimiter } from './rate-limiter';
import { GeneratePetDto } from './dto/generate-pet.dto';

const HOUR = 60 * 60 * 1000;

export interface GeneratedPet {
  look: {
    primaryColor: string;
    secondaryColor: string;
    pattern: string;
    eyeType: string;
    mouthType: string;
  };
  /** Sugestão de nome; o app só usa se a pessoa ainda não escolheu um. */
  suggestedName: string | null;
}

@Injectable()
export class PetsService {
  private readonly logger = new Logger(PetsService.name);

  /** 5 por hora e 15 por dia por perfil: sobra para experimentar, não para abusar. */
  private readonly limiter = new SlidingWindowLimiter([
    { max: 5, windowMs: HOUR },
    { max: 15, windowMs: 24 * HOUR },
  ]);

  constructor(@Inject(PET_GENERATOR) private readonly generator: PetGenerator) {}

  capabilities(): { aiGeneration: boolean } {
    return { aiGeneration: this.generator.available };
  }

  async generate(profileId: string, dto: GeneratePetDto): Promise<GeneratedPet> {
    if (!this.generator.available) {
      throw new HttpException(
        {
          message: 'A criação com IA não está disponível agora.',
          code: 'AI_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const waitMs = this.limiter.consume(profileId);
    if (waitMs !== null) {
      const minutes = Math.max(1, Math.ceil(waitMs / 60000));
      throw new HttpException(
        {
          message: `Você já criou vários pets com IA. Tente de novo em ${minutes} min.`,
          code: 'AI_RATE_LIMIT',
          retryAfterMinutes: minutes,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const look = await this.generator.generate({
        species: dto.species,
        description: dto.description.trim(),
      });
      return {
        look: {
          primaryColor: look.primaryColor,
          secondaryColor: look.secondaryColor,
          pattern: look.pattern,
          eyeType: look.eyeType,
          mouthType: look.mouthType,
        },
        suggestedName: look.name,
      };
    } catch (error) {
      if (error instanceof PetGenerationError) {
        this.logger.warn(`Geração de pet rejeitada (${error.reason})`);
        throw new HttpException(
          {
            message:
              'Não consegui criar um pet com essa descrição. Tente descrever de outro jeito.',
            code: 'AI_REJECTED',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      this.logger.error(
        'Falha ao chamar o modelo',
        error instanceof Error ? error.stack : String(error),
      );
      throw new HttpException(
        {
          message: 'A IA não respondeu agora. Tente de novo em instantes.',
          code: 'AI_FAILED',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
