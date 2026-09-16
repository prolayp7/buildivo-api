import { PartialType } from '@nestjs/mapped-types'; import { CreateFeaturedSectionDto } from './create-featured-section.dto';
export class UpdateFeaturedSectionDto extends PartialType(CreateFeaturedSectionDto) {}
