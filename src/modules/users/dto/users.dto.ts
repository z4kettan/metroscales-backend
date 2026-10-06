import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PIN_PATTERN } from '../../auth/dto/auth.dto';

export class CreateUserDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEmail() email: string;
  @Matches(PIN_PATTERN, { message: 'PIN must be 4 to 8 digits' }) pin: string;
  @IsIn(['OWNER', 'STAFF']) role: 'OWNER' | 'STAFF';
  /// Branches a STAFF user may see (ignored for OWNER)
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) branchIds?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(PIN_PATTERN, { message: 'PIN must be 4 to 8 digits' }) pin?: string;
  @IsOptional() @IsIn(['OWNER', 'STAFF']) role?: 'OWNER' | 'STAFF';
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) branchIds?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UserListQuery {
  @IsOptional() @IsUUID() customerId?: string;
}
