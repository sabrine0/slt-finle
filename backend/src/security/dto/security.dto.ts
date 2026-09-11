import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleNames!: string[];
}
