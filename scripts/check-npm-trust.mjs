import { readFileSync } from 'node:fs';

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!requestUrl || !requestToken) {
  throw new Error('GitHub OIDC request context is unavailable (requires id-token: write)');
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packages = [pkg.name, ...Object.keys(pkg.optionalDependencies ?? {})];
if (packages.length !== 9) throw new Error(`expected nine npm packages, found ${packages.length}`);
const failures = [];

for (const name of packages) {
  const url = new URL(requestUrl);
  url.searchParams.append('audience', 'npm:registry.npmjs.org');
  const identityResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${requestToken}`, Accept: 'application/json' },
  });
  if (!identityResponse.ok) {
    throw new Error(`GitHub OIDC request failed: HTTP ${identityResponse.status}`);
  }
  const { value: identityToken } = await identityResponse.json();
  if (typeof identityToken !== 'string') throw new Error('GitHub OIDC response has no token');

  if (name === packages[0]) {
    const claims = JSON.parse(Buffer.from(identityToken.split('.')[1], 'base64url').toString('utf8'));
    console.log(`OIDC repository=${claims.repository} workflow_ref=${claims.workflow_ref} sub=${claims.sub}`);
  }
  const escaped = name.replace('/', '%2f');
  const response = await fetch(`https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${escaped}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${identityToken}`, Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 201 || typeof body.token !== 'string') {
    const reason = String(body?.message ?? body?.error ?? response.statusText).slice(0, 300);
    console.error(`${name}: npm OIDC exchange failed (HTTP ${response.status}): ${reason}`);
    failures.push(name);
    continue;
  }
  console.log(`${name}: npm OIDC exchange OK`);
}

if (failures.length) {
  throw new Error(`npm OIDC exchange failed for ${failures.length} package(s): ${failures.join(', ')}`);
}
