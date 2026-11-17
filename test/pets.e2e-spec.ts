import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/database/prisma.service';
import {
  PET_GENERATOR,
  PetGenerationError,
  PetGenerator,
} from './../src/modules/pets/pet-generator';
import { PetLook } from './../src/modules/pets/pet-look';

/**
 * Criação de pet com IA. O modelo é trocado por um falso: aqui testamos o que
 * é nosso (acesso, validação, limite de uso, mapeamento de erros), não a API.
 */
describe('Pets com IA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];

  const LOOK: PetLook = {
    primaryColor: '#F4A6B8',
    secondaryColor: '#FCE3EA',
    pattern: 'spots',
    eyeType: 'lashes',
    mouthType: 'smile',
    name: 'Algodão',
  };

  const generator: {
    available: boolean;
    next: () => Promise<PetLook>;
    calls: Array<{ species: string; description: string }>;
    generate: PetGenerator['generate'];
  } = {
    available: true,
    calls: [],
    next: () => Promise.resolve(LOOK),
    generate(input) {
      this.calls.push(input);
      return this.next();
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PET_GENERATOR)
      .useValue(generator)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    generator.available = true;
    generator.calls = [];
    generator.next = () => Promise.resolve(LOOK);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function signUp(label: string): Promise<string> {
    const email = `e2e.pets.${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Teste12345', name: `E2E ${label}` })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  const generate = (token: string, body: object) =>
    http()
      .post('/api/v1/pets/generate')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('exige login', async () => {
    await http().get('/api/v1/pets/capabilities').expect(401);
    await http()
      .post('/api/v1/pets/generate')
      .send({ species: 'CAT', description: 'gatinho laranja' })
      .expect(401);
  });

  it('informa se a IA está disponível', async () => {
    const token = await signUp('caps');
    const on = await http()
      .get('/api/v1/pets/capabilities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(on.body.data).toEqual({ aiGeneration: true });

    generator.available = false;
    const off = await http()
      .get('/api/v1/pets/capabilities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(off.body.data).toEqual({ aiGeneration: false });
  });

  it('gera a aparência e sugere um nome', async () => {
    const token = await signUp('ok');
    const res = await generate(token, {
      species: 'CAT',
      description: '  gatinha rosa com cílios  ',
    }).expect(201);

    expect(res.body.data).toEqual({
      look: {
        primaryColor: '#F4A6B8',
        secondaryColor: '#FCE3EA',
        pattern: 'spots',
        eyeType: 'lashes',
        mouthType: 'smile',
      },
      suggestedName: 'Algodão',
    });
    expect(generator.calls).toEqual([
      { species: 'CAT', description: 'gatinha rosa com cílios' },
    ]);
  });

  it('valida espécie e descrição', async () => {
    const token = await signUp('validation');
    await generate(token, { species: 'DRAGON', description: 'verde' }).expect(
      400,
    );
    await generate(token, { species: 'CAT', description: 'ab' }).expect(400);
    await generate(token, { species: 'CAT', description: 'x'.repeat(201) }).expect(
      400,
    );
    await generate(token, { species: 'CAT' }).expect(400);
    expect(generator.calls).toHaveLength(0);
  });

  it('responde 503 com código claro quando a IA está desligada', async () => {
    const token = await signUp('off');
    generator.available = false;
    const res = await generate(token, {
      species: 'DOG',
      description: 'cachorro caramelo',
    }).expect(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect(generator.calls).toHaveLength(0);
  });

  it('limita o uso por pessoa sem afetar as outras', async () => {
    const heavy = await signUp('heavy');
    const other = await signUp('other');
    const body = { species: 'OTTER', description: 'lontra azul' };

    for (let i = 0; i < 5; i++) {
      await generate(heavy, body).expect(201);
    }
    const blocked = await generate(heavy, body).expect(429);
    expect(blocked.body.code).toBe('AI_RATE_LIMIT');
    expect(blocked.body.details.retryAfterMinutes).toBeGreaterThan(0);
    expect(generator.calls).toHaveLength(5);

    await generate(other, body).expect(201);
  });

  it('descrição recusada pelo modelo vira 422 amigável', async () => {
    const token = await signUp('refused');
    generator.next = () =>
      Promise.reject(new PetGenerationError('refused', 'recusou'));
    const res = await generate(token, {
      species: 'CAT',
      description: 'qualquer coisa',
    }).expect(422);
    expect(res.body.code).toBe('AI_REJECTED');
  });

  it('falha do provedor vira 502 sem vazar detalhes', async () => {
    const token = await signUp('down');
    generator.next = () =>
      Promise.reject(new Error('401 invalid x-api-key sk-ant-secret'));
    const res = await generate(token, {
      species: 'CAT',
      description: 'qualquer coisa',
    }).expect(502);
    expect(res.body.code).toBe('AI_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('sk-ant');
  });
});
