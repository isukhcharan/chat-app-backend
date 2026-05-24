import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { ChannelType } from '@prisma/client';

export class CreateChannelDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ChannelType)
  @IsOptional()
  type?: ChannelType;
}
