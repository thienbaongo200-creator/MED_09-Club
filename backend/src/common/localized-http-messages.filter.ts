import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

const FRAMEWORK_MESSAGES: Record<string, string> = {
  'Unauthorized': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  'Forbidden resource': 'Bạn không có quyền thực hiện thao tác này.',
  'File too large': 'Tệp chứng từ không được vượt quá 10 MB.',
  'Unexpected field': 'Trường tệp tải lên không được hỗ trợ.',
  'Unexpected end of JSON input': 'Dữ liệu gửi lên không đúng định dạng.',
};

@Catch()
export class LocalizedHttpMessagesFilter implements ExceptionFilter {
  private readonly logger = new Logger(LocalizedHttpMessagesFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
      if (typeof exception === 'object' && exception !== null && 'statusCode' in exception) {
        const httpError = exception as { statusCode?: unknown; message?: unknown };
        if (typeof httpError.statusCode === 'number' && typeof httpError.message === 'string') {
          const message = FRAMEWORK_MESSAGES[httpError.message]
            ?? (httpError.statusCode >= 500 ? 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.' : 'Yêu cầu không hợp lệ.');
          response.status(httpError.statusCode).json({ statusCode: httpError.statusCode, message });
          return;
        }
      }
      response.status(500).json({ statusCode: 500, message: 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.' });
      return;
    }

    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      response.status(status).json({ statusCode: status, message: FRAMEWORK_MESSAGES[payload] ?? payload });
      return;
    }

    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      const body = payload as Record<string, unknown>;
      if (typeof body.message === 'string' && FRAMEWORK_MESSAGES[body.message]) {
        response.status(status).json({ ...body, message: FRAMEWORK_MESSAGES[body.message] });
        return;
      }
    }

    response.status(status).json(payload);
  }
}
