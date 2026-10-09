import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';
import { createHandler } from './index.mjs';

const DOMAIN = 'abc123.lambda-url.us-east-1.on.aws';
const ISSUER = `https://${DOMAIN}`;
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const NOW = 1_800_000_000;

function event(method, path, { query, headers = {}, body } = {}) {
  return {
    rawPath: path,
    requestContext: { http: { method }, domainName: DOMAIN },
    queryStringParameters: query,
    headers,
    body,
    isBase64Encoded: false,
  };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

// A fake GitHub. Records calls so tests can assert on what was sent.
function fakeGithub({ emails, tokenReply = { access_token: 'gho_fake', token_type: 'bearer' } } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === 'https://github.com/login/oauth/access_token') return json(tokenReply);
    if (url === 'https://api.github.com/user') {
      return json({ id: 4242, login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatars.example/o.png' });
    }
    if (url === 'https://api.github.com/user/emails') {
      return json(emails ?? [
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'unverified@example.com', primary: true, verified: false },
      ]);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { calls, impl };
}

function makeHandler(gh) {
  let ssmCalls = 0;
  const handler = createHandler({
    fetchImpl: gh?.impl,
    getSigningKeyPem: async () => { ssmCalls += 1; return PEM; },
    nowSeconds: () => NOW,
  });
  return { handler, ssmCalls: () => ssmCalls };
}

const goodEmails = [
  { email: 'octo@example.com', primary: true, verified: true },
  { email: 'other@example.com', primary: false, verified: true },
];

function tokenEvent(headers, form) {
  return event('POST', '/token', {
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(form).toString(),
  });
}

function verifyJwt(jwt, jwk) {
  const [h, p, s] = jwt.split('.');
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  return { ok, header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(p, 'base64url')) };
}

test('discovery document points every endpoint at the function URL origin', async () => {
  const { handler } = makeHandler(fakeGithub());
  const res = await handler(event('GET', '/.well-known/openid-configuration'));
  assert.equal(res.statusCode, 200);
  const doc = JSON.parse(res.body);
  assert.equal(doc.issuer, ISSUER);
  assert.ok(!doc.issuer.endsWith('/'));
  assert.equal(doc.authorization_endpoint, `${ISSUER}/authorize`);
  assert.equal(doc.token_endpoint, `${ISSUER}/token`);
  assert.equal(doc.userinfo_endpoint, `${ISSUER}/userinfo`);
  assert.equal(doc.jwks_uri, `${ISSUER}/jwks`);
  assert.deepEqual(doc.id_token_signing_alg_values_supported, ['RS256']);
  assert.ok(doc.token_endpoint_auth_methods_supported.includes('client_secret_basic'));
  assert.ok(doc.token_endpoint_auth_methods_supported.includes('client_secret_post'));
});

test('authorize redirects to GitHub with passthrough params and fixed scope', async () => {
  const { handler } = makeHandler(fakeGithub());
  const redirectUri = 'https://pool.auth.us-east-1.amazoncognito.com/oauth2/idpresponse';
  const res = await handler(event('GET', '/authorize', {
    query: { client_id: 'Iv1.abc', redirect_uri: redirectUri, state: 'st4te', response_type: 'code', scope: 'openid evil', nonce: 'n' },
  }));
  assert.equal(res.statusCode, 302);
  const url = new URL(res.headers.location);
  assert.equal(`${url.origin}${url.pathname}`, 'https://github.com/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'Iv1.abc');
  assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(url.searchParams.get('state'), 'st4te');
  assert.equal(url.searchParams.get('scope'), 'read:user user:email');
  assert.equal(url.searchParams.has('nonce'), false);
});

test('authorize rejects missing state and non-https redirect_uri', async () => {
  const { handler } = makeHandler(fakeGithub());
  const noState = await handler(event('GET', '/authorize', { query: { client_id: 'abc', redirect_uri: 'https://x.example/cb' } }));
  assert.equal(noState.statusCode, 400);
  assert.equal(JSON.parse(noState.body).error, 'invalid_request');
  const http = await handler(event('GET', '/authorize', { query: { client_id: 'abc', redirect_uri: 'http://x.example/cb', state: 's' } }));
  assert.equal(http.statusCode, 400);
});

test('token exchange (client credentials in body) returns a verifiable id_token', async () => {
  const gh = fakeGithub({ emails: goodEmails });
  const { handler } = makeHandler(gh);
  const res = await handler(tokenEvent({}, {
    grant_type: 'authorization_code', client_id: 'Iv1.abc', client_secret: 's3cret', code: 'abcdef0123', redirect_uri: 'https://x.example/cb',
  }));
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.access_token, 'gho_fake');
  assert.equal(out.token_type, 'Bearer');
  assert.equal(out.expires_in, 300);

  const exchange = gh.calls.find((c) => c.url === 'https://github.com/login/oauth/access_token');
  assert.equal(exchange.init.method, 'POST');
  assert.equal(exchange.init.headers.accept, 'application/json');
  assert.deepEqual(JSON.parse(exchange.init.body), {
    client_id: 'Iv1.abc', client_secret: 's3cret', code: 'abcdef0123', redirect_uri: 'https://x.example/cb',
  });

  const jwks = JSON.parse((await handler(event('GET', '/jwks'))).body);
  const { ok, header, claims } = verifyJwt(out.id_token, jwks.keys[0]);
  assert.ok(ok, 'signature verifies against /jwks');
  assert.equal(header.alg, 'RS256');
  assert.equal(header.kid, jwks.keys[0].kid);
  assert.deepEqual(claims, {
    iss: ISSUER, aud: 'Iv1.abc', sub: '4242', email: 'octo@example.com', email_verified: true,
    name: 'The Octocat', preferred_username: 'octocat', picture: 'https://avatars.example/o.png',
    iat: NOW, exp: NOW + 300,
  });
});

test('token exchange accepts HTTP Basic client credentials', async () => {
  const gh = fakeGithub({ emails: goodEmails });
  const { handler } = makeHandler(gh);
  // Secret includes characters that must survive form-urlencoding + base64.
  const basic = Buffer.from(`${encodeURIComponent('Iv1.abc')}:${encodeURIComponent('p@ss:w/rd+1')}`).toString('base64');
  const res = await handler(tokenEvent({ Authorization: `Basic ${basic}` }, {
    grant_type: 'authorization_code', code: 'abcdef0123', redirect_uri: 'https://x.example/cb',
  }));
  assert.equal(res.statusCode, 200);
  const exchange = gh.calls.find((c) => c.url === 'https://github.com/login/oauth/access_token');
  const sent = JSON.parse(exchange.init.body);
  assert.equal(sent.client_id, 'Iv1.abc');
  assert.equal(sent.client_secret, 'p@ss:w/rd+1');
  assert.equal(JSON.parse(res.body).access_token, 'gho_fake');
});

test('token exchange fails with an OIDC error when no primary verified email exists', async () => {
  const { handler } = makeHandler(fakeGithub()); // default emails: primary is unverified
  const res = await handler(tokenEvent({}, {
    grant_type: 'authorization_code', client_id: 'abc', client_secret: 's', code: 'abcdef0123',
  }));
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'invalid_grant');
  assert.match(body.error_description, /verified email/);
  assert.equal(body.id_token, undefined);
  assert.equal(body.access_token, undefined);
});

test('token exchange maps GitHub errors reported with HTTP 200', async () => {
  const bad = makeHandler(fakeGithub({ tokenReply: { error: 'bad_verification_code' } }));
  const res = await bad.handler(tokenEvent({}, { grant_type: 'authorization_code', client_id: 'abc', client_secret: 's', code: 'abc' }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, 'invalid_grant');
  const creds = makeHandler(fakeGithub({ tokenReply: { error: 'incorrect_client_credentials' } }));
  const res2 = await creds.handler(tokenEvent({}, { grant_type: 'authorization_code', client_id: 'abc', client_secret: 's', code: 'abc' }));
  assert.equal(res2.statusCode, 401);
  assert.equal(JSON.parse(res2.body).error, 'invalid_client');
});

test('token endpoint validates its input', async () => {
  const { handler } = makeHandler(fakeGithub());
  const cases = [
    [{ 'content-type': 'application/json' }, {}, 400, 'invalid_request'],
    [{}, { grant_type: 'password', client_id: 'a', client_secret: 's', code: 'c' }, 400, 'unsupported_grant_type'],
    [{}, { grant_type: 'authorization_code', code: 'c' }, 401, 'invalid_client'],
    [{}, { grant_type: 'authorization_code', client_id: 'a', client_secret: 's', code: 'bad code!' }, 400, 'invalid_request'],
  ];
  for (const [headers, form, status, error] of cases) {
    const res = await handler(tokenEvent(headers, form));
    assert.equal(res.statusCode, status);
    assert.equal(JSON.parse(res.body).error, error);
  }
});

test('JWKS publishes the signing key, with a stable thumbprint kid, loaded once', async () => {
  const { handler, ssmCalls } = makeHandler(fakeGithub());
  const first = JSON.parse((await handler(event('GET', '/jwks'))).body);
  const second = JSON.parse((await handler(event('GET', '/jwks'))).body);
  assert.equal(ssmCalls(), 1);
  const expected = privateKey.export({ format: 'jwk' });
  const [jwk] = first.keys;
  assert.equal(jwk.kty, 'RSA');
  assert.equal(jwk.n, expected.n);
  assert.equal(jwk.e, expected.e);
  assert.equal(jwk.alg, 'RS256');
  assert.equal(jwk.use, 'sig');
  assert.equal(jwk.d, undefined, 'private exponent must never be published');
  assert.equal(jwk.kid, second.keys[0].kid);
  // A second handler instance (new cold start) derives the same kid.
  const again = JSON.parse((await makeHandler(fakeGithub()).handler(event('GET', '/jwks'))).body);
  assert.equal(again.keys[0].kid, jwk.kid);
});

test('userinfo returns the claims for a Bearer GitHub token', async () => {
  const gh = fakeGithub({ emails: goodEmails });
  const { handler } = makeHandler(gh);
  const res = await handler(event('GET', '/userinfo', { headers: { Authorization: 'Bearer gho_fake' } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    sub: '4242', email: 'octo@example.com', email_verified: true, name: 'The Octocat',
    preferred_username: 'octocat', picture: 'https://avatars.example/o.png',
  });
  assert.equal(gh.calls[0].init.headers.authorization, 'Bearer gho_fake');
  const missing = await handler(event('GET', '/userinfo'));
  assert.equal(missing.statusCode, 401);
  assert.equal(JSON.parse(missing.body).error, 'invalid_token');
});

test('unknown paths, wrong methods and internal failures give JSON errors without leaking', async () => {
  const { handler } = makeHandler(fakeGithub());
  assert.equal((await handler(event('GET', '/nope'))).statusCode, 404);
  assert.equal((await handler(event('POST', '/jwks'))).statusCode, 405);

  const logs = [];
  const original = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const broken = createHandler({ fetchImpl: fakeGithub().impl, getSigningKeyPem: async () => { throw new Error('secret-pem-material'); } });
    const res = await broken(event('GET', '/jwks'));
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.parse(res.body).error, 'server_error');
    assert.ok(!res.body.includes('secret-pem-material'));
    assert.ok(!logs.join('\n').includes('secret-pem-material'));
  } finally {
    console.error = original;
  }
});
