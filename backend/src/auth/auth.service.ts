import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare as compareJs } from 'bcryptjs';
import { Pool } from 'pg';
import { Inject } from '@nestjs/common';
import { PG_POOL } from '../common/database/database.module';

@Injectable()
export class AuthService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly jwt: JwtService) {}
  async login(email: string, password: string) {
    const { rows } = await this.db.query(`SELECT id, ho_ten, email, so_dien_thoai, vai_tro, trang_thai, ngay_tham_gia, mat_khau_hash FROM dbo.thanh_vien WHERE lower(email)=lower($1)`, [email]);
    const member = rows[0];
    // Production hashes must be bcrypt. The SHA-256 fixture hashes in database/02_seed.sql are not accepted.
    let validPassword = false;
    if (member?.mat_khau_hash.startsWith('$2')) {
      try {
        const bcrypt = await import('bcrypt');
        validPassword = await bcrypt.compare(password, member.mat_khau_hash);
      } catch {
        // Keep local development functional when native bcrypt install scripts are disabled.
        validPassword = await compareJs(password, member.mat_khau_hash);
      }
    }
    if (!member || member.trang_thai !== 'ACTIVE' || !validPassword) throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    const accessToken = await this.jwt.signAsync({ sub: member.id, email: member.email });
    return { accessToken, user: this.toUser(member) };
  }

  async me(memberId: string) {
    const { rows } = await this.db.query(`SELECT id, ho_ten, email, so_dien_thoai, vai_tro, trang_thai, ngay_tham_gia FROM dbo.thanh_vien WHERE id=$1`, [memberId]);
    if (!rows[0] || rows[0].trang_thai !== 'ACTIVE') throw new UnauthorizedException();
    return this.toUser(rows[0]);
  }

  private toUser(member: any) {
    return { id: member.id, hoTen: member.ho_ten, email: member.email, soDienThoai: member.so_dien_thoai, vaiTro: member.vai_tro, trangThai: member.trang_thai, ngayThamGia: member.ngay_tham_gia };
  }
}
