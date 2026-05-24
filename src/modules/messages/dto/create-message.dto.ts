import { IsString, IsOptional, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsString()
  @IsOptional()
  parentId?: string;
}
