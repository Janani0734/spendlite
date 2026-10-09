import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { registerAgent } from './helpers/auth';
import { resetDatabase } from './helpers/db';
import { mockLlmBody, mockLlmReply, mockLlmStatus, mockLlmUnreachable } from './helpers/llm';

const app = createApp();
const URL_PATH = '/api/expenses/auto-categorize';

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/expenses/auto-categorize', () => {
  it('asks the LLM and returns its category', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    const fetchSpy = mockLlmReply('FOOD');

    const res = await agent
      .post(URL_PATH)
      .send({ description: 'Team lunch at the office', merchant: 'Swiggy' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { category: 'FOOD', fallback: false } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const sent = JSON.parse(init?.body as string) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(sent.model).toBe('test-model');
    expect(sent.messages[0]?.role).toBe('system');
    expect(sent.messages[1]?.content).toContain('Team lunch at the office');
    expect(sent.messages[1]?.content).toContain('Swiggy');
  });

  it('works without a merchant and leaves it out of the prompt', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    const fetchSpy = mockLlmReply('SOFTWARE');

    const res = await agent.post(URL_PATH).send({ description: 'Figma subscription' });

    expect(res.status).toBe(200);
    expect(res.body.data.category).toBe('SOFTWARE');
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const sent = JSON.parse(init?.body as string) as { messages: { content: string }[] };
    expect(sent.messages[1]?.content).not.toContain('Merchant');
  });

  const replyVariants: [string, string][] = [
    ['food', 'FOOD'],
    ['Category: Travel.', 'TRAVEL'],
    ['**SOFTWARE**', 'SOFTWARE'],
  ];

  it.each(replyVariants)('understands the reply "%s"', async (reply, expected) => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    mockLlmReply(reply);

    const res = await agent.post(URL_PATH).send({ description: 'Something' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ category: expected, fallback: false });
  });

  it('falls back to OTHER when the reply names two different categories', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    mockLlmReply('FOOD or TRAVEL');

    const res = await agent.post(URL_PATH).send({ description: 'Airport dinner' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ category: 'OTHER', fallback: true });
  });

  it('falls back to OTHER when the reply names no category', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    mockLlmReply('banana');

    const res = await agent.post(URL_PATH).send({ description: 'Something odd' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ category: 'OTHER', fallback: true });
  });

  it('returns 502 without leaking details when the LLM answers with an error status', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    mockLlmStatus(500);

    const res = await agent.post(URL_PATH).send({ description: 'Anything' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('test-key');
    expect(text).not.toContain('secret details');
  });

  it('returns 502 when the LLM is unreachable', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    mockLlmUnreachable();

    const res = await agent.post(URL_PATH).send({ description: 'Anything' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
  });

  it('returns 502 when the LLM reply has an unexpected shape', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    mockLlmBody({ unexpected: true });

    const res = await agent.post(URL_PATH).send({ description: 'Anything' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
  });

  it('returns 503 and makes no request when AI is not configured', async () => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    const fetchSpy = mockLlmReply('FOOD');
    const savedKey = env.LLM_API_KEY;
    env.LLM_API_KEY = undefined;

    try {
      const res = await agent.post(URL_PATH).send({ description: 'Anything' });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      env.LLM_API_KEY = savedKey;
    }
  });

  const invalidBodies: [string, Record<string, unknown>][] = [
    ['a missing description', {}],
    ['a blank description', { description: '   ' }],
    ['a description over 500 characters', { description: 'x'.repeat(501) }],
  ];

  it.each(invalidBodies)('rejects %s without calling the LLM', async (_label, body) => {
    const { agent } = await registerAgent(app, 'alice@example.com');
    const fetchSpy = mockLlmReply('FOOD');

    const res = await agent.post(URL_PATH).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires login and makes no LLM call', async () => {
    const fetchSpy = mockLlmReply('FOOD');

    const res = await request(app).post(URL_PATH).send({ description: 'Anything' });

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});