import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('invites')
export class InvitesController {
  constructor(private workspacesService: WorkspacesService) {}

  @Get(':token')
  getPreview(@Param('token') token: string) {
    return this.workspacesService.getInvitePreview(token);
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  acceptInvite(@Param('token') token: string, @CurrentUser() user: any) {
    return this.workspacesService.acceptInvite(token, user.id);
  }
}
