import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import { IsIn, IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { Request } from 'express';
import { AuthUser } from '../common/auth/role';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { FundsService } from './funds.service';

class CreateManualTransactionDto {
  @IsIn(['THU', 'CHI']) loai!: 'THU' | 'CHI';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) soTien!: number;
  @IsString() @MaxLength(2000) noiDung!: string;
}
class UpdateManualTransactionDto extends CreateManualTransactionDto {}
class ReverseTransactionDto { @IsString() @MaxLength(2000) noiDung!: string; }

const MAX_VOUCHER_SIZE = 10 * 1024 * 1024;
export function validateVoucherFile(file: Express.Multer.File) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size <= 0 || file.size > MAX_VOUCHER_SIZE) {
    throw new BadRequestException('Invalid voucher file or file exceeds 10 MB.');
  }
  const signatures: Record<string, (buffer: Buffer) => boolean> = {
    'application/pdf': (buffer) => buffer.subarray(0, 5).equals(Buffer.from('%PDF-')),
    'image/jpeg': (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  };
  if (!signatures[file.mimetype]?.(file.buffer)) {
    throw new BadRequestException('Voucher content must be a valid PDF, JPEG, or PNG file.');
  }
  const displayName = (file.originalname ?? '').replace(/\\/g, '/').split('/').pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!displayName || displayName.length > 255) throw new BadRequestException('Invalid voucher filename.');
  return { ...file, originalname: displayName };
}

@Controller('fund')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'THU_QUY', 'THANH_VIEN')
export class FundsController {
  constructor(private readonly funds: FundsService) {}
  @Get('transactions') statement(@Query() query: { page?: number; pageSize?: number; tuNgay?: string; denNgay?: string; loai?: string; keyword?: string }, @Req() req: Request & { user: AuthUser }) { return this.funds.getStatement(query, req.user); }
  @Get('summary') summary() { return this.funds.summary(); }
  @Get('transactions/:id/voucher-url')
  @Roles('ADMIN', 'THU_QUY')
  voucher(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: AuthUser }) { return this.funds.voucherUrl(id, req.user); }
  @Post('transactions')
  @Roles('ADMIN', 'THU_QUY')
  create(@Body() body: CreateManualTransactionDto, @Req() req: Request & { user: AuthUser }) { return this.funds.createManualTransaction(body, req.user.sub); }
  @Patch('transactions/:id')
  @Roles('ADMIN', 'THU_QUY')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateManualTransactionDto, @Req() req: Request & { user: AuthUser }) { return this.funds.updateManualTransaction(id, body, req.user.sub); }
  @Post('transactions/:id/reversal')
  @Roles('ADMIN', 'THU_QUY')
  reverse(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ReverseTransactionDto, @Req() req: Request & { user: AuthUser }) { return this.funds.reverseTransaction(id, body.noiDung, req.user.sub); }
  @Post('transactions/:id/voucher')
  @Roles('ADMIN', 'THU_QUY')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadVoucher(@Param('id', new ParseUUIDPipe()) id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request & { user: AuthUser }) {
    if (!file) throw new BadRequestException('Thiếu tệp chứng từ.');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) throw new BadRequestException('Chỉ chấp nhận PDF, JPEG hoặc PNG.');
    return this.funds.uploadVoucher(id, req.user.sub, validateVoucherFile(file));
  }
}
