import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [CouponsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
