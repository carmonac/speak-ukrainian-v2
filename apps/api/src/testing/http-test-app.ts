import 'reflect-metadata';
import type { INestApplication, Provider, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Auth } from '../auth/auth.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { HttpExceptionFilter } from '../common/http-exception.filter.js';

/** Bearer tokens the fake sign-in below recognises. */
export const ADMIN_TOKEN = 'admin-token';
export const STUDENT_TOKEN = 'student-token';

const SESSIONS: Record<string, { id: string; email: string; role: string }> = {
  [ADMIN_TOKEN]: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
  [STUDENT_TOKEN]: { id: 'student-1', email: 'student@example.com', role: 'student' },
};

/** Stands in for better-auth: a session exists for the two tokens above and for nothing else. */
const fakeAuth = {
  api: {
    getSession: ({ headers }: { headers: Headers }) => {
      const token = (headers.get('authorization') ?? '').replace(/^Bearer /, '');
      const user = SESSIONS[token];
      return Promise.resolve(user ? { user, session: { token } } : null);
    },
  },
} as unknown as Auth;

export interface TestController {
  controller: Type<unknown>;
  /** The classes or tokens of its constructor, in order. */
  inject: unknown[];
}

/**
 * A Nest application with the given controllers behind the real guards
 * (`SessionAuthGuard`, `RolesGuard`), the real exception filter and the `/api`
 * prefix, so a spec exercises routes over HTTP exactly as a client would:
 * decorators, interceptors, pipes and all.
 *
 * Vitest compiles without `emitDecoratorMetadata`, so Nest cannot see what a
 * constructor asks for; each controller's dependencies are declared here
 * instead, and services are handed in already built.
 */
export async function createHttpTestApp(options: {
  controllers: TestController[];
  providers: Provider[];
  /** Runs before the application starts, e.g. to mount middleware. */
  configure?: (app: INestApplication) => void;
}): Promise<INestApplication> {
  for (const { controller, inject } of options.controllers) {
    Reflect.defineMetadata('design:paramtypes', inject, controller);
  }
  const reflector = new Reflector();
  const moduleRef = await Test.createTestingModule({
    controllers: options.controllers.map((c) => c.controller),
    providers: [
      ...options.providers,
      { provide: APP_GUARD, useValue: new SessionAuthGuard(fakeAuth, reflector) },
      { provide: APP_GUARD, useValue: new RolesGuard(reflector) },
      { provide: APP_FILTER, useValue: new HttpExceptionFilter() },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  options.configure?.(app);
  await app.init();
  return app;
}
