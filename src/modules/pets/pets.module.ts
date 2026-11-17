import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../../config/app-config.service';
import {
  AnthropicPetGenerator,
  DEFAULT_PET_MODEL,
} from './anthropic-pet-generator';
import { PET_GENERATOR } from './pet-generator';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';

@Module({
  controllers: [PetsController],
  providers: [
    PetsService,
    {
      provide: PET_GENERATOR,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const apiKey = config.anthropicApiKey;
        // Sem chave o app continua funcionando; só some a opção "Criar com IA".
        const client = apiKey
          ? new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 })
          : null;
        return new AnthropicPetGenerator(
          client,
          config.petAiModel ?? DEFAULT_PET_MODEL,
        );
      },
    },
  ],
})
export class PetsModule {}
