import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/database/prisma.service';
import {
  SHOP_CATALOG,
  SHOP_CATEGORIES,
} from './../src/modules/shop/shop.catalog';

/**
 * Loja de moedas: só enfeites, preço no servidor, compra e entrega juntas,
 * sem comprar duas vezes e sem vestir o que não se tem.
 */
describe('Loja (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  interface Session {
    token: string;
    profileId: string;
  }

  async function signUp(label: string, coins = 0): Promise<Session> {
    const email = `e2e.shop.${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Teste12345', name: `E2E ${label}` })
      .expect(201);
    const session = {
      token: res.body.data.accessToken as string,
      profileId: res.body.data.user.profile.id as string,
    };
    if (coins > 0) {
      await prisma.profile.update({
        where: { id: session.profileId },
        data: { coins },
      });
    }
    return session;
  }

  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
  const list = (s: Session) => http().get('/api/v1/shop').set(auth(s));
  const buy = (s: Session, id: string) =>
    http().post(`/api/v1/shop/items/${id}/buy`).set(auth(s));
  const equip = (s: Session, body: object) =>
    http().put('/api/v1/shop/loadout').set(auth(s)).send(body);

  const price = (id: string) => SHOP_CATALOG.find((i) => i.id === id)!.price;

  describe('catálogo', () => {
    it('só vende enfeites: nada de corpo, volume ou músculos', () => {
      expect([...SHOP_CATEGORIES].sort()).toEqual([
        'BACKGROUND',
        'HAIR',
        'OUTFIT',
        'SKIN',
      ]);
      const ids = SHOP_CATALOG.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const item of SHOP_CATALOG) {
        expect(SHOP_CATEGORIES).toContain(item.category);
        expect(item.price).toBeGreaterThan(0);
        expect(item.id).not.toMatch(/body|muscle|weight|slim|fat|volume/i);
      }
    });
  });

  it('exige login', async () => {
    await http().get('/api/v1/shop').expect(401);
    await http().post('/api/v1/shop/items/hair_bun/buy').expect(401);
    await http().put('/api/v1/shop/loadout').send({}).expect(401);
  });

  it('lista o catálogo com saldo, nada comprado e nada vestido', async () => {
    const s = await signUp('list', 7);
    const res = await list(s).expect(200);
    expect(res.body.data.coins).toBe(7);
    expect(res.body.data.loadout).toEqual({});
    expect(res.body.data.items).toHaveLength(SHOP_CATALOG.length);
    expect(
      res.body.data.items.every(
        (i: { owned: boolean; equipped: boolean }) => !i.owned && !i.equipped,
      ),
    ).toBe(true);
  });

  it('sem saldo não cobra nem entrega', async () => {
    const s = await signUp('poor', price('hair_bun') - 1);
    const res = await buy(s, 'hair_bun').expect(400);
    expect(res.body.error).toBe('Moedas insuficientes.');

    const after = await list(s).expect(200);
    expect(after.body.data.coins).toBe(price('hair_bun') - 1);
    expect(
      after.body.data.items.find((i: { id: string }) => i.id === 'hair_bun')
        .owned,
    ).toBe(false);
    expect(await prisma.petItem.count({ where: { profileId: s.profileId } })).toBe(
      0,
    );
    expect(
      await prisma.coinEvent.count({
        where: { profileId: s.profileId, reason: 'shop_purchase' },
      }),
    ).toBe(0);
  });

  it('compra desconta o preço do servidor e registra no livro-razão', async () => {
    const s = await signUp('buy', 100);
    const res = await buy(s, 'outfit_cape').expect(201);

    expect(res.body.data.coins).toBe(100 - price('outfit_cape'));
    const item = res.body.data.items.find(
      (i: { id: string }) => i.id === 'outfit_cape',
    );
    expect(item).toMatchObject({ owned: true, equipped: false });

    const event = await prisma.coinEvent.findFirstOrThrow({
      where: { profileId: s.profileId, reason: 'shop_purchase' },
    });
    expect(event.amount).toBe(-price('outfit_cape'));
    expect(event.refId).toBe('outfit_cape');
  });

  it('não deixa comprar o mesmo item duas vezes', async () => {
    const s = await signUp('twice', 200);
    await buy(s, 'hair_tuft').expect(201);
    const again = await buy(s, 'hair_tuft').expect(409);
    expect(again.body.error).toBe('Você já tem este item.');
    expect((await list(s)).body.data.coins).toBe(200 - price('hair_tuft'));
  });

  it('toques simultâneos cobram uma vez só', async () => {
    const s = await signUp('race', 200);
    const results = await Promise.all([
      buy(s, 'skin_candy'),
      buy(s, 'skin_candy'),
      buy(s, 'skin_candy'),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((c) => c === 201)).toHaveLength(1);
    expect(statuses.filter((c) => c === 409)).toHaveLength(2);
    expect((await list(s)).body.data.coins).toBe(200 - price('skin_candy'));
  });

  it('item inexistente é 404', async () => {
    const s = await signUp('missing', 500);
    await buy(s, 'body_slim').expect(404);
  });

  describe('vestir', () => {
    it('só veste o que comprou, na categoria certa', async () => {
      const s = await signUp('equip', 300);

      const notOwned = await equip(s, {
        category: 'HAIR',
        itemId: 'hair_bun',
      }).expect(400);
      expect(notOwned.body.error).toBe('Você ainda não tem esse item.');

      await buy(s, 'hair_bun').expect(201);
      await equip(s, { category: 'OUTFIT', itemId: 'hair_bun' }).expect(400);
      await equip(s, { category: 'HAIR', itemId: 'nao_existe' }).expect(404);
      await equip(s, { category: 'ROUPA', itemId: 'hair_bun' }).expect(400);

      const ok = await equip(s, { category: 'HAIR', itemId: 'hair_bun' }).expect(
        200,
      );
      expect(ok.body.data.loadout).toEqual({ HAIR: 'hair_bun' });
      expect(
        ok.body.data.items.find((i: { id: string }) => i.id === 'hair_bun')
          .equipped,
      ).toBe(true);
    });

    it('troca um item por outro da mesma categoria e tira com null', async () => {
      const s = await signUp('swap', 300);
      await buy(s, 'bg_clouds').expect(201);
      await buy(s, 'bg_night').expect(201);
      await buy(s, 'hair_bangs').expect(201);

      await equip(s, { category: 'BACKGROUND', itemId: 'bg_clouds' }).expect(200);
      await equip(s, { category: 'HAIR', itemId: 'hair_bangs' }).expect(200);
      const swapped = await equip(s, {
        category: 'BACKGROUND',
        itemId: 'bg_night',
      }).expect(200);
      expect(swapped.body.data.loadout).toEqual({
        BACKGROUND: 'bg_night',
        HAIR: 'hair_bangs',
      });

      const removed = await equip(s, {
        category: 'BACKGROUND',
        itemId: null,
      }).expect(200);
      expect(removed.body.data.loadout).toEqual({ HAIR: 'hair_bangs' });
      // O item continua comprado depois de tirado.
      expect(
        removed.body.data.items.find((i: { id: string }) => i.id === 'bg_night')
          .owned,
      ).toBe(true);
    });

    it('o perfil devolve o que está vestido, para o app desenhar o pet', async () => {
      const s = await signUp('profile', 100);
      await buy(s, 'skin_gold').expect(201);
      await equip(s, { category: 'SKIN', itemId: 'skin_gold' }).expect(200);

      const profile = await http()
        .get('/api/v1/profile')
        .set(auth(s))
        .expect(200);
      expect(profile.body.data.petLoadout).toEqual({ SKIN: 'skin_gold' });
      expect(profile.body.data.coins).toBe(100 - price('skin_gold'));
    });

    it('ignora item vestido que a pessoa não tem (dado corrompido)', async () => {
      const s = await signUp('corrupt', 0);
      await prisma.profile.update({
        where: { id: s.profileId },
        data: { petLoadout: { HAIR: 'hair_bun', OUTFIT: 'hair_bun', X: 1 } },
      });
      const res = await list(s).expect(200);
      expect(res.body.data.loadout).toEqual({});
    });
  });

  it('o piso de saúde e o corpo do pet continuam fora da loja', async () => {
    // Moedas nunca compram corpo: não existe rota nem categoria para isso.
    const s = await signUp('body', 1000);
    await equip(s, { category: 'BODY', itemId: 'muscle_max' }).expect(400);
    await buy(s, 'muscle_max').expect(404);
  });
});
