import { Controller, Get, Query } from '@nestjs/common';
import { StorefrontCalculatorsService } from './calculators.service';
import { MaterialsCalculatorQueryDto } from './dto/materials-calculator-query.dto';

@Controller('calculators')
export class StorefrontCalculatorsController {
  constructor(private readonly service: StorefrontCalculatorsService) {}
  @Get('materials') materials(@Query() query: MaterialsCalculatorQueryDto) { return this.service.materials(query); }
}
