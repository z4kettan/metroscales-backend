import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested, IsInt, Min, Max,
} from 'class-validator';
import { PIN_PATTERN } from '../../auth/dto/auth.dto';

export class OwnerDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEmail() email: string;
  @Matches(PIN_PATTERN, { message: 'PIN must be 4 to 8 digits' }) pin: string;
}

export class CreateCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsDateString() subscriptionEndsAt?: string;

  @ValidateNested() @Type(() => OwnerDto) owner: OwnerDto;

  /// First branch; defaults to the customer name
  @IsOptional() @IsString() @MaxLength(60) branchName?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /// null clears it
  @IsOptional() @IsDateString() subscriptionEndsAt?: string | null;
}

export class CustomerListQuery {
  @IsOptional() @IsString() search?: string;
}

export class CreateScaleDto {
  @IsString() @IsNotEmpty() mac: string;
  @IsString() @IsNotEmpty() @MaxLength(40) name: string;
  @IsOptional() @IsString() @MaxLength(40) model?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99) number?: number;
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdateScaleDto {
  @IsOptional() @IsString() @IsNotEmpty() mac?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40) name?: string;
  @IsOptional() @IsString() @MaxLength(40) model?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99) number?: number;
  /// null unassigns the scale (e.g. returned for repair)
  @IsOptional() @IsUUID() branchId?: string | null;
}

export class ScaleRegistryQuery {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsIn(['online', 'offline', 'unassigned']) status?: 'online' | 'offline' | 'unassigned';
  @IsOptional() @IsString() search?: string;
}
