import { IsString, IsOptional, IsEnum, IsArray, MinLength, MaxLength } from 'class-validator';
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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  memberIds?: string[];
}
