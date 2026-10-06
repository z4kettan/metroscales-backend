import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccessService } from '../../common/access/access.service';
import { StockService } from './stock.service';
import { CreatePurchaseDto, MovementQuery, PurchaseListQuery, SetPricesDto, SetStockDto } from './dto/stock.dto';

@UseGuards(JwtAuthGuard)
@Controller('branches/:branchId')
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly access: AccessService,
  ) {}

  @Put('prices')
  async setPrices(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string, @Body() dto: SetPricesDto) {
    this.access.assertOwnerOrDealer(user);
    await this.access.branch(user, branchId);
    return this.stock.setPrices(branchId, dto, user.id);
  }

  @Put('stock')
  async setStock(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string, @Body() dto: SetStockDto) {
    await this.access.branch(user, branchId);
    return this.stock.setStock(branchId, dto, user.id);
  }

  @Post('stock/clear')
  @HttpCode(200)
  async clearStock(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string) {
    this.access.assertOwnerOrDealer(user);
    await this.access.branch(user, branchId);
    return this.stock.clearStock(branchId, user.id);
  }

  @Get('stock/movements')
  async movements(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string, @Query() q: MovementQuery) {
    await this.access.branch(user, branchId);
    return this.stock.movements(branchId, q.itemId);
  }

  @Get('purchases')
  async purchases(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string, @Query() q: PurchaseListQuery) {
    await this.access.branch(user, branchId);
    return this.stock.listPurchases(branchId, q);
  }

  @Get('purchases/:id')
  async purchase(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.branch(user, branchId);
    return this.stock.getPurchase(branchId, id);
  }

  @Post('purchases')
  async createPurchase(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string, @Body() dto: CreatePurchaseDto) {
    await this.access.branch(user, branchId);
    return this.stock.createPurchase(branchId, dto, user.id);
  }

  @Delete('purchases/:id')
  async deletePurchase(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.access.assertOwnerOrDealer(user);
    await this.access.branch(user, branchId);
    return this.stock.deletePurchase(branchId, id, user.id);
  }
}
