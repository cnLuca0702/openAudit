import assert from 'node:assert/strict';
import { chromium, request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const base = 'http://10.8.0.2:3090';
const report = { at: new Date().toISOString(), checks: [] };
// Each boundary check has a fresh cookie jar.
for (const [label, headers, path, expected] of [
  ['VPN audit without cookies', {}, '/api/audit/state', 200],
  ['VPN workbench without cookies', {}, '/audit/', 200],
  ['Public root still requires login', { host: 'audit-demo.myfangzhou.com' }, '/', 401],
  ['Public audit still requires login', { host: 'audit-demo.myfangzhou.com' }, '/api/audit/state', 401],
  ['Forwarded root cannot auto-login', { 'x-forwarded-for': '10.8.0.3' }, '/', 401],
  ['Forwarded API cannot bypass login', { forwarded: 'for=10.8.0.3' }, '/api/audit/state', 401],
  ['Tunnel headers cannot auto-login', { 'cf-connecting-ip': '10.8.0.3' }, '/', 401],
  ['Cross-origin API is denied', { origin: 'https://example.com' }, '/api/audit/state', 403],
  ['Cross-origin index cannot auto-login', { origin: 'https://example.com' }, '/', 401],
  ['Same-site cross-origin index cannot auto-login', { 'sec-fetch-site': 'same-site' }, '/', 401],
]) {
  const context = await request.newContext({ extraHTTPHeaders: headers });
  const response = await context.get(base + path, { maxRedirects: 0 });
  assert.equal(response.status(), expected, label);
  if (expected !== 200) assert.equal(response.headers()['set-cookie'], undefined, label);
  report.checks.push({ label, status: response.status() });
  await context.dispose();
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(`${base}/api`) && response.status() >= 400) errors.push(`API status ${response.status()}`);
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '审计工作台', exact: true }).click({ timeout: 60000 });
  const frame = page.frameLocator('iframe[title="openAudit 审计工作台"]');
  await frame.getByRole('button', { name: /^审计资料中心/ }).waitFor({ timeout: 60000 });
  assert.equal(new URL(page.url()).searchParams.has('token'), false);
  const cookies = await context.cookies();
  assert(cookies.some(cookie => cookie.httpOnly), 'DSH issued its existing browser session');
  const publicWithLanSession = await context.request.get(`${base}/api/audit/state`, { headers: { host: 'audit-demo.myfangzhou.com' } });
  assert.equal(publicWithLanSession.status(), 401, 'LAN session does not authenticate the public authority');
  assert.deepEqual(errors, []);
  report.checks.push({ label: 'Fresh browser opens DSH and audit workbench without entering token', passed: true });
  report.checks.push({ label: 'LAN session cannot authenticate public hostname', status: publicWithLanSession.status() });
  await page.screenshot({ path: 'validation/lan-access-browser.png' });
} finally {
  await browser.close();
}
report.passed = true;
await writeFile('validation/lan-access.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
