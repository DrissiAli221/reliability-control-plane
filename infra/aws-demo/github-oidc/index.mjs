// Minimal OIDC adapter in front of GitHub OAuth, for Amazon Cognito's OIDC identity provider.
// GitHub OAuth is not OIDC (no id_token, no discovery, no JWKS), so this Lambda supplies them.
// No npm dependencies: node:crypto and global fetch.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_USER = 'https://api.github.com/user';
const GITHUB_EMAILS = 'https://api.github.com/user/emails';
const GITHUB_SCOPE = 'read:user user:email';
const ID_TOKEN_TTL_SECONDS = 300;
const FETCH_TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 8192;

class OidcError extends Error {
  constructor(status, error, description, headers = {}) {
    super(error);
    this.status = status;
    this.error = error;
    this.description = description;
    this.headers = headers;
  }
}

const b64url = (input) => Buffer.from(input).toString('base64url');

function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function errorResponse(e) {
  return json(e.status, { error: e.error, error_description: e.description }, e.headers);
}

// RFC 7638 thumbprint: stable for a given public key, so kid survives cold starts.
function buildSigner(pem) {
  const privateKey = createPrivateKey(pem);
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  if (jwk.kty !== 'RSA') throw new Error('signing key must be RSA');
  const thumbprintInput = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  const kid = createHash('sha256').update(thumbprintInput).digest('base64url');
  const publicJwk = { kty: 'RSA', n: jwk.n, e: jwk.e, kid, use: 'sig', alg: 'RS256' };
  return {
    kid,
    publicJwk,
    signJwt(payload) {
      const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
      const body = b64url(JSON.stringify(payload));
      const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey);
      return `${header}.${body}.${b64url(signature)}`;
    },
  };
}

// The PEM arrives as a Lambda environment variable (encrypted at rest by Lambda).
export function keyFromEnv(env = process.env) {
  const pem = env.SIGNING_KEY_PEM;
  if (!pem) throw new Error('signing key is not configured');
  return pem;
}

function parseForm(text) {
  return Object.fromEntries(new URLSearchParams(text).entries());
}

function clientCredentials(headers, form) {
  const auth = headers['authorization'];
  if (auth && /^basic /i.test(auth)) {
    const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i > 0) {
      // RFC 6749 2.3.1: id and secret are form-urlencoded before Base64.
      try {
        return {
          clientId: decodeURIComponent(decoded.slice(0, i).replace(/\+/g, ' ')),
          clientSecret: decodeURIComponent(decoded.slice(i + 1).replace(/\+/g, ' ')),
        };
      } catch {
        throw new OidcError(401, 'invalid_client', 'Malformed Basic credentials.', { 'www-authenticate': 'Basic' });
      }
    }
  }
  return { clientId: form.client_id, clientSecret: form.client_secret };
}

const CLIENT_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const CODE_RE = /^[A-Za-z0-9._~-]{1,512}$/;
const STATE_RE = /^[\x21-\x7e]{1,2048}$/;

function validHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash;
  } catch {
    return false;
  }
}

function claimsFor(user, email, issuer, clientId, now) {
  const claims = {
    iss: issuer,
    aud: clientId,
    sub: String(user.id),
    email,
    email_verified: true,
    name: user.name || user.login,
    preferred_username: user.login,
    iat: now,
    exp: now + ID_TOKEN_TTL_SECONDS,
  };
  if (user.avatar_url) claims.picture = user.avatar_url;
  return claims;
}

export function createHandler({ fetchImpl = (...a) => fetch(...a), getSigningKeyPem, nowSeconds = () => Math.floor(Date.now() / 1000) }) {
  let signerPromise;
  const signer = () => {
    // Loaded once per cold start; a failure is not cached so the next invocation retries.
    if (!signerPromise) {
      signerPromise = Promise.resolve().then(getSigningKeyPem).then(buildSigner);
      signerPromise.catch(() => { signerPromise = undefined; });
    }
    return signerPromise;
  };

  async function gh(url, init) {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      throw new OidcError(502, 'server_error', 'GitHub is unreachable.');
    }
  }

  async function githubIdentity(accessToken) {
    const headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'rcp-github-oidc',
      'x-github-api-version': '2022-11-28',
    };
    const [userRes, emailRes] = await Promise.all([gh(GITHUB_USER, { headers }), gh(GITHUB_EMAILS, { headers })]);
    if (userRes.status === 401 || emailRes.status === 401) {
      throw new OidcError(401, 'invalid_token', 'GitHub rejected the access token.', { 'www-authenticate': 'Bearer error="invalid_token"' });
    }
    if (!userRes.ok || !emailRes.ok) throw new OidcError(502, 'server_error', 'GitHub profile lookup failed.');
    const user = await userRes.json();
    const emails = await emailRes.json();
    if (!user || typeof user.id !== 'number' || typeof user.login !== 'string') {
      throw new OidcError(502, 'server_error', 'Unexpected GitHub profile.');
    }
    const primary = Array.isArray(emails)
      ? emails.find((e) => e && e.primary === true && e.verified === true && typeof e.email === 'string')
      : undefined;
    if (!primary) {
      throw new OidcError(400, 'invalid_grant', 'The GitHub account has no primary verified email address.');
    }
    return { user, email: primary.email };
  }

  const routes = {
    'GET /.well-known/openid-configuration': async ({ issuer }) => json(200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: ['openid', 'read:user', 'user:email'],
      claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'email', 'email_verified', 'name', 'preferred_username', 'picture'],
    }, { 'cache-control': 'public, max-age=300' }),

    'GET /authorize': async ({ query }) => {
      const { client_id: clientId, redirect_uri: redirectUri, state, response_type: responseType } = query;
      if (responseType !== undefined && responseType !== 'code') {
        throw new OidcError(400, 'unsupported_response_type', 'Only response_type=code is supported.');
      }
      if (!CLIENT_ID_RE.test(clientId ?? '')) throw new OidcError(400, 'invalid_request', 'client_id is missing or malformed.');
      if (!validHttpsUrl(redirectUri)) throw new OidcError(400, 'invalid_request', 'redirect_uri must be an https URL.');
      if (!STATE_RE.test(state ?? '')) throw new OidcError(400, 'invalid_request', 'state is missing or malformed.');
      const target = new URL(GITHUB_AUTHORIZE);
      target.searchParams.set('client_id', clientId);
      target.searchParams.set('redirect_uri', redirectUri);
      target.searchParams.set('state', state);
      target.searchParams.set('scope', GITHUB_SCOPE);
      return { statusCode: 302, headers: { location: target.toString(), 'cache-control': 'no-store' }, body: '' };
    },

    'POST /token': async ({ headers, bodyText, issuer }) => {
      const contentType = (headers['content-type'] ?? '').toLowerCase();
      if (!contentType.startsWith('application/x-www-form-urlencoded')) {
        throw new OidcError(400, 'invalid_request', 'Send an application/x-www-form-urlencoded body.');
      }
      const form = parseForm(bodyText);
      if (form.grant_type !== 'authorization_code') {
        throw new OidcError(400, 'unsupported_grant_type', 'Only authorization_code is supported.');
      }
      const { clientId, clientSecret } = clientCredentials(headers, form);
      if (!CLIENT_ID_RE.test(clientId ?? '') || !clientSecret || clientSecret.length > 512) {
        throw new OidcError(401, 'invalid_client', 'Client credentials are missing or malformed.', { 'www-authenticate': 'Basic' });
      }
      if (!CODE_RE.test(form.code ?? '')) throw new OidcError(400, 'invalid_request', 'code is missing or malformed.');
      if (form.redirect_uri !== undefined && !validHttpsUrl(form.redirect_uri)) {
        throw new OidcError(400, 'invalid_request', 'redirect_uri must be an https URL.');
      }
      const key = await signer();
      const exchange = { client_id: clientId, client_secret: clientSecret, code: form.code };
      if (form.redirect_uri) exchange.redirect_uri = form.redirect_uri;
      const tokenRes = await gh(GITHUB_TOKEN, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'rcp-github-oidc' },
        body: JSON.stringify(exchange),
      });
      if (!tokenRes.ok) throw new OidcError(502, 'server_error', 'GitHub token endpoint failed.');
      const granted = await tokenRes.json();
      if (granted.error) {
        // GitHub reports failures as HTTP 200 with an error code.
        if (granted.error === 'incorrect_client_credentials') {
          throw new OidcError(401, 'invalid_client', 'GitHub rejected the client credentials.', { 'www-authenticate': 'Basic' });
        }
        throw new OidcError(400, 'invalid_grant', 'GitHub rejected the authorization code.');
      }
      if (typeof granted.access_token !== 'string' || !granted.access_token) {
        throw new OidcError(502, 'server_error', 'GitHub returned no access token.');
      }
      const { user, email } = await githubIdentity(granted.access_token);
      const idToken = key.signJwt(claimsFor(user, email, issuer, clientId, nowSeconds()));
      return json(200, { access_token: granted.access_token, token_type: 'Bearer', id_token: idToken, expires_in: ID_TOKEN_TTL_SECONDS });
    },

    'GET /userinfo': async ({ headers, issuer }) => {
      const m = /^Bearer ([A-Za-z0-9._~+/=-]{1,512})$/i.exec(headers['authorization'] ?? '');
      if (!m) throw new OidcError(401, 'invalid_token', 'Bearer token required.', { 'www-authenticate': 'Bearer' });
      const { user, email } = await githubIdentity(m[1]);
      const { iss, aud, iat, exp, ...profile } = claimsFor(user, email, issuer, '', 0);
      return json(200, profile);
    },

    'GET /jwks': async () => json(200, { keys: [(await signer()).publicJwk] }, { 'cache-control': 'public, max-age=300' }),
  };

  return async function handler(event) {
    try {
      const method = event?.requestContext?.http?.method;
      const path = event?.rawPath;
      const domain = event?.requestContext?.domainName;
      if (typeof method !== 'string' || typeof path !== 'string' || typeof domain !== 'string') {
        throw new OidcError(400, 'invalid_request', 'Unsupported event.');
      }
      const route = routes[`${method} ${path}`];
      if (!route) {
        const known = Object.keys(routes).some((k) => k.endsWith(` ${path}`));
        throw known ? new OidcError(405, 'invalid_request', 'Method not allowed.') : new OidcError(404, 'invalid_request', 'Not found.');
      }
      const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      let bodyText = event.body ?? '';
      if (event.isBase64Encoded) bodyText = Buffer.from(bodyText, 'base64').toString('utf8');
      if (Buffer.byteLength(bodyText) > MAX_BODY_BYTES) throw new OidcError(413, 'invalid_request', 'Request body too large.');
      return await route({
        headers,
        bodyText,
        query: event.queryStringParameters ?? {},
        issuer: `https://${domain}`,
      });
    } catch (e) {
      if (e instanceof OidcError) return errorResponse(e);
      // Log the error class only: messages can embed tokens, codes or key material.
      console.error('unhandled error', e?.name ?? 'Error');
      return errorResponse(new OidcError(500, 'server_error', 'Internal error.'));
    }
  };
}

export const handler = createHandler({
  getSigningKeyPem: () => keyFromEnv(),
});
