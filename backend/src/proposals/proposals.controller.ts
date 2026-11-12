import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { Request } from 'express';
import { AuthUser } from '../common/auth/role';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { ApproveProposalDto } from './dto/approve-proposal.dto';
import { ProposalsService } from './proposals.service';

class CreateProposalDto {
  @IsString() @MaxLength(200) tieuDe!: string;
  @IsString() @MaxLength(5000) noiDung!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) kinhPhi!: number;
}
class VoteDto { @IsIn(['AGREE', 'DISAGREE']) ketQua!: 'AGREE' | 'DISAGREE'; }

@Controller('proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}
  @Get()
  list(@Req() req: Request & { user: AuthUser }, @Query('trangThai') status?: string) { return this.proposals.list(req.user.sub, status); }
  @Post()
  create(@Body() body: CreateProposalDto, @Req() req: Request & { user: AuthUser }) { return this.proposals.create(body, req.user.sub); }
  @Post(':id/vote')
  vote(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: VoteDto, @Req() req: Request & { user: AuthUser }) { return this.proposals.vote(id, req.user.sub, body.ketQua); }
  @Post(':id/approve')
  @Roles('ADMIN', 'THU_QUY')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ApproveProposalDto, @Req() req: Request & { user: AuthUser }) {
    return this.proposals.approve(id, req.user.sub, body.ghiChu);
  }
  @Patch(':id/reject')
  @Roles('ADMIN', 'THU_QUY')
  reject(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: AuthUser }) { return this.proposals.reject(id, req.user.sub); }
}
