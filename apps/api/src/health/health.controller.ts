import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { DatabaseService } from '../infra/db/database.service.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get('health')
  async health(): Promise<{ status: 'ok' | 'degraded'; database: string }> {
    try {
      await this.db.query('select 1');
      return { status: 'ok', database: 'ok' };
    } catch (error) {
      return { status: 'degraded', database: (error as Error).message };
    }
  }
}
