import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScaleCommandType, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScaleCommandsService } from '../scales/scale-commands.service';
import { CreatePurchaseDto, PurchaseListQuery, SetPricesDto, SetStockDto } from './dto/stock.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: ScaleCommandsService,
  ) {}

  /// Moves stock by `delta` and logs it. Used by purchases, adjustments and
  /// (later) sales uploaded from the scales.
  static async move(
    tx: Tx,
    branchId: string,
    itemId: string,
    delta: Prisma.Decimal,
    type: StockMovementType,
    extra: { refId?: string; note?: string; userId?: string } = {},
  ) {
    const existing = await tx.branchItem.findUnique({ where: { branchId_itemId: { branchId, itemId } } });
    let balance: Prisma.Decimal;
    if (existing) {
      const updated = await tx.branchItem.update({
        where: { branchId_itemId: { branchId, itemId } },
        data: { stock: { increment: delta } },
      });
      balance = updated.stock;
    } else {
      const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
      const created = await tx.branchItem.create({
        data: { branchId, itemId, price: item.defaultPrice, stock: delta },
      });
      balance = created.stock;
    }
    await tx.stockMovement.create({
      data: { branchId, itemId, type, quantity: delta, balance, ...extra },
    });
    return balance;
  }

  private async assertItems(branchId: string, itemIds: string[]) {
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const unique = [...new Set(itemIds)];
    const count = await this.prisma.item.count({ where: { id: { in: unique }, customerId: branch.customerId } });
    if (count !== unique.length) throw new BadRequestException('Some items do not belong to this shop');
  }

  async setPrices(branchId: string, dto: SetPricesDto, userId: string) {
    await this.assertItems(branchId, dto.prices.map((p) => p.itemId));
    await this.prisma.$transaction(
      dto.prices.map((p) =>
        this.prisma.branchItem.upsert({
          where: { branchId_itemId: { branchId, itemId: p.itemId } },
          create: { branchId, itemId: p.itemId, price: p.price },
          update: { price: p.price },
        }),
      ),
    );
    // Scales need the new prices
    const queued = await this.commands.queueForBranch(
      branchId,
      ScaleCommandType.PUSH_ITEMS,
      { itemIds: dto.prices.map((p) => p.itemId), reason: 'price-change' },
      userId,
    );
    return { updated: dto.prices.length, queuedForScales: queued.length };
  }

  async setStock(branchId: string, dto: SetStockDto, userId: string) {
    await this.assertItems(branchId, dto.stock.map((s) => s.itemId));
    let changed = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.stock) {
        const current = await tx.branchItem.findUnique({
          where: { branchId_itemId: { branchId, itemId: entry.itemId } },
        });
        const delta = new Prisma.Decimal(entry.quantity).minus(current?.stock ?? 0);
        if (delta.isZero()) continue;
        await StockService.move(tx, branchId, entry.itemId, delta, StockMovementType.ADJUSTMENT, {
          note: dto.note, userId,
        });
        changed++;
      }
    });
    return { changed };
  }

  async clearStock(branchId: string, userId: string) {
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.branchItem.findMany({ where: { branchId, NOT: { stock: 0 } } });
      for (const row of rows) {
        await StockService.move(tx, branchId, row.itemId, row.stock.negated(), StockMovementType.CLEAR, { userId });
        cleared++;
      }
    });
    return { cleared };
  }

  movements(branchId: string, itemId?: string) {
    return this.prisma.stockMovement.findMany({
      where: { branchId, ...(itemId ? { itemId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { item: { select: { name: true, plu: true } } },
    });
  }

  listPurchases(branchId: string, q: PurchaseListQuery) {
    return this.prisma.purchase.findMany({
      where: {
        branchId,
        purchasedAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined },
      },
      orderBy: { purchasedAt: 'desc' },
      take: 200,
      include: { lines: { include: { item: { select: { name: true, plu: true, unit: true } } } } },
    });
  }

  async getPurchase(branchId: string, id: string) {
    const p = await this.prisma.purchase.findFirst({
      where: { id, branchId },
      include: { lines: { include: { item: { select: { name: true, plu: true, unit: true } } } } },
    });
    if (!p) throw new NotFoundException('Purchase not found');
    return p;
  }

  async createPurchase(branchId: string, dto: CreatePurchaseDto, userId: string) {
    await this.assertItems(branchId, dto.lines.map((l) => l.itemId));
    const purchase = await this.prisma.$transaction(async (tx) => {
      const lines = dto.lines.map((l) => {
        const qty = new Prisma.Decimal(l.quantity);
        const cost = new Prisma.Decimal(l.unitCost ?? 0);
        return { itemId: l.itemId, quantity: qty, unitCost: cost, amount: qty.times(cost).toDecimalPlaces(2) };
      });
      const total = lines.reduce((sum, l) => sum.plus(l.amount), new Prisma.Decimal(0));
      const created = await tx.purchase.create({
        data: {
          branchId,
          purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : undefined,
          supplier: dto.supplier,
          invoiceNo: dto.invoiceNo,
          note: dto.note,
          total,
          userId,
          lines: { create: lines },
        },
      });
      for (const l of lines) {
        await StockService.move(tx, branchId, l.itemId, l.quantity, StockMovementType.PURCHASE, {
          refId: created.id, userId,
        });
      }
      return created;
    });
    return this.getPurchase(branchId, purchase.id);
  }

  async deletePurchase(branchId: string, id: string, userId: string) {
    const purchase = await this.getPurchase(branchId, id);
    await this.prisma.$transaction(async (tx) => {
      // Take the purchased stock back out before removing the record
      for (const l of purchase.lines) {
        await StockService.move(tx, branchId, l.itemId, l.quantity.negated(), StockMovementType.ADJUSTMENT, {
          refId: id, note: 'Purchase deleted', userId,
        });
      }
      await tx.purchase.delete({ where: { id } });
    });
    return { deleted: true };
  }
}
