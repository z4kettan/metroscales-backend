import { Module } from '@nestjs/common';
import { ScalesModule } from '../scales/scales.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [ScalesModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
