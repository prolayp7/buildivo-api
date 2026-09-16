import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateTrackingDto {
  @IsString() @MinLength(1) @MaxLength(255) trackingCarrier: string;
  @IsString() @MinLength(1) @MaxLength(255) trackingNumber: string;
  @IsOptional() @IsUrl({ require_protocol: true }) trackingUrl?: string;
}
