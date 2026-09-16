import { Module } from '@nestjs/common';
import { ProductConditionsController } from './product-conditions.controller';
import { ProductConditionsService } from './product-conditions.service';

@Module({
  controllers: [ProductConditionsController],
  providers: [ProductConditionsService],
})
export class ProductConditionsModule {}
