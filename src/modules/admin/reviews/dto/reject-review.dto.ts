import { IsOptional, IsString } from 'class-validator';
export class RejectReviewDto { @IsOptional() @IsString() reason?: string; }
