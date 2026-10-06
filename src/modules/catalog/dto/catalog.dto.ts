import { Type } from 'class-transformer';
import {
  IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { GstMode, PriceUnit } from '@prisma/client';

export const MAX_PLU = 20000;

export class CustomerQuery {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class CreateCategoryDto extends CustomerQuery {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  code?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;
}

export class ListItemsQuery extends CustomerQuery {
  /// When set, each item carries this branch's price and stock
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['plu', 'name'])
  sort?: 'plu' | 'name';
}

export class ItemFieldsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PLU)
  plu?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  barcode?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  tareGrams?: number;

  @IsOptional()
  @IsEnum(PriceUnit)
  unit?: PriceUnit;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  gstPercent?: number;

  @IsOptional()
  @IsEnum(GstMode)
  gstMode?: GstMode;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  /// Price used for branches that have no price of their own yet
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultPrice?: number;
}

export class CreateItemDto extends ItemFieldsDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  declare name: string;

  /// Also set this price in the given branch (the app sends the current branch)
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;
}

export class UpdateItemDto extends ItemFieldsDto {}

export class NumberParam {
  @Type(() => Number)
  @IsInt()
  value: number;
}
