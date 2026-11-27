import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../auth/roles.decorator.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { CouponsController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';

const TODAY = Date.parse('2026-03-15T23:30:00Z');
const SPRING = { code: 'SPRING', percentOff: 20, startsOn: '2026-03-01', endsOn: '2026-03-31' };

describe('CouponsService', () => {
  let t: TestDatabase;
  let coupons: CouponsService;

  beforeEach(() => {
    t = createTestDatabase();
    coupons = new CouponsService(t.db, { now: () => TODAY });
  });

  it('creates, lists, edits and deletes a coupon', async () => {
    const created = await coupons.create(SPRING);
    expect(created).toMatchObject({ ...SPRING, active: true, timesUsed: 0 });

    const edited = await coupons.update(created.id, { ...SPRING, endsOn: '2026-03-10' });
    expect(edited).toMatchObject({ endsOn: '2026-03-10', active: false });
    expect(await coupons.list()).toEqual([edited]);

    await coupons.remove(created.id);
    expect(await coupons.list()).toEqual([]);
  });

  it('refuses a code another coupon uses, whatever its case', async () => {
    const first = await coupons.create(SPRING);
    const other = await coupons.create({ ...SPRING, code: 'SUMMER' });
    await expect(coupons.create({ ...SPRING, code: 'spring' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(coupons.update(other.id, SPRING)).rejects.toBeInstanceOf(ConflictException);
    // A coupon may keep its own code.
    await expect(coupons.update(first.id, { ...SPRING, percentOff: 30 })).resolves.toMatchObject({
      percentOff: 30,
    });
  });

  it('answers 404 for a coupon that does not exist', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(coupons.update(missing, SPRING)).rejects.toBeInstanceOf(NotFoundException);
    await expect(coupons.remove(missing)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts the paid orders that used a coupon', async () => {
    const created = await coupons.create(SPRING);
    t.addUser('u1');
    t.all(
      `insert into courses (id, title, slug, price_cents, currency) values ('c1', 'A1', 'a1', 2000, 'eur')`,
    );
    t.all(
      `insert into orders (user_id, course_id, amount_cents, currency, status, coupon_code, discount_percent)
       values ('u1', 'c1', 1600, 'eur', 'paid', 'spring', 20),
              ('u1', 'c1', 1600, 'eur', 'pending', 'SPRING', 20)`,
    );
    expect((await coupons.list())[0]).toMatchObject({ id: created.id, timesUsed: 1 });
  });

  describe('redeemable', () => {
    it('finds a coupon by its code in any case, on both of its end days', async () => {
      await coupons.create({ ...SPRING, startsOn: '2026-03-15', endsOn: '2026-03-15' });
      await expect(coupons.redeemable('Spring')).resolves.toEqual({
        code: 'SPRING',
        percentOff: 20,
      });
    });

    it('says why a code cannot be used', async () => {
      await coupons.create({
        ...SPRING,
        code: 'LATER',
        startsOn: '2026-04-01',
        endsOn: '2026-04-30',
      });
      await coupons.create({
        ...SPRING,
        code: 'OVER',
        startsOn: '2026-02-01',
        endsOn: '2026-03-14',
      });
      await expect(coupons.redeemable('NOPE')).rejects.toThrow('does not exist');
      await expect(coupons.redeemable('LATER')).rejects.toThrow('from 2026-04-01');
      await expect(coupons.redeemable('OVER')).rejects.toThrow('expired on 2026-03-14');
      await expect(coupons.redeemable('OVER')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('is managed by the administrator only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CouponsController)).toEqual(['admin']);
  });
});
