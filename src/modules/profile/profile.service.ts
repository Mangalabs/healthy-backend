import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Prisma, Profile } from '@prisma/client';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(profileId: string): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado.');
    }

    return profile;
  }

  async updateProfile(
    profileId: string,
    dto: UpdateProfileDto,
  ): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado.');
    }

    return await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.timezone && { timezone: dto.timezone }),
        ...(dto.avatarUrl && { avatarUrl: dto.avatarUrl }),
        ...(dto.dailyHydrationGoal && {
          dailyHydrationGoal: dto.dailyHydrationGoal,
        }),
        ...(dto.petName && { petName: dto.petName }),
        ...(dto.petStatus && { petStatus: dto.petStatus }),
        ...(dto.petSpecies && { petSpecies: dto.petSpecies }),
        ...(dto.petDna && { petDna: dto.petDna as Prisma.InputJsonObject }),
        ...(dto.heightCm !== undefined && { heightCm: dto.heightCm }),
        ...(dto.bodyGoal !== undefined && { bodyGoal: dto.bodyGoal }),
        ...(dto.targetWeightKg !== undefined && {
          targetWeightKg: dto.targetWeightKg,
        }),
        ...(dto.healthFloorBmi !== undefined && {
          healthFloorBmi: dto.healthFloorBmi,
        }),
        ...(dto.trackedModules !== undefined && {
          trackedModules: dto.trackedModules,
        }),
        ...(dto.bodyMirror !== undefined && { bodyMirror: dto.bodyMirror }),
        ...(dto.setupCompleted === true &&
          !profile.setupCompletedAt && { setupCompletedAt: new Date() }),
      },
    });
  }
}
