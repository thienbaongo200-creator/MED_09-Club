import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../common/auth/role';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'THU_QUY')
export class MembersController {
  constructor(private readonly members: MembersService) {}
  @Get() list() { return this.members.list(); }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) { return this.members.get(id); }
  @Post() create(@Body() body: CreateMemberDto) { return this.members.create(body); }
  @Patch(':id') update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateMemberDto, @Req() req: Request & { user: AuthUser }) { return this.members.update(id, body, req.user); }
  @Patch(':id/status') status(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateMemberStatusDto, @Req() req: Request & { user: AuthUser }) { return this.members.setStatus(id, body.trangThai, req.user); }
  @Delete(':id') @Roles('ADMIN', 'THU_QUY') deactivate(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: AuthUser }) { return this.members.setStatus(id, 'INACTIVE', req.user); }
  @Patch(':id/role') @Roles('ADMIN') role(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateMemberRoleDto, @Req() req: Request & { user: AuthUser }) { return this.members.setRole(id, body.vaiTro, req.user); }
}
