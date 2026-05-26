import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DmsService } from './dms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('dms')
@UseGuards(JwtAuthGuard)
export class DmsController {
  constructor(private dmsService: DmsService) {}

  @Get(':partnerId')
  getConversation(@CurrentUser() user: any, @Param('partnerId') partnerId: string) {
    return this.dmsService.getConversation(user.id, partnerId);
  }

  @Get('unread/counts')
  getUnreadCounts(@CurrentUser() user: any) {
    return this.dmsService.getUnreadCounts(user.id);
  }
}
