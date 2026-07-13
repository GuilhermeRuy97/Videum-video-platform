import {
  IsInt,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Maximum accepted upload size: 10 GiB (per phase-03-upload-processing/TD-05). */
export const MAX_UPLOAD_BYTES = 10 * 1024 ** 3;

export class CreateVideoDto {
  /** Human-readable video title. */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  /** Original file name of the upload. */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename: string;

  /** MIME type of the upload (e.g. `video/mp4`). */
  @IsString()
  @MinLength(1)
  content_type: string;

  /** Total upload size in bytes; capped at 10 GiB. */
  @IsInt()
  @IsPositive()
  @Max(MAX_UPLOAD_BYTES)
  size_bytes: number;
}
