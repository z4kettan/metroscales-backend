import { Body, Controller, Get, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScaleIngestService } from './scale-ingest.service';
import { AckDto, HeartbeatDto, UploadBillDto } from './dto/gateway.dto';

/// Stand-in for a real scale, so the apps can be built and demoed before the
/// scale protocol is known. Only enabled when DEVICE_SIMULATOR=true.
/// No login: anyone who can reach it can fake sales, so never enable it on a
/// public server with real customers.
@Controller('device-sim/:mac')
export class SimulatorController {
  constructor(
    private readonly ingest: ScaleIngestService,
    private readonly config: ConfigService,
  ) {}

  private guard() {
    if (this.config.get('DEVICE_SIMULATOR') !== 'true') throw new NotFoundException();
  }

  @Post('heartbeat')
  @HttpCode(200)
  async heartbeat(@Param('mac') mac: string, @Body() dto: HeartbeatDto, @Ip() ip: string) {
    this.guard();
    const scale = await this.ingest.heartbeat(mac, { ip, firmware: dto.firmware });
    return { scaleId: scale.id, lastSeenAt: scale.lastSeenAt };
  }

  @Post('bills')
  async bill(@Param('mac') mac: string, @Body() dto: UploadBillDto) {
    this.guard();
    return this.ingest.uploadBill(mac, dto);
  }

  @Get('commands')
  async commands(@Param('mac') mac: string) {
    this.guard();
    return this.ingest.takeCommands(mac);
  }

  @Post('commands/:id/ack')
  @HttpCode(200)
  async ack(@Param('mac') mac: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AckDto) {
    this.guard();
    return this.ingest.ack(mac, id, dto);
  }
}
