import { type ArgumentsHost, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../common/http-exception.filter.js';
import { H5pAjaxExceptionFilter } from './h5p-ajax.exception-filter.js';

const URL_WITH_TOKEN = '/api/h5p/ajax?token=secret.token&action=files&';

/** Runs a filter over `exception` and returns what it wrote. */
function answer(filter: HttpExceptionFilter, exception: unknown) {
  const written: {
    status?: number;
    body?: Record<string, unknown>;
    headers: Record<string, string>;
  } = { headers: {} };
  const response = {
    headersSent: false,
    setHeader: vi.fn((name: string, value: string) => {
      written.headers[name] = value;
    }),
    status: vi.fn((status: number) => {
      written.status = status;
      return response;
    }),
    json: vi.fn((body: Record<string, unknown>) => {
      written.body = body;
    }),
  };
  const request = { method: 'POST', url: URL_WITH_TOKEN };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;

  filter.catch(exception, host);
  return written;
}

describe('H5pAjaxExceptionFilter', () => {
  it('marks a refusal as a failure in the shape the H5P uploader reads', () => {
    // `H5PEditor.FileUploader` treats any body without `error` or
    // `success: false` as a successful upload (TASK-63).
    const { status, body } = answer(
      new H5pAjaxExceptionFilter(),
      new UnauthorizedException('That editing session has expired.'),
    );

    expect(status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      statusCode: 401,
      message: 'That editing session has expired.',
    });
  });

  it('never answers a path, which the uploader would store as the file', () => {
    const { body } = answer(new H5pAjaxExceptionFilter(), new BadRequestException('Nope.'));

    expect(body).not.toHaveProperty('path');
    expect(JSON.stringify(body)).not.toContain('secret.token');
  });

  it('keeps the parent envelope rules: no-store and a generic 500', () => {
    const { status, body, headers } = answer(new H5pAjaxExceptionFilter(), new Error('internals'));

    expect(status).toBe(500);
    expect(body?.success).toBe(false);
    expect(JSON.stringify(body)).not.toContain('internals');
    expect(headers['Cache-Control']).toContain('no-store');
  });

  it('leaves the API-wide envelope untouched', () => {
    const { body } = answer(new HttpExceptionFilter(), new BadRequestException('Nope.'));

    expect(body).toMatchObject({ statusCode: 400, message: 'Nope.', path: URL_WITH_TOKEN });
    expect(body).not.toHaveProperty('success');
  });
});
