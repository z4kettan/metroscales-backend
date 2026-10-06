import { Injectable } from '@nestjs/common';
import { ScaleCommandType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isOnline, ScaleCommandsService } from '../scales/scale-commands.service';
import { BillSettingsDto, CreateBranchDto, UpdateBranchDto } from './dto/branches.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: ScaleCommandsService,
  ) {}

  async list(customerId: string, onlyIds: string[] | null) {
    const branches = await this.prisma.branch.findMany({
      where: { customerId, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
      orderBy: { name: 'asc' },
      include: { scales: { select: { lastSeenAt: true } } },
    });
    return branches.map(({ scales, ...b }) => ({
      ...b,
      scaleCount: scales.length,
      onlineScaleCount: scales.filter((s) => isOnline(s.lastSeenAt)).length,
    }));
  }

  async create(customerId: string, dto: CreateBranchDto) {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: { customerId, name: dto.name.trim(), address: dto.address, phone: dto.phone },
      });
      // New branch starts with every item at its default price
      const items = await tx.item.findMany({ where: { customerId }, select: { id: true, defaultPrice: true } });
      if (items.length) {
        await tx.branchItem.createMany({
          data: items.map((i) => ({ branchId: branch.id, itemId: i.id, price: i.defaultPrice })),
        });
      }
      return branch;
    });
  }

  update(branchId: string, dto: UpdateBranchDto) {
    return this.prisma.branch.update({ where: { id: branchId }, data: { ...dto, name: dto.name?.trim() } });
  }

  async remove(branchId: string) {
    await this.prisma.branch.delete({ where: { id: branchId } });
    return { deleted: true };
  }

  async getBillSettings(branchId: string) {
    return (
      (await this.prisma.billSettings.findUnique({ where: { branchId } })) ?? {
        branchId, header: null, billFooter: null, itemFooter: null, offerTitle: null,
      }
    );
  }

  async saveBillSettings(branchId: string, dto: BillSettingsDto, userId: string) {
    const settings = await this.prisma.billSettings.upsert({
      where: { branchId },
      create: { branchId, ...dto },
      update: dto,
    });
    const { updatedAt, ...payload } = settings;
    const queued = await this.commands.queueForBranch(branchId, ScaleCommandType.SET_BILL_SETTINGS, payload, userId);
    return { ...settings, queuedForScales: queued.length };
  }
}
