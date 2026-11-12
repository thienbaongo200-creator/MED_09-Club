import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMemberDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) hoTen?: string;
  @IsOptional() @IsEmail() @MaxLength(100) email?: string;
  @IsOptional() @IsString() @MaxLength(20) soDienThoai?: string | null;
}
