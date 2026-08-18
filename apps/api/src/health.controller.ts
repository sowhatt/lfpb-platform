import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: 'lfpb-api'; timestamp: string } {
    return {
      status: 'ok',
      service: 'lfpb-api',
      timestamp: new Date().toISOString(),
    };
  }
}
