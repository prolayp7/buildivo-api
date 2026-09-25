import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class TrackOrderDto {
  @IsString() @MinLength(3) @MaxLength(40) orderNumber: string;
  @IsEmail() @MaxLength(254) email: string;
}
