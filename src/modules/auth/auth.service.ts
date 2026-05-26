import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });

    if (existing) {
      throw new ConflictException('Email or username already taken');
    }

    const hashed = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        displayName: dto.displayName,
        password: hashed,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
      },
    });

    // Seed new users into a default #general channel if it exists
    const general = await this.prisma.channel.findFirst({
      where: { name: 'general' },
    });
    if (general) {
      const exists = await this.prisma.channelMember.findUnique({
        where: { userId_channelId: { userId: user.id, channelId: general.id } },
      });
      if (!exists) {
        await this.prisma.channelMember.create({
          data: { userId: user.id, channelId: general.id },
        });
      }
    }

    const token = this.signToken(user.id, user.username);
    return { user, token };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { username: dto.identifier }],
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    const { password: _, ...safe } = user;
    const token = this.signToken(user.id, user.username);
    return { user: safe, token };
  }

  private signToken(userId: string, username: string) {
    return this.jwt.sign({ sub: userId, username });
  }
}
