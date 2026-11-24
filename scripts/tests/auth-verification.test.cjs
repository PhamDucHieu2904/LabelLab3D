const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');

function createLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = module.paths;
    cache.set(filename, loaded);
    loaded.require = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith('@/')) return load(path.resolve(ROOT, `${specifier.slice(2)}.ts`));
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
      return require(specifier);
    };
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    loaded._compile(compiled, filename);
    return loaded.exports;
  }
  return load;
}

function createAuthMockDb() {
  const codes = [];
  const rateLimits = new Map();
  const users = new Map();
  const wallets = new Map();
  const oauth = new Map();

  const exec = (sql, params) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT created_at AS createdAt FROM email_verification_codes')) {
      const matches = codes.filter((c) => c.email === params[0] && c.purpose === params[1]).sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { first: matches[0] ? { createdAt: matches[0].created_at } : null };
    }
    if (q.startsWith('SELECT failures,locked_until AS lockedUntil,updated_at AS updatedAt FROM auth_rate_limits')) {
      const row = rateLimits.get(params[0]);
      return { first: row ? { failures: row.failures, lockedUntil: row.locked_until, updatedAt: row.updated_at } : null };
    }
    if (q.startsWith('SELECT failures,updated_at AS updatedAt FROM auth_rate_limits')) {
      const row = rateLimits.get(params[0]);
      return { first: row ? { failures: row.failures, updatedAt: row.updated_at } : null };
    }
    if (q.startsWith('INSERT INTO auth_rate_limits')) {
      rateLimits.set(params[0], { failures: params[1], locked_until: params[2], updated_at: params[3] });
      return { meta: { changes: 1 } };
    }
    if (q.startsWith('UPDATE email_verification_codes SET consumed_at=? WHERE email=? AND purpose=? AND consumed_at IS NULL')) {
      let changes = 0;
      for (const c of codes) {
        if (c.email === params[1] && c.purpose === params[2] && c.consumed_at === null) { c.consumed_at = params[0]; changes++; }
      }
      return { meta: { changes } };
    }
    if (q.startsWith('INSERT INTO email_verification_codes')) {
      codes.push({
        id: params[0], email: params[1], purpose: params[2], code_hash: params[3],
        attempts: 0, expires_at: params[4], consumed_at: null, created_at: params[5],
      });
      return { meta: { changes: 1 } };
    }
    if (q.startsWith('DELETE FROM email_verification_codes WHERE id=?')) {
      const idx = codes.findIndex((c) => c.id === params[0]);
      if (idx >= 0) { codes.splice(idx, 1); return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    }
    if (q.startsWith('SELECT id,code_hash AS codeHash,attempts,expires_at AS expiresAt FROM email_verification_codes')) {
      const matches = codes.filter((c) => c.email === params[0] && c.purpose === params[1] && c.consumed_at === null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const row = matches[0];
      return { first: row ? { id: row.id, codeHash: row.code_hash, attempts: row.attempts, expiresAt: row.expires_at } : null };
    }
    if (q.startsWith('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=?')) {
      const row = codes.find((c) => c.id === params[0]);
      if (row) { row.attempts += 1; return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    }
    if (q.startsWith('UPDATE email_verification_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL')) {
      const row = codes.find((c) => c.id === params[1] && c.consumed_at === null);
      if (row) { row.consumed_at = params[0]; return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    }
    if (q.startsWith('SELECT u.id,u.email,u.name,u.role,u.status FROM oauth_accounts')) {
      const link = oauth.get(`google:${params[0]}`);
      if (!link) return { first: null };
      const u = users.get(link.user_id);
      return { first: u ? { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status } : null };
    }
    if (q.startsWith('UPDATE oauth_accounts SET email=?,avatar_url=?,updated_at=?')) {
      const link = oauth.get(`google:${params[3]}`);
      if (link) { link.email = params[0]; link.avatar_url = params[1]; link.updated_at = params[2]; }
      return { meta: { changes: link ? 1 : 0 } };
    }
    if (q.startsWith('SELECT id,email,name,role,status,email_verified_at AS emailVerifiedAt FROM users WHERE email=?')) {
      const u = [...users.values()].find((row) => row.email === params[0]);
      return { first: u ? { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, emailVerifiedAt: u.email_verified_at } : null };
    }
    if (q.startsWith('UPDATE users SET password_hash=NULL,email_verified_at=?,updated_at=? WHERE id=?')) {
      const u = users.get(params[2]);
      if (u) { u.password_hash = null; u.email_verified_at = params[0]; u.updated_at = params[1]; }
      return { meta: { changes: u ? 1 : 0 } };
    }
    if (q.startsWith('INSERT INTO users')) {
      const u = { id: params[0], email: params[1], name: params[2], password_hash: null, role: 'user', status: 'active', email_verified_at: params[3], created_at: params[4], updated_at: params[5] };
      users.set(u.id, u);
      return { meta: { changes: 1 } };
    }
    if (q.startsWith('INSERT INTO wallets')) {
      if (!wallets.has(params[0])) wallets.set(params[0], { user_id: params[0], balance: 0, updated_at: params[1] });
      return { meta: { changes: 1 } };
    }
    if (q.startsWith('INSERT INTO oauth_accounts')) {
      oauth.set(`google:${params[0]}`, { provider: 'google', provider_subject: params[0], user_id: params[1], email: params[2], avatar_url: params[3], created_at: params[4], updated_at: params[5] });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled mock SQL: ${q}`);
  };

  const makeStmt = (sql, params = []) => ({
    bind: (...values) => makeStmt(sql, values),
    first: async () => exec(sql, params).first ?? null,
    all: async () => ({ success: true, results: [] }),
    run: async () => ({ success: true, meta: exec(sql, params).meta ?? { changes: 0 } }),
    _exec: () => exec(sql, params),
  });

  return {
    codes, users, wallets, oauth, rateLimits,
    db: {
      prepare: (sql) => makeStmt(sql),
      batch: async (stmts) => stmts.map((stmt) => ({ success: true, meta: stmt._exec().meta ?? { changes: 0 } })),
    },
  };
}

test('email sender supports Brevo and Resend and fails closed when unconfigured', async () => {
  const load = createLoader();
  const emailMod = load(path.resolve(ROOT, 'lib/server/email.ts'));

  assert.equal(emailMod.readEmailConfig({}), null);
  await assert.rejects(() => emailMod.sendVerificationEmail({}, { to: 'a@b.com', purpose: 'register', code: '123456' }), /EMAIL_NOT_CONFIGURED/);

  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 201 }); };

  const brevoRes = await emailMod.sendVerificationEmail(
    { BREVO_API_KEY: 'xkeysib-test', EMAIL_FROM: 'Labellab3d@gmail.com', EMAIL_FROM_NAME: 'LabelLab 3D' },
    { to: 'user@example.com', purpose: 'register', code: '482910' },
    fakeFetch,
  );
  assert.equal(brevoRes.provider, 'brevo');
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.headers['api-key'], 'xkeysib-test');
  const brevoBody = JSON.parse(calls[0].init.body);
  assert.equal(brevoBody.sender.email, 'Labellab3d@gmail.com');
  assert.equal(brevoBody.to[0].email, 'user@example.com');
  assert.match(brevoBody.subject, /482910/);

  const resendRes = await emailMod.sendVerificationEmail(
    { RESEND_API_KEY: 're_test', EMAIL_FROM: 'noreply@labellab3d.com' },
    { to: 'user@example.com', purpose: 'reset', code: '739104' },
    fakeFetch,
  );
  assert.equal(resendRes.provider, 'resend');
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  assert.equal(calls[1].init.headers.authorization, 'Bearer re_test');
});

test('OTP verification hashes codes, enforces cooldown/attempts/single-use, and cleans up on send error', async () => {
  const load = createLoader();
  const otp = load(path.resolve(ROOT, 'lib/server/email-verification.ts'));
  const mock = createAuthMockDb();
  const env = { DB: mock.db };

  // Failed delivery removes row so user is not locked in cooldown.
  await assert.rejects(() => otp.issueVerificationCode(env, {
    email: 'fail@example.com', purpose: 'register', ip: '1.2.3.4',
    deliver: async () => { throw new Error('EMAIL_SEND_FAILED'); },
  }), /EMAIL_SEND_FAILED/);
  assert.equal(mock.codes.length, 0);

  let sentCode = '';
  const issued = await otp.issueVerificationCode(env, {
    email: 'User@Example.com', purpose: 'register', ip: '1.2.3.4',
    deliver: async (_env, payload) => { sentCode = payload.code; return { provider: 'brevo' }; },
  });
  assert.equal(issued.cooldownSeconds, 60);
  assert.match(sentCode, /^\d{6}$/);
  assert.equal(mock.codes.length, 1);
  assert.notEqual(mock.codes[0].code_hash, sentCode, 'OTP must be hashed before storing in D1');

  // Immediate resend hits 60s cooldown.
  await assert.rejects(() => otp.issueVerificationCode(env, {
    email: 'user@example.com', purpose: 'register', ip: '1.2.3.4',
    deliver: async () => ({ provider: 'brevo' }),
  }), /VERIFICATION_COOLDOWN/);

  // Wrong code increments attempts and rejects.
  const wrongCode = sentCode === '000000' ? '111111' : '000000';
  await assert.rejects(() => otp.verifyAndConsumeCode(env, { email: 'user@example.com', purpose: 'register', code: wrongCode }), /INVALID_CODE/);
  assert.equal(mock.codes[0].attempts, 1);

  // Valid code succeeds once, then replay fails.
  await otp.verifyAndConsumeCode(env, { email: 'user@example.com', purpose: 'register', code: sentCode });
  assert.ok(mock.codes[0].consumed_at);
  await assert.rejects(() => otp.verifyAndConsumeCode(env, { email: 'user@example.com', purpose: 'register', code: sentCode }), /CODE_EXPIRED/);
});

test('upsertGoogleUser creates wallet-backed D1 user, reuses link, and prevents unverified pre-takeover', async () => {
  const load = createLoader();
  const { upsertGoogleUser } = load(path.resolve(ROOT, 'lib/server/google-account.ts'));
  const mock = createAuthMockDb();
  const env = { DB: mock.db };

  // Brand-new Google user creates users + wallets + oauth_accounts.
  const created = await upsertGoogleUser(env, {
    sub: 'google-sub-1', email: 'Hieu@Gmail.com', name: 'Đức Hiếu', avatarUrl: 'https://lh3.googleusercontent.com/a1',
  });
  assert.equal(created.email, 'hieu@gmail.com');
  assert.ok(mock.wallets.has(created.id));
  assert.ok(mock.users.get(created.id).email_verified_at);
  assert.equal(mock.oauth.get('google:google-sub-1').avatar_url, 'https://lh3.googleusercontent.com/a1');

  // Repeat sign-in reuses exact user and refreshes avatar.
  const again = await upsertGoogleUser(env, {
    sub: 'google-sub-1', email: 'hieu@gmail.com', name: 'Đức Hiếu', avatarUrl: 'https://lh3.googleusercontent.com/a2',
  });
  assert.equal(again.id, created.id);
  assert.equal(mock.oauth.get('google:google-sub-1').avatar_url, 'https://lh3.googleusercontent.com/a2');

  // Unverified pre-registered password user gets password_hash cleared when true Google owner signs in.
  mock.users.set('usr_pre', {
    id: 'usr_pre', email: 'victim@gmail.com', name: 'Pre', password_hash: 'attacker-hash',
    role: 'user', status: 'active', email_verified_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
  });
  const claimed = await upsertGoogleUser(env, { sub: 'google-sub-victim', email: 'victim@gmail.com', name: 'Real Owner' });
  assert.equal(claimed.id, 'usr_pre');
  assert.equal(mock.users.get('usr_pre').password_hash, null, 'unverified pre-registered password must be cleared');
  assert.ok(mock.users.get('usr_pre').email_verified_at);
});
