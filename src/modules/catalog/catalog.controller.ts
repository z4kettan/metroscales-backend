import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccessService } from '../../common/access/access.service';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto, CreateItemDto, CustomerQuery, ListItemsQuery, UpdateCategoryDto, UpdateItemDto } from './dto/catalog.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly access: AccessService,
  ) {}

  @Get('categories')
  listCategories(@CurrentUser() user: AuthUser, @Query() q: CustomerQuery) {
    return this.catalog.listCategories(this.access.customerIdFor(user, q.customerId));
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    this.access.assertOwnerOrDealer(user);
    return this.catalog.createCategory(this.access.customerIdFor(user, dto.customerId), dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: CustomerQuery,
    @Body() dto: UpdateCategoryDto,
  ) {
    this.access.assertOwnerOrDealer(user);
    return this.catalog.updateCategory(this.access.customerIdFor(user, q.customerId), id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: CustomerQuery) {
    this.access.assertOwnerOrDealer(user);
    return this.catalog.deleteCategory(this.access.customerIdFor(user, q.customerId), id);
  }

  @Get('items')
  async listItems(@CurrentUser() user: AuthUser, @Query() q: ListItemsQuery) {
    if (q.branchId) await this.access.branch(user, q.branchId);
    return this.catalog.listItems(this.access.customerIdFor(user, q.customerId), q);
  }

  @Get('items/next-plu')
  nextPlu(@CurrentUser() user: AuthUser, @Query() q: CustomerQuery) {
    return this.catalog.nextPlu(this.access.customerIdFor(user, q.customerId));
  }

  @Get('items/:id')
  async getItem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ListItemsQuery) {
    if (q.branchId) await this.access.branch(user, q.branchId);
    return this.catalog.getItem(this.access.customerIdFor(user, q.customerId), id, q.branchId);
  }

  @Post('items')
  async createItem(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    this.access.assertOwnerOrDealer(user);
    if (dto.branchId) await this.access.branch(user, dto.branchId);
    return this.catalog.createItem(this.access.customerIdFor(user, dto.customerId), dto);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: CustomerQuery,
    @Body() dto: UpdateItemDto,
  ) {
    this.access.assertOwnerOrDealer(user);
    return this.catalog.updateItem(this.access.customerIdFor(user, q.customerId), id, dto);
  }

  @Delete('items/:id')
  deleteItem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: CustomerQuery) {
    this.access.assertOwnerOrDealer(user);
    return this.catalog.deleteItem(this.access.customerIdFor(user, q.customerId), id);
  }

  @Post('items/delete-all')
  @HttpCode(200)
  deleteAll(@CurrentUser() user: AuthUser, @Body() body: CustomerQuery) {
    this.access.assertOwnerOrDealer(user);
    return this.catalog.deleteAllItems(this.access.customerIdFor(user, body.customerId));
  }
}
