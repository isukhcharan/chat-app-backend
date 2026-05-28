import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { MessagesService } from '../messages/messages.service';
import { AiService } from '../ai/ai.service';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';
import { DmsService } from '../dms/dms.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface AuthSocket extends Socket {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private userSocketMap = new Map<string, string>(); // userId -> socketId

  constructor(
    private jwt: JwtService,
    private messagesService: MessagesService,
    private aiService: AiService,
    private channelsService: ChannelsService,
    private usersService: UsersService,
    private dmsService: DmsService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async handleConnection(client: AuthSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) { client.disconnect(); return; }

      const payload = this.jwt.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      });

      if (!user) { client.disconnect(); return; }

      client.userId = user.id;
      client.username = user.username;
      client.displayName = user.displayName;
      client.avatarUrl = user.avatarUrl;

      this.userSocketMap.set(user.id, client.id);

      await this.usersService.updateStatus(user.id, 'ONLINE');
      this.server.emit('user:connected', {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        status: 'ONLINE',
      });
      this.server.emit('user:status', { userId: user.id, status: 'ONLINE' });

      // Auto-join all channels the user is a member of
      const memberships = await this.prisma.channelMember.findMany({
        where: { userId: user.id },
        select: { channelId: true },
      });
      memberships.forEach((m) => client.join(`channel:${m.channelId}`));
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthSocket) {
    if (!client.userId) return;

    this.userSocketMap.delete(client.userId);
    await this.usersService.updateStatus(client.userId, 'OFFLINE');
    this.server.emit('user:status', { userId: client.userId, status: 'OFFLINE' });
  }

  @SubscribeMessage('channel:join')
  async handleJoinChannel(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { channelId }: { channelId: string },
  ) {
    // Join the Socket.IO room immediately so the client never misses broadcasts,
    // even if handleConnection's async DB queries haven't resolved yet.
    client.join(`channel:${channelId}`);
    if (!client.userId) return; // auth still in-flight; room join above is sufficient
    try {
      await this.channelsService.join(channelId, client.userId);
      client.to(`channel:${channelId}`).emit('channel:member_joined', {
        channelId,
        userId: client.userId,
        username: client.username,
      });
    } catch { /* already a member or private channel — ignore */ }
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: { channelId: string; content: string; parentId?: string; attachments?: any[] },
  ) {
    if (!client.userId) return; // auth still in-flight

    // Pre-generate the real message ID — no DB round-trip needed
    const id = randomUUID();
    const now = new Date().toISOString();
    const parentId = data.parentId || null;

    const message = {
      id,
      content: data.content,
      isAI: false,
      createdAt: now,
      editedAt: null,
      channelId: data.channelId,
      parentId,
      attachments: data.attachments ?? [],
      user: {
        id: client.userId,
        username: client.username,
        displayName: client.displayName,
        avatarUrl: client.avatarUrl,
      },
      reactions: [],
      _count: { replies: 0 },
    };

    // Broadcast to other clients as a temp (pending) message
    client.to(`channel:${data.channelId}`).emit('message:new', { ...message, _pending: true });

    // Confirm to ALL immediately — zero DB/network latency for the sender
    this.server.to(`channel:${data.channelId}`).emit('message:confirmed', {
      pendingId: `pending-${client.userId}`, // fallback match key (sender uses content match anyway)
      message,
    });

    // Background: persist to Redis cache + Postgres (non-blocking)
    if (!parentId) {
      this.redis.pushMessage(data.channelId, message).catch(() => {});
    } else {
      this.redis.bumpReplyCount(data.channelId, parentId).catch(() => {});
    }
    this.messagesService.createWithId(id, data.channelId, client.userId, {
      content: data.content,
      parentId: data.parentId,
      attachments: data.attachments,
    }).catch((err) => console.error('[DB write failed]', err));

    // Handle /ai command
    if (data.content.startsWith('/ai ') && !parentId) {
      this.handleAICommand(data.channelId, data.content.slice(4).trim(), client.userId);
    }
  }

  @SubscribeMessage('message:edit')
  async handleEditMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { messageId: string; content: string },
  ) {
    const message = await this.messagesService.update(data.messageId, client.userId, data.content);
    this.server.to(`channel:${message.channelId}`).emit('message:updated', message);
    this.redis.updateMessage(message.channelId, message).catch(() => {});
  }

  @SubscribeMessage('message:delete')
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { messageId: string },
  ) {
    const result = await this.messagesService.delete(data.messageId, client.userId);
    this.server.to(`channel:${result.channelId}`).emit('message:deleted', { id: result.id });
    this.redis.removeMessage(result.channelId, result.id).catch(() => {});
  }

  @SubscribeMessage('message:react')
  async handleReaction(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { messageId: string; emoji: string; channelId: string },
  ) {
    await this.messagesService.toggleReaction(data.messageId, client.userId, data.emoji);
    const reactions = await this.messagesService.getReactions(data.messageId);
    this.server
      .to(`channel:${data.channelId}`)
      .emit('message:reactions_updated', { messageId: data.messageId, reactions });
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { channelId }: { channelId: string },
  ) {
    client.to(`channel:${channelId}`).emit('typing:update', {
      channelId,
      userId: client.userId,
      username: client.username,
      typing: true,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { channelId }: { channelId: string },
  ) {
    client.to(`channel:${channelId}`).emit('typing:update', {
      channelId,
      userId: client.userId,
      username: client.username,
      typing: false,
    });
  }

  @SubscribeMessage('ai:summarize')
  async handleSummarize(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { channelId: string; messageId: string },
  ) {
    const replies = await this.channelsService.getThreadReplies(data.messageId);
    const formatted = replies.map((r: any) => ({
      username: r.user.displayName,
      content: r.content,
    }));

    const summary = await this.aiService.summarizeThread(formatted);

    client.emit('ai:summary', { messageId: data.messageId, summary });
  }

  @SubscribeMessage('ai:suggest_replies')
  async handleSuggestReplies(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { channelId: string },
  ) {
    const messages = await this.channelsService.getMessages(data.channelId, client.userId);
    const formatted = (messages as any[]).slice(-5).map((m) => ({
      username: m.user.displayName,
      content: m.content,
    }));

    const suggestions = await this.aiService.suggestReplies(formatted);
    client.emit('ai:suggestions', { channelId: data.channelId, suggestions });
  }

  private async handleAICommand(channelId: string, question: string, userId: string) {
    // Emit a "thinking" indicator
    this.server.to(`channel:${channelId}`).emit('ai:thinking', { channelId });

    const recentMessages = await this.channelsService.getMessages(channelId, userId, undefined, 10);
    const context = (recentMessages as any[])
      .map((m) => `${m.user.displayName}: ${m.content}`)
      .join('\n');

    const answer = await this.aiService.askAI(question, context);

    // Find or create the AI bot user
    let botUser = await this.prisma.user.findFirst({ where: { username: 'nexus-ai' } });
    if (!botUser) {
      botUser = await this.prisma.user.create({
        data: {
          email: 'ai@nexus.internal',
          username: 'nexus-ai',
          displayName: 'Nexus AI',
          password: 'not-a-real-password',
        },
      });
    }

    // Ensure bot is in the channel
    const botMember = await this.prisma.channelMember.findUnique({
      where: { userId_channelId: { userId: botUser.id, channelId } },
    });
    if (!botMember) {
      await this.prisma.channelMember.create({ data: { userId: botUser.id, channelId } });
    }

    const aiMessage = await this.messagesService.createAIMessage(channelId, answer, botUser.id);
    this.server.to(`channel:${channelId}`).emit('message:new', aiMessage);
    this.server.to(`channel:${channelId}`).emit('ai:thinking_done', { channelId });
  }

  @SubscribeMessage('dm:send')
  async handleDmSend(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { receiverId: string; content: string },
  ) {
    const dm = await this.dmsService.send(client.userId, data.receiverId, data.content);

    // Deliver to sender's socket
    client.emit('dm:new', dm);

    // Deliver to receiver's socket if online
    const receiverSocketId = this.userSocketMap.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('dm:new', dm);
    }
  }
}
