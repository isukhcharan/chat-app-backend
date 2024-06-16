import { Module } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { UsersModule } from 'src/users/users.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [UsersModule, JwtModule],
    providers: [SocketGateway]
})
export class SocketModule {}
