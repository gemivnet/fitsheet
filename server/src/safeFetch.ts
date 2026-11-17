// safeFetch.ts — fetch a user-supplied web link without letting it reach the home network.
// The recipe importer takes a URL from the request, so the server must never be a way to
// poke at private services (router, other containers, cloud metadata). The address check runs
// on the address the socket actually connects to (so a hostname that resolves to a private
// address, or changes its answer between lookups, is still refused), and every redirect hop is
// checked the same way. http(s) only; bounded time, redirects and size.

import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT (Tailscale lives here)
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3], // multicast + reserved + broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  ['64:ff9b::', 96], // NAT64: embeds an IPv4 address
  ['2002::', 16], // 6to4: embeds an IPv4 address
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

// true when the address is private, loopback, link-local, multicast or otherwise not a public host.
export function isBlockedAddress(addr: string): boolean {
  let ip = addr.trim().replace(/^\[|\]$/g, '').split('%')[0];
  const kind = isIP(ip);
  if (!kind) return true; // not an address at all: refuse
  if (kind === 6) {
    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:aabb:ccdd) is judged as the IPv4 address inside it
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (dotted) return isBlockedAddress(dotted[1]);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return blocked.check(ip, 'ipv6');
  }
  return blocked.check(ip, 'ipv4');
}

export class BlockedUrlError extends Error {}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  // tests only: decide which resolved addresses are refused
  isBlocked?: (addr: string) => boolean;
}

// Returns the body text (truncated to maxBytes), or throws. BlockedUrlError = refused by policy.
export function safeFetchText(rawUrl: string, opts: SafeFetchOptions = {}): Promise<string> {
  const { timeoutMs = 12_000, maxBytes = 200_000, maxRedirects = 5, userAgent = 'fitsheet/1.0 (recipe import)', isBlocked = isBlockedAddress } = opts;
  const deadline = Date.now() + timeoutMs;

  const hop = (urlStr: string, redirectsLeft: number): Promise<string> =>
    new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(urlStr);
      } catch {
        return reject(new BlockedUrlError('invalid url'));
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject(new BlockedUrlError('http(s) only'));
      if (url.username || url.password) return reject(new BlockedUrlError('credentials in url'));
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (isIP(host) && isBlocked(host)) return reject(new BlockedUrlError('address not allowed'));

      const remaining = deadline - Date.now();
      if (remaining <= 0) return reject(new Error('timeout'));

      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(
        url,
        {
          method: 'GET',
          headers: { 'User-Agent': userAgent, Accept: 'text/html,*/*;q=0.5', 'Accept-Encoding': 'identity' },
          // runs for every hostname lookup the socket does; the address that passes is the one connected to
          lookup: (hostname, options, cb) => {
            dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
              if (err) return (cb as any)(err);
              const list = addrs as { address: string; family: number }[];
              const bad = list.find((a) => isBlocked(a.address));
              if (bad || !list.length) return (cb as any)(new BlockedUrlError('address not allowed'));
              if ((options as any)?.all) return (cb as any)(null, list);
              (cb as any)(null, list[0].address, list[0].family);
            });
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
            let next: string;
            try {
              next = new URL(res.headers.location, url).toString();
            } catch {
              return reject(new BlockedUrlError('invalid redirect'));
            }
            return hop(next, redirectsLeft - 1).then(resolve, reject);
          }
          if (status < 200 || status >= 300) {
            res.resume();
            return reject(new Error(`status ${status}`));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            size += c.length;
            chunks.push(c);
            if (size >= maxBytes) {
              res.destroy();
              resolve(Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8'));
            }
          });
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', (e) => (size >= maxBytes ? resolve(Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8')) : reject(e)));
        },
      );
      req.setTimeout(remaining, () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    });

  return hop(rawUrl, maxRedirects);
}
