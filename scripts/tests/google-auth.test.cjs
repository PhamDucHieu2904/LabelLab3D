const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(relative, overrides = {}) {
  const filename = path.resolve(__dirname, '../..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = id => Object.hasOwn(overrides, id) ? overrides[id] : nativeRequire(id);
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const config = loadTs('lib/auth/google-config.ts');
const validEnv = {
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-only-client-secret',
  NEXTAUTH_SECRET: 'test-only-secret-with-at-least-32-characters',
  NEXTAUTH_URL: 'http://127.0.0.1:3005',
};
const { authOptions } = loadTs('lib/auth/options.ts', {
  './google-config': { ...config, getGoogleAuthConfig: () => config.getGoogleAuthConfig(validEnv) },
});

test('Google stays unavailable with partial credentials, weak session keys or invalid origins', () => {
  assert.equal(config.getGoogleAuthConfig({}), null);
  for (const key of Object.keys(validEnv)) {
    assert.equal(config.getGoogleAuthConfig({ ...validEnv, [key]: '' }), null, key);
  }
  assert.equal(config.getGoogleAuthConfig({ ...validEnv, NEXTAUTH_SECRET: 'short' }), null);
  for (const url of ['bad-url', 'http://labellab.example', 'https://labellab.example/auth',
    'https://user:password@labellab.example', 'https://labellab.example/?secret=abc']) {
    assert.equal(config.getGoogleAuthConfig({ ...validEnv, NEXTAUTH_URL: url }), null, url);
  }
  assert.ok(config.getGoogleAuthConfig(validEnv));
  assert.ok(config.getGoogleAuthConfig({ ...validEnv, NEXTAUTH_URL: 'https://labellab.example' }));
});

test('only verified Google identities can create sessions', async () => {
  const signIn = authOptions.callbacks.signIn;
  const account = { provider: 'google' };
  const verified = { sub: 'google-subject-123', email: 'designer@example.test', email_verified: true };
  assert.equal(await signIn({ account, profile: verified }), true);
  for (const profile of [undefined, null, {}, { ...verified, email_verified: false },
    { ...verified, email_verified: 'true' }, { ...verified, sub: '' }, { ...verified, email: '' }]) {
    assert.equal(await signIn({ account, profile }), false);
  }
  assert.equal(await signIn({ account: { provider: 'credentials' }, profile: verified }), false);
  assert.equal(await signIn({ account: null, profile: verified }), false);
});

test('Google profile uses the stable provider subject and preserves the supplied name', () => {
  const provider = authOptions.providers[0];
  assert.deepEqual(provider.profile({
    sub: 'stable-google-id', name: 'Nguyễn Minh', email: 'designer@example.test', picture: 'https://lh3.googleusercontent.com/test',
  }), {
    id: 'stable-google-id', name: 'Nguyễn Minh', email: 'designer@example.test', image: 'https://lh3.googleusercontent.com/test',
  });
  assert.deepEqual(provider.options.checks, ['pkce', 'state']);
  assert.equal(provider.options.authorization.params.scope, 'openid email profile');
  assert.notEqual(provider.options.allowDangerousEmailAccountLinking, true);
  assert.equal(authOptions.session.strategy, 'jwt');
  assert.equal(authOptions.callbacks.jwt, undefined, 'do not copy provider access tokens into the session');
});

test('OAuth return URLs cannot send the user to an external or executable URL', async () => {
  const baseUrl = 'https://labellab.example';
  const redirect = authOptions.callbacks.redirect;
  assert.equal(await redirect({ baseUrl, url: '/studio#workspace' }), `${baseUrl}/studio#workspace`);
  assert.equal(await redirect({ baseUrl, url: `${baseUrl}/?panel=projects` }), `${baseUrl}/?panel=projects`);
  for (const url of ['https://attacker.example', '//attacker.example', 'javascript:alert(1)',
    'data:text/html,test', 'https://labellab.example.attacker.example', 'https://labellab.example@attacker.example',
    'https://labellab.example:8443/studio', 'http://labellab.example', 'https://[invalid']) {
    assert.equal(await redirect({ baseUrl, url }), baseUrl, url);
  }
});
