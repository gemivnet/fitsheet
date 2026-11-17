import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { BlockedUrlError, isBlockedAddress, safeFetchText } from './safeFetch';
import { readUpload } from './uploadPath';

test('isBlockedAddress refuses private, loopback, link-local and mapped addresses', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', 'not-an-ip']) {
    assert.equal(isBlockedAddress(a), true, a);
  }
});

test('isBlockedAddress allows public addresses', () => {
  for (const a of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(a), false, a);
  }
});

const servers: http.Server[] = [];
function listen(handler: http.RequestListener): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    servers.push(s);
    s.listen(0, '0.0.0.0', () => resolve((s.address() as { port: number }).port));
  });
}
after(() => servers.forEach((s) => s.close()));

test('safeFetchText refuses loopback, literal private IPs, hostnames resolving to loopback, and bad schemes', async () => {
  const port = await listen((_q, r) => r.end('secret'));
  for (const u of [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`, `http://[::1]:${port}/`, 'http://169.254.169.254/latest/meta-data/', 'http://192.168.1.1/', 'file:///etc/passwd', 'ftp://example.com/', 'http://user:pw@example.com/']) {
    await assert.rejects(safeFetchText(u), BlockedUrlError, u);
  }
});

test('safeFetchText fetches an allowed address and truncates to maxBytes', async () => {
  const port = await listen((_q, r) => r.end('x'.repeat(5000)));
  const out = await safeFetchText(`http://127.0.0.1:${port}/`, { isBlocked: (a) => a !== '127.0.0.1', maxBytes: 100 });
  assert.equal(out.length, 100);
});

test('safeFetchText checks every redirect hop', async () => {
  const target = await listen((_q, r) => r.end('internal'));
  const start = await listen((_q, r) => {
    r.writeHead(302, { Location: `http://127.0.0.2:${target}/` });
    r.end();
  });
  // first hop (127.0.0.1) allowed, redirect target (127.0.0.2) not
  await assert.rejects(safeFetchText(`http://127.0.0.1:${start}/`, { isBlocked: (a) => a !== '127.0.0.1' }), BlockedUrlError);
  // and with both allowed the redirect is followed
  assert.equal(await safeFetchText(`http://127.0.0.1:${start}/`, { isBlocked: () => false }), 'internal');
});

test('safeFetchText gives up on redirect loops', async () => {
  let port = 0;
  port = await listen((_q, r) => {
    r.writeHead(302, { Location: `http://127.0.0.1:${port}/` });
    r.end();
  });
  await assert.rejects(safeFetchText(`http://127.0.0.1:${port}/`, { isBlocked: () => false, maxRedirects: 3 }), /redirects/);
});

test('readUpload reads inside the uploads folder and refuses anything outside, including symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'fs-up-'));
  const dir = join(root, 'uploads');
  mkdirSync(dir);
  writeFileSync(join(dir, 'a.jpg'), 'img');
  writeFileSync(join(root, 'outside.txt'), 'nope');
  symlinkSync(join(root, 'outside.txt'), join(dir, 'link.jpg'));
  assert.equal(readUpload(join(dir, 'a.jpg'), dir).toString(), 'img');
  assert.throws(() => readUpload(join(dir, '..', 'outside.txt'), dir), /outside/);
  assert.throws(() => readUpload(join(dir, 'link.jpg'), dir), /outside/);
  assert.throws(() => readUpload('/etc/passwd', dir), /outside/);
});
