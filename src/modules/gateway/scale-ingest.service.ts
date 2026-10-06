import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ScaleCommandStatus, ScaleCommandType, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { normalizeMac } from '../../common/utils/mac.util';
import { AckDto, UploadBillDto } from './dto/gateway.dto';

/// Everything that happens when a scale talks to the cloud. The protocol
/// adapter (written after the scale traffic test) parses the scale's own
/// messages and calls these methods; until then the simulator does.
@Injectable()
export class ScaleIngestService {
  private readonly logger = new Logger(ScaleIngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scaleByMac(rawMac: string) {
    const mac = normalizeMac(rawMac);
    if (!mac) throw new BadRequestException('Invalid MAC address');
    const scale = await this.prisma.scale.findUnique({ where: { mac } });
    if (!scale) {
      this.logger.warn(`Unknown scale ${mac} tried to connect`);
      throw new NotFoundException(`Scale ${mac} is not registered`);
    }
    return scale;
  }

  async heartbeat(rawMac: string, info: { ip?: string; firmware?: string } = {}) {
    const scale = await this.scaleByMac(rawMac);
    return this.prisma.scale.update({
      where: { id: scale.id },
      data: { lastSeenAt: new Date(), lastIp: info.ip, firmware: info.firmware ?? undefined },
    });
  }

  async uploadBill(rawMac: string, dto: UploadBillDto, raw?: Prisma.InputJsonValue) {
    const scale = await this.heartbeat(rawMac);
    if (!scale.branchId || !scale.customerId) throw new ConflictException('Scale is not assigned to a branch');
    const branchId = scale.branchId;
    const billedAt = new Date(dto.billedAt);

    const duplicate = await this.prisma.bill.findUnique({
      where: { scaleId_billNo_billedAt: { scaleId: scale.id, billNo: dto.billNo, billedAt } },
    });
    if (duplicate) return { bill: duplicate, duplicate: true };

    const items = await this.prisma.item.findMany({
      where: { customerId: scale.customerId, plu: { in: dto.lines.map((l) => l.plu) } },
      include: { branchItems: { where: { branchId } } },
    });
    const byPlu = new Map(items.map((i) => [i.plu, i]));

    const lines = dto.lines.map((l) => {
      const item = byPlu.get(l.plu);
      const price = new Prisma.Decimal(l.price ?? item?.branchItems[0]?.price ?? item?.defaultPrice ?? 0);
      const quantity = new Prisma.Decimal(l.quantity);
      const amount = new Prisma.Decimal(l.amount ?? quantity.times(price).toDecimalPlaces(2));
      // GST charged on top only for items priced excluding GST
      const tax = item && item.gstMode === 'EXCLUDED' ? amount.times(item.gstPercent).dividedBy(100).toDecimalPlaces(2) : new Prisma.Decimal(0);
      return {
        itemId: item?.id ?? null,
        plu: l.plu,
        name: l.name ?? item?.name ?? `PLU ${l.plu}`,
        unit: item?.unit ?? 'KG',
        quantity, price, amount, tax,
      };
    });
    const subtotal = lines.reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
    const tax = lines.reduce((s, l) => s.plus(l.tax), new Prisma.Decimal(0));
    const discount = new Prisma.Decimal(dto.discount ?? 0);

    const bill = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bill.create({
        data: {
          branchId,
          scaleId: scale.id,
          billNo: dto.billNo,
          billedAt,
          subtotal,
          discount,
          tax,
          total: subtotal.plus(tax).minus(discount),
          raw: raw ?? (dto as unknown as Prisma.InputJsonValue),
          lines: { create: lines.map(({ tax: _t, ...l }) => l) },
        },
        include: { lines: true },
      });
      for (const l of lines) {
        if (l.itemId) {
          await StockService.move(tx, branchId, l.itemId, l.quantity.negated(), StockMovementType.SALE, { refId: created.id });
        }
      }
      return created;
    });
    return { bill, duplicate: false };
  }

  /// Pending work for this scale, marked as sent. Payloads are expanded to
  /// what the scale needs (e.g. full item list with this branch's prices).
  async takeCommands(rawMac: string) {
    const scale = await this.heartbeat(rawMac);
    const pending = await this.prisma.scaleCommand.findMany({
      where: { scaleId: scale.id, status: ScaleCommandStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });
    if (!pending.length) return [];
    await this.prisma.scaleCommand.updateMany({
      where: { id: { in: pending.map((c) => c.id) } },
      data: { status: ScaleCommandStatus.SENT, sentAt: new Date() },
    });
    return Promise.all(pending.map(async (c) => ({
      id: c.id,
      type: c.type,
      payload: c.type === ScaleCommandType.PUSH_ITEMS ? await this.itemsForScale(scale.branchId, scale.customerId) : c.payload,
    })));
  }

  async itemsForScale(branchId: string | null, customerId: string | null) {
    if (!branchId || !customerId) return { items: [] };
    const items = await this.prisma.item.findMany({
      where: { customerId },
      orderBy: { plu: 'asc' },
      include: { branchItems: { where: { branchId } }, category: { select: { code: true } } },
    });
    return {
      items: items.map((i) => ({
        plu: i.plu,
        name: i.name,
        price: i.branchItems[0]?.price ?? i.defaultPrice,
        unit: i.unit,
        tareGrams: i.tareGrams,
        barcode: i.barcode,
        gstPercent: i.gstPercent,
        gstMode: i.gstMode,
        categoryCode: i.category?.code ?? null,
      })),
    };
  }

  async ack(rawMac: string, commandId: string, dto: AckDto) {
    const scale = await this.heartbeat(rawMac);
    const command = await this.prisma.scaleCommand.findFirst({ where: { id: commandId, scaleId: scale.id } });
    if (!command) throw new NotFoundException('Command not found');

    if (dto.ok && command.type === ScaleCommandType.PULL_ITEMS && dto.items?.length) {
      await this.importItems(scale.customerId, scale.branchId, dto.items);
    }
    let payload = command.payload as Prisma.JsonObject | null;
    if (command.type === ScaleCommandType.SET_WIFI && payload) payload = { ...payload, password: null };

    return this.prisma.scaleCommand.update({
      where: { id: command.id },
      data: {
        status: dto.ok ? ScaleCommandStatus.DONE : ScaleCommandStatus.FAILED,
        error: dto.error,
        completedAt: new Date(),
        payload: payload ?? Prisma.DbNull,
      },
    });
  }

  private async importItems(customerId: string | null, branchId: string | null, items: NonNullable<AckDto['items']>) {
    if (!customerId || !branchId) throw new ConflictException('Scale is not assigned to a branch');
    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        const item = await tx.item.upsert({
          where: { customerId_plu: { customerId, plu: it.plu } },
          create: {
            customerId, plu: it.plu, name: it.name, unit: it.unit, tareGrams: it.tareGrams ?? 0,
            barcode: it.barcode, defaultPrice: it.price,
          },
          update: { name: it.name, unit: it.unit, tareGrams: it.tareGrams, barcode: it.barcode },
        });
        await tx.branchItem.upsert({
          where: { branchId_itemId: { branchId, itemId: item.id } },
          create: { branchId, itemId: item.id, price: it.price },
          update: { price: it.price },
        });
      }
    });
  }
}
