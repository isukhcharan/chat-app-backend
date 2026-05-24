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
import { MessagesService } from '../messages/messages.service';
import { AiService } from '../ai/ai.service';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

interface AuthSocket extends Socket {
  userId: string;
  username: string;
  displayName: string;
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
    private prisma: PrismaService,
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
        select: { id: true, username: true, displayName: true },
      });

      if (!user) { client.disconnect(); return; }

      client.userId = user.id;
      client.username = user.username;
      client.displayName = user.displayName;

      this.userSocketMap.set(user.id, client.id);

      await this.usersService.updateStatus(user.id, 'ONLINE');
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
    await this.channelsService.join(channelId, client.userId);
    client.join(`channel:${channelId}`);
    client.to(`channel:${channelId}`).emit('channel:member_joined', {
      channelId,
      userId: client.userId,
      username: client.username,
    });
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: { channelId: string; content: string; parentId?: string },
  ) {
    const message = await this.messagesService.create(data.channelId, client.userId, {
      content: data.content,
      parentId: data.parentId,
    });

    this.server.to(`channel:${data.channelId}`).emit('message:new', message);

    // Handle /ai command
    if (data.content.startsWith('/ai ') && !data.parentId) {
      const question = data.content.slice(4).trim();
      this.handleAICommand(data.channelId, question, client.userId);
    }
  }

  @SubscribeMessage('message:edit')
  async handleEditMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { messageId: string; content: string },
  ) {
    const message = await this.messagesService.update(data.messageId, client.userId, data.content);
    this.server.to(`channel:${message.channelId}`).emit('message:updated', message);
  }

  @SubscribeMessage('message:delete')
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { messageId: string },
  ) {
    const result = await this.messagesService.delete(data.messageId, client.userId);
    this.server.to(`channel:${result.channelId}`).emit('message:deleted', { id: result.id });
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
    await this.prisma.channelMember.upsert({
      where: { userId_channelId: { userId: botUser.id, channelId } },
      create: { userId: botUser.id, channelId },
      update: {},
    });

    const aiMessage = await this.messagesService.createAIMessage(channelId, answer, botUser.id);
    this.server.to(`channel:${channelId}`).emit('message:new', aiMessage);
    this.server.to(`channel:${channelId}`).emit('ai:thinking_done', { channelId });
  }
}
