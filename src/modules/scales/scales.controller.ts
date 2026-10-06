import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccessService } from '../../common/access/access.service';
import { ScalesService } from './scales.service';
import { ManualCommandDto, PrintFormatDto, ScaleListQuery, ShortcutsDto, UpdateScaleParamsDto, WifiDto } from './dto/scales.dto';

@UseGuards(JwtAuthGuard)
@Controller('scales')
export class ScalesController {
  constructor(
    private readonly scales: ScalesService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: ScaleListQuery) {
    if (q.branchId) {
      await this.access.branch(user, q.branchId);
      return this.scales.list({ branchId: q.branchId });
    }
    if (user.role === Role.DEALER_ADMIN) return this.scales.list({});
    const allowed = await this.access.allowedBranchIds(user);
    return this.scales.list({
      customerId: user.customerId!,
      branchId: allowed ? { in: allowed } : { not: null },
    });
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.scale(user, id);
    return this.scales.detail(id);
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScaleParamsDto) {
    this.access.assertOwnerOrDealer(user);
    await this.access.scale(user, id);
    return this.scales.updateParams(id, dto, user.id);
  }

  @Post(':id/wifi')
  @HttpCode(200)
  async wifi(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WifiDto) {
    this.access.assertOwnerOrDealer(user);
    await this.access.scale(user, id);
    return this.scales.setWifi(id, dto, user.id);
  }

  @Get(':id/print-format')
  async printFormat(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.scale(user, id);
    return this.scales.getPrintFormat(id);
  }

  @Put(':id/print-format')
  async setPrintFormat(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PrintFormatDto) {
    this.access.assertOwnerOrDealer(user);
    await this.access.scale(user, id);
    return this.scales.setPrintFormat(id, dto, user.id);
  }

  @Get(':id/shortcuts')
  async shortcuts(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.scale(user, id);
    return this.scales.getShortcuts(id);
  }

  @Put(':id/shortcuts')
  async setShortcuts(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShortcutsDto) {
    this.access.assertOwnerOrDealer(user);
    const scale = await this.access.scale(user, id);
    return this.scales.setShortcuts(id, scale.customerId, dto, user.id);
  }

  @Post(':id/commands')
  async command(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualCommandDto) {
    if (dto.type === 'CLEAR_PLU') this.access.assertOwnerOrDealer(user);
    await this.access.scale(user, id);
    return this.scales.runCommand(id, dto, user.id);
  }

  @Get(':id/commands')
  async history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.scale(user, id);
    return this.scales.history(id);
  }
}
