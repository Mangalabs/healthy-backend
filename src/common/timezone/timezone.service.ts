import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { localDayRange, safeTimezone } from '../utils/date.util';

@Injectable()
export class TimezoneService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimezone(profileId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { timezone: true },
    });
    return safeTimezone(profile?.timezone);
  }

  /** Intervalo do dia local do perfil que contém `reference` (padrão: agora). */
  async dayRange(profileId: string, reference: Date = new Date()) {
    const timezone = await this.getTimezone(profileId);
    return { timezone, ...localDayRange(timezone, reference) };
  }
}
