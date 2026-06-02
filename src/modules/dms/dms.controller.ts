import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { DmsService } from './dms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('workspaces/:workspaceId/dms')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class DmsController {
  constructor(private dmsService: DmsService) {}

  @Get('unread/counts')
  getUnreadCounts(@CurrentUser() user: any) {
    return this.dmsService.getUnreadCounts(user.id);
  }

  @Get(':partnerId')
  getConversation(
    @CurrentUser() user: any,
    @Param('partnerId') partnerId: string,
  ) {
    return this.dmsService.getConversation(user.id, partnerId);
  }

  @Post(':partnerId/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: any, @Param('partnerId') partnerId: string) {
    return this.dmsService.markRead(partnerId, user.id);
  }
}
