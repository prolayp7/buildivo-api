import { Body, Controller, Get, Header, HttpCode, Param, ParseIntPipe, Post, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { StorefrontReturnsService, UploadedEvidence } from './returns.service';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { MAX_EVIDENCE_IMAGE_BYTES } from '../../returns/return-rules';

@Controller('returns')
@UseGuards(CustomerAuthGuard)
export class StorefrontReturnsController {
  constructor(private readonly returnsService: StorefrontReturnsService) {}

  @Get()
  list(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.returnsService.list(customer.id);
  }

  /** What each item of an order can still have returned, plus reasons and collection addresses. */
  @Get('orders/:orderUuid')
  returnable(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('orderUuid') orderUuid: string) {
    return this.returnsService.returnable(customer.id, orderUuid);
  }

  /** Multipart: `data` (JSON, see CreateReturnRequestDto) + photos named `evidence_<item index>`. */
  @Post()
  @HttpCode(201)
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_EVIDENCE_IMAGE_BYTES, files: 250 } }))
  create(@CurrentCustomer() customer: AuthenticatedCustomer, @Body('data') data: string, @UploadedFiles() files: UploadedEvidence[] = []) {
    return this.returnsService.create(customer.id, data, files);
  }

  @Get(':returnNumber')
  detail(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('returnNumber') returnNumber: string) {
    return this.returnsService.detail(customer.id, returnNumber);
  }

  @Post(':returnNumber/cancel')
  cancel(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('returnNumber') returnNumber: string) {
    return this.returnsService.cancel(customer.id, returnNumber);
  }

  @Get(':returnNumber/images/:imageId')
  @Header('Cache-Control', 'private, no-store')
  async image(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('returnNumber') returnNumber: string, @Param('imageId', ParseIntPipe) imageId: number) {
    const image = await this.returnsService.image(customer.id, returnNumber, imageId);
    return new StreamableFile(image.buffer, { type: image.mimeType });
  }
}
