import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Redirect,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import type {
  CompleteUploadResult,
  CreateVideoResult,
  VideoPlaybackResult,
} from './videos.service';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a video draft and start an upload',
    description:
      'Pre-registers a draft video for the authenticated user and initiates a presigned direct-to-storage multipart upload, returning the upload id and presigned part URLs.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft created and multipart upload initiated',
    schema: {
      properties: {
        public_id: { type: 'string', format: 'uuid' },
        upload_id: { type: 'string' },
        storage_key: { type: 'string' },
        parts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              part_number: { type: 'integer' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoDto,
  ): Promise<CreateVideoResult> {
    return this.videosService.createDraft(user.sub, dto);
  }

  @Post(':publicId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Complete a video upload',
    description:
      'Finalizes the multipart upload, verifies the object landed with the declared size, transitions the draft to processing, and enqueues the processing job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload finalized; processing started',
    schema: {
      properties: {
        public_id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Caller is not the video owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Upload already finalized',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 422,
    description:
      'Uploaded object missing (UPLOAD_OBJECT_MISSING) or size mismatch (UPLOAD_SIZE_MISMATCH)',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async complete(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<CompleteUploadResult> {
    return this.videosService.completeUpload(user.sub, publicId, dto);
  }

  @Get(':publicId')
  @OptionalAuth()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get a video for playback',
    description:
      'Returns video metadata plus a presigned, Range-native playback URL streamed directly from storage. Anonymous access is allowed for ready videos; the owner also sees a non-ready video (with a null playback URL) for polling processing state.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video metadata and presigned playback URL',
    schema: {
      properties: {
        public_id: { type: 'string', format: 'uuid' },
        title: { type: 'string' },
        status: { type: 'string' },
        duration_seconds: { type: 'integer', nullable: true },
        thumbnail_url: { type: 'string', nullable: true },
        playback_url: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found, or not ready and requester is not the owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getForPlayback(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('publicId') publicId: string,
  ): Promise<VideoPlaybackResult> {
    return this.videosService.getForPlayback(publicId, user?.sub);
  }

  @Get(':publicId/download')
  @OptionalAuth()
  @Redirect()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Download a video',
    description:
      'Redirects (302) to a presigned GET URL carrying an attachment content-disposition for a native browser download. Anonymous access is allowed for ready videos.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to a presigned attachment download URL',
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found, or not ready and requester is not the owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video processing has not completed (VIDEO_NOT_READY)',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async download(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('publicId') publicId: string,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.videosService.getDownloadUrl(publicId, user?.sub);
    return { url, statusCode: HttpStatus.FOUND };
  }
}
