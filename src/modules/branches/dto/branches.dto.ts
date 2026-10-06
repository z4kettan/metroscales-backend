import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBranchDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class BillSettingsDto {
  @IsOptional() @IsString() @MaxLength(64) header?: string;
  @IsOptional() @IsString() @MaxLength(64) billFooter?: string;
  @IsOptional() @IsString() @MaxLength(64) itemFooter?: string;
  @IsOptional() @IsString() @MaxLength(64) offerTitle?: string;
}

export class BranchListQuery {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
