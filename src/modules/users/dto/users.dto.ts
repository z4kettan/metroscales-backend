import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_MIN, USERNAME_MESSAGE, USERNAME_PATTERN } from '../../auth/dto/auth.dto';

export class CreateUserDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE }) username: string;
  @IsString() @MinLength(PASSWORD_MIN, { message: PASSWORD_MESSAGE }) @MaxLength(64) password: string;
  @IsOptional() @IsEmail() email?: string;
  @IsIn(['OWNER', 'STAFF']) role: 'OWNER' | 'STAFF';
  /// Branches a STAFF user may see (ignored for OWNER)
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) branchIds?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE }) username?: string;
  /// Sets a new password (a reset by the owner or dealer)
  @IsOptional() @IsString() @MinLength(PASSWORD_MIN, { message: PASSWORD_MESSAGE }) @MaxLength(64) password?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['OWNER', 'STAFF']) role?: 'OWNER' | 'STAFF';
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) branchIds?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UserListQuery {
  @IsOptional() @IsUUID() customerId?: string;
}
