import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CoinsService } from '../gamification/coins.service';
import {
  SHOP_CATALOG,
  ShopCategory,
  ShopItemDef,
  findShopItem,
} from './shop.catalog';
import { EquipDto } from './dto/equip.dto';

export type Loadout = Partial<Record<ShopCategory, string>>;

export interface ShopItemView extends ShopItemDef {
  owned: boolean;
  equipped: boolean;
}

export interface ShopView {
  coins: number;
  items: ShopItemView[];
  loadout: Loadout;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
  ) {}

  async list(profileId: string): Promise<ShopView> {
    const [profile, owned] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({
        where: { id: profileId },
        select: { coins: true, petLoadout: true },
      }),
      this.ownedIds(profileId),
    ]);
    const loadout = this.cleanLoadout(profile.petLoadout, owned);
    return {
      coins: profile.coins,
      loadout,
      items: SHOP_CATALOG.map((item) => ({
        ...item,
        owned: owned.has(item.id),
        equipped: loadout[item.category] === item.id,
      })),
    };
  }

  /** Compra e entrega o item juntos: se faltar saldo, nada é cobrado nem entregue. */
  async buy(profileId: string, itemId: string): Promise<ShopView> {
    const item = findShopItem(itemId);
    if (!item) throw new NotFoundException('Item não encontrado.');

    if ((await this.ownedIds(profileId)).has(item.id)) {
      throw new ConflictException('Você já tem este item.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.petItem.create({ data: { profileId, itemId: item.id } });
        await this.coins.spend(
          profileId,
          item.price,
          'shop_purchase',
          item.id,
          tx,
        );
      });
    } catch (error) {
      // Dois toques seguidos: a segunda compra bate na chave única.
      if (isUniqueViolation(error)) {
        throw new ConflictException('Você já tem este item.');
      }
      throw error;
    }
    return this.list(profileId);
  }

  /** Veste (ou tira, com `itemId: null`) um item que a pessoa já comprou. */
  async equip(profileId: string, dto: EquipDto): Promise<ShopView> {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
      select: { petLoadout: true },
    });
    const owned = await this.ownedIds(profileId);
    const loadout = this.cleanLoadout(profile.petLoadout, owned);

    if (dto.itemId === null || dto.itemId === undefined) {
      delete loadout[dto.category];
    } else {
      const item = findShopItem(dto.itemId);
      if (!item) throw new NotFoundException('Item não encontrado.');
      if (item.category !== dto.category) {
        throw new BadRequestException('Esse item é de outra categoria.');
      }
      if (!owned.has(item.id)) {
        throw new BadRequestException('Você ainda não tem esse item.');
      }
      loadout[item.category] = item.id;
    }

    await this.prisma.profile.update({
      where: { id: profileId },
      data: { petLoadout: loadout as Prisma.InputJsonObject },
    });
    return this.list(profileId);
  }

  private async ownedIds(profileId: string): Promise<Set<string>> {
    const rows = await this.prisma.petItem.findMany({
      where: { profileId },
      select: { itemId: true },
    });
    return new Set(rows.map((r) => r.itemId));
  }

  /** Só fica o que existe no catálogo, na categoria certa e que a pessoa tem. */
  private cleanLoadout(raw: Prisma.JsonValue, owned: Set<string>): Loadout {
    const loadout: Loadout = {};
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return loadout;
    }
    for (const [category, itemId] of Object.entries(raw)) {
      if (typeof itemId !== 'string') continue;
      const item = findShopItem(itemId);
      if (item && item.category === category && owned.has(item.id)) {
        loadout[item.category] = item.id;
      }
    }
    return loadout;
  }
}
