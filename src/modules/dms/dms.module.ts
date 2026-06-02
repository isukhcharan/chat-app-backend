import { Module } from '@nestjs/common';
import { DmsService } from './dms.service';
import { DmsController } from './dms.controller';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DmsService, WorkspaceMemberGuard],
  controllers: [DmsController],
  exports: [DmsService],
})
export class DmsModule {}
