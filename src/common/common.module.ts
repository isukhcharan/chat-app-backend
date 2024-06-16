import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  providers: [CommonService]
})
export class CommonModule {}
