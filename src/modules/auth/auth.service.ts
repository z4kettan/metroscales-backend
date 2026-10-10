import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ChangeSecretDto, LoginDto, normalizeUsername, UpdateProfileDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hashSecret(secret: string) {
    return bcrypt.hash(secret, 10);
  }

  async login(dto: LoginDto) {
    const login = normalizeUsername(dto.username);
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: login }, { email: login }] },
      include: { customer: true },
    });
    if (!user || !user.isActive || (user.customer && !user.customer.isActive)) {
      throw new UnauthorizedException('Wrong username or password');
    }
    if (!(await bcrypt.compare(dto.secret, user.secretHash))) {
      throw new UnauthorizedException('Wrong username or password');
    }
    return { user: await this.profile(user.id), ...(await this.issueTokens(user.id, user.role)) };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    // Rotate: each refresh token can be used once
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(stored.userId, stored.user.role);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: this.hash(refreshToken) } });
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        customer: { select: { id: true, name: true } },
        branches: { select: { branchId: true } },
      },
    });
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      customer: user.customer,
      branchIds: user.branches.map((b) => b.branchId),
    };
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { name: dto.name?.trim(), email: dto.email?.toLowerCase().trim() },
    });
    return this.profile(user.id);
  }

  async changeSecret(user: AuthUser, dto: ChangeSecretDto) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(dto.currentSecret, row.secretHash))) {
      throw new BadRequestException('Current password is wrong');
    }
    if (row.role === Role.DEALER_ADMIN && dto.newSecret.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { secretHash: await AuthService.hashSecret(dto.newSecret) },
    });
    // Sign out other devices
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    return { changed: true };
  }

  private async issueTokens(userId: string, role: Role) {
    const accessToken = await this.jwt.signAsync({ sub: userId, role });
    const refreshToken = randomBytes(48).toString('hex');
    const days = parseInt(this.config.get('JWT_REFRESH_EXPIRY', '30d'), 10) || 30;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });
    return { accessToken, refreshToken };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
