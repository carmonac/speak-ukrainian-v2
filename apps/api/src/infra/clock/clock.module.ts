import { Global, Module } from '@nestjs/common';
import { CLOCK, type Clock } from './clock.tokens.js';

/**
 * Global for the same reason `DatabaseModule` is: one definition of the
 * system clock, reachable by every module that needs "now" without each
 * re-providing it — and one token for a test to `overrideProvider`.
 */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: { now: () => Date.now() } satisfies Clock }],
  exports: [CLOCK],
})
export class ClockModule {}
