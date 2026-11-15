import test from 'node:test';
import assert from 'node:assert/strict';
import { isDirectLanRequest } from '../index.js';

const request = (local = '10.8.0.2', remote = '10.8.0.3', headers = {}) => ({
  socket: { localAddress: local, localPort: 3090, remoteAddress: remote },
  headers: { host: `${local}:3090`, ...headers },
});

test('both approved interfaces accept direct clients and same-origin requests', () => {
  assert.equal(isDirectLanRequest(request()), true);
  assert.equal(isDirectLanRequest(request('10.168.1.224', '10.168.1.20')), true);
  assert.equal(isDirectLanRequest(request('10.8.0.2', '::ffff:10.8.0.3', { origin: 'http://10.8.0.2:3090' })), true);
});

test('public hosts, proxies, external addresses and missing socket facts retain authentication', () => {
  for (const value of [
    request('10.8.0.2', '203.0.113.2'),
    request('10.8.0.2', '10.8.0.2'),
    request('10.8.0.2', '10.168.1.224'),
    request('10.8.0.2', '127.0.0.1'),
    request('10.8.0.2', '10.8.0.3', { host: 'audit-demo.myfangzhou.com' }),
    request('10.8.0.2', '10.8.0.3', { 'x-forwarded-for': '10.8.0.4' }),
    request('10.8.0.2', '10.8.0.3', { forwarded: 'for=10.8.0.4' }),
    request('10.8.0.2', '10.8.0.3', { 'cf-connecting-ip': '10.8.0.4' }),
    request('10.8.0.2', '10.8.0.300'),
    { headers: { host: '10.8.0.2:3090' } },
    { ...request(), socket: { ...request().socket, localPort: 3080 } },
  ]) assert.equal(isDirectLanRequest(value), false);
});

test('cross-origin browser access cannot acquire LAN privileges', () => {
  for (const headers of [
    { origin: 'https://evil.example' }, { origin: 'null' },
    { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
    { host: ['10.8.0.2:3090'] },
  ]) assert.equal(isDirectLanRequest(request('10.8.0.2', '10.8.0.3', headers)), false);
});
