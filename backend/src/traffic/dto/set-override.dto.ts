import { IsBoolean } from 'class-validator';

export class SetOverrideDto {
  @IsBoolean()
  engaged!: boolean;
}
