import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { LowStockAlertService } from './low-stock-alert.service';
import { SettingsModule } from '../admin/settings/settings.module';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [EmailService, LowStockAlertService],
  exports: [EmailService, LowStockAlertService],
})
export class EmailModule {}
