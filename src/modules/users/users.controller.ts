import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccessService } from '../../common/access/access.service';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserListQuery } from './dto/users.dto';

/// Shop owners manage their own staff here; the dealer can too by passing customerId.
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly access: AccessService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: UserListQuery) {
    this.access.assertOwnerOrDealer(user);
    return this.users.list(this.access.customerIdFor(user, q.customerId));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    this.access.assertOwnerOrDealer(user);
    return this.users.create(this.access.customerIdFor(user, dto.customerId), dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: UserListQuery, @Body() dto: UpdateUserDto) {
    this.access.assertOwnerOrDealer(user);
    return this.users.update(this.access.customerIdFor(user, q.customerId), id, dto, user.id);
  }
}
