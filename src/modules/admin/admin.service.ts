import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ScalesService } from '../scales/scales.service';
import { isOnline, ONLINE_WINDOW_MS } from '../scales/scale-commands.service';
import { normalizeMac } from '../../common/utils/mac.util';
import { dayStart, todayLocal, addDays } from '../../common/utils/dates.util';
import { CreateCustomerDto, CreateScaleDto, ScaleRegistryQuery, UpdateCustomerDto, UpdateScaleDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scales: ScalesService,
  ) {}

  async dashboard() {
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
    const today = todayLocal();
    const todayRange = { gte: dayStart(today), lt: dayStart(addDays(today, 1)) };
    const soon = new Date(Date.now() + 15 * 86_400_000);
    const [customers, activeCustomers, scales, onlineScales, unassignedScales, todaySales, expiring] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { isActive: true } }),
      this.prisma.scale.count(),
      this.prisma.scale.count({ where: { lastSeenAt: { gte: onlineSince } } }),
      this.prisma.scale.count({ where: { branchId: null } }),
      this.prisma.bill.aggregate({ where: { billedAt: todayRange }, _count: true, _sum: { total: true } }),
      this.prisma.customer.findMany({
        where: { isActive: true, subscriptionEndsAt: { lte: soon } },
        orderBy: { subscriptionEndsAt: 'asc' },
        select: { id: true, name: true, subscriptionEndsAt: true },
        take: 20,
      }),
    ]);
    return {
      customers, activeCustomers, scales, onlineScales, unassignedScales,
      billsToday: todaySales._count,
      salesToday: todaySales._sum.total ?? new Prisma.Decimal(0),
      expiringSubscriptions: expiring,
    };
  }

  // ---- customers ----

  async listCustomers(search?: string) {
    const where: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { branches: true, users: true, items: true } },
        scales: { select: { lastSeenAt: true } },
      },
    });
    return customers.map(({ scales, ...c }) => ({
      ...c,
      scaleCount: scales.length,
      onlineScaleCount: scales.filter((s) => isOnline(s.lastSeenAt)).length,
    }));
  }

  async getCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        branches: { orderBy: { name: 'asc' } },
        users: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        },
        _count: { select: { items: true, categories: true } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const scales = await this.scales.list({ customerId: id });
    return { ...customer, scales };
  }

  async createCustomer(dto: CreateCustomerDto) {
    const email = dto.owner.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new BadRequestException('A user with this email already exists');
    }
    const secretHash = await AuthService.hashSecret(dto.owner.pin);
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        notes: dto.notes,
        subscriptionEndsAt: dto.subscriptionEndsAt ? new Date(dto.subscriptionEndsAt) : null,
        branches: { create: { name: (dto.branchName || dto.name).trim() } },
        users: { create: { name: dto.owner.name.trim(), email, secretHash, role: Role.OWNER } },
      },
    });
    return this.getCustomer(customer.id);
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    await this.prisma.customer.update({
      where: { id },
      data: {
        ...dto,
        name: dto.name?.trim(),
        subscriptionEndsAt:
          dto.subscriptionEndsAt === undefined ? undefined : dto.subscriptionEndsAt ? new Date(dto.subscriptionEndsAt) : null,
      },
    });
    if (dto.isActive === false) {
      await this.prisma.refreshToken.deleteMany({ where: { user: { customerId: id } } });
    }
    return this.getCustomer(id);
  }

  // ---- scale registry ----

  listScales(q: ScaleRegistryQuery) {
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
    const where: Prisma.ScaleWhereInput = {};
    if (q.customerId) where.customerId = q.customerId;
    if (q.status === 'unassigned') where.branchId = null;
    if (q.status === 'online') where.lastSeenAt = { gte: onlineSince };
    if (q.status === 'offline') where.OR = [{ lastSeenAt: null }, { lastSeenAt: { lt: onlineSince } }];
    if (q.search) {
      const mac = q.search.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
      where.AND = [{
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          ...(mac ? [{ mac: { contains: mac } }] : []),
          { customer: { name: { contains: q.search, mode: 'insensitive' } } },
        ],
      }];
    }
    return this.scales.list(where).then((rows) =>
      Promise.all(rows.map(async (r) => ({
        ...r,
        customer: r.customerId
          ? await this.prisma.customer.findUnique({ where: { id: r.customerId }, select: { id: true, name: true } })
          : null,
      }))),
    );
  }

  private async branchOwner(branchId?: string | null) {
    if (!branchId) return null;
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new BadRequestException('Branch not found');
    return branch.customerId;
  }

  private mac(input: string) {
    const mac = normalizeMac(input);
    if (!mac) throw new BadRequestException('MAC address must be 12 hex digits, e.g. 00:23:F0:1A:97:40');
    return mac;
  }

  async createScale(dto: CreateScaleDto) {
    const customerId = await this.branchOwner(dto.branchId);
    const scale = await this.prisma.scale.create({
      data: {
        mac: this.mac(dto.mac),
        name: dto.name.trim(),
        model: dto.model,
        number: dto.number ?? (dto.branchId ? (await this.prisma.scale.count({ where: { branchId: dto.branchId } })) + 1 : 1),
        branchId: dto.branchId ?? null,
        customerId,
      },
    });
    return this.scales.detail(scale.id);
  }

  async updateScale(id: string, dto: UpdateScaleDto) {
    const data: Prisma.ScaleUncheckedUpdateInput = {
      name: dto.name?.trim(),
      model: dto.model,
      number: dto.number,
      mac: dto.mac ? this.mac(dto.mac) : undefined,
    };
    if (dto.branchId !== undefined) {
      data.branchId = dto.branchId;
      data.customerId = await this.branchOwner(dto.branchId);
    }
    await this.prisma.scale.update({ where: { id }, data });
    return this.scales.detail(id);
  }

  async deleteScale(id: string) {
    await this.prisma.scale.delete({ where: { id } });
    return { deleted: true };
  }
}
