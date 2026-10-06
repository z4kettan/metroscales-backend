import { Injectable } from '@nestjs/common';
import { Prisma, ScaleCommandStatus, ScaleCommandType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/// A scale counts as online if it has been heard from this recently.
export const ONLINE_WINDOW_MS = 2 * 60_000;

export function isOnline(lastSeenAt: Date | null | undefined, now = new Date()) {
  return !!lastSeenAt && now.getTime() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

/// Queue of work for scales. Nothing here talks to a scale: the scale
/// gateway (built after the protocol test) picks up PENDING commands when a
/// scale connects, sends them, and marks them DONE or FAILED.
@Injectable()
export class ScaleCommandsService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(scaleIds: string[], type: ScaleCommandType, payload?: Prisma.InputJsonValue, requestedBy?: string) {
    if (!scaleIds.length) return [];
    // A newer command of the same kind replaces one that has not been sent yet
    await this.prisma.scaleCommand.updateMany({
      where: { scaleId: { in: scaleIds }, type, status: ScaleCommandStatus.PENDING },
      data: { status: ScaleCommandStatus.CANCELLED },
    });
    return this.prisma.$transaction(
      scaleIds.map((scaleId) =>
        this.prisma.scaleCommand.create({ data: { scaleId, type, payload, requestedBy } }),
      ),
    );
  }

  async queueForBranch(branchId: string, type: ScaleCommandType, payload?: Prisma.InputJsonValue, requestedBy?: string) {
    const scales = await this.prisma.scale.findMany({ where: { branchId }, select: { id: true } });
    return this.queue(scales.map((s) => s.id), type, payload, requestedBy);
  }

  /// Queues work for every scale a customer owns, in all branches.
  async queueForCustomer(customerId: string, type: ScaleCommandType, payload?: Prisma.InputJsonValue, requestedBy?: string) {
    const scales = await this.prisma.scale.findMany({ where: { customerId, branchId: { not: null } }, select: { id: true } });
    return this.queue(scales.map((s) => s.id), type, payload, requestedBy);
  }

  list(scaleId: string, take = 50) {
    return this.prisma.scaleCommand.findMany({ where: { scaleId }, orderBy: { createdAt: 'desc' }, take });
  }
}
