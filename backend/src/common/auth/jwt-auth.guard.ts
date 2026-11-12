import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser | false | null, _info: unknown, _context: ExecutionContext, _status?: unknown): TUser {
    if (err) throw err;
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return user as TUser;
  }
}
