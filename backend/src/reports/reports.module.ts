import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
@Module({ imports: [AuthCommonModule], controllers: [ReportsController], providers: [ReportsService] }) export class ReportsModule {}
