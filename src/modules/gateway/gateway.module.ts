import { Module } from '@nestjs/common';
import { ScaleIngestService } from './scale-ingest.service';
import { SimulatorController } from './simulator.controller';

@Module({
  controllers: [SimulatorController],
  providers: [ScaleIngestService],
  exports: [ScaleIngestService],
})
export class GatewayModule {}
