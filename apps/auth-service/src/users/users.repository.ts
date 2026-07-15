import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(tenantId: string, email: string) {
    return this.prisma.client.user.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email,
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.client.user.findUnique({
      where: { id },
    });
  }

  async create(data: {
    tenantId: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }) {
    return this.prisma.client.user.create({
      data,
    });
  }

  async updatePassword(id: string, passwordHash: string) {
    return this.prisma.client.user.update({
      where: { id },
      data: { passwordHash },
    });
  }
}
