import { Injectable } from '@nestjs/common';
import { getPrismaClient } from '@medsphere/database';

@Injectable()
export class PrismaService {
  public readonly client = getPrismaClient();
}
