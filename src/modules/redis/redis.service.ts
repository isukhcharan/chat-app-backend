import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const MESSAGES_TTL_SEC = 5 * 60;
const MAX_CACHED_MESSAGES = 100;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  async onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    });
    this.client.on('error', (err) => console.error('[Redis]', err.message));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  private key(channelId: string) {
    return `nexus:msgs:${channelId}`;
  }

  async getMessages(channelId: string): Promise<any[] | null> {
    try {
      const raw = await this.client.get(this.key(channelId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async setMessages(channelId: string, messages: any[]) {
    try {
      await this.client.set(
        this.key(channelId),
        JSON.stringify(messages),
        'EX',
        MESSAGES_TTL_SEC,
      );
    } catch {
      /* non-fatal */
    }
  }

  async pushMessage(channelId: string, message: any) {
    try {
      const raw = await this.client.get(this.key(channelId));
      if (!raw) return; // no cache yet — next getMessages will populate it
      const msgs: any[] = JSON.parse(raw);
      msgs.push(message);
      const trimmed =
        msgs.length > MAX_CACHED_MESSAGES
          ? msgs.slice(-MAX_CACHED_MESSAGES)
          : msgs;
      await this.client.set(
        this.key(channelId),
        JSON.stringify(trimmed),
        'EX',
        MESSAGES_TTL_SEC,
      );
    } catch {
      /* non-fatal */
    }
  }

  async updateMessage(channelId: string, updated: any) {
    try {
      const raw = await this.client.get(this.key(channelId));
      if (!raw) return;
      const msgs: any[] = JSON.parse(raw);
      const idx = msgs.findIndex((m) => m.id === updated.id);
      if (idx !== -1) msgs[idx] = updated;
      await this.client.set(
        this.key(channelId),
        JSON.stringify(msgs),
        'EX',
        MESSAGES_TTL_SEC,
      );
    } catch {
      /* non-fatal */
    }
  }

  async removeMessage(channelId: string, messageId: string) {
    try {
      const raw = await this.client.get(this.key(channelId));
      if (!raw) return;
      const msgs: any[] = JSON.parse(raw).filter(
        (m: any) => m.id !== messageId,
      );
      await this.client.set(
        this.key(channelId),
        JSON.stringify(msgs),
        'EX',
        MESSAGES_TTL_SEC,
      );
    } catch {
      /* non-fatal */
    }
  }

  async bumpReplyCount(channelId: string, parentId: string) {
    try {
      const raw = await this.client.get(this.key(channelId));
      if (!raw) return;
      const msgs: any[] = JSON.parse(raw);
      const idx = msgs.findIndex((m) => m.id === parentId);
      if (idx !== -1)
        msgs[idx] = {
          ...msgs[idx],
          _count: {
            ...msgs[idx]._count,
            replies: (msgs[idx]._count?.replies ?? 0) + 1,
          },
        };
      await this.client.set(
        this.key(channelId),
        JSON.stringify(msgs),
        'EX',
        MESSAGES_TTL_SEC,
      );
    } catch {
      /* non-fatal */
    }
  }
}
