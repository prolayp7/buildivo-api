import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'; import { FileInterceptor } from '@nestjs/platform-express'; import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard'; import { PermissionsGuard } from '../../../common/admin/permissions.guard'; import { RequirePermissions } from '../../../common/admin/permissions.decorator'; import { mediaUploadDirectory } from '../../../bootstrap'; import { ListMediaQueryDto, UpdateMediaDto, UploadMediaDto } from './dto/media.dto'; import { MediaService, UploadedMediaFile } from './media.service';
@Controller('admin/media') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('media.manage')
export class MediaController {
  constructor(private readonly service: MediaService) {}
  @Get() list(@Query() query: ListMediaQueryDto) { return this.service.list(query); }
  @Post() @UseInterceptors(FileInterceptor('file', { dest: mediaUploadDirectory, limits: { fileSize: 1 * 1024 * 1024, files: 1 } })) create(@Body() dto: UploadMediaDto, @UploadedFile() file?: UploadedMediaFile) { return this.service.create(dto, file); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMediaDto) { return this.service.update(id, dto); }
  @Delete(':id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
}
