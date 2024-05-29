import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { SocketGateway } from './gateway/socket.gateway';
import { UserService } from './services/user.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [SocketGateway, UserService],
})
export class AppModule { }
