import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScaleCommandType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScaleCommandsService } from '../scales/scale-commands.service';
import { CreateCategoryDto, CreateItemDto, ListItemsQuery, MAX_PLU, UpdateCategoryDto, UpdateItemDto } from './dto/catalog.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: ScaleCommandsService,
  ) {}

  /// Item changes reach the scales with the next full item push.
  private pushToScales(customerId: string) {
    return this.commands.queueForCustomer(customerId, ScaleCommandType.PUSH_ITEMS);
  }

  // ---- categories ----

  listCategories(customerId: string) {
    return this.prisma.category.findMany({
      where: { customerId },
      orderBy: { code: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async createCategory(customerId: string, dto: CreateCategoryDto) {
    let code = dto.code;
    if (!code) {
      const last = await this.prisma.category.findFirst({ where: { customerId }, orderBy: { code: 'desc' } });
      code = (last?.code ?? 0) + 1;
    }
    return this.prisma.category.create({ data: { customerId, name: dto.name.trim(), code } });
  }

  async updateCategory(customerId: string, id: string, dto: UpdateCategoryDto) {
    await this.category(customerId, id);
    return this.prisma.category.update({ where: { id }, data: { name: dto.name?.trim() } });
  }

  async deleteCategory(customerId: string, id: string) {
    await this.category(customerId, id);
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  private async category(customerId: string, id: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, customerId } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  // ---- items ----

  async listItems(customerId: string, q: ListItemsQuery) {
    const search = q.search?.trim();
    const where: Prisma.ItemWhereInput = { customerId };
    if (q.categoryId) where.categoryId = q.categoryId;
    if (search) {
      const asNumber = /^\d+$/.test(search) ? parseInt(search, 10) : undefined;
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search } },
        ...(asNumber !== undefined ? [{ plu: asNumber }] : []),
      ];
    }
    const items = await this.prisma.item.findMany({
      where,
      orderBy: q.sort === 'name' ? { name: 'asc' } : { plu: 'asc' },
      include: {
        category: { select: { id: true, name: true, code: true } },
        branchItems: q.branchId ? { where: { branchId: q.branchId } } : false,
      },
    });
    return items.map((item) => this.withBranch(item, q.branchId));
  }

  async getItem(customerId: string, id: string, branchId?: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, customerId },
      include: {
        category: { select: { id: true, name: true, code: true } },
        branchItems: branchId ? { where: { branchId } } : false,
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return this.withBranch(item, branchId);
  }

  async nextPlu(customerId: string) {
    const last = await this.prisma.item.findFirst({ where: { customerId }, orderBy: { plu: 'desc' } });
    const next = (last?.plu ?? 0) + 1;
    if (next <= MAX_PLU) return { plu: next };
    // The top is used; find the first gap
    const used = new Set((await this.prisma.item.findMany({ where: { customerId }, select: { plu: true } })).map((i) => i.plu));
    for (let p = 1; p <= MAX_PLU; p++) if (!used.has(p)) return { plu: p };
    throw new ConflictException(`All ${MAX_PLU} PLU numbers are in use`);
  }

  async createItem(customerId: string, dto: CreateItemDto) {
    await this.checkCategory(customerId, dto.categoryId);
    const plu = dto.plu ?? (await this.nextPlu(customerId)).plu;
    const defaultPrice = dto.defaultPrice ?? dto.price ?? 0;
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          customerId,
          plu,
          name: dto.name.trim(),
          barcode: dto.barcode || null,
          tareGrams: dto.tareGrams ?? 0,
          unit: dto.unit,
          gstPercent: dto.gstPercent ?? 0,
          gstMode: dto.gstMode,
          categoryId: dto.categoryId ?? null,
          defaultPrice,
        },
      });
      // Every branch starts at the default price; the given branch gets `price`
      const branches = await tx.branch.findMany({ where: { customerId }, select: { id: true } });
      if (branches.length) {
        await tx.branchItem.createMany({
          data: branches.map((b) => ({
            branchId: b.id,
            itemId: created.id,
            price: b.id === dto.branchId && dto.price !== undefined ? dto.price : defaultPrice,
          })),
        });
      }
      return created;
    });
    await this.pushToScales(customerId);
    return this.getItem(customerId, item.id, dto.branchId);
  }

  async updateItem(customerId: string, id: string, dto: UpdateItemDto) {
    await this.getItem(customerId, id);
    await this.checkCategory(customerId, dto.categoryId);
    await this.prisma.item.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        plu: dto.plu,
        barcode: dto.barcode === undefined ? undefined : dto.barcode || null,
        tareGrams: dto.tareGrams,
        unit: dto.unit,
        gstPercent: dto.gstPercent,
        gstMode: dto.gstMode,
        categoryId: dto.categoryId,
        defaultPrice: dto.defaultPrice,
      },
    });
    await this.pushToScales(customerId);
    return this.getItem(customerId, id);
  }

  async deleteItem(customerId: string, id: string) {
    await this.getItem(customerId, id);
    await this.prisma.item.delete({ where: { id } });
    await this.pushToScales(customerId);
    return { deleted: true };
  }

  async deleteAllItems(customerId: string) {
    const { count } = await this.prisma.item.deleteMany({ where: { customerId } });
    // Nothing left to push, so wipe the scales' item memory instead
    await this.commands.queueForCustomer(customerId, ScaleCommandType.CLEAR_PLU);
    return { deleted: count };
  }

  private async checkCategory(customerId: string, categoryId?: string | null) {
    if (!categoryId) return;
    const cat = await this.prisma.category.findFirst({ where: { id: categoryId, customerId } });
    if (!cat) throw new BadRequestException('Category not found');
  }

  private withBranch(item: any, branchId?: string) {
    const { branchItems, ...rest } = item;
    if (!branchId) return rest;
    const bi = branchItems?.[0];
    return { ...rest, price: bi ? bi.price : item.defaultPrice, stock: bi ? bi.stock : new Prisma.Decimal(0) };
  }
}
