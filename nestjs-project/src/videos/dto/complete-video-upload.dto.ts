import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CompletedPartDto {
  @IsInt()
  part_number: number;

  @IsString()
  @IsNotEmpty()
  etag: string;
}

export class CompleteVideoUploadDto {
  @IsString()
  @IsNotEmpty()
  video_id: string;

  @IsString()
  @IsNotEmpty()
  upload_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts: CompletedPartDto[];
}
