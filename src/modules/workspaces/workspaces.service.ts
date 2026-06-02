import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { CreateInviteDto } from './dto/create-invite.dto';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const WORKSPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  ownerId: true,
  createdAt: true,
  _count: { select: { members: true } },
};

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    let slug = dto.slug ?? toSlug(dto.name);
    if (!slug) throw new BadRequestException('Invalid workspace name');

    // Ensure slug uniqueness by appending a suffix when needed
    const existing = await this.prisma.workspace.findUnique({
      where: { slug },
    });
    if (existing) {
      const suffix = randomBytes(3).toString('hex');
      slug = `${slug}-${suffix}`;
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug,
        ownerId: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
      select: WORKSPACE_SELECT,
    });

    // Create default #general channel and add owner
    await this.prisma.channel.create({
      data: {
        name: 'general',
        workspaceId: workspace.id,
        type: 'PUBLIC',
        members: { create: { userId, role: 'OWNER' } },
      },
    });

    return workspace;
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: { select: WORKSPACE_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  }

  async findOne(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: WORKSPACE_SELECT,
    });
    if (!ws) throw new NotFoundException('Workspace not found');
    return ws;
  }

  async getMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
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
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMemberRole(
    workspaceId: string,
    requesterId: string,
    targetUserId: string,
    role: string,
  ) {
    const requester = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: requesterId } },
    });
    if (
      !requester ||
      (requester.role !== 'OWNER' && requester.role !== 'ADMIN')
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (role === 'OWNER')
      throw new ForbiddenException('Cannot assign OWNER role this way');

    return this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: role as any },
    });
  }

  async removeMember(
    workspaceId: string,
    requesterId: string,
    targetUserId: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.ownerId === targetUserId)
      throw new ForbiddenException('Cannot remove the owner');

    const requester = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: requesterId } },
    });
    if (
      !requester ||
      (requester.role !== 'OWNER' &&
        requester.role !== 'ADMIN' &&
        requesterId !== targetUserId)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
  }

  // ── Invites ──────────────────────────────────────────────────────────────

  async createInvite(
    workspaceId: string,
    createdById: string,
    dto: CreateInviteDto,
  ) {
    const token = randomBytes(24).toString('base64url');
    return this.prisma.workspaceInvite.create({
      data: {
        token,
        workspaceId,
        createdById,
        email: dto.email,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      select: {
        id: true,
        token: true,
        email: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async listInvites(workspaceId: string) {
    return this.prisma.workspaceInvite.findMany({
      where: { workspaceId },
      select: {
        id: true,
        token: true,
        email: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(
    workspaceId: string,
    requesterId: string,
    inviteId: string,
  ) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.workspaceId !== workspaceId)
      throw new NotFoundException('Invite not found');

    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: requesterId } },
    });
    if (
      !member ||
      (member.role !== 'OWNER' &&
        member.role !== 'ADMIN' &&
        invite.createdById !== requesterId)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.prisma.workspaceInvite.delete({ where: { id: inviteId } });
  }

  async getInvitePreview(token: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: { select: { members: true } },
          },
        },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found or invalid');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite link has expired');
    }
    return {
      workspace: invite.workspace,
      email: invite.email,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token },
    });
    if (!invite) throw new NotFoundException('Invite not found or invalid');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite link has expired');
    }

    const workspaceId = invite.workspaceId;

    // Idempotent — already a member
    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!existing) {
      await this.prisma.workspaceMember.create({
        data: { workspaceId, userId, role: 'MEMBER' },
      });
    }

    // Join #general channel of the workspace
    const general = await this.prisma.channel.findFirst({
      where: { workspaceId, name: 'general' },
    });
    if (general) {
      await this.prisma.channelMember.upsert({
        where: { userId_channelId: { userId, channelId: general.id } },
        create: { userId, channelId: general.id },
        update: {},
      });
    }

    return { workspaceId };
  }
}
