import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AiModule } from './modules/ai/ai.module';
import { DmsModule } from './modules/dms/dms.module';
import { ChatGatewayModule } from './modules/gateway/chat.gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AttachmentsModule,
    AuthModule,
    UsersModule,
    ChannelsModule,
    MessagesModule,
    AiModule,
    DmsModule,
    ChatGatewayModule,
  ],
})
export class AppModule {}
