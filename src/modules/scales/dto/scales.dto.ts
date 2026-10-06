import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class ScaleListQuery {
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdateScaleParamsDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99) number?: number;
  @IsOptional() @IsString() @MaxLength(40) storeName?: string;
}

export class WifiDto {
  @IsString() @IsNotEmpty() @MaxLength(32) ssid: string;
  @IsString() @MaxLength(63) password: string;
}

export class PrintFormatDto {
  @IsOptional() @IsString() @MaxLength(64) format1?: string;
  @IsOptional() @IsString() @MaxLength(64) format2?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  postils?: string[];
}

export class ShortcutEntry {
  @IsInt() @Min(1) @Max(200) keyNo: number;
  @IsInt() @IsIn([1, 2]) layer: number;
  /// null clears the key
  @IsOptional() @IsUUID() itemId?: string | null;
}

export class ShortcutsDto {
  @ValidateNested({ each: true })
  @Type(() => ShortcutEntry)
  @ArrayMaxSize(400)
  shortcuts: ShortcutEntry[];
}

export const MANUAL_COMMANDS = ['PUSH_ITEMS', 'PULL_ITEMS', 'CLEAR_PLU'] as const;
export class ManualCommandDto {
  @IsIn(MANUAL_COMMANDS as unknown as string[])
  type: (typeof MANUAL_COMMANDS)[number];
}
