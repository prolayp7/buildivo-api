import { Module } from '@nestjs/common';
import { GiftCardsController } from './gift-cards.controller';
import { GiftCardsService } from './gift-cards.service';
@Module({ controllers: [GiftCardsController], providers: [GiftCardsService] })
export class GiftCardsModule {}
