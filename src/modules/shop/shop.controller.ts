import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { EquipDto } from './dto/equip.dto';
import { ShopService, ShopView } from './shop.service';

@UseGuards(JwtAuthGuard)
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ShopView> {
    return this.shop.list(user.profileId);
  }

  @Post('items/:id/buy')
  buy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ShopView> {
    return this.shop.buy(user.profileId, id);
  }

  @Put('loadout')
  @HttpCode(200)
  equip(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EquipDto,
  ): Promise<ShopView> {
    return this.shop.equip(user.profileId, dto);
  }
}
