import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DM_SELECT = {
  id: true,
  content: true,
  isRead: true,
  editedAt: true,
  createdAt: true,
  senderId: true,
  receiverId: true,
  replyToId: true,
  sender: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      sender: { select: { id: true, displayName: true } },
    },
  },
  reactions: {
    select: {
      id: true,
      emoji: true,
      user: { select: { id: true, username: true } },
    },
  },
};

@Injectable()
export class DmsService {
  constructor(private prisma: PrismaService) {}

  async getConversation(
    userId: string,
    partnerId: string,
    limit = 50,
    before?: string,
  ) {
    let createdAtFilter: { lt: Date } | undefined;

    if (before) {
      const pivot = await this.prisma.directMessage.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (pivot) createdAtFilter = { lt: pivot.createdAt };
    }

    return this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: partnerId },
          { senderId: partnerId, receiverId: userId },
        ],
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      select: DM_SELECT,
      orderBy: { createdAt: 'asc' },
      take: -limit,
    });
  }

  async send(
    senderId: string,
    receiverId: string,
    content: string,
    replyToId?: string,
  ) {
    return this.prisma.directMessage.create({
      data: {
        senderId,
        receiverId,
        content,
        ...(replyToId ? { replyToId } : {}),
      },
      select: DM_SELECT,
    });
  }

  async edit(messageId: string, userId: string, content: string) {
    const dm = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!dm) throw new NotFoundException('Message not found');
    if (dm.senderId !== userId)
      throw new ForbiddenException('Cannot edit this message');

    return this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      select: DM_SELECT,
    });
  }

  async delete(messageId: string, userId: string) {
    const dm = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!dm) throw new NotFoundException('Message not found');
    if (dm.senderId !== userId)
      throw new ForbiddenException('Cannot delete this message');

    await this.prisma.directMessage.delete({ where: { id: messageId } });
    return { id: messageId, senderId: dm.senderId, receiverId: dm.receiverId };
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const existing = await this.prisma.dMReaction.findUnique({
      where: { userId_messageId_emoji: { userId, messageId, emoji } },
    });

    if (existing) {
      await this.prisma.dMReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.dMReaction.create({
        data: { userId, messageId, emoji },
      });
    }

    return this.prisma.dMReaction.findMany({
      where: { messageId },
      select: {
        id: true,
        emoji: true,
        user: { select: { id: true, username: true } },
      },
    });
  }

  async markRead(senderId: string, receiverId: string) {
    return this.prisma.directMessage.updateMany({
      where: { senderId, receiverId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCounts(userId: string) {
    const unread = await this.prisma.directMessage.groupBy({
      by: ['senderId'],
      where: { receiverId: userId, isRead: false },
      _count: { id: true },
    });
    return Object.fromEntries(unread.map((u) => [u.senderId, u._count.id]));
  }
}
