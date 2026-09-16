import { Module } from '@nestjs/common';
import { StorefrontQnaController } from './qna.controller';
import { StorefrontQnaService } from './qna.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';

@Module({
  imports: [CustomerCoreModule],
  controllers: [StorefrontQnaController],
  providers: [StorefrontQnaService],
})
export class StorefrontQnaModule {}
