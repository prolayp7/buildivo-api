import { Controller, Get, Query } from '@nestjs/common';
import { StorefrontCalculatorsService } from './calculators.service';
import { MaterialsCalculatorQueryDto } from './dto/materials-calculator-query.dto';

@Controller('calculators')
export class StorefrontCalculatorsController {
  constructor(private readonly service: StorefrontCalculatorsService) {}
  // Products an admin has given coverage data (paint, tiles, flooring...), for the calculator's product picker.
  @Get('products') products() { return this.service.products(); }
  @Get('materials') materials(@Query() query: MaterialsCalculatorQueryDto) { return this.service.materials(query); }
}
