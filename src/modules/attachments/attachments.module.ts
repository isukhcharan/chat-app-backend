import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
})
export class AttachmentsModule {}
