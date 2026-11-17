import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Refeições: só a marcação de que a pessoa comeu (sem calorias), uma por tipo
 * por dia, ligada à meta do dia e ao XP.
 */
describe('Refeições (e2e)', () => {
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

  async function signUp(label: string): Promise<Session> {
    const email = `e2e.meals.${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Teste12345', name: `E2E ${label}` })
      .expect(201);
    return {
      token: res.body.data.accessToken as string,
      profileId: res.body.data.user.profile.id as string,
    };
  }

  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
  const get = (s: Session, path: string) =>
    http().get(`/api/v1${path}`).set(auth(s));
  const post = (s: Session, path: string, body: object = {}) =>
    http().post(`/api/v1${path}`).set(auth(s)).send(body);
  const patch = (s: Session, path: string, body: object) =>
    http().patch(`/api/v1${path}`).set(auth(s)).send(body);
  const del = (s: Session, path: string) =>
    http().delete(`/api/v1${path}`).set(auth(s));

  const now = () => new Date().toISOString();
  const eat = (s: Session, mealType: string, loggedAt = now()) =>
    post(s, '/meals', { mealType, loggedAt });
  const today = async (s: Session) =>
    (await get(s, '/goals/today').expect(200)).body.data;
  const totalXp = async (s: Session): Promise<number> =>
    (await get(s, '/gamification/status').expect(200)).body.data.totalXp;
  const coinReasons = async (s: Session): Promise<string[]> =>
    (
      (await get(s, '/coins').expect(200)).body.data.history as {
        reason: string;
      }[]
    ).map((e) => e.reason);
  const enableMeals = (s: Session) =>
    patch(s, '/profile', {
      trackedModules: ['MEALS'],
      setupCompleted: true,
    }).expect(200);

  it('exige login', async () => {
    await http().post('/api/v1/meals').send({}).expect(401);
    await http().get('/api/v1/meals/daily').expect(401);
  });

  it('marca a refeição e lista as de hoje, sem guardar nada além da presença', async () => {
    const s = await signUp('marcar');
    const res = await eat(s, 'BREAKFAST').expect(201);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'createdAt',
      'id',
      'loggedAt',
      'mealType',
      'profileId',
    ]);

    await eat(s, 'LUNCH').expect(201);
    const daily = (await get(s, '/meals/daily').expect(200)).body.data;
    expect(daily.map((m: { mealType: string }) => m.mealType)).toEqual([
      'BREAKFAST',
      'LUNCH',
    ]);
  });

  it('recusa refeição inválida e data inválida', async () => {
    const s = await signUp('invalida');
    await eat(s, 'PIZZA').expect(400);
    await post(s, '/meals', { mealType: 'LUNCH', loggedAt: 'ontem' }).expect(400);
    await post(s, '/meals', { loggedAt: now() }).expect(400);
  });

  it('marcar o mesmo tipo de novo no dia não duplica nem dá XP em dobro', async () => {
    const s = await signUp('idempotente');
    const first = (await eat(s, 'DINNER').expect(201)).body.data;
    const xp = await totalXp(s);
    expect(xp).toBe(8);

    const again = (await eat(s, 'DINNER').expect(201)).body.data;
    expect(again.id).toBe(first.id);
    expect(await totalXp(s)).toBe(xp);
    expect(
      (await get(s, '/meals/daily').expect(200)).body.data,
    ).toHaveLength(1);
  });

  it('o mesmo tipo em outro dia é uma nova marcação e não entra no dia de hoje', async () => {
    const s = await signUp('ontem');
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    await eat(s, 'LUNCH', yesterday).expect(201);
    expect((await get(s, '/meals/daily').expect(200)).body.data).toHaveLength(0);
    await eat(s, 'LUNCH').expect(201);
    expect((await get(s, '/meals/daily').expect(200)).body.data).toHaveLength(1);
    const history = (await get(s, '/meals/history').expect(200)).body.data;
    expect(history).toHaveLength(2);
  });

  describe('meta do dia', () => {
    it('só aparece a tarefa de refeições para quem acompanha refeições', async () => {
      const s = await signUp('sem-modulo');
      await patch(s, '/profile', {
        trackedModules: ['HYDRATION'],
        setupCompleted: true,
      }).expect(200);
      await eat(s, 'BREAKFAST').expect(201);
      const keys = (await today(s)).tasks.map((t: { key: string }) => t.key);
      expect(keys).toEqual(['hydration']);
    });

    it('conta tipos distintos, fecha com três e paga moedas uma vez', async () => {
      const s = await signUp('meta');
      await enableMeals(s);

      let state = await today(s);
      expect(state.tasks).toEqual([
        { key: 'meals', current: 0, target: 3, done: false },
      ]);

      await eat(s, 'BREAKFAST').expect(201);
      await eat(s, 'LUNCH').expect(201);
      state = await today(s);
      expect(state.tasks[0]).toMatchObject({ current: 2, done: false });
      expect(state.complete).toBe(false);
      expect(state.minimumMet).toBe(false);

      await eat(s, 'SNACK').expect(201);
      state = await today(s);
      expect(state.tasks[0]).toMatchObject({ current: 3, done: true });
      expect(state.complete).toBe(true);
      expect(state.streakDays).toBe(1);

      const reasons = await coinReasons(s);
      expect(reasons).toEqual(
        expect.arrayContaining(['task_meals', 'daily_goal']),
      );
      // 3 (refeições) + 10 (meta do dia)
      expect(state.coins).toBe(13);
    });

    it('desfazer uma marcação reabre a tarefa, mas moedas já pagas ficam e não se repetem', async () => {
      const s = await signUp('desfazer');
      await enableMeals(s);
      const ids: string[] = [];
      for (const type of ['BREAKFAST', 'LUNCH', 'DINNER']) {
        ids.push((await eat(s, type).expect(201)).body.data.id as string);
      }
      expect((await today(s)).coins).toBe(13);

      await del(s, `/meals/${ids[2]}`).expect(200);
      let state = await today(s);
      expect(state.tasks[0]).toMatchObject({ current: 2, done: false });
      expect(state.coins).toBe(13);

      await eat(s, 'DINNER').expect(201);
      state = await today(s);
      expect(state.complete).toBe(true);
      expect(state.coins).toBe(13);
    });
  });

  describe('remoção', () => {
    it('só a própria pessoa desfaz a sua marcação', async () => {
      const a = await signUp('dona');
      const b = await signUp('outra');
      const meal = (await eat(a, 'LUNCH').expect(201)).body.data;

      await del(b, `/meals/${meal.id}`).expect(404);
      expect((await get(a, '/meals/daily').expect(200)).body.data).toHaveLength(
        1,
      );

      await del(a, `/meals/${meal.id}`).expect(200);
      expect((await get(a, '/meals/daily').expect(200)).body.data).toHaveLength(
        0,
      );
      await del(a, `/meals/${meal.id}`).expect(404);
      await del(a, '/meals/nao-e-uuid').expect(400);
    });
  });

  it('o histórico de tarefas mostra as refeições do dia', async () => {
    const s = await signUp('historico');
    await enableMeals(s);
    await eat(s, 'BREAKFAST').expect(201);
    const res = await get(s, '/goals/history?days=2').expect(200);
    const last = res.body.data.days[1];
    expect(last.tasks).toEqual([
      { key: 'meals', current: 1, target: 3, done: false },
    ]);
    expect(last.anyHabit).toBe(true);
  });
});
