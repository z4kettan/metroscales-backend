import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class DayQuery {
  @IsUUID() branchId: string;
  @IsOptional() @Matches(DAY, { message: 'date must be YYYY-MM-DD' }) date?: string;
  /// Minutes east of UTC for day boundaries; defaults to IST (330)
  @IsOptional() @Type(() => Number) @IsInt() @Min(-720) @Max(840) tz?: number;
}

export class RangeQuery {
  @IsUUID() branchId: string;
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' }) from: string;
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' }) to: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-720) @Max(840) tz?: number;
}
