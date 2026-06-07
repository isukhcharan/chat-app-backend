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

function channelRoom(workspaceId: string, channelId: string) {
  return `ws:${workspaceId}:channel:${channelId}`;
}

function workspaceRoom(workspaceId: string) {
  return `ws:${workspaceId}`;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

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

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      client.userId = user.id;
      client.username = user.username;
      client.displayName = user.displayName;
      client.avatarUrl = user.avatarUrl;

      if (!this.userSockets.has(user.id)) {
        this.userSockets.set(user.id, new Set());
      }
      this.userSockets.get(user.id)!.add(client.id);

      const isFirstConnection = this.userSockets.get(user.id)!.size === 1;

      // Join workspace rooms + channel rooms
      const memberships = await this.prisma.workspaceMember.findMany({
        where: { userId: user.id },
        select: { workspaceId: true },
      });

      for (const { workspaceId } of memberships) {
        client.join(workspaceRoom(workspaceId));
      }

      const channelMemberships = await this.prisma.channelMember.findMany({
        where: { userId: user.id },
        include: { channel: { select: { workspaceId: true } } },
      });

      for (const m of channelMemberships) {
        const wsId = m.channel.workspaceId;
        if (wsId) {
          client.join(channelRoom(wsId, m.channelId));
        }
      }

      if (isFirstConnection) {
        this.usersService.updateStatus(user.id, 'ONLINE').catch(() => {});
        // Broadcast status only to co-members in shared workspaces
        for (const { workspaceId } of memberships) {
          this.server.to(workspaceRoom(workspaceId)).emit('user:status', {
            userId: user.id,
            status: 'ONLINE',
          });
        }
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthSocket) {
    if (!client.userId) return;

    const sockets = this.userSockets.get(client.userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(client.userId);
        // Broadcast offline only to workspace co-members
        const memberships = await this.prisma.workspaceMember.findMany({
          where: { userId: client.userId },
          select: { workspaceId: true },
        });
        for (const { workspaceId } of memberships) {
          this.server.to(workspaceRoom(workspaceId)).emit('user:status', {
            userId: client.userId,
            status: 'OFFLINE',
          });
        }
        this.usersService
          .updateStatus(client.userId, 'OFFLINE')
          .catch(() => {});
      }
    }
  }

  // Client emits this when switching to a workspace (e.g. after accepting invite)
  @SubscribeMessage('workspace:join')
  async handleWorkspaceJoin(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { workspaceId }: { workspaceId: string },
  ) {
    if (!client.userId) return;

    // Verify membership
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: client.userId } },
    });
    if (!member) return;

    client.join(workspaceRoom(workspaceId));

    // Join all channels in this workspace the user belongs to
    const channelMemberships = await this.prisma.channelMember.findMany({
      where: { userId: client.userId },
      include: { channel: { select: { workspaceId: true } } },
    });
    for (const m of channelMemberships) {
      if (m.channel.workspaceId === workspaceId) {
        client.join(channelRoom(workspaceId, m.channelId));
      }
    }
  }

  @SubscribeMessage('channel:join')
  async handleJoinChannel(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    { channelId, workspaceId }: { channelId: string; workspaceId: string },
  ) {
    if (!workspaceId) return;
    client.join(channelRoom(workspaceId, channelId));
    if (!client.userId) return;
    try {
      await this.channelsService.join(channelId, client.userId);
      client
        .to(channelRoom(workspaceId, channelId))
        .emit('channel:member_joined', {
          channelId,
          userId: client.userId,
          username: client.username,
        });
    } catch {
      /* already a member or private channel */
    }
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: {
      channelId: string;
      workspaceId: string;
      content: string;
      parentId?: string;
      attachments?: any[];
    },
  ) {
    if (!client.userId || !data.workspaceId) return;

    const id = randomUUID();
    const now = new Date().toISOString();
    const parentId = data.parentId || null;
    const room = channelRoom(data.workspaceId, data.channelId);

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

    client.to(room).emit('message:new', { ...message, _pending: true });
    this.server.to(room).emit('message:confirmed', {
      pendingId: `pending-${client.userId}`,
      message,
    });

    if (!parentId) {
      this.redis.pushMessage(data.channelId, message).catch(() => {});
    } else {
      this.redis.bumpReplyCount(data.channelId, parentId).catch(() => {});
    }
    this.messagesService
      .createWithId(id, data.channelId, client.userId, {
        content: data.content,
        parentId: data.parentId,
        attachments: data.attachments,
      })
      .catch((err) => console.error('[DB write failed]', err));

    if (data.content.startsWith('/ai ') && !parentId) {
      this.handleAICommand(
        data.channelId,
        data.workspaceId,
        data.content.slice(4).trim(),
        client.userId,
      );
    }
  }

  @SubscribeMessage('message:edit')
  async handleEditMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: { messageId: string; content: string; workspaceId: string },
  ) {
    const message = await this.messagesService.update(
      data.messageId,
      client.userId,
      data.content,
    );
    const room = channelRoom(data.workspaceId, message.channelId);
    this.server.to(room).emit('message:updated', message);
    this.redis.updateMessage(message.channelId, message).catch(() => {});
  }

  @SubscribeMessage('message:delete')
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { messageId: string; workspaceId: string },
  ) {
    const result = await this.messagesService.delete(
      data.messageId,
      client.userId,
    );
    const room = channelRoom(data.workspaceId, result.channelId);
    this.server.to(room).emit('message:deleted', { id: result.id });
    this.redis.removeMessage(result.channelId, result.id).catch(() => {});
  }

  @SubscribeMessage('message:react')
  async handleReaction(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: {
      messageId: string;
      emoji: string;
      channelId: string;
      workspaceId: string;
    },
  ) {
    await this.messagesService.toggleReaction(
      data.messageId,
      client.userId,
      data.emoji,
    );
    const reactions = await this.messagesService.getReactions(data.messageId);
    this.server
      .to(channelRoom(data.workspaceId, data.channelId))
      .emit('message:reactions_updated', {
        messageId: data.messageId,
        reactions,
      });
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    { channelId, workspaceId }: { channelId: string; workspaceId: string },
  ) {
    if (!workspaceId) return;
    client.to(channelRoom(workspaceId, channelId)).emit('typing:update', {
      channelId,
      userId: client.userId,
      username: client.username,
      typing: true,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    { channelId, workspaceId }: { channelId: string; workspaceId: string },
  ) {
    if (!workspaceId) return;
    client.to(channelRoom(workspaceId, channelId)).emit('typing:update', {
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
    const messages = await this.channelsService.getMessages(
      data.channelId,
      client.userId,
    );
    const formatted = (messages as any[]).slice(-5).map((m) => ({
      username: m.user.displayName,
      content: m.content,
    }));
    const suggestions = await this.aiService.suggestReplies(formatted);
    client.emit('ai:suggestions', { channelId: data.channelId, suggestions });
  }

  private async handleAICommand(
    channelId: string,
    workspaceId: string,
    question: string,
    userId: string,
  ) {
    const room = channelRoom(workspaceId, channelId);
    this.server.to(room).emit('ai:thinking', { channelId });

    const recentMessages = await this.channelsService.getMessages(
      channelId,
      userId,
      undefined,
      10,
    );
    const context = (recentMessages as any[])
      .map((m) => `${m.user.displayName}: ${m.content}`)
      .join('\n');

    const answer = await this.aiService.askAI(question, context);

    let botUser = await this.prisma.user.findFirst({
      where: { username: 'nexus-ai' },
    });
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

    const botMember = await this.prisma.channelMember.findUnique({
      where: { userId_channelId: { userId: botUser.id, channelId } },
    });
    if (!botMember) {
      await this.prisma.channelMember.create({
        data: { userId: botUser.id, channelId },
      });
    }

    const aiMessage = await this.messagesService.createAIMessage(
      channelId,
      answer,
      botUser.id,
    );
    this.server.to(room).emit('message:new', aiMessage);
    this.server.to(room).emit('ai:thinking_done', { channelId });
  }

  @SubscribeMessage('channel:add_member')
  async handleAddMember(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    {
      channelId,
      workspaceId,
      userId,
    }: { channelId: string; workspaceId: string; userId: string },
  ) {
    if (!client.userId || !workspaceId) return;

    await this.channelsService.addMember(channelId, userId);

    const addedUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    if (!addedUser) return;

    // Join any active sockets of the newly added user to this channel room
    this.userSockets.get(userId)?.forEach((socketId) => {
      this.server.in(socketId).socketsJoin(channelRoom(workspaceId, channelId));
    });

    const room = channelRoom(workspaceId, channelId);

    // Persist the system message then broadcast it as a regular message
    const systemMsg = await this.messagesService.createSystemMessage(
      channelId,
      client.userId,
      `${client.displayName} added ${addedUser.displayName} to the channel.`,
    );
    this.server.to(room).emit('message:new', systemMsg);

    this.server.to(room).emit('channel:member_added', {
      channelId,
      workspaceId,
      addedUser,
      addedBy: {
        id: client.userId,
        username: client.username,
        displayName: client.displayName,
      },
    });
  }

  @SubscribeMessage('channel:mark_read')
  async handleChannelMarkRead(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    { channelId, workspaceId }: { channelId: string; workspaceId: string },
  ) {
    if (!workspaceId) return;
    const lastRead = new Date().toISOString();
    await this.channelsService.updateLastRead(channelId, client.userId);
    client.to(channelRoom(workspaceId, channelId)).emit('channel:read', {
      channelId,
      userId: client.userId,
      lastRead,
    });
  }

  @SubscribeMessage('dm:mark_read')
  async handleDmMarkRead(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() { partnerId }: { partnerId: string },
  ) {
    await this.dmsService.markRead(partnerId, client.userId);
    this.emitToDmPair(client.userId, partnerId, 'dm:read', {
      senderId: partnerId,
    });
  }

  @SubscribeMessage('dm:send')
  async handleDmSend(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: { receiverId: string; content: string; replyToId?: string },
  ) {
    const dm = await this.dmsService.send(
      client.userId,
      data.receiverId,
      data.content,
      data.replyToId,
    );
    console.log(JSON.stringify(dm));
    this.emitToDmPair(client.userId, data.receiverId, 'dm:new', dm);
  }

  @SubscribeMessage('dm:edit')
  async handleDmEdit(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: { messageId: string; content: string; partnerId: string },
  ) {
    const dm = await this.dmsService.edit(
      data.messageId,
      client.userId,
      data.content,
    );
    this.emitToDmPair(client.userId, data.partnerId, 'dm:updated', dm);
  }

  @SubscribeMessage('dm:delete')
  async handleDmDelete(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { messageId: string; partnerId: string },
  ) {
    const result = await this.dmsService.delete(data.messageId, client.userId);
    this.emitToDmPair(client.userId, data.partnerId, 'dm:deleted', {
      id: result.id,
    });
  }

  @SubscribeMessage('dm:react')
  async handleDmReact(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    data: { messageId: string; emoji: string; partnerId: string },
  ) {
    const reactions = await this.dmsService.toggleReaction(
      data.messageId,
      client.userId,
      data.emoji,
    );
    this.emitToDmPair(client.userId, data.partnerId, 'dm:reactions_updated', {
      messageId: data.messageId,
      reactions,
    });
  }

  private emitToDmPair(
    userAId: string,
    userBId: string,
    event: string,
    payload: any,
  ) {
    [userAId, userBId].forEach((uid) => {
      this.userSockets.get(uid)?.forEach((socketId) => {
        this.server.to(socketId).emit(event, payload);
      });
    });
  }
}
