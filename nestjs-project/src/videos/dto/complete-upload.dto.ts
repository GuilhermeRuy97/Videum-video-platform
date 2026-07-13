import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UploadedPartDto {
  /** 1-based part number of the multipart upload. */
  @IsInt()
  @IsPositive()
  part_number: number;

  /** ETag storage returned for the uploaded part. */
  @IsString()
  @MinLength(1)
  etag: string;
}

export class CompleteUploadDto {
  /** The uploaded parts used to finalize the multipart upload. */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UploadedPartDto)
  parts: UploadedPartDto[];
}
