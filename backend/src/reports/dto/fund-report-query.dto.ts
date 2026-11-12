import { IsDateString } from 'class-validator';
export class FundReportQueryDto {
  @IsDateString() tuNgay!: string;
  @IsDateString() denNgay!: string;
}
