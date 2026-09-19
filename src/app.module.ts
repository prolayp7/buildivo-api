import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuditLogsModule } from './modules/admin/audit-logs/audit-logs.module';
import { AuditModule } from './common/audit/audit.module';
import { correlationMiddleware } from './common/audit/correlation';
import { PrismaModule } from './prisma/prisma.module';
import { AdminCoreModule } from './common/admin/admin-core.module';
import { AdminAuthModule } from './modules/admin/auth/admin-auth.module';
import { CustomersModule } from './modules/admin/customers/customers.module';
import { CategoriesModule } from './modules/admin/catalog/categories/categories.module';
import { BrandsModule } from './modules/admin/catalog/brands/brands.module';
import { SuppliersModule } from './modules/admin/catalog/suppliers/suppliers.module';
import { ProductConditionsModule } from './modules/admin/catalog/product-conditions/product-conditions.module';
import { TaxRatesModule } from './modules/admin/catalog/tax-rates/tax-rates.module';
import { ProductAttributesModule } from './modules/admin/catalog/product-attributes/product-attributes.module';
import { ProductsModule } from './modules/admin/catalog/products/products.module';
import { SettingsModule } from './modules/admin/settings/settings.module';
import { ShippingMethodsModule } from './modules/admin/shipping/shipping-methods.module';
import { OrdersModule } from './modules/admin/orders/orders.module';
import { RbacModule } from './modules/admin/rbac/rbac.module';
import { CollectionsModule } from './modules/admin/catalog/collections/collections.module';
import { CouponsModule } from './modules/admin/marketing/coupons/coupons.module';
import { BundlesModule } from './modules/admin/marketing/bundles/bundles.module';
import { PaymentOperationsModule } from './modules/admin/payment-operations/payment-operations.module';
import { AdminQuotesModule } from './modules/admin/quotes/quotes.module';
import { ReviewsModule } from './modules/admin/reviews/reviews.module';
import { AdminQnaModule } from './modules/admin/qna/qna.module';
import { GiftCardsModule } from './modules/admin/gift-cards/gift-cards.module';
import { MerchandisingModule } from './modules/admin/merchandising/merchandising.module';
import { MenusModule } from './modules/admin/menus/menus.module';
import { CmsModule } from './modules/admin/cms/cms.module';
import { NotificationsModule } from './modules/admin/notifications/notifications.module';
import { ReportsModule } from './modules/admin/reports/reports.module';
import { MediaModule } from './modules/admin/media/media.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { StorefrontAuthModule } from './modules/storefront/auth/storefront-auth.module';
import { StorefrontCategoriesModule } from './modules/storefront/catalog/categories/storefront-categories.module';
import { StorefrontSettingsModule } from './modules/storefront/settings/storefront-settings.module';
import { StorefrontBrandsModule } from './modules/storefront/catalog/brands/storefront-brands.module';
import { StorefrontProductsModule } from './modules/storefront/catalog/products/storefront-products.module';
import { StorefrontAddressesModule } from './modules/storefront/addresses/storefront-addresses.module';
import { StorefrontCouponsModule } from './modules/storefront/coupons/coupons.module';
import { CartModule } from './modules/storefront/cart/cart.module';
import { StorefrontShippingModule } from './modules/storefront/shipping/storefront-shipping.module';
import { OrdersModule as StorefrontOrdersModule } from './modules/storefront/orders/orders.module';
import { WishlistModule } from './modules/storefront/wishlist/wishlist.module';
import { StorefrontReviewsModule } from './modules/storefront/reviews/reviews.module';
import { StorefrontReturnsModule } from './modules/storefront/returns/returns.module';
import { NewsletterModule } from './modules/storefront/newsletter/newsletter.module';
import { AdminNewsletterModule } from './modules/admin/newsletter/newsletter.module';
import { EmailModule } from './modules/email/email.module';
import { StorefrontMerchandisingModule } from './modules/storefront/merchandising/storefront-merchandising.module';
import { StorefrontCmsModule } from './modules/storefront/cms/storefront-cms.module';
import { StorefrontMenusModule } from './modules/storefront/menus/storefront-menus.module';
import { StorefrontHomepageSectionsModule } from './modules/storefront/homepage-sections/storefront-homepage-sections.module';
import { StorefrontBundlesModule } from './modules/storefront/bundles/storefront-bundles.module';
import { StorefrontQuotesModule } from './modules/storefront/quotes/quotes.module';
import { StorefrontQnaModule } from './modules/storefront/qna/qna.module';
import { StorefrontCalculatorsModule } from './modules/storefront/calculators/calculators.module';
import { SitemapModule } from './modules/storefront/sitemap/sitemap.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
            limit: config.get<number>('THROTTLE_LIMIT', 120),
          },
        ],
      }),
    }),
    PrismaModule,
    AuditModule,
    EmailModule,
    AdminCoreModule,
    AdminAuthModule,
    StorefrontAuthModule,
    StorefrontCategoriesModule,
    StorefrontSettingsModule,
    StorefrontBrandsModule,
    StorefrontProductsModule,
    StorefrontAddressesModule,
    StorefrontCouponsModule,
    CartModule,
    StorefrontShippingModule,
    StorefrontOrdersModule,
    WishlistModule,
    StorefrontReviewsModule,
    StorefrontReturnsModule,
    NewsletterModule,
    StorefrontMerchandisingModule,
    StorefrontCmsModule,
    StorefrontMenusModule,
    StorefrontHomepageSectionsModule,
    StorefrontBundlesModule,
    StorefrontQuotesModule,
    StorefrontQnaModule,
    StorefrontCalculatorsModule,
    SitemapModule,
    CustomersModule,
    CategoriesModule,
    BrandsModule,
    SuppliersModule,
    ProductConditionsModule,
    TaxRatesModule,
    ProductAttributesModule,
    ProductsModule,
    SettingsModule,
    ShippingMethodsModule,
    OrdersModule,
    RbacModule,
    CollectionsModule,
    CouponsModule,
    BundlesModule,
    PaymentOperationsModule,
    AdminQuotesModule,
    ReviewsModule,
    AdminQnaModule,
    AdminNewsletterModule,
    GiftCardsModule,
    MerchandisingModule,
    MenusModule,
    CmsModule,
    NotificationsModule,
    ReportsModule,
    MediaModule,
    PaymentsModule,
    AuditLogsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(correlationMiddleware).forRoutes('*');
  }
}
