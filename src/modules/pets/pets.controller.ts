import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { GeneratePetDto } from './dto/generate-pet.dto';
import { GeneratedPet, PetsService } from './pets.service';

@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  /** O app só mostra "Criar com IA" quando isto devolve `aiGeneration: true`. */
  @Get('capabilities')
  capabilities(): { aiGeneration: boolean } {
    return this.pets.capabilities();
  }

  @Post('generate')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GeneratePetDto,
  ): Promise<GeneratedPet> {
    return this.pets.generate(user.profileId, dto);
  }
}
