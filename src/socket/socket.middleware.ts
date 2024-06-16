import { Socket } from 'socket.io';
import { SocketGuard } from './socket.guard';

export type SocketIOMiddleware = {
  (client: Socket, next: (error?: Error) => void);
}

export const SocketMiddleware = (): SocketIOMiddleware => {
  return async (client, next) => {
    try {
      await SocketGuard.verifyToken(client);
      next();
    } catch (error) {
      next(error);
    }
  }
}
