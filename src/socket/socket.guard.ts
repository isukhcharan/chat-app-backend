import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class SocketGuard implements CanActivate {
  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    if (context.getType() !== 'ws') {
      return true;
    }
    const client: Socket = context.switchToWs().getClient();
    await SocketGuard.verifyToken(client);
    return true;
  }

  static async verifyToken(client: Socket) {
    try {
      const jwtService = new JwtService();
      const { access_token } = client.handshake.auth;
      if (!access_token) {
        throw new UnauthorizedException();
      }
      const payload = await jwtService.verifyAsync(
        access_token, { secret: process.env.JWT_SECRET }
      );

      client['userId'] = payload._id;
      return true;
    } catch (error) {
      throw new UnauthorizedException();
    }
  }

}
