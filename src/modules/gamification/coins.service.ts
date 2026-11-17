import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Moedas vêm de metas cumpridas e só compram itens cosméticos. Cada prêmio é
 * identificado por (motivo, refId), então repetir o mesmo evento não paga duas vezes.
 */
export const COIN_REWARDS = {
  taskHydration: 3,
  taskMedication: 3,
  taskExercise: 5,
  taskMeals: 3,
  dailyGoal: 10,
  weightCheckpoint: 20,
  weightTarget: 100,
  weeklyWorkouts: 30,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class CoinsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paga a recompensa uma única vez por (motivo, refId). Devolve se pagou. */
  async award(
    profileId: string,
    reason: string,
    refId: string,
    amount: number,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    const existing = await this.prisma.coinEvent.findUnique({
      where: { profileId_reason_refId: { profileId, reason, refId } },
      select: { id: true },
    });
    if (existing) return false;

    try {
      await this.prisma.$transaction([
        this.prisma.coinEvent.create({
          data: { profileId, reason, refId, amount },
        }),
        this.prisma.profile.update({
          where: { id: profileId },
          data: { coins: { increment: amount } },
        }),
      ]);
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /**
   * Gasta moedas; falha sem tirar nada se o saldo não cobre. Com [tx] entra na
   * transação de quem chamou (ex.: compra + item entregue juntos).
   */
  async spend(
    profileId: string,
    amount: number,
    reason: string,
    refId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (client: Prisma.TransactionClient) => {
      const updated = await client.profile.updateMany({
        where: { id: profileId, coins: { gte: amount } },
        data: { coins: { decrement: amount } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Moedas insuficientes.');
      }
      await client.coinEvent.create({
        data: { profileId, reason, refId, amount: -amount },
      });
    };
    if (tx) {
      await run(tx);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  async balance(profileId: string): Promise<number> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { coins: true },
    });
    return profile?.coins ?? 0;
  }

  async history(profileId: string, limit = 30) {
    return this.prisma.coinEvent.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        amount: true,
        reason: true,
        refId: true,
        createdAt: true,
      },
    });
  }
}
