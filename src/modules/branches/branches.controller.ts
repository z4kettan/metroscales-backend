import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccessService } from '../../common/access/access.service';
import { BranchesService } from './branches.service';
import { BillSettingsDto, BranchListQuery, CreateBranchDto, UpdateBranchDto } from './dto/branches.dto';

@UseGuards(JwtAuthGuard)
@Controller('branches')
export class BranchesController {
  constructor(
    private readonly branches: BranchesService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: BranchListQuery) {
    const customerId = this.access.customerIdFor(user, q.customerId);
    return this.branches.list(customerId, await this.access.allowedBranchIds(user));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.access.branch(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    this.access.assertOwnerOrDealer(user);
    return this.branches.create(this.access.customerIdFor(user, dto.customerId), dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    this.access.assertOwnerOrDealer(user);
    await this.access.branch(user, id);
    return this.branches.update(id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.access.assertOwnerOrDealer(user);
    await this.access.branch(user, id);
    return this.branches.remove(id);
  }

  @Get(':id/bill-settings')
  async billSettings(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.branch(user, id);
    return this.branches.getBillSettings(id);
  }

  @Put(':id/bill-settings')
  async saveBillSettings(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BillSettingsDto) {
    this.access.assertOwnerOrDealer(user);
    await this.access.branch(user, id);
    return this.branches.saveBillSettings(id, dto, user.id);
  }
}
