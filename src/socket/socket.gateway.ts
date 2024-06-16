import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { IMessage } from 'src/interface/message.interface';
import { UsersService } from 'src/users/users.service';
import { SocketGuard } from './socket.guard';
import { Socket } from 'socket.io';
import { SocketMiddleware } from './socket.middleware';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseGuards(SocketGuard)
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private userService: UsersService) { }

  afterInit(server: Server) {
    server.use(SocketMiddleware())
  }

  handleConnection(client: Socket) {
    console.log('Connected', client.id);
    this.userService.newUser(client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('Disconnected', client.id);
    const user = this.userService.getUserById(client.id);
    if (user && this.server.sockets.sockets.get(user.connected_to)) {
      this.server.to(user.connected_to).emit('user-disconnected', true);
      this.userService.setUserDisconnected(client.id, user.connected_to);
    }
    this.userService.removeUser(client.id);
  }

  @SubscribeMessage('message')
  handleMessage(@MessageBody() message: IMessage) {
    this.server.to(message.to).emit('on-message', message);
  }

  @SubscribeMessage('connect-user')
  handleUserConnect(
    @MessageBody() otherUserSocketId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.userService.setUserConnected(otherUserSocketId, client.id);
    this.userService.setUserConnected(client.id, otherUserSocketId);
    this.server.to(otherUserSocketId).emit('on-user-connect', client.id);
  }
}
