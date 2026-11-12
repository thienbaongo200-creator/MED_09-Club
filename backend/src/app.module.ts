import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthCommonModule } from './common/auth/auth.module';
import { DatabaseModule } from './common/database/database.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { FundsModule } from './funds/funds.module';
import { MembersModule } from './members/members.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ReportsModule } from './reports/reports.module';
import { StorageModule } from './storage/storage.module';
import { HealthController } from './health.controller';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthCommonModule, AuthModule, MembersModule, FundsModule, ProposalsModule, EventsModule, ReportsModule, StorageModule], controllers: [HealthController] })
export class AppModule {}
