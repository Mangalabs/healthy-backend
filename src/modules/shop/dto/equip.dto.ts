import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SHOP_CATEGORIES, type ShopCategory } from '../shop.catalog';

export class EquipDto {
  @IsIn(SHOP_CATEGORIES, { message: 'Categoria inválida.' })
  category: ShopCategory;

  /** `null` (ou ausente) tira o que estiver vestido na categoria. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  itemId?: string | null;
}
