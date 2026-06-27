import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class InitVideoUploadDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  original_filename: string;

  @IsString()
  @IsNotEmpty()
  content_type: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024 * 1024)
  size_bytes: number;
}
