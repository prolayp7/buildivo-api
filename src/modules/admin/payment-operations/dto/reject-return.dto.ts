import { IsOptional, IsString } from 'class-validator';
export class RejectReturnDto { @IsOptional() @IsString() comment?: string; }
