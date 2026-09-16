import { IsString, MaxLength, MinLength } from 'class-validator';

export class MergeCartDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  guestToken: string;
}
