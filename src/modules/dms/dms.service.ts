import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DmsService {
  constructor(private prisma: PrismaService) {}

  async getConversation(userId: string, partnerId: string, limit = 50) {
    return this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: partnerId },
          { senderId: partnerId, receiverId: userId },
        ],
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async send(senderId: string, receiverId: string, content: string) {
    return this.prisma.directMessage.create({
      data: { senderId, receiverId, content },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
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
