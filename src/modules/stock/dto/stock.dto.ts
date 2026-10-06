import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class PriceEntry {
  @IsUUID()
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;
}

export class SetPricesDto {
  @ValidateNested({ each: true })
  @Type(() => PriceEntry)
  @ArrayMinSize(1)
  @ArrayMaxSize(20000)
  prices: PriceEntry[];
}

export class StockEntry {
  @IsUUID()
  itemId: string;

  /// New stock level (may be negative when more was sold than recorded)
  @IsNumber({ maxDecimalPlaces: 3 })
  quantity: number;
}

export class SetStockDto {
  @ValidateNested({ each: true })
  @Type(() => StockEntry)
  @ArrayMinSize(1)
  @ArrayMaxSize(20000)
  stock: StockEntry[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class PurchaseLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;
}

export class CreatePurchaseDto {
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @IsOptional() @IsString() @MaxLength(100) supplier?: string;
  @IsOptional() @IsString() @MaxLength(50) invoiceNo?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;

  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  lines: PurchaseLineDto[];
}

export class PurchaseListQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class MovementQuery {
  @IsOptional() @IsUUID() itemId?: string;
}
