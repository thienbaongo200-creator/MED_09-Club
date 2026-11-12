import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { Role } from './role';
import { Inject } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, @Inject(PG_POOL) private readonly db: Pool) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: config.getOrThrow('JWT_SECRET') });
  }
  async validate(payload: { sub: string; email: string }): Promise<{ sub: string; email: string; role: Role }> {
    const result = await this.db.query('SELECT id, email, vai_tro, trang_thai FROM dbo.thanh_vien WHERE id = $1', [payload.sub]);
    const member = result.rows[0];
    if (!member || member.trang_thai !== 'ACTIVE') throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return { sub: member.id, email: member.email, role: member.vai_tro };
  }
}
