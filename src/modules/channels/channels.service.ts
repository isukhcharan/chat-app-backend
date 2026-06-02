import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateChannelDto } from './dto/create-channel.dto';

const MESSAGE_SELECT = {
  id: true,
  content: true,
  isAI: true,
  createdAt: true,
  editedAt: true,
  parentId: true,
  attachments: true,
  user: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  reactions: {
    select: {
      id: true,
      emoji: true,
      user: { select: { id: true, username: true } },
    },
  },
  _count: { select: { replies: true } },
};

@Injectable()
export class ChannelsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async create(userId: string, workspaceId: string, dto: CreateChannelDto) {
    const name = dto.name.toLowerCase().replace(/\s+/g, '-');

    return this.prisma.channel.create({
      data: {
        name,
        description: dto.description,
        type: dto.type || 'PUBLIC',
        workspaceId,
        members: { create: { userId, role: 'OWNER' } },
      },
    });
  }

  async findAll(userId: string, workspaceId: string) {
    const channels = await this.prisma.channel.findMany({
      where: {
        workspaceId,
        OR: [{ type: 'PUBLIC' }, { members: { some: { userId } } }],
      },
      include: {
        _count: { select: { members: true } },
        members: {
          where: { userId },
          select: { role: true, lastRead: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      channels.map(async (ch) => {
        const lastRead = ch.members[0]?.lastRead ?? new Date(0);
        const unreadCount = await this.prisma.message.count({
          where: {
            channelId: ch.id,
            parentId: null,
            createdAt: { gt: lastRead },
            userId: { not: userId },
          },
        });
        return { ...ch, unreadCount };
      }),
    );
  }

  async findOne(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!channel) throw new NotFoundException('Channel not found');

    if (channel.type === 'PRIVATE') {
      const isMember = channel.members.some((m) => m.userId === userId);
      if (!isMember) throw new ForbiddenException('Access denied');
    }

    return channel;
  }

  async join(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.type === 'PRIVATE')
      throw new ForbiddenException('Cannot join private channel');

    const existing = await this.prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    if (existing) return existing;
    return this.prisma.channelMember.create({ data: { userId, channelId } });
  }

  async leave(channelId: string, userId: string) {
    return this.prisma.channelMember.delete({
      where: { userId_channelId: { userId, channelId } },
    });
  }

  async getMessages(
    channelId: string,
    userId: string,
    cursor?: string,
    limit = 50,
  ) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    if (channel.type === 'PRIVATE') {
      const member = await this.prisma.channelMember.findUnique({
        where: { userId_channelId: { userId, channelId } },
      });
      if (!member) throw new ForbiddenException('Access denied');
    }

    if (!cursor) {
      const cached = await this.redis.getMessages(channelId);
      if (cached) return cached;
    }

    const messages = await this.prisma.message.findMany({
      where: { channelId, parentId: null },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const result = messages.reverse();
    if (!cursor) this.redis.setMessages(channelId, result);
    return result;
  }

  async getThreadReplies(messageId: string) {
    return this.prisma.message.findMany({
      where: { parentId: messageId },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateLastRead(channelId: string, userId: string) {
    return this.prisma.channelMember.updateMany({
      where: { channelId, userId },
      data: { lastRead: new Date() },
    });
  }
}
