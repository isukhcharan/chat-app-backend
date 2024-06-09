import { Controller, Get, Param } from '@nestjs/common';
import { UserService } from './services/user.service';

@Controller('/')
export class AppController {
  constructor(private readonly userService: UserService) { }

  @Get(':socketId')
  getActiveUsers(@Param('socketId') socketId: string) {
    const user = this.userService.getActiveUser(socketId);
    return {
      data: user,
      message: 'Success',
    };
  }
}
