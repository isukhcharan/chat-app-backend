import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';

const MESSAGE_SELECT = {
  id: true,
  content: true,
  isAI: true,
  isSystem: true,
  createdAt: true,
  editedAt: true,
  parentId: true,
  channelId: true,
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
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async create(channelId: string, userId: string, dto: CreateMessageDto) {
    return this.prisma.message.create({
      data: {
        content: dto.content,
        channelId,
        userId,
        parentId: dto.parentId,
      },
      select: MESSAGE_SELECT,
    });
  }

  // Used when the ID is pre-generated (background Postgres write after Redis confirm)
  async createWithId(
    id: string,
    channelId: string,
    userId: string,
    dto: CreateMessageDto & { attachments?: any[] },
  ) {
    return this.prisma.message.create({
      data: {
        id,
        content: dto.content,
        channelId,
        userId,
        parentId: dto.parentId,
        attachments: dto.attachments ?? [],
      },
      select: MESSAGE_SELECT,
    });
  }

  async createAIMessage(channelId: string, content: string, botUserId: string) {
    return this.prisma.message.create({
      data: { content, channelId, userId: botUserId, isAI: true },
      select: MESSAGE_SELECT,
    });
  }

  async createSystemMessage(channelId: string, userId: string, content: string) {
    return this.prisma.message.create({
      data: { content, channelId, userId, isSystem: true },
      select: MESSAGE_SELECT,
    });
  }

  async update(messageId: string, userId: string, content: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.userId !== userId)
      throw new ForbiddenException('Not your message');

    return this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      select: MESSAGE_SELECT,
    });
  }

  async delete(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.userId !== userId)
      throw new ForbiddenException('Not your message');

    await this.prisma.message.delete({ where: { id: messageId } });
    return { id: messageId, channelId: message.channelId };
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const existing = await this.prisma.reaction.findUnique({
      where: { userId_messageId_emoji: { userId, messageId, emoji } },
    });

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
      return { action: 'removed', messageId, emoji };
    }

    await this.prisma.reaction.create({ data: { userId, messageId, emoji } });
    return { action: 'added', messageId, emoji };
  }

  async getReactions(messageId: string) {
    return this.prisma.reaction.findMany({
      where: { messageId },
      select: {
        id: true,
        emoji: true,
        user: { select: { id: true, username: true } },
      },
    });
  }
}
