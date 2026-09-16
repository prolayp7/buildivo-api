import { ArrayMinSize, ArrayUnique, IsArray, IsInt } from 'class-validator';

export class ReorderHomepageSectionsDto {
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsInt({ each: true })
  order: number[];
}
