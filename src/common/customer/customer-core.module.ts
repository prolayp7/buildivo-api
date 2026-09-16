import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CustomerAuthGuard } from './customer-auth.guard';
import { OptionalCustomerAuthGuard } from './optional-customer-auth.guard';

// Not @Global(): AdminCoreModule already publishes a globally-visible JwtService
// bound to JWT_ADMIN_SECRET. A second global JwtModule registration would collide
// with it on the same DI token, so every storefront module that needs customer
// auth imports this module explicitly instead.
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_CUSTOMER_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [CustomerAuthGuard, OptionalCustomerAuthGuard],
  exports: [JwtModule, CustomerAuthGuard, OptionalCustomerAuthGuard],
})
export class CustomerCoreModule {}
