import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';

@Module({
  imports: [CustomerCoreModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
