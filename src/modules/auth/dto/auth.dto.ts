import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  /// Password for the dealer admin, PIN for shop users
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
  @MinLength(4)
  @MaxLength(64)
  newSecret: string;
}

export const PIN_PATTERN = /^\d{4,8}$/;
export class PinField {
  @Matches(PIN_PATTERN, { message: 'PIN must be 4 to 8 digits' })
  pin: string;
}
