/**
 * FeishuPushService — Push conversation logs to Feishu/Lark
 *
 * After each completed conversational turn, pushes a rich card to Feishu
 * via webhook.
 */

import type { ChatMessage } from '@/types/session';
import type { FeishuConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';

const log = getLogger('FeishuPush');

interface QueuedPush {
  type: 'feishu_push';
  payload: FeishuCardPayload;
  retryAt: number;
  attempts: number;
}

interface FeishuCardPayload {
  agentName: string;
  userMessage: ChatMessage;
  aiResponse: ChatMessage;
  sessionInfo: { sessionId: string; durationMs: number };
}

class MessageQueue {
  private queue: QueuedPush[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  enqueue(item: QueuedPush): void {
    this.queue.push(item);
    if (!this.timer) this.startProcessor();
  }

  private startProcessor(): void {
    this.timer = setInterval(() => {
      const now = Date.now();
      this.queue = this.queue.filter((item) => {
        if (now >= item.retryAt) {
          this.process(item);
          return false; // Remove after processing attempt
        }
        return true;
      });
      if (this.queue.length === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 5000);
  }

  private async process(item: QueuedPush): Promise<void> {
    try {
      await FeishuPushService.pushTurnDirect(item.payload);
      log.info('Queued Feishu push succeeded');
    } catch {
      item.attempts++;
      if (item.attempts >= 5) {
        log.warn('Max retries reached, dropping Feishu push');
        return;
      }
      // Exponential backoff: 5s, 15s, 45s, max 5min
      const delay = Math.min(5000 * Math.pow(3, item.attempts - 1), 300_000);
      item.retryAt = Date.now() + delay;
      this.enqueue(item); // Re-queue
    }
  }
}

const messageQueue = new MessageQueue();

export class FeishuPushService {
  /**
   * Push a completed conversation turn to Feishu/Lark
   */
  static async pushTurn(
    agentName: string,
    userMessage: ChatMessage,
    aiResponse: ChatMessage,
    sessionInfo: { sessionId: string; durationMs: number },
  ): Promise<boolean> {
    const config = useAppStore.getState().config.feishu;
    if (!config.enabled || !config.webhookUrl) return false;

    const payload: FeishuCardPayload = {
      agentName,
      userMessage,
      aiResponse,
      sessionInfo,
    };

    try {
      return await FeishuPushService.pushTurnDirect(payload);
    } catch (error) {
      log.error('Feishu push failed, queuing for retry', error);
      messageQueue.enqueue({
        type: 'feishu_push',
        payload,
        retryAt: Date.now() + 5000,
        attempts: 0,
      });
      return false;
    }
  }

  private static async pushTurnDirect(payload: FeishuCardPayload): Promise<boolean> {
    const config = useAppStore.getState().config.feishu;
    if (!config.webhookUrl) return false;

    const card = FeishuPushService.buildCard(payload);

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'interactive',
        card,
      }),
    });

    if (!response.ok) {
      throw new Error(`Feishu webhook returned ${response.status}`);
    }

    log.info('Feishu push successful');
    return true;
  }

  private static buildCard(payload: FeishuCardPayload): object {
    const durationSec = Math.round(payload.sessionInfo.durationMs / 1000);
    const time = new Date(payload.userMessage.timestamp).toLocaleString('zh-CN');

    return {
      header: {
        title: { tag: 'plain_text', content: `🦞 MobileClaw · ${payload.agentName}` },
        template: 'blue',
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: `**时间**: ${time}` },
        },
        {
          tag: 'hr',
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**👤 你**:\n${payload.userMessage.content}`,
          },
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**🤖 龙虾**:\n${payload.aiResponse.content}`,
          },
        },
        {
          tag: 'hr',
        },
        {
          tag: 'div',
          text: {
            tag: 'plain_text',
            content: `${payload.userMessage.hasVideoContext ? '📷' : '🎤'} · 时长 ${durationSec}s`,
          },
        },
      ],
    };
  }
}

// Need access to store — import at bottom to avoid circular dependency
// We'll inline the config access in methods above
function useAppStore() {
  // Dynamic import to avoid circular deps at module load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/store/useAppStore').useAppStore();
}
