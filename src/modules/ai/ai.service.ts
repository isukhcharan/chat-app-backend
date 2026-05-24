import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  async askAI(question: string, context?: string): Promise<string> {
    if (!this.client) {
      return '⚠️ AI features require an `ANTHROPIC_API_KEY` in your environment. Add your key to `.env` and restart the server.';
    }

    try {
      const messages: Anthropic.MessageParam[] = [];

      if (context) {
        messages.push({
          role: 'user',
          content: `Here is the recent conversation context:\n\n${context}\n\nNow answer this question: ${question}`,
        });
      } else {
        messages.push({ role: 'user', content: question });
      }

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system:
          'You are Nexus AI, a helpful assistant built into the Nexus team chat platform. Be concise, friendly, and helpful. Use markdown for formatting when appropriate.',
        messages,
      });

      return (response.content[0] as Anthropic.TextBlock).text;
    } catch (err) {
      this.logger.error('AI request failed', err);
      return '⚠️ AI is temporarily unavailable. Please try again.';
    }
  }

  async summarizeThread(messages: Array<{ username: string; content: string }>): Promise<string> {
    if (!this.client) {
      return '⚠️ AI features require an `ANTHROPIC_API_KEY` to be configured.';
    }

    const formatted = messages
      .map((m) => `${m.username}: ${m.content}`)
      .join('\n');

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:
          'You are Nexus AI. Summarize the following chat thread in 2-4 bullet points. Be concise and capture the key decisions or outcomes.',
        messages: [{ role: 'user', content: formatted }],
      });

      return (response.content[0] as Anthropic.TextBlock).text;
    } catch (err) {
      this.logger.error('Thread summary failed', err);
      return '⚠️ Could not summarize thread.';
    }
  }

  async suggestReplies(messages: Array<{ username: string; content: string }>): Promise<string[]> {
    if (!this.client) return [];

    const formatted = messages
      .slice(-5)
      .map((m) => `${m.username}: ${m.content}`)
      .join('\n');

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system:
          'Generate exactly 3 short, natural reply suggestions for the last message in this chat. Return only a JSON array of strings, nothing else. Each reply should be under 80 characters.',
        messages: [{ role: 'user', content: formatted }],
      });

      const text = (response.content[0] as Anthropic.TextBlock).text;
      return JSON.parse(text);
    } catch {
      return [];
    }
  }
}
