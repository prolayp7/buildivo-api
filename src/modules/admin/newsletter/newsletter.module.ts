import { Module } from '@nestjs/common';
import { AdminNewsletterController } from './newsletter.controller';
import { AdminNewsletterService } from './newsletter.service';

@Module({
  controllers: [AdminNewsletterController],
  providers: [AdminNewsletterService],
})
export class AdminNewsletterModule {}
