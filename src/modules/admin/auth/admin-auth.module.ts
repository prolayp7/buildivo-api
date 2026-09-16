import { Module } from '@nestjs/common';
import { AdminAuthController, AdminMeController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';

@Module({
  controllers: [AdminAuthController, AdminMeController],
  providers: [AdminAuthService],
})
export class AdminAuthModule {}
