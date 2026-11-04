import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  RefreshTokenService,
  SESSION_EXPIRED_MESSAGE,
} from './refresh-token.service';
import { MailService } from '../mail/mail.service';
import { SocialTokenService } from './social-token.service';
import {
  RESET_CODE_TTL_MINUTES,
  RESET_MAX_ATTEMPTS,
  generateResetCode,
  hashResetCode,
  resetCodeMatches,
} from './reset-code.util';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { User, Profile } from '@prisma/client';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    profile: {
      id: string;
      name: string;
      streakDays: number;
      currentXp: number;
      dailyHydrationGoal: number;
      timezone: string;
      petName: string;
      petSpecies: string;
      petDna: unknown;
    };
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly socialTokenService: SocialTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersService.create(
      dto.email,
      passwordHash,
      dto.name,
    );

    if (!user.profile) {
      throw new InternalServerErrorException(
        'Erro interno ao gerar o perfil do usuário.',
      );
    }

    return this.generateAuthResponse(user);
  }

  async issueDevToken(email: string): Promise<AuthResponse> {
    const allowDevToken = process.env.ALLOW_DEV_TOKEN === 'true' || process.env.NODE_ENV !== 'production';
    if (!allowDevToken) {
      throw new ForbiddenException('Dev token endpoint is disabled in production.');
    }

    let user = await this.usersService.findByEmail(email);
    if (!user) {
      const randomPassword = randomUUID() + randomUUID();
      const passwordHash = await argon2.hash(randomPassword);
      user = await this.usersService.create(email, passwordHash, 'Dev User');
    }

    if (!user.profile) {
      throw new InternalServerErrorException('User has no profile.');
    }

    return this.generateAuthResponse(user as User & { profile: Profile });
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (!user.profile) {
      throw new UnauthorizedException(
        'Este utilizador não possui um perfil ativo.',
      );
    }

    return this.generateAuthResponse(user as User & { profile: Profile });
  }

  async socialLogin(dto: SocialLoginDto): Promise<AuthResponse> {
    const identity = await this.socialTokenService.verify(
      dto.provider,
      dto.idToken,
    );
    let user = await this.usersService.findByEmail(identity.email);

    if (!user) {
      const randomPassword = randomUUID() + randomUUID();
      const passwordHash = await argon2.hash(randomPassword);

      const defaultName =
        dto.name ||
        identity.name ||
        (dto.provider === 'apple' ? 'Usuário Apple' : 'Usuário Convidado');

      user = await this.usersService.create(
        identity.email,
        passwordHash,
        defaultName,
      );
    }

    if (!user.profile) {
      throw new UnauthorizedException(
        'Este utilizador não possui um perfil ativo.',
      );
    }

    return this.generateAuthResponse(user as User & { profile: Profile });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (user) {
      const token = generateResetCode();
      const expires = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000);

      await this.usersService.updateResetToken(
        user.id,
        hashResetCode(token),
        expires,
      );
      await this.mailService.sendResetPasswordEmail(user.email, token);
    }

    return {
      message:
        'Se o e-mail estiver cadastrado, um token de redefinição foi enviado.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    const stored = user?.resetPasswordToken;
    const expires = user?.resetPasswordExpires;

    if (!user || !stored || !expires || expires <= new Date()) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    if (!resetCodeMatches(dto.token.trim(), stored)) {
      await this.usersService.registerResetFailure(user.id, RESET_MAX_ATTEMPTS);
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);
    await this.usersService.updatePassword(user.id, newPasswordHash);
    // Quem tinha a senha antiga (ou um token roubado) perde a sessão.
    await this.refreshTokens.revokeAllForUser(user.id);

    return { message: 'Senha redefinida com sucesso!' };
  }

  /** Troca um refresh token válido por um par novo (rotação de uso único). */
  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const { userId, familyId } = await this.refreshTokens.consume(
      dto.refreshToken,
    );

    let user: (User & { profile: Profile | null }) | null = null;
    try {
      user = await this.usersService.findById(userId);
    } catch {
      user = null;
    }
    if (!user || !user.profile) {
      await this.refreshTokens.revokeAllForUser(userId);
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    return this.generateAuthResponse(
      user as User & { profile: Profile },
      familyId,
    );
  }

  async logout(dto: RefreshTokenDto): Promise<{ message: string }> {
    await this.refreshTokens.revokeByToken(dto.refreshToken);
    return { message: 'Sessão encerrada.' };
  }

  private async generateAuthResponse(
    user: User & { profile: Profile },
    familyId?: string,
  ): Promise<AuthResponse> {
    const payload = {
      sub: user.id,
      email: user.email,
      profileId: user.profile.id,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.refreshTokens.issue(user.id, familyId);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        profile: {
          id: user.profile.id,
          name: user.profile.name,
          streakDays: user.profile.streakDays,
          currentXp: user.profile.currentXp,
          dailyHydrationGoal: user.profile.dailyHydrationGoal,
          timezone: user.profile.timezone,
          petName: user.profile.petName,
          petSpecies: user.profile.petSpecies,
          petDna: user.profile.petDna,
        },
      },
    };
  }
}
