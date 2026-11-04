import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User, Profile } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(
    email: string,
  ): Promise<(User & { profile: Profile | null }) | null> {
    return await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
      include: { profile: true },
    });
  }

  async findById(id: string): Promise<User & { profile: Profile | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }

    return user;
  }

  async create(
    email: string,
    passwordHash: string,
    name: string,
  ): Promise<User & { profile: Profile }> {
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Este e-mail já está em uso.');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: {
            name,
            timezone: 'America/Sao_Paulo',
          },
        },
      },
      include: {
        profile: true,
      },
    });

    if (!user.profile) {
      throw new InternalServerErrorException(
        'Falha ao criar o perfil do usuário.',
      );
    }

    return user as User & { profile: Profile };
  }

  async updateResetToken(
    userId: string,
    token: string | null,
    expires: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: token,
        resetPasswordExpires: expires,
        resetPasswordAttempts: 0,
      },
    });
  }

  /** Conta uma tentativa errada e invalida o código ao atingir o limite. */
  async registerResetFailure(userId: string, maxAttempts: number): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { resetPasswordAttempts: { increment: 1 } },
      select: { resetPasswordAttempts: true },
    });

    if (user.resetPasswordAttempts >= maxAttempts) {
      await this.updateResetToken(userId, null, null);
    }
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        resetPasswordAttempts: 0,
      },
    });
  }
}
