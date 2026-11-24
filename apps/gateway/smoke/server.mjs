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

    // R2 through the intercepted bridge host: binary bodies in both
    // directions, a range, and a multipart upload larger than one part.
    if (url.pathname === '/files') {
      const base = process.env.BRIDGE_URL;
      const at = (path, query) => `${base}${path}?${new URLSearchParams(query)}`;
      const key = 'smoke/файл 1.bin';

      const small = Buffer.from('0123456789');
      const put = await fetch(at('/r2/object', { key }), { method: 'PUT', body: small });
      const ranged = await fetch(at('/r2/object', { key }), { headers: { range: 'bytes=2-5' } });
      const rangeText = await ranged.text();

      const big = 'smoke/big.bin';
      const partSize = 8 * 1024 * 1024;
      const created = await (
        await fetch(at('/r2/multipart', { key: big }), { method: 'POST' })
      ).json();
      const parts = [];
      for (const [index, size] of [partSize, partSize, 1234].entries()) {
        const response = await fetch(
          at('/r2/multipart/part', { key: big, uploadId: created.uploadId, partNumber: index + 1 }),
          { method: 'PUT', body: Buffer.alloc(size, 65 + index) },
        );
        parts.push(await response.json());
      }
      const completed = await fetch(
        at('/r2/multipart/complete', { key: big, uploadId: created.uploadId }),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ parts }),
        },
      );
      const stat = await (await fetch(at('/r2/stat', { key: big }))).json();
      const tail = await (
        await fetch(at('/r2/object', { key: big }), {
          headers: { range: `bytes=${2 * partSize - 2}-${2 * partSize + 1}` },
        })
      ).text();

      const listed = await (await fetch(at('/r2/list', { prefix: 'smoke/' }))).json();
      const removed = await fetch(`${base}/r2/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keys: listed.objects.map((o) => o.key) }),
      });
      const after = await (await fetch(at('/r2/list', { prefix: 'smoke/' }))).json();

      return send(res, 200, {
        put: put.status,
        range: {
          status: ranged.status,
          text: rangeText,
          contentRange: ranged.headers.get('content-range'),
        },
        multipart: { completed: completed.status, size: stat.size, acrossParts: tail },
        listed: listed.objects.map((o) => o.key),
        removed: removed.status,
        left: after.objects.length,
      });
    }

    return send(res, 404, { error: 'not found', path: url.pathname });
  } catch (error) {
    return send(res, 500, { error: String(error) });
  }
});

server.listen(8080, '0.0.0.0', () => console.log('smoke stub listening on 8080'));
