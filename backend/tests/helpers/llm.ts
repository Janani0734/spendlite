import { vi, type MockInstance } from 'vitest';

type FetchSpy = MockInstance<typeof fetch>;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// A fresh Response per call, because a Response body can only be read once.
export function mockLlmBody(body: unknown): FetchSpy {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS }),
    );
}

export function mockLlmReply(content: string): FetchSpy {
  return mockLlmBody({ choices: [{ message: { role: 'assistant', content } }] });
}

export function mockLlmStatus(status: number): FetchSpy {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response('upstream error with secret details', { status }));
}

export function mockLlmUnreachable(): FetchSpy {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
}