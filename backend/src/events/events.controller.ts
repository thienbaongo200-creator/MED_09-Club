import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Request } from 'express';
import { AuthUser } from '../common/auth/role';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { EventsService } from './events.service';

class CreateEventDto {
  @IsString() @MaxLength(200) tenSuKien!: string;
  @IsOptional() @IsString() @MaxLength(5000) moTa?: string;
  @IsOptional() @IsString() @MaxLength(200) diaDiem?: string;
  @IsDateString() thoiGianBatDau!: string;
  @IsDateString() thoiGianKetThuc!: string;
}
class AttendanceDto { @IsUUID() thanhVienId!: string; @IsIn(['ATTENDED', 'ABSENT']) trangThai!: 'ATTENDED' | 'ABSENT'; }

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}
  @Get() list(@Req() req: Request & { user: AuthUser }) { return this.events.list(req.user.sub); }
  @Post()
  @Roles('ADMIN', 'THU_QUY')
  create(@Body() body: CreateEventDto, @Req() req: Request & { user: AuthUser }) { return this.events.create(body, req.user.sub); }
  @Patch(':id')
  @Roles('ADMIN', 'THU_QUY')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CreateEventDto, @Req() req: Request & { user: AuthUser }) { return this.events.update(id, body, req.user.sub); }
  @Post(':id/register') register(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: AuthUser }) { return this.events.register(id, req.user.sub); }
  @Get(':id/registrations')
  @Roles('ADMIN', 'THU_QUY')
  registrations(@Param('id', new ParseUUIDPipe()) id: string) { return this.events.registrations(id); }
  @Post(':id/attendance')
  @Roles('ADMIN', 'THU_QUY')
  attend(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: AttendanceDto, @Req() req: Request & { user: AuthUser }) { return this.events.attend(id, body.thanhVienId, body.trangThai, req.user.sub); }
}
