import { Module } from '@nestjs/common';
import { StorefrontCalculatorsController } from './calculators.controller';
import { StorefrontCalculatorsService } from './calculators.service';
@Module({ controllers: [StorefrontCalculatorsController], providers: [StorefrontCalculatorsService] })
export class StorefrontCalculatorsModule {}
