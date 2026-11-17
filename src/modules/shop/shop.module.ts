import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [GamificationModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
