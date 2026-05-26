import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    // Ping every 4 min to prevent Neon serverless cold-start latency
    setInterval(() => this.$queryRaw`SELECT 1`.catch(() => {}), 4 * 60 * 1000);
  }
}
