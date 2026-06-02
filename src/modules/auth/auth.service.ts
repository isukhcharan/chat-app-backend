import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
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
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException(
        'An account with this email already exists. Try signing in instead.',
      );
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException(
        'This username is already taken. Please choose a different one.',
      );
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

    const token = this.signToken(user.id, user.username);
    return { user, token, hasWorkspace: false };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { username: dto.identifier }],
      },
    });

    if (!user) {
      throw new NotFoundException(
        'No account found with that email or username. Would you like to create one?',
      );
    }

    const match = await bcrypt.compare(dto.password, user.password);
    if (!match)
      throw new UnauthorizedException('Incorrect password. Please try again.');

    const { password: _, ...safe } = user;
    const token = this.signToken(user.id, user.username);
    const workspaceCount = await this.prisma.workspaceMember.count({
      where: { userId: user.id },
    });
    return { user: safe, token, hasWorkspace: workspaceCount > 0 };
  }

  private signToken(userId: string, username: string) {
    return this.jwt.sign({ sub: userId, username });
  }
}
