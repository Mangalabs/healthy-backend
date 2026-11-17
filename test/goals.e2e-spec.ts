import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/database/prisma.service';
import { addDaysToKey } from './../src/common/utils/date.util';

/**
 * Integração contra o Postgres local: metas do dia, XP com teto, moedas,
 * dia de descanso, piso de peso e degraus de meta. Cada teste cria o seu usuário
 * e apaga tudo no fim.
 */
describe('Metas, XP e moedas (e2e)', () => {
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
    const email = `e2e.${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
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

  const now = () => new Date().toISOString();
  const status = async (s: Session) =>
    (await get(s, '/gamification/status').expect(200)).body.data;
  const today = async (s: Session) =>
    (await get(s, '/goals/today').expect(200)).body.data;
  const coinReasons = async (s: Session): Promise<string[]> =>
    (
      (await get(s, '/coins').expect(200)).body.data.history as {
        reason: string;
      }[]
    ).map((e) => e.reason);

  async function drink(s: Session, ml: number) {
    await post(s, '/hydration', { amountMl: ml, loggedAt: now() }).expect(201);
  }

  describe('perfil', () => {
    it('salva altura, objetivo, módulos e peso meta, e devolve números', async () => {
      const s = await signUp('perfil');
      const res = await patch(s, '/profile', {
        heightCm: 165,
        bodyGoal: 'LOSE',
        targetWeightKg: 60.5,
        trackedModules: ['HYDRATION', 'WEIGHT'],
        bodyMirror: false,
        setupCompleted: true,
      }).expect(200);
      expect(res.body.data).toMatchObject({
        heightCm: 165,
        bodyGoal: 'LOSE',
        targetWeightKg: 60.5,
        healthFloorBmi: 18.5,
        trackedModules: ['HYDRATION', 'WEIGHT'],
        bodyMirror: false,
        setupCompleted: true,
      });
    });

    it('recusa valores fora do limite', async () => {
      const s = await signUp('perfil-invalido');
      await patch(s, '/profile', { heightCm: 50 }).expect(400);
      await patch(s, '/profile', { trackedModules: ['XYZ'] }).expect(400);
      await patch(s, '/profile', { bodyGoal: 'EMAGRECER' }).expect(400);
      await patch(s, '/profile', { healthFloorBmi: 12 }).expect(400);
    });

    it('apaga a altura com null', async () => {
      const s = await signUp('perfil-null');
      await patch(s, '/profile', { heightCm: 170 }).expect(200);
      const res = await patch(s, '/profile', { heightCm: null }).expect(200);
      expect(res.body.data.heightCm).toBeNull();
    });
  });

  describe('meta do dia, XP e moedas', () => {
    it('monta as tarefas pelos módulos escolhidos', async () => {
      const s = await signUp('modulos');
      await patch(s, '/profile', {
        trackedModules: ['HYDRATION', 'EXERCISE'],
        setupCompleted: true,
      }).expect(200);
      const state = await today(s);
      expect(state.tasks.map((t: { key: string }) => t.key)).toEqual([
        'hydration',
        'exercise',
      ]);
      expect(state.complete).toBe(false);
      expect(state.minimumMet).toBe(false);
    });

    it('conta apenas os módulos ativos: conta antiga acompanha tudo, exceto refeições', async () => {
      const s = await signUp('conta-antiga');
      const state = await today(s);
      expect(state.modules).toEqual([
        'MEDICATION',
        'HYDRATION',
        'EXERCISE',
        'WEIGHT',
      ]);
    });

    it('um gole não conta o dia; fechar uma tarefa conta a sequência e paga moedas', async () => {
      const s = await signUp('constancia');
      await patch(s, '/profile', {
        trackedModules: ['HYDRATION', 'EXERCISE'],
        setupCompleted: true,
      }).expect(200);

      await drink(s, 500);
      let state = await today(s);
      expect(state.tasks[0]).toMatchObject({ current: 500, done: false });
      expect(state.minimumMet).toBe(false);
      expect(state.streakDays).toBe(0);

      await post(s, '/exercise', {
        didExercise: true,
        durationMinutes: 30,
        loggedAt: now(),
      }).expect(201);
      state = await today(s);
      expect(state.minimumMet).toBe(true);
      expect(state.complete).toBe(false);
      expect(state.streakDays).toBe(1);
      expect(await coinReasons(s)).toEqual(['task_exercise']);

      await drink(s, 1500);
      state = await today(s);
      expect(state.complete).toBe(true);
      const reasons = await coinReasons(s);
      expect(reasons).toEqual(
        expect.arrayContaining(['task_exercise', 'task_hydration', 'daily_goal']),
      );
      // 5 (exercício) + 3 (água) + 10 (meta do dia)
      expect(state.coins).toBe(18);
      // 10 + 50 + 10 + bônus de 20 pela meta do dia
      expect((await status(s)).totalXp).toBe(90);

      // registrar de novo no mesmo dia não paga outra vez
      await drink(s, 250);
      expect((await today(s)).coins).toBe(18);
      expect((await status(s)).streakDays).toBe(1);
    });

    it('o XP do dia tem teto e o bônus da meta fica de fora', async () => {
      const s = await signUp('teto');
      await patch(s, '/profile', {
        trackedModules: ['MEDICATION', 'EXERCISE'],
        setupCompleted: true,
      }).expect(200);

      for (let i = 0; i < 9; i++) {
        const med = await post(s, '/medications', {
          name: `Remédio ${i}`,
          dosage: '1 comprimido',
          stockCount: 5,
        }).expect(201);
        await post(s, `/medications/${med.body.data.id as string}/log`, {
          status: 'TAKEN',
          loggedAt: now(),
        }).expect(201);
      }
      // 9 x 15 = 135 XP; o exercício (50) só cabe em 15 até o teto de 150
      await post(s, '/exercise', {
        didExercise: true,
        loggedAt: now(),
      }).expect(201);
      const state = await today(s);
      expect(state.complete).toBe(true);
      // 150 do teto + 20 do bônus de fechar a meta do dia
      expect((await status(s)).totalXp).toBe(170);
    });
  });

  describe('dia de descanso', () => {
    it('protege a sequência e vale uma vez por semana', async () => {
      const s = await signUp('descanso');
      await patch(s, '/profile', {
        trackedModules: ['HYDRATION'],
        setupCompleted: true,
      }).expect(200);

      const first = await post(s, '/goals/rest-day').expect(201);
      expect(first.body.data.restDay).toBe(true);
      // repetir no mesmo dia não falha nem duplica
      await post(s, '/goals/rest-day').expect(201);
      expect(
        await prisma.restDay.count({ where: { profileId: s.profileId } }),
      ).toBe(1);
    });

    it('não deixa descansar depois de cumprir a meta', async () => {
      const s = await signUp('descanso-feito');
      await patch(s, '/profile', {
        trackedModules: ['HYDRATION'],
        setupCompleted: true,
      }).expect(200);
      await drink(s, 2000);
      await post(s, '/goals/rest-day').expect(400);
    });

    it('um dia de descanso entre dois dias ativos mantém a sequência', async () => {
      const s = await signUp('descanso-gap');
      await patch(s, '/profile', {
        trackedModules: ['HYDRATION'],
        setupCompleted: true,
      }).expect(200);
      const todayKey = (await today(s)).dayKey as string;

      await prisma.profile.update({
        where: { id: s.profileId },
        data: {
          streakDays: 5,
          maxStreakDays: 5,
          lastActiveDate: addDaysToKey(todayKey, -2),
        },
      });
      // sem descanso ontem, a sequência já quebrou
      expect((await status(s)).streakDays).toBe(0);

      await prisma.restDay.create({
        data: { profileId: s.profileId, dayKey: addDaysToKey(todayKey, -1) },
      });
      expect((await status(s)).streakDays).toBe(5);

      await drink(s, 2000);
      expect((await status(s)).streakDays).toBe(6);
    });
  });

  describe('metas de peso', () => {
    async function withWeight(label: string, heightCm: number, kg: number) {
      const s = await signUp(label);
      await patch(s, '/profile', {
        heightCm,
        trackedModules: ['WEIGHT'],
        setupCompleted: true,
      }).expect(200);
      await post(s, '/weight', { weightKg: kg, loggedAt: now() }).expect(201);
      return s;
    }

    it('exige peso registrado para criar a meta', async () => {
      const s = await signUp('sem-peso');
      await post(s, '/goals', { type: 'WEIGHT', targetValue: 60 }).expect(400);
    });

    it('alvo abaixo do piso pede confirmação e a recompensa para no piso', async () => {
      const s = await withWeight('piso', 160, 60);
      // 160 cm x IMC 18,5 = 47,36 kg
      const refused = await post(s, '/goals', {
        type: 'WEIGHT',
        targetValue: 45,
      }).expect(422);
      expect(refused.body.code).toBe('TARGET_BELOW_FLOOR');
      expect(refused.body.details.floorKg).toBe(47.36);

      const created = await post(s, '/goals', {
        type: 'WEIGHT',
        targetValue: 45,
        confirmBelowFloor: true,
      }).expect(201);
      expect(created.body.data).toMatchObject({
        direction: 'LOSE',
        targetValue: 45,
        rewardTarget: 47.36,
        belowFloor: true,
      });
    });

    it('premia um degrau por semana, a meta final uma vez, e nada por ir além', async () => {
      const s = await withWeight('degraus', 160, 60);
      const goal = (
        await post(s, '/goals', {
          type: 'WEIGHT',
          targetValue: 50,
        }).expect(201)
      ).body.data;
      // 60 -> 50: degraus em 58, 56, 54, 52
      expect(
        goal.checkpoints.map((c: { value: number }) => c.value),
      ).toEqual([58, 56, 54, 52]);

      await post(s, '/weight', { weightKg: 57.9, loggedAt: now() }).expect(201);
      expect(
        (await coinReasons(s)).filter((r) => r === 'weight_checkpoint'),
      ).toHaveLength(1);

      // outro degrau logo em seguida: ainda não, só depois de uma semana
      await post(s, '/weight', { weightKg: 55.9, loggedAt: now() }).expect(201);
      expect(
        (await coinReasons(s)).filter((r) => r === 'weight_checkpoint'),
      ).toHaveLength(1);

      // uma semana depois, o próximo degrau (56) é premiado
      const stored = await prisma.goal.findUniqueOrThrow({
        where: { id: goal.id as string },
      });
      const aged = (
        stored.checkpoints as { value: number; achievedAt: string | null }[]
      ).map((c) =>
        c.achievedAt
          ? {
              ...c,
              achievedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
            }
          : c,
      );
      await prisma.goal.update({
        where: { id: goal.id as string },
        data: { checkpoints: aged },
      });
      await post(s, '/weight', { weightKg: 55.8, loggedAt: now() }).expect(201);
      expect(
        (await coinReasons(s)).filter((r) => r === 'weight_checkpoint'),
      ).toHaveLength(2);

      // chegou no alvo: prêmio final, meta concluída e degraus restantes fechados
      await post(s, '/weight', { weightKg: 49.5, loggedAt: now() }).expect(201);
      const reasons = await coinReasons(s);
      expect(reasons.filter((r) => r === 'weight_target')).toHaveLength(1);
      expect(
        reasons.filter((r) => r === 'weight_checkpoint'),
      ).toHaveLength(2);
      const done = (await get(s, '/goals').expect(200)).body.data[0];
      expect(done.status).toBe('ACHIEVED');

      // passar do alvo não rende mais nada
      await post(s, '/weight', { weightKg: 44, loggedAt: now() }).expect(201);
      expect(
        (await coinReasons(s)).filter((r) => r === 'weight_target'),
      ).toHaveLength(1);
    });

    it('ganhar peso (recuperação) também vira meta cumprida', async () => {
      const s = await withWeight('ganho', 165, 45);
      const goal = (
        await post(s, '/goals', { type: 'WEIGHT', targetValue: 50 }).expect(201)
      ).body.data;
      expect(goal.direction).toBe('GAIN');
      expect(goal.belowFloor).toBe(false);
      await post(s, '/weight', { weightKg: 50.2, loggedAt: now() }).expect(201);
      expect(await coinReasons(s)).toContain('weight_target');
    });

    it('perder peso nunca paga a quem já estava abaixo do alvo ao criar', async () => {
      const s = await withWeight('manter', 170, 70);
      const goal = (
        await post(s, '/goals', { type: 'WEIGHT', targetValue: 70.2 }).expect(
          201,
        )
      ).body.data;
      expect(goal.direction).toBe('MAINTAIN');
      await post(s, '/weight', { weightKg: 70, loggedAt: now() }).expect(201);
      expect(await coinReasons(s)).not.toContain('weight_target');
      expect(await coinReasons(s)).not.toContain('weight_checkpoint');
    });
  });

  describe('treinos por semana', () => {
    it('paga a meta semanal uma vez por semana', async () => {
      const s = await signUp('semanal');
      await patch(s, '/profile', {
        trackedModules: ['EXERCISE'],
        setupCompleted: true,
      }).expect(200);
      await post(s, '/goals', { type: 'WEEKLY_WORKOUTS', targetValue: 1 }).expect(
        201,
      );
      await post(s, '/exercise', {
        didExercise: true,
        loggedAt: now(),
      }).expect(201);
      expect(
        (await coinReasons(s)).filter((r) => r === 'weekly_workouts'),
      ).toHaveLength(1);
      await post(s, '/exercise', {
        didExercise: true,
        durationMinutes: 40,
        loggedAt: now(),
      }).expect(201);
      expect(
        (await coinReasons(s)).filter((r) => r === 'weekly_workouts'),
      ).toHaveLength(1);
    });

    it('recusa mais de 7 treinos por semana', async () => {
      const s = await signUp('semanal-invalido');
      await post(s, '/goals', { type: 'WEEKLY_WORKOUTS', targetValue: 9 }).expect(
        400,
      );
    });
  });

  it('exige login', async () => {
    await http().get('/api/v1/goals/today').expect(401);
    await http().get('/api/v1/coins').expect(401);
  });
});
