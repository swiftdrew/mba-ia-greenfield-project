import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StorageService } from '../storage/storage.service';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { InitVideoUploadDto } from './dto/init-video-upload.dto';
import { SignUploadPartDto } from './dto/sign-upload-part.dto';
import { VideosService } from './videos.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string };
}

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly storageService: StorageService,
  ) {}

  @Post('uploads/init')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Initialize multipart upload and create draft video',
  })
  async initUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InitVideoUploadDto,
  ): Promise<{
    video_id: string;
    slug: string;
    upload_id: string;
    object_key: string;
  }> {
    return this.videosService.initUpload(req.user.sub, dto);
  }

  @Post('uploads/sign-part')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Generate pre-signed URL for multipart part upload',
  })
  async signPart(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SignUploadPartDto,
  ): Promise<{ upload_url: string }> {
    return this.videosService.signUploadPart(req.user.sub, dto);
  }

  @Post('uploads/complete')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Complete multipart upload and enqueue processing' })
  async completeUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CompleteVideoUploadDto,
  ): Promise<void> {
    return this.videosService.completeUpload(req.user.sub, dto);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get public video metadata by slug' })
  async getVideoBySlug(@Param('slug') slug: string): Promise<{
    id: string;
    title: string;
    slug: string;
    status: string;
    duration_seconds: number | null;
    thumbnail_object_key: string | null;
    created_at: Date;
  }> {
    const video = await this.videosService.getPublicVideoBySlug(slug);
    return {
      id: video.id,
      title: video.title,
      slug: video.slug,
      status: video.status,
      duration_seconds: video.duration_seconds,
      thumbnail_object_key: video.thumbnail_object_key,
      created_at: video.created_at,
    };
  }

  @Public()
  @Get(':slug/stream')
  @ApiOperation({ summary: 'Stream video with HTTP range support' })
  async streamVideo(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.videosService.getPublicVideoBySlug(slug);
    const streamResult = await this.storageService.getVideoObjectStream(
      video.source_object_key!,
      req.headers.range,
    );

    res.status(streamResult.statusCode);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', streamResult.contentType);
    res.setHeader('Content-Length', streamResult.contentLength.toString());
    if (streamResult.contentRange) {
      res.setHeader('Content-Range', streamResult.contentRange);
    }

    streamResult.body.pipe(res);
  }

  @Public()
  @Get(':slug/download')
  @Header('Content-Disposition', 'attachment')
  @ApiOperation({ summary: 'Download full video file' })
  async downloadVideo(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.videosService.getPublicVideoBySlug(slug);
    const metadata = await this.storageService.getVideoObjectMetadata(
      video.source_object_key!,
    );
    const streamResult = await this.storageService.getVideoObjectStream(
      video.source_object_key!,
    );

    res.status(200);
    res.setHeader('Content-Type', metadata.contentType);
    res.setHeader('Content-Length', metadata.contentLength.toString());
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${video.slug}.mp4"`,
    );

    streamResult.body.pipe(res);
  }
}
