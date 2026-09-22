import { PartialType } from '@nestjs/mapped-types'; import { CreateTrustBadgeDto } from './create-trust-badge.dto'; export class UpdateTrustBadgeDto extends PartialType(CreateTrustBadgeDto) {}
