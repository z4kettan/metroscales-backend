import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';

const userSelect = {
  id: true, name: true, email: true, role: true, isActive: true, customerId: true, createdAt: true,
  branches: { select: { branch: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string) {
    const users = await this.prisma.user.findMany({ where: { customerId }, orderBy: { name: 'asc' }, select: userSelect });
    return users.map(flatten);
  }

  async create(customerId: string, dto: CreateUserDto) {
    await this.checkBranches(customerId, dto.branchIds);
    const user = await this.prisma.user.create({
      data: {
        customerId,
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        role: dto.role as Role,
        secretHash: await AuthService.hashSecret(dto.pin),
        branches: dto.role === 'STAFF' && dto.branchIds?.length
          ? { create: dto.branchIds.map((branchId) => ({ branchId })) }
          : undefined,
      },
      select: userSelect,
    });
    return flatten(user);
  }

  async update(customerId: string, id: string, dto: UpdateUserDto, actingUserId: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, customerId } });
    if (!existing) throw new NotFoundException('User not found');
    if (id === actingUserId && (dto.isActive === false || dto.role === 'STAFF')) {
      throw new BadRequestException('You cannot remove your own owner access');
    }
    await this.checkBranches(customerId, dto.branchIds);
    const user = await this.prisma.$transaction(async (tx) => {
      if (dto.branchIds) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        if (dto.branchIds.length) await tx.userBranch.createMany({ data: dto.branchIds.map((branchId) => ({ userId: id, branchId })) });
      }
      if (dto.isActive === false || dto.pin) await tx.refreshToken.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          email: dto.email?.toLowerCase().trim(),
          role: dto.role as Role | undefined,
          isActive: dto.isActive,
          secretHash: dto.pin ? await AuthService.hashSecret(dto.pin) : undefined,
        },
        select: userSelect,
      });
    });
    return flatten(user);
  }

  private async checkBranches(customerId: string, branchIds?: string[]) {
    if (!branchIds?.length) return;
    const count = await this.prisma.branch.count({ where: { id: { in: branchIds }, customerId } });
    if (count !== new Set(branchIds).size) throw new BadRequestException('Some branches do not belong to this shop');
  }
}

function flatten(user: any) {
  const { branches, ...rest } = user;
  return { ...rest, branches: branches.map((b: any) => b.branch) };
}
