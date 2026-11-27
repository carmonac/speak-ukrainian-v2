import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { couponInputSchema, idSchema, type Coupon, type CouponInput } from '@speakukrainian/shared';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CouponsService } from './coupons.service.js';

const couponId = () => new ZodValidationPipe(idSchema);

/** Coupons in the control panel. Students check a code through `/me/checkout/quote`. */
@ApiTags('coupons')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(): Promise<Coupon[]> {
    return this.coupons.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(couponInputSchema)) body: CouponInput): Promise<Coupon> {
    return this.coupons.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', couponId()) id: string,
    @Body(new ZodValidationPipe(couponInputSchema)) body: CouponInput,
  ): Promise<Coupon> {
    return this.coupons.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', couponId()) id: string): Promise<void> {
    return this.coupons.remove(id);
  }
}
