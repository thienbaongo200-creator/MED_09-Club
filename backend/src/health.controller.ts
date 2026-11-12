import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './common/database/database.module';
import { ObjectStorageService } from './storage/object-storage.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly storage: ObjectStorageService) {}

  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unavailable' });
    }
    if (!(await this.storage.isReady())) {
      throw new ServiceUnavailableException({ status: 'error', database: 'ok', storage: 'unavailable' });
    }
    return { status: 'ok', database: 'ok', storage: this.storage.isEnabled() ? 'ok' : 'disabled' };
  }
}
