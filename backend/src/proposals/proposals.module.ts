import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
@Module({ imports: [AuthCommonModule], controllers: [ProposalsController], providers: [ProposalsService] })
export class ProposalsModule {}
