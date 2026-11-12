import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { FundsController } from './funds.controller';
import { FundsService } from './funds.service';
import { SearchService } from './search.service';
@Module({ imports: [AuthCommonModule, StorageModule], controllers: [FundsController], providers: [FundsService, SearchService], exports: [FundsService] })
export class FundsModule {}
