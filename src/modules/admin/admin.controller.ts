import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  CreateCustomerDto, CreateScaleDto, CustomerListQuery, ScaleRegistryQuery, UpdateCustomerDto, UpdateScaleDto,
} from './dto/admin.dto';

/// Dealer-only endpoints used by the admin panel.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DEALER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('customers')
  customers(@Query() q: CustomerListQuery) {
    return this.admin.listCustomers(q.search);
  }

  @Get('customers/:id')
  customer(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getCustomer(id);
  }

  @Post('customers')
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.admin.createCustomer(dto);
  }

  @Patch('customers/:id')
  updateCustomer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.admin.updateCustomer(id, dto);
  }

  @Get('scales')
  scales(@Query() q: ScaleRegistryQuery) {
    return this.admin.listScales(q);
  }

  @Post('scales')
  createScale(@Body() dto: CreateScaleDto) {
    return this.admin.createScale(dto);
  }

  @Patch('scales/:id')
  updateScale(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScaleDto) {
    return this.admin.updateScale(id, dto);
  }

  @Delete('scales/:id')
  deleteScale(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteScale(id);
  }
}
