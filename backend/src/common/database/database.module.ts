import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [{
    provide: PG_POOL,
    useFactory: () => new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    }),
  }],
  exports: [PG_POOL],
})
export class DatabaseModule {}
