import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays, dayStart, DEFAULT_TZ_OFFSET_MINUTES, localDay, todayLocal } from '../../common/utils/dates.util';

const MAX_RANGE_DAYS = 366;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(from: string, to: string, tz: number) {
    if (from > to) throw new BadRequestException('from must be on or before to');
    const start = dayStart(from, tz);
    const end = dayStart(addDays(to, 1), tz);
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Range can be at most ${MAX_RANGE_DAYS} days`);
    }
    return { gte: start, lt: end };
  }

  async summary(branchId: string, date?: string, tz = DEFAULT_TZ_OFFSET_MINUTES) {
    const day = date ?? todayLocal(tz);
    const agg = await this.prisma.bill.aggregate({
      where: { branchId, billedAt: this.range(day, day, tz) },
      _count: true,
      _sum: { total: true, discount: true, tax: true },
    });
    return {
      date: day,
      bills: agg._count,
      total: agg._sum.total ?? new Prisma.Decimal(0),
      discount: agg._sum.discount ?? new Prisma.Decimal(0),
      tax: agg._sum.tax ?? new Prisma.Decimal(0),
    };
  }

  /// One row per day in the range, including days with no sales
  async daily(branchId: string, from: string, to: string, tz = DEFAULT_TZ_OFFSET_MINUTES) {
    const bills = await this.prisma.bill.findMany({
      where: { branchId, billedAt: this.range(from, to, tz) },
      select: { billedAt: true, total: true, discount: true, tax: true },
    });
    const days = new Map<string, { date: string; bills: number; total: Prisma.Decimal; discount: Prisma.Decimal; tax: Prisma.Decimal }>();
    for (let d = from; d <= to; d = addDays(d, 1)) {
      days.set(d, { date: d, bills: 0, total: new Prisma.Decimal(0), discount: new Prisma.Decimal(0), tax: new Prisma.Decimal(0) });
    }
    for (const b of bills) {
      const row = days.get(localDay(b.billedAt, tz));
      if (!row) continue;
      row.bills++;
      row.total = row.total.plus(b.total);
      row.discount = row.discount.plus(b.discount);
      row.tax = row.tax.plus(b.tax);
    }
    return [...days.values()];
  }

  async dailyCsv(branchId: string, from: string, to: string, tz?: number) {
    const rows = await this.daily(branchId, from, to, tz);
    const lines = ['Date,Bills,Total,Discount,Tax'];
    for (const r of rows) lines.push(`${r.date},${r.bills},${r.total.toFixed(2)},${r.discount.toFixed(2)},${r.tax.toFixed(2)}`);
    return lines.join('\n') + '\n';
  }

  bills(branchId: string, date?: string, tz = DEFAULT_TZ_OFFSET_MINUTES) {
    const day = date ?? todayLocal(tz);
    return this.prisma.bill.findMany({
      where: { branchId, billedAt: this.range(day, day, tz) },
      orderBy: { billedAt: 'desc' },
      include: { lines: true, scale: { select: { id: true, name: true, number: true } } },
    });
  }

  async itemSales(branchId: string, from: string, to: string, tz = DEFAULT_TZ_OFFSET_MINUTES) {
    const rows = await this.prisma.billLine.groupBy({
      by: ['plu', 'name', 'unit'],
      where: { bill: { branchId, billedAt: this.range(from, to, tz) } },
      _sum: { quantity: true, amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
    });
    return rows.map((r) => ({
      plu: r.plu, name: r.name, unit: r.unit, lines: r._count,
      quantity: r._sum.quantity ?? new Prisma.Decimal(0),
      amount: r._sum.amount ?? new Prisma.Decimal(0),
    }));
  }

  async deleteBills(branchId: string, from: string, to: string, tz = DEFAULT_TZ_OFFSET_MINUTES) {
    const { count } = await this.prisma.bill.deleteMany({ where: { branchId, billedAt: this.range(from, to, tz) } });
    return { deleted: count };
  }
}
