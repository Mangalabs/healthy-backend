import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

interface Row {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Prisma falso em memória, só com o que o serviço usa. */
function fakePrisma() {
  const rows: Row[] = [];
  let seq = 0;

  const matches = (row: Row, where: Record<string, any>) =>
    Object.entries(where).every(([key, cond]) => {
      const value = (row as any)[key];
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('lt' in cond) return value < cond.lt;
        return true;
      }
      return value === cond;
    });

  const refreshToken = {
    create: ({ data }: any) => {
      const row: Row = {
        id: `id-${++seq}`,
        usedAt: null,
        revokedAt: null,
        ...data,
      };
      rows.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: any) =>
      Promise.resolve(rows.find((r) => r.tokenHash === where.tokenHash) ?? null),
    updateMany: ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return Promise.resolve({ count: hit.length });
    },
    deleteMany: ({ where }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return Promise.resolve({ count: hit.length });
    },
  };

  return { prisma: { refreshToken } as any, rows };
}

describe('RefreshTokenService', () => {
  it('consome o token uma vez e devolve usuário e cadeia', async () => {
    const { prisma } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    const token = await service.issue('u1', 'f1');

    await expect(service.consume(token)).resolves.toEqual({
      userId: 'u1',
      familyId: 'f1',
    });
  });

  it('rejeita token desconhecido', async () => {
    const { prisma } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    await expect(service.consume('nao-existe')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token expirado', async () => {
    const { prisma, rows } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    const token = await service.issue('u1');
    rows[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.consume(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('replay de token já usado revoga a cadeia inteira', async () => {
    const { prisma, rows } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    const first = await service.issue('u1', 'f1');
    await service.consume(first);
    const second = await service.issue('u1', 'f1'); // token legítimo novo

    await expect(service.consume(first)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // O token novo também foi derrubado: o ladrão e o dono precisam logar.
    await expect(service.consume(second)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('logout revoga só a cadeia do token informado', async () => {
    const { prisma } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    const mine = await service.issue('u1', 'f1');
    const other = await service.issue('u1', 'f2');

    await service.revokeByToken(mine);

    await expect(service.consume(mine)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.consume(other)).resolves.toMatchObject({
      familyId: 'f2',
    });
  });

  it('logout com token desconhecido não falha', async () => {
    const { prisma } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    await expect(service.revokeByToken('x')).resolves.toBeUndefined();
  });

  it('trocar a senha revoga todas as sessões do usuário', async () => {
    const { prisma } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    const a = await service.issue('u1', 'f1');
    const b = await service.issue('u1', 'f2');
    const outro = await service.issue('u2', 'f3');

    await service.revokeAllForUser('u1');

    await expect(service.consume(a)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.consume(b)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.consume(outro)).resolves.toMatchObject({ userId: 'u2' });
  });

  it('emitir um token apaga os vencidos do mesmo usuário', async () => {
    const { prisma, rows } = fakePrisma();
    const service = new RefreshTokenService(prisma);
    await service.issue('u1');
    rows[0].expiresAt = new Date(Date.now() - 1000);

    await service.issue('u1');

    expect(rows).toHaveLength(1);
  });
});
