import { Module } from '@nestjs/common';
import { AdminQuotesController } from './quotes.controller';
import { AdminQuotesService } from './quotes.service';
@Module({ controllers: [AdminQuotesController], providers: [AdminQuotesService] })
export class AdminQuotesModule {}
