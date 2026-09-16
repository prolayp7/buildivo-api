import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { StorefrontAuthService } from './storefront-auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';

@Controller('auth')
export class StorefrontAuthController {
  constructor(private readonly authService: StorefrontAuthService) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('otp/send')
  @HttpCode(200)
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.email, dto.purpose);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.purpose, dto.code);
  }

  @Post('password/reset')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }
}

@Controller('me')
@UseGuards(CustomerAuthGuard)
export class StorefrontMeController {
  constructor(private readonly authService: StorefrontAuthService) {}

  @Get()
  me(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.authService.me(customer.id);
  }

  @Patch()
  update(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(customer.id, dto);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(customer.id, dto.currentPassword, dto.newPassword);
  }
}
