/**
 * Stub for the API in the gateway smoke run. Each route exercises one thing
 * the gateway has to get right.
 */
import { createServer } from 'node:http';

const CHUNK = Buffer.alloc(1024 * 1024, 'x');

async function bridge(path, body) {
  const response = await fetch(`${process.env.BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://stub');
  try {
    // Readiness probe used by the gateway.
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });

    // Env passing, and what the gateway forwards about the client.
    if (url.pathname === '/env') {
      return send(res, 200, {
        SMOKE_VAR: process.env.SMOKE_VAR ?? null,
        BRIDGE_URL: process.env.BRIDGE_URL ?? null,
        // A Worker secret, when one is set for the run. Presence only.
        SMOKE_SECRET_SET: Boolean(process.env.SMOKE_SECRET),
        forwarded: {
          proto: req.headers['x-forwarded-proto'] ?? null,
          host: req.headers['x-forwarded-host'] ?? null,
          for: req.headers['x-forwarded-for'] ?? null,
        },
      });
    }

    // Streamed upload: counts bytes without holding them.
    if (url.pathname === '/upload' && req.method === 'POST') {
      let bytes = 0;
      for await (const chunk of req) bytes += chunk.length;
      return send(res, 200, { bytes });
    }

    // Streamed download of ?mb= megabytes.
    if (url.pathname === '/download') {
      const mb = Number(url.searchParams.get('mb') ?? '1');
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      for (let i = 0; i < mb; i++) {
        if (!res.write(CHUNK)) await new Promise((resolve) => res.once('drain', resolve));
      }
      return res.end();
    }

    // D1 through the intercepted bridge host: a query, an atomic batch, and a
    // batch that must roll back.
    if (url.pathname === '/sql') {
      const setup = await bridge('/d1/batch', {
        statements: [
          { sql: 'create table if not exists smoke (id integer primary key, name text unique)' },
          { sql: 'delete from smoke' },
          { sql: 'insert into smoke (name) values (?), (?)', params: ['a', 'b'] },
        ],
      });
      const failing = await bridge('/d1/batch', {
        statements: [
          { sql: 'insert into smoke (name) values (?)', params: ['c'] },
          { sql: 'insert into smoke (name) values (?)', params: ['a'] },
        ],
      });
      const rows = await bridge('/d1/query', { sql: 'select name from smoke order by name' });
      return send(res, 200, { setup: setup.status, failing, rows: rows.body.results });
    }

    return send(res, 404, { error: 'not found', path: url.pathname });
  } catch (error) {
    return send(res, 500, { error: String(error) });
  }
});

server.listen(8080, '0.0.0.0', () => console.log('smoke stub listening on 8080'));
