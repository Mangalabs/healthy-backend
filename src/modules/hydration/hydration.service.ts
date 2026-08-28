import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LogHydrationDto } from './dto/log-hydration.dto';
import { HydrationLog } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class HydrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async logConsumption(
    profileId: string,
    dto: LogHydrationDto,
  ): Promise<HydrationLog> {
    const log = await this.prisma.hydrationLog.create({
      data: {
        profileId,
        amountMl: dto.amountMl,
        //TODO: "glass" pode ir pra uma constante
        containerType: dto.containerType || 'glass',
        loggedAt: new Date(dto.loggedAt),
      },
    });

    this.eventEmitter.emit('habit.logged', {
      profileId,
      action: 'hydration_logged',
    });

    return log;
  }

  async getDailySummary(
    profileId: string,
    targetDate: string,
  ): Promise<{ totalMl: number }> {
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const logs = await this.prisma.hydrationLog.aggregate({
      _sum: { amountMl: true },
      where: {
        profileId,
        loggedAt: { gte: startOfDay, lte: endOfDay },
      },
    });
    //TODO: esse 0 me soa como número mágico, recomendo revisar mais por precaução, já que da pra entender o que ele significa.
    return { totalMl: logs._sum.amountMl || 0 };
  }

  async getHistory(
    profileId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<HydrationLog[]> {
    const where: any = { profileId };

    if (startDate) {
      where.loggedAt = { gte: new Date(startDate) };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.loggedAt = { ...where.loggedAt, lte: end };
    }

    return await this.prisma.hydrationLog.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
      //TODO: 2 coisas:
      //1: Eu moveria essa lógica do take pra uma variável antes do return por legibilidade.
      // take = startDate || endDate ? undefined : 30;
      //2: essa lógica está um pouco confusa. 
      //  Ele peg ao startDate se existir, se não existir ele verifica o endDate e se ele não existir ele pega 30
      // 30 é um número mágico por si só, mas além disso, eu preferiria deixar essa lógica mais explicita no que ela significa.
      take: startDate || endDate ? undefined : 30,
    });
  }
}
