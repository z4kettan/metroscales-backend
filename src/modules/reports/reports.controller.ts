import { Controller, Delete, Get, Header, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccessService } from '../../common/access/access.service';
import { ReportsService } from './reports.service';
import { DayQuery, RangeQuery } from './dto/reports.dto';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly access: AccessService,
  ) {}

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser, @Query() q: DayQuery) {
    await this.access.branch(user, q.branchId);
    return this.reports.summary(q.branchId, q.date, q.tz);
  }

  @Get('daily')
  async daily(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    await this.access.branch(user, q.branchId);
    return this.reports.daily(q.branchId, q.from, q.to, q.tz);
  }

  @Get('daily.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="daily-sales.csv"')
  async dailyCsv(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    await this.access.branch(user, q.branchId);
    return this.reports.dailyCsv(q.branchId, q.from, q.to, q.tz);
  }

  @Get('bills')
  async bills(@CurrentUser() user: AuthUser, @Query() q: DayQuery) {
    await this.access.branch(user, q.branchId);
    return this.reports.bills(q.branchId, q.date, q.tz);
  }

  @Get('items')
  async items(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    await this.access.branch(user, q.branchId);
    return this.reports.itemSales(q.branchId, q.from, q.to, q.tz);
  }

  @Delete('bills')
  async deleteBills(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    this.access.assertOwnerOrDealer(user);
    await this.access.branch(user, q.branchId);
    return this.reports.deleteBills(q.branchId, q.from, q.to, q.tz);
  }
}
