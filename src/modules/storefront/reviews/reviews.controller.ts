import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { StorefrontReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';

@Controller('reviews')
export class StorefrontReviewsController {
  constructor(private readonly reviewsService: StorefrontReviewsService) {}

  @Get()
  list(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.list(query);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(CustomerAuthGuard)
  create(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(customer.id, `${customer.firstName} ${customer.lastName}`, dto);
  }
}
