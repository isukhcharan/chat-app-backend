import { IsOptional, IsEmail, IsDateString } from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
