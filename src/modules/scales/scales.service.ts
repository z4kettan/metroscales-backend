import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ScaleCommandStatus, ScaleCommandType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isOnline, ScaleCommandsService } from './scale-commands.service';
import { ManualCommandDto, PrintFormatDto, ShortcutsDto, UpdateScaleParamsDto, WifiDto } from './dto/scales.dto';

export function withStatus<T extends { lastSeenAt: Date | null }>(scale: T) {
  return { ...scale, online: isOnline(scale.lastSeenAt) };
}

@Injectable()
export class ScalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: ScaleCommandsService,
  ) {}

  async list(where: Prisma.ScaleWhereInput) {
    const scales = await this.prisma.scale.findMany({
      where,
      orderBy: [{ branchId: 'asc' }, { number: 'asc' }],
      include: {
        branch: { select: { id: true, name: true } },
        _count: { select: { commands: { where: { status: ScaleCommandStatus.PENDING } } } },
      },
    });
    return scales.map(({ _count, ...s }) => ({ ...withStatus(s), pendingCommands: _count.commands }));
  }

  async detail(scaleId: string) {
    const scale = await this.prisma.scale.findUniqueOrThrow({
      where: { id: scaleId },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        printFormat: true,
      },
    });
    const recentCommands = await this.commands.list(scaleId, 20);
    return { ...withStatus(scale), recentCommands: recentCommands.map(redactCommand) };
  }

  async updateParams(scaleId: string, dto: UpdateScaleParamsDto, userId: string) {
    const scale = await this.prisma.scale.update({ where: { id: scaleId }, data: dto });
    await this.commands.queue([scaleId], ScaleCommandType.SET_PARAMETERS,
      { name: scale.name, number: scale.number, storeName: scale.storeName }, userId);
    return this.detail(scaleId);
  }

  async setWifi(scaleId: string, dto: WifiDto, userId: string) {
    await this.prisma.scale.update({ where: { id: scaleId }, data: { wifiSsid: dto.ssid } });
    // The password only lives in the pending command; the gateway should blank
    // it out once delivered.
    await this.commands.queue([scaleId], ScaleCommandType.SET_WIFI, { ssid: dto.ssid, password: dto.password }, userId);
    return this.detail(scaleId);
  }

  async getPrintFormat(scaleId: string) {
    const pf = await this.prisma.scalePrintFormat.findUnique({ where: { scaleId } });
    return pf ?? { scaleId, format1: null, format2: null, postils: [] };
  }

  async setPrintFormat(scaleId: string, dto: PrintFormatDto, userId: string) {
    const data = { format1: dto.format1, format2: dto.format2, postils: dto.postils ?? [] };
    const pf = await this.prisma.scalePrintFormat.upsert({
      where: { scaleId },
      create: { scaleId, ...data },
      update: data,
    });
    await this.commands.queue([scaleId], ScaleCommandType.SET_PRINT_FORMAT, data, userId);
    return pf;
  }

  getShortcuts(scaleId: string) {
    return this.prisma.scaleShortcut.findMany({
      where: { scaleId },
      orderBy: [{ keyNo: 'asc' }, { layer: 'asc' }],
      include: { item: { select: { id: true, name: true, plu: true } } },
    });
  }

  async setShortcuts(scaleId: string, customerId: string | null, dto: ShortcutsDto, userId: string) {
    const itemIds = [...new Set(dto.shortcuts.map((s) => s.itemId).filter((x): x is string => !!x))];
    if (itemIds.length) {
      const count = await this.prisma.item.count({ where: { id: { in: itemIds }, customerId: customerId ?? undefined } });
      if (count !== itemIds.length) throw new BadRequestException('Some items do not belong to this shop');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const s of dto.shortcuts) {
        const key = { scaleId_keyNo_layer: { scaleId, keyNo: s.keyNo, layer: s.layer } };
        if (s.itemId) {
          await tx.scaleShortcut.upsert({
            where: key,
            create: { scaleId, keyNo: s.keyNo, layer: s.layer, itemId: s.itemId },
            update: { itemId: s.itemId },
          });
        } else {
          await tx.scaleShortcut.deleteMany({ where: { scaleId, keyNo: s.keyNo, layer: s.layer } });
        }
      }
    });
    const all = await this.getShortcuts(scaleId);
    await this.commands.queue([scaleId], ScaleCommandType.SET_SHORTCUTS,
      all.map((s) => ({ keyNo: s.keyNo, layer: s.layer, plu: s.item.plu })), userId);
    return all;
  }

  async runCommand(scaleId: string, dto: ManualCommandDto, userId: string) {
    const [command] = await this.commands.queue([scaleId], dto.type as ScaleCommandType, undefined, userId);
    const scale = await this.prisma.scale.findUniqueOrThrow({ where: { id: scaleId } });
    return { command, online: isOnline(scale.lastSeenAt) };
  }

  async history(scaleId: string) {
    return (await this.commands.list(scaleId)).map(redactCommand);
  }
}

/// Never send a WiFi password back to clients
export function redactCommand<T extends { type: ScaleCommandType; payload: Prisma.JsonValue }>(c: T): T {
  if (c.type === ScaleCommandType.SET_WIFI && c.payload && typeof c.payload === 'object') {
    return { ...c, payload: { ...(c.payload as object), password: '••••' } };
  }
  return c;
}
