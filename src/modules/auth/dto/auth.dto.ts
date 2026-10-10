import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/// 3 to 30 characters: letters, digits, dot, underscore or hyphen. Stored in lower case.
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/i;
export const USERNAME_MESSAGE = 'Username must be 3 to 30 letters, digits, dots, underscores or hyphens';
export const PASSWORD_MIN = 6;
export const PASSWORD_MESSAGE = `Password must be at least ${PASSWORD_MIN} characters`;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export class LoginDto {
  /// Username, or the email address for accounts that have one
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  secret: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ChangeSecretDto {
  @IsString()
  @IsNotEmpty()
  currentSecret: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: PASSWORD_MESSAGE })
  @MaxLength(64)
  newSecret: string;
}

export class UsernameField {
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE }) username: string;
}
