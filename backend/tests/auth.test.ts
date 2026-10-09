import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { resetDatabase } from './helpers/db';

const app = createApp();

const validUser = {
  name: 'Test User',
  email: 'janani.test@example.com',
  password: 'Passw0rd-Test1',
};

// Express sends Set-Cookie as an array; join it so tests can search the text.
function setCookieText(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw.join('; ') : String(raw ?? '');
}

beforeEach(async () => {
  await resetDatabase();
});

describe('POST /api/auth/signup', () => {
  it('creates an account, lowercases the email, and sets an httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...validUser, email: 'Janani.Test@Example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('janani.test@example.com');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(validUser.password);

    const cookie = setCookieText(res);
    expect(cookie).toContain('spendlite_token=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('stores a bcrypt hash, never the plaintext password', async () => {
    await request(app).post('/api/auth/signup').send(validUser).expect(201);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: validUser.email } });
    expect(stored.passwordHash).not.toBe(validUser.password);
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  it('rejects a duplicate email regardless of letter case', async () => {
    await request(app).post('/api/auth/signup').send(validUser).expect(201);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...validUser, email: 'JANANI.TEST@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(await prisma.user.count()).toBe(1);
  });

  it('rejects invalid input with field-level errors', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: '', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors).toHaveProperty('name');
    expect(res.body.error.details.fieldErrors).toHaveProperty('email');
    expect(res.body.error.details.fieldErrors).toHaveProperty('password');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials, with the email in any letter case', async () => {
    await request(app).post('/api/auth/signup').send(validUser).expect(201);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'JANANI.TEST@example.com', password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(setCookieText(res)).toContain('spendlite_token=');
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    await request(app).post('/api/auth/signup').send(validUser).expect(201);

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'spendlite_token=garbage');

    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send(validUser).expect(201);

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ name: validUser.name, email: validUser.email });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 once the user no longer exists', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send(validUser).expect(201);
    await prisma.user.delete({ where: { email: validUser.email } });

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send(validUser).expect(201);
    await agent.get('/api/auth/me').expect(200);

    await agent.post('/api/auth/logout').expect(200);

    await agent.get('/api/auth/me').expect(401);
  });
});