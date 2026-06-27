import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class SignUploadPartDto {
  @IsString()
  @IsNotEmpty()
  video_id: string;

  @IsString()
  @IsNotEmpty()
  upload_id: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  part_number: number;
}
