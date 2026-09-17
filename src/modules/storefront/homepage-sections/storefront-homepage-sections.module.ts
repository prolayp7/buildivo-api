import { Module } from '@nestjs/common';
import { StorefrontHomepageSectionsController } from './storefront-homepage-sections.controller';
import { StorefrontHomepageSectionsService } from './storefront-homepage-sections.service';
@Module({ controllers: [StorefrontHomepageSectionsController], providers: [StorefrontHomepageSectionsService] })
export class StorefrontHomepageSectionsModule {}
