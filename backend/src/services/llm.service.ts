import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

function logError(message: string): void {
  if (env.NODE_ENV !== 'test') {
    console.error(message);
  }
}

function unavailable(): AppError {
  return new AppError(
    502,
    'AI_UNAVAILABLE',
    'The AI service is unavailable right now. Please try again.',
  );
}

// Calls any OpenAI-compatible /chat/completions endpoint and returns the reply text.
// Only the model and messages are sent, which every compatible provider accepts.
export async function completeChat(messages: ChatMessage[]): Promise<string> {
  const apiKey = env.LLM_API_KEY;
  const model = env.LLM_MODEL;
  if (!apiKey || !model) {
    throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI features are not configured on this server');
  }

  const url = `${env.LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
    });
  } catch (error) {
    logError(`LLM request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    throw unavailable();
  }

  if (!response.ok) {
    // The provider's response body is never logged or returned, only the status.
    logError(`LLM request failed with HTTP ${response.status}`);
    throw unavailable();
  }

  const parsed = completionSchema.safeParse(await response.json().catch(() => null));
  const content = parsed.success ? parsed.data.choices[0]?.message.content : undefined;
  if (content === undefined) {
    logError('LLM response had an unexpected shape');
    throw unavailable();
  }

  return content.trim();
}