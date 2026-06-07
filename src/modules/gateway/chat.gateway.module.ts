import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessagesModule } from '../messages/messages.module';
import { AiModule } from '../ai/ai.module';
import { ChannelsModule } from '../channels/channels.module';
import { UsersModule } from '../users/users.module';
import { DmsModule } from '../dms/dms.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MessagesModule,
    AiModule,
    ChannelsModule,
    UsersModule,
    DmsModule,
    AuthModule,
  ],
  providers: [ChatGateway],
})
export class ChatGatewayModule {}
