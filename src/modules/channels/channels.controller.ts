import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('workspaces/:workspaceId/channels')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.create(user.id, workspaceId, dto);
  }

  @Get()
  findAll(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.channelsService.findAll(user.id, workspaceId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.channelsService.findOne(id, user.id);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@Param('id') id: string, @CurrentUser() user: any) {
    return this.channelsService.join(id, user.id);
  }

  @Delete(':id/leave')
  @HttpCode(200)
  leave(@Param('id') id: string, @CurrentUser() user: any) {
    return this.channelsService.leave(id, user.id);
  }

  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.channelsService.getMessages(
      id,
      user.id,
      cursor,
      limit ? +limit : 50,
    );
  }

  @Get(':id/messages/:messageId/replies')
  getReplies(@Param('messageId') messageId: string) {
    return this.channelsService.getThreadReplies(messageId);
  }

  @Post(':id/read')
  @HttpCode(200)
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.channelsService.updateLastRead(id, user.id);
  }
}
