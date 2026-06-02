import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private workspacesService: WorkspacesService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.workspacesService.findAllForUser(user.id);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  findOne(@Param('workspaceId') id: string) {
    return this.workspacesService.findOne(id);
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard)
  getMembers(@Param('workspaceId') id: string) {
    return this.workspacesService.getMembers(id);
  }

  @Patch(':workspaceId/members/:userId/role')
  @UseGuards(WorkspaceMemberGuard)
  updateMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: any,
    @Body('role') role: string,
  ) {
    return this.workspacesService.updateMemberRole(
      workspaceId,
      user.id,
      targetUserId,
      role,
    );
  }

  @Delete(':workspaceId/members/:userId')
  @UseGuards(WorkspaceMemberGuard)
  @HttpCode(200)
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.removeMember(
      workspaceId,
      user.id,
      targetUserId,
    );
  }

  @Post(':workspaceId/invites')
  @UseGuards(WorkspaceMemberGuard)
  createInvite(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateInviteDto,
  ) {
    return this.workspacesService.createInvite(workspaceId, user.id, dto);
  }

  @Get(':workspaceId/invites')
  @UseGuards(WorkspaceMemberGuard)
  listInvites(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.listInvites(workspaceId);
  }

  @Delete(':workspaceId/invites/:inviteId')
  @UseGuards(WorkspaceMemberGuard)
  @HttpCode(200)
  revokeInvite(
    @Param('workspaceId') workspaceId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.revokeInvite(workspaceId, user.id, inviteId);
  }
}
