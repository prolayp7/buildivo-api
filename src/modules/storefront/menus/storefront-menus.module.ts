import { Module } from '@nestjs/common';
import { StorefrontMenusController } from './storefront-menus.controller';
import { StorefrontMenusService } from './storefront-menus.service';
@Module({ controllers: [StorefrontMenusController], providers: [StorefrontMenusService] })
export class StorefrontMenusModule {}
