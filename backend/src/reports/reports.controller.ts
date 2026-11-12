import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { FundReportQueryDto } from './dto/fund-report-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('fund')
  @Roles('ADMIN', 'THU_QUY', 'THANH_VIEN')
  fund(@Query() query: FundReportQueryDto) { return this.reports.fund(query.tuNgay, query.denNgay); }
  @Get('events/:id/attendance')
  @Roles('ADMIN', 'THU_QUY')
  attendance(@Param('id', new ParseUUIDPipe()) id: string) { return this.reports.attendance(id); }
}
