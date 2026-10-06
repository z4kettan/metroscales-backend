import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';

/// Works out which customer and branches a request may touch.
/// Shop users are tied to their own customer (staff to their assigned
/// branches); the dealer admin may act on any customer by naming it.
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  customerIdFor(user: AuthUser, requested?: string): string {
    if (user.role === Role.DEALER_ADMIN) {
      if (!requested) throw new BadRequestException('customerId is required');
      return requested;
    }
    if (!user.customerId) throw new ForbiddenException('User has no customer');
    if (requested && requested !== user.customerId) {
      throw new ForbiddenException('You do not have access to this customer');
    }
    return user.customerId;
  }

  /// Branch ids the user may see, or null for "every branch of the customer".
  async allowedBranchIds(user: AuthUser): Promise<string[] | null> {
    if (user.role !== Role.STAFF) return null;
    const rows = await this.prisma.userBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });
    return rows.map((r) => r.branchId);
  }

  async branch(user: AuthUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    if (user.role === Role.DEALER_ADMIN) return branch;
    if (branch.customerId !== user.customerId) {
      throw new ForbiddenException('You do not have access to this branch');
    }
    const allowed = await this.allowedBranchIds(user);
    if (allowed && !allowed.includes(branchId)) {
      throw new ForbiddenException('You do not have access to this branch');
    }
    return branch;
  }

  async scale(user: AuthUser, scaleId: string) {
    const scale = await this.prisma.scale.findUnique({ where: { id: scaleId } });
    if (!scale) throw new NotFoundException('Scale not found');
    if (user.role === Role.DEALER_ADMIN) return scale;
    if (!scale.branchId || scale.customerId !== user.customerId) {
      throw new ForbiddenException('You do not have access to this scale');
    }
    await this.branch(user, scale.branchId);
    return scale;
  }

  assertOwnerOrDealer(user: AuthUser) {
    if (user.role === Role.STAFF) {
      throw new ForbiddenException('Only the shop owner can do this');
    }
  }
}
