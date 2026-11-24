import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

@Module({
  imports: [CoursesModule, PaymentsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
