import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { couponIsActive, type Coupon, type CouponInput } from '@speakukrainian/shared';
import { CLOCK, type Clock } from '../infra/clock/clock.tokens.js';
import { DatabaseService, isUniqueViolation } from '../infra/db/database.service.js';

interface CouponRow {
  id: string;
  code: string;
  percent_off: number;
  starts_on: string;
  ends_on: string;
  created_at: string;
  times_used: number;
}

/** A coupon the student may use today: what the order is priced and recorded with. */
export interface RedeemableCoupon {
  code: string;
  percentOff: number;
}

const COUPON_SELECT = `
  select c.id, c.code, c.percent_off, c.starts_on, c.ends_on, c.created_at,
         (select count(*) from orders o
           where o.coupon_code = c.code collate nocase and o.status = 'paid') as times_used
  from coupons c`;

/**
 * Discount coupons: managed in the control panel, redeemed at checkout.
 * Orders copy the code and the percentage, so a coupon can be edited or
 * deleted at any time without changing what past purchases say.
 */
@Injectable()
export class CouponsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(): Promise<Coupon[]> {
    const rows = await this.db.rows<CouponRow>(
      `${COUPON_SELECT} order by c.starts_on desc, c.code`,
    );
    return rows.map((row) => this.toCoupon(row));
  }

  async create(input: CouponInput): Promise<Coupon> {
    const row = await this.write(() =>
      this.db.one<{ id: string }>(
        `insert into coupons (code, percent_off, starts_on, ends_on)
         values (?1, ?2, ?3, ?4) returning id`,
        [input.code, input.percentOff, input.startsOn, input.endsOn],
      ),
    );
    return this.findById(row!.id);
  }

  async update(id: string, input: CouponInput): Promise<Coupon> {
    const result = await this.write(() =>
      this.db.query(
        `update coupons set code = ?2, percent_off = ?3, starts_on = ?4, ends_on = ?5
         where id = ?1`,
        [id, input.code, input.percentOff, input.startsOn, input.endsOn],
      ),
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('That coupon does not exist.');
    }
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.db.query('delete from coupons where id = ?1', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundException('That coupon does not exist.');
    }
  }

  /**
   * The coupon a student typed, if it can be used today. The message says why
   * not, because the student reads it in the buy box.
   */
  async redeemable(code: string): Promise<RedeemableCoupon> {
    const row = await this.db.one<CouponRow>(`${COUPON_SELECT} where c.code = ?1 collate nocase`, [
      code,
    ]);
    if (!row) {
      throw new BadRequestException('That coupon code does not exist.');
    }
    const today = this.today();
    if (today < row.starts_on) {
      throw new BadRequestException(`That coupon can only be used from ${row.starts_on}.`);
    }
    if (today > row.ends_on) {
      throw new BadRequestException(`That coupon expired on ${row.ends_on}.`);
    }
    return { code: row.code, percentOff: row.percent_off };
  }

  private async findById(id: string): Promise<Coupon> {
    const row = await this.db.one<CouponRow>(`${COUPON_SELECT} where c.id = ?1`, [id]);
    if (!row) {
      throw new NotFoundException('That coupon does not exist.');
    }
    return this.toCoupon(row);
  }

  private async write<T>(statement: () => Promise<T>): Promise<T> {
    try {
      return await statement();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Another coupon already uses that code.');
      }
      throw error;
    }
  }

  /** `YYYY-MM-DD` in UTC: coupon dates are whole UTC days. */
  private today(): string {
    return new Date(this.clock.now()).toISOString().slice(0, 10);
  }

  private toCoupon(row: CouponRow): Coupon {
    const coupon = { startsOn: row.starts_on, endsOn: row.ends_on };
    return {
      id: row.id,
      code: row.code,
      percentOff: row.percent_off,
      ...coupon,
      active: couponIsActive(coupon, this.today()),
      timesUsed: row.times_used,
      createdAt: row.created_at,
    };
  }
}
