import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { Message } from "src/interface/message.interface";
import { UserService } from "src/services/user.service";

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server

    constructor(
        private userService: UserService,
    ) { }

    handleConnection(client: any, ...args: any[]) {
        console.log("Connected", client.id);
        this.userService.newUser(client.id);
    }

    handleDisconnect(client: any) {
        console.log("Disconnected", client.id);
        const user = this.userService.getUserById(client.id);
        if (user && this.server.sockets.sockets.get(user.connected_to)) {
            this.server.to(user.connected_to).emit('user-disconnected', true);
            this.userService.setUserDisconnected(client.id, user.connected_to);
        }
        this.userService.removeUser(client.id);
    }

    @SubscribeMessage('message')
    handleMessage(@MessageBody() message: Message, @ConnectedSocket() client: any) {
        this.server.to(message.to).emit('on-message', message);
    }

    @SubscribeMessage('connect-user')
    handleUserConnect(@MessageBody() otherUserSocketId: string, @ConnectedSocket() client: any) {
        this.userService.setUserConnected(otherUserSocketId, client.id);
        this.userService.setUserConnected(client.id, otherUserSocketId);
        this.server.to(otherUserSocketId).emit('on-user-connect', client.id);
    }


}