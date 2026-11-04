import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiry,
} from './refresh-token.util';

export const SESSION_EXPIRED_MESSAGE =
  'Sessão expirada. Faça login novamente.';

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria um refresh token novo; `familyId` continua uma cadeia de rotação. */
  async issue(userId: string, familyId: string = randomUUID()): Promise<string> {
    const token = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashRefreshToken(token),
        expiresAt: refreshExpiry(),
      },
    });

    // Limpeza oportunista: tokens vencidos do próprio usuário não servem mais.
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    return token;
  }

  /**
   * Consome o token (uso único). Um token já usado que reaparece indica
   * replay: a cadeia inteira é revogada e o usuário precisa entrar de novo.
   */
  async consume(token: string): Promise<{ userId: string; familyId: string }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
    });

    if (!row || row.revokedAt || row.expiresAt <= new Date()) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    // Atômico: só uma requisição concorrente consegue marcar como usado.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });

    if (claimed.count !== 1) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    return { userId: row.userId, familyId: row.familyId };
  }

  /** Logout: invalida a cadeia do token informado. Silencioso se desconhecido. */
  async revokeByToken(token: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
    });
    if (row) await this.revokeFamily(row.familyId);
  }

  /** Troca de senha: derruba todas as sessões do usuário. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
