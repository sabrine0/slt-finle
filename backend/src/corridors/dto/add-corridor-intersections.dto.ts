import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

import { CorridorIntersectionInputDto } from './create-corridor.dto';

export class AddCorridorIntersectionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CorridorIntersectionInputDto)
  intersections!: CorridorIntersectionInputDto[];
}
