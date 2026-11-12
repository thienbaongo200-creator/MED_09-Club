import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
@Module({ imports: [AuthCommonModule], controllers: [EventsController], providers: [EventsService] }) export class EventsModule {}
