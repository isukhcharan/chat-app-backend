import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ChannelsService, WorkspaceMemberGuard],
  controllers: [ChannelsController],
  exports: [ChannelsService],
})
export class ChannelsModule {}
