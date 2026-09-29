import { Module } from '@nestjs/common';
import { ReturnImageStorage } from './return-image.storage';
import { ReturnsCoreService } from './returns-core.service';
import { RefundSettlementService } from './refund-settlement.service';

/** Return rules, numbering, timeline and private photo storage, shared by the storefront and admin. */
@Module({
  providers: [ReturnsCoreService, ReturnImageStorage, RefundSettlementService],
  exports: [ReturnsCoreService, ReturnImageStorage, RefundSettlementService],
})
export class ReturnsCoreModule {}
