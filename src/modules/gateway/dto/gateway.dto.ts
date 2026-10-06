import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { PriceUnit } from '@prisma/client';

export class HeartbeatDto {
  @IsOptional() @IsString() @MaxLength(40) firmware?: string;
}

export class BillLineDto {
  @IsInt() @Min(1) @Max(20000) plu: number;
  /// kg for weighed items, count for packs
  @IsNumber({ maxDecimalPlaces: 3 }) quantity: number;
  /// Unit price used on the scale; defaults to the branch price
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  /// Line amount printed on the bill; defaults to quantity x price
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) amount?: number;
  @IsOptional() @IsString() @MaxLength(40) name?: string;
}

export class UploadBillDto {
  @IsString() @IsNotEmpty() @MaxLength(30) billNo: string;
  @IsDateString() billedAt: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount?: number;

  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  lines: BillLineDto[];
}

export class PulledItemDto {
  @IsInt() @Min(1) @Max(20000) plu: number;
  @IsString() @IsNotEmpty() @MaxLength(40) name: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
  @IsOptional() @IsEnum(PriceUnit) unit?: PriceUnit;
  @IsOptional() @IsInt() @Min(0) tareGrams?: number;
  @IsOptional() @IsString() @MaxLength(32) barcode?: string;
}

export class AckDto {
  @IsBoolean() ok: boolean;
  @IsOptional() @IsString() @MaxLength(500) error?: string;

  /// For PULL_ITEMS: the items read from the scale
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PulledItemDto)
  @ArrayMaxSize(20000)
  items?: PulledItemDto[];
}
