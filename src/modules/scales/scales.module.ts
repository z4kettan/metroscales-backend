import { Module } from '@nestjs/common';
import { ScaleCommandsService } from './scale-commands.service';
import { ScalesController } from './scales.controller';
import { ScalesService } from './scales.service';

@Module({
  controllers: [ScalesController],
  providers: [ScalesService, ScaleCommandsService],
  exports: [ScalesService, ScaleCommandsService],
})
export class ScalesModule {}
