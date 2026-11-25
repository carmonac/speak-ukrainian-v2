import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TRUSTED_PROXY_HOPS } from './proxy.js';

function app() {
  const server = express();
  server.set('trust proxy', TRUSTED_PROXY_HOPS);
  server.get('/', (req, res) => {
    res.json({ ip: req.ip, protocol: req.protocol, host: req.hostname });
  });
  return server;
}

describe('proxy trust', () => {
  it('takes the visitor address, protocol and host from the gateway headers', async () => {
    const response = await request(app())
      .get('/')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'speakukrainian.org');
    expect(response.body).toEqual({
      ip: '203.0.113.7',
      protocol: 'https',
      host: 'speakukrainian.org',
    });
  });

  it('believes only the nearest hop when the header lists several addresses', async () => {
    // What a client could prepend if something else ever sat in front.
    const response = await request(app()).get('/').set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
    expect(response.body.ip).toBe('203.0.113.7');
  });

  it('falls back to the connection when there are no proxy headers', async () => {
    const response = await request(app()).get('/');
    expect(response.body.protocol).toBe('http');
    expect(response.body.ip).toMatch(/127\.0\.0\.1|::1/);
  });
});
