import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
@Module({ imports: [AuthCommonModule], controllers: [MembersController], providers: [MembersService] }) export class MembersModule {}
