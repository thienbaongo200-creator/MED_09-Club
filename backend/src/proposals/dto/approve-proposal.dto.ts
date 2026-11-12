import { IsOptional, IsString, MaxLength } from 'class-validator';
export class ApproveProposalDto { @IsOptional() @IsString() @MaxLength(500) ghiChu?: string; }
