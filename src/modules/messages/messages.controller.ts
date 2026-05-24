import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('channels/:channelId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Post()
  create(
    @Param('channelId') channelId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(channelId, user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('content') content: string,
  ) {
    return this.messagesService.update(id, user.id, content);
  }

  @Delete(':id')
  @HttpCode(200)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.messagesService.delete(id, user.id);
  }

  @Post(':id/reactions')
  @HttpCode(200)
  toggleReaction(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('emoji') emoji: string,
  ) {
    return this.messagesService.toggleReaction(id, user.id, emoji);
  }
}
