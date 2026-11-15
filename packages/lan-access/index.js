import { createServer } from 'node:http';
import { isIPv4 } from 'node:net';
import { AsyncLocalStorage } from 'node:async_hooks';

export const name = 'openaudit-lan-access';
export const inject = ['connection', 'webServer'];

const endpoints = new Set(['10.8.0.2', '10.168.1.224']);
const ipv4 = value => typeof value === 'string' ? value.replace(/^::ffff:/, '') : '';

// Deliberately use socket facts, never a forwarded client address. Local proxies
// and the public tunnel must still use DSH's normal authentication.
export function isDirectLanRequest(request) {
  const local = ipv4(request.socket?.localAddress);
  const remote = ipv4(request.socket?.remoteAddress);
  if (!endpoints.has(local) || request.socket?.localPort !== 3090) return false;
  if (!isIPv4(remote) || endpoints.has(remote)) return false;
  if (!remote.startsWith('10.8.0.') && !remote.startsWith('10.168.1.')) return false;
  const headers = request.headers;
  if (!headers || typeof headers.get === 'function') return false;
  const authority = `${local}:3090`;
  if (headers.host !== authority) return false;
  if (Object.keys(headers).some(key => /^(forwarded|x-forwarded-.*|x-real-ip|cf-.*)$/i.test(key))) return false;
  if (headers.origin !== undefined && headers.origin !== `http://${authority}`) return false;
  if (headers['sec-fetch-site'] !== undefined && !['same-origin', 'none'].includes(headers['sec-fetch-site'])) return false;
  return true;
}

// Version-specific adapter for DSH 0.2.2-rc.1. It leaves vendor files intact.
export async function apply(ctx) {
  const connection = ctx.connection[Symbol.for('cordis.original')] ?? ctx.connection;
  const web = ctx.webServer;
  const carrier = web.server;
  if (web.host !== '10.8.0.2' || web.port !== 3090 || web.protocol !== 'http:' || !carrier?.emit) {
    throw new Error('LAN access requires the verified DSH listener at 10.8.0.2:3090');
  }
  const originalAdmit = connection.admit;
  const originalIndex = connection.authorizeIndex;
  const originalTrustedHosts = connection.trustedHosts;
  if (typeof originalAdmit !== 'function' || typeof originalIndex !== 'function' || !connection.browserPeer || !Array.isArray(originalTrustedHosts)) {
    throw new Error('Unsupported DSH Connection interface');
  }
  const server = createServer((req, res) => carrier.emit('request', req, res));
  const requests = new AsyncLocalStorage();
  // DSH converts the index request to Fetch, which drops socket metadata.
  // Preserve it in request-local async context, never in a client header.
  const listeners = carrier.listeners('request');
  const dispatch = (req, res) => requests.run(req, () => {
    for (const listener of listeners) listener.call(carrier, req, res);
  });
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (req, socket, head) => carrier.emit('upgrade', req, socket, head));
  ctx.effect(() => {
    // Allow the additional listener's authority through DSH's existing fence;
    // this alone never grants authentication to a remote or proxied request.
    connection.trustedHosts = [...originalTrustedHosts, '10.168.1.224:3090'];
    for (const listener of listeners) carrier.removeListener('request', listener);
    carrier.on('request', dispatch);
    connection.admit = function(request) {
      return isDirectLanRequest(request) ? { peer: this.browserPeer } : originalAdmit.call(this, request);
    };
    connection.authorizeIndex = function(request, response) {
      const source = requests.getStore() ?? request;
      const host = typeof request.headers?.get === 'function' ? request.headers.get('host') : request.headers?.host;
      if (host === source.headers?.host && isDirectLanRequest(source) && 'rejection' in originalAdmit.call(this, source)) {
        // Issue DSH's existing authority-bound cookie without exposing its launch
        // token to the browser. Fetch resource requests may lack socket metadata.
        const internal = Object.create(source);
        const login = new URL(this.authenticatedUrl(`http://${source.headers.host}/`));
        internal.url = login.pathname + login.search;
        return originalIndex.call(this, internal, response);
      }
      return originalIndex.call(this, request, response);
    };
    return () => {
      connection.admit = originalAdmit;
      connection.authorizeIndex = originalIndex;
      connection.trustedHosts = originalTrustedHosts;
      carrier.removeListener('request', dispatch);
      for (const listener of listeners) carrier.on('request', listener);
      for (const socket of sockets) socket.destroy();
      server.close();
    };
  }, 'LAN-only automatic DSH access');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3090, '10.168.1.224', resolve);
  });
}
