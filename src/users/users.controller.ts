import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './user.dto';
import { Public } from 'src/decorators/public.decorator';

@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Get()
    async findAll() {
        const users = await this.usersService.findAll();
        return users;
    }

    @Public()
    @Post()
    async createUser(@Body() createUserDto: CreateUserDto) {
        return await this.usersService.create(createUserDto);
    }

    @Public()
    @Get(':socketId')
    getActiveUsers(@Param('socketId') socketId: string) {
        return this.usersService.getActiveUser(socketId);
    }
}
