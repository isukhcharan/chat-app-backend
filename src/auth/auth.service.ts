import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './auth.dto';


@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService
    ) { }

    async logIn(loginDto: LoginDto): Promise<{ access_token: string }> {
        const user = await this.usersService.findOne(loginDto.username);
        if (!user) {
            throw new UnauthorizedException();
        }
        const isPasswordMatch = await bcrypt.compare(loginDto.password, user?.password)
        if (!isPasswordMatch) {
            throw new UnauthorizedException();
        }
        const payload = { _id: user._id, username: user.username };
        return {
            access_token: await this.jwtService.signAsync(payload, {
                secret: process.env.JWT_SECRET
            }),
        };
    }
}