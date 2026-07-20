import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrivacyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string) {
    return this.prisma.client.userPrivacy.findUnique({
      where: { userId },
    });
  }

  async upsert(
    userId: string,
    data: {
      sharePhone?: boolean;
      shareEmail?: boolean;
      allowInAppChat?: boolean;
      privatePickup?: boolean;
      hideSensitiveNotifications?: boolean;
    },
  ) {
    return this.prisma.client.userPrivacy.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
    });
  }
}
