/**
 * Catálogo da loja. Só entra aqui o que é enfeite: cabelo, roupa, "pele" (cor
 * especial da pelagem) e cenário. O corpo do pet (volume, músculos) NUNCA é
 * vendido: ele espelha a vida real e não tem preço.
 *
 * Preços em moedas, que só vêm de metas cumpridas. O app desenha cada item pelo
 * `id`; nomes e preços vêm daqui para poderem mudar sem lançar nova versão.
 */
export const SHOP_CATEGORIES = [
  'HAIR',
  'OUTFIT',
  'SKIN',
  'BACKGROUND',
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export interface ShopItemDef {
  id: string;
  category: ShopCategory;
  name: string;
  price: number;
}

export const SHOP_CATALOG: readonly ShopItemDef[] = [
  { id: 'hair_tuft', category: 'HAIR', name: 'Topete', price: 15 },
  { id: 'hair_bangs', category: 'HAIR', name: 'Franja', price: 20 },
  { id: 'hair_bun', category: 'HAIR', name: 'Coque', price: 25 },
  { id: 'hair_pigtails', category: 'HAIR', name: 'Maria-chiquinha', price: 30 },

  { id: 'outfit_bandana', category: 'OUTFIT', name: 'Bandana', price: 20 },
  { id: 'outfit_bowtie', category: 'OUTFIT', name: 'Gravata borboleta', price: 25 },
  { id: 'outfit_collar', category: 'OUTFIT', name: 'Gola de suéter', price: 30 },
  { id: 'outfit_cape', category: 'OUTFIT', name: 'Capa de herói', price: 40 },

  { id: 'skin_candy', category: 'SKIN', name: 'Algodão-doce', price: 50 },
  { id: 'skin_gold', category: 'SKIN', name: 'Dourado', price: 60 },
  { id: 'skin_galaxy', category: 'SKIN', name: 'Galáxia', price: 80 },

  { id: 'bg_clouds', category: 'BACKGROUND', name: 'Nuvens', price: 25 },
  { id: 'bg_meadow', category: 'BACKGROUND', name: 'Campinho', price: 30 },
  { id: 'bg_sunset', category: 'BACKGROUND', name: 'Pôr do sol', price: 30 },
  { id: 'bg_night', category: 'BACKGROUND', name: 'Noite estrelada', price: 40 },
];

export function findShopItem(id: string): ShopItemDef | undefined {
  return SHOP_CATALOG.find((item) => item.id === id);
}
