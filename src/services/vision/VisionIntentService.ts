import { SecureStorage } from '@/services/storage/SecureStorage';
import { getLogger } from '@/utils/logger';

export type VisionIntentType =
  | 'none'
  | 'describe_scene'
  | 'identify_object'
  | 'read_text'
  | 'compare_change';

export interface VisionIntentResult {
  needsVision: boolean;
  type: VisionIntentType;
  confidence: number;
  source: 'rule' | 'model';
  reason: string;
}

const VISION_RULES: Array<{ pattern: RegExp; type: VisionIntentType; reason: string }> = [
  { pattern: /(屏幕上|画面里|图里|写了什么|文字|字幕)/u, type: 'read_text', reason: 'text visible in scene' },
  { pattern: /(这是什么|这个是什么|这个东西|这玩意|这个按钮|你看一下)/u, type: 'identify_object', reason: 'explicit visual identification request' },
  {
    pattern: /(帮我看看|看一下前面|镜头里|现在看到什么|描述一下|看得见|看得到|能看见|能看到|看到画面|看见画面|看得到画面|看得见画面)/u,
    type: 'describe_scene',
    reason: 'explicit scene description request',
  },
  { pattern: /(变化|刚才发生|有什么不同|前后对比|过程)/u, type: 'compare_change', reason: 'change comparison request' },
];

const TEXT_ONLY_RULES = [
  /(总结|翻译|润色|写一段|起个标题|解释一下概念)/u,
];

const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const ZHIPU_MODEL = 'glm-4.7-flash';
const log = getLogger('VisionIntent');

export class VisionIntentService {
  async classify(text: string): Promise<VisionIntentResult> {
    const normalized = text.trim();
    log.info(`Classifying transcript for vision: "${normalized}"`);
    if (!normalized) {
      log.info('Vision classify: empty transcript -> no vision');
      return {
        needsVision: false,
        type: 'none',
        confidence: 1,
        source: 'rule',
        reason: 'empty transcript',
      };
    }

    for (const pattern of TEXT_ONLY_RULES) {
      if (pattern.test(normalized)) {
        log.info('Vision classify: matched text-only rule');
        return {
          needsVision: false,
          type: 'none',
          confidence: 0.95,
          source: 'rule',
          reason: 'text-only task detected',
        };
      }
    }

    for (const rule of VISION_RULES) {
      if (rule.pattern.test(normalized)) {
        log.info(`Vision classify: matched local vision rule (${rule.type})`);
        return {
          needsVision: true,
          type: rule.type,
          confidence: 0.92,
          source: 'rule',
          reason: rule.reason,
        };
      }
    }

    const modelResult = await this.classifyWithModel(normalized);
    if (modelResult) {
      log.info('Vision classify: model fallback used', modelResult);
      return modelResult;
    }

    log.info('Vision classify: fallback unavailable -> default no vision');
    return {
      needsVision: false,
      type: 'none',
      confidence: 0.55,
      source: 'rule',
      reason: 'no strong visual cue found',
    };
  }

  private async classifyWithModel(text: string): Promise<VisionIntentResult | null> {
    const apiKey =
      (await SecureStorage.getVisionApiKey()) ||
      process.env.EXPO_PUBLIC_ZHIPU_API_KEY ||
      null;

    if (!apiKey) {
      log.warn('Vision classify: no Zhipu API key found; skipping model fallback');
      return null;
    }

    log.info(`Vision classify: calling ${ZHIPU_MODEL} fallback`);

    const prompt = [
      '你是一个视觉触发分类器。',
      '任务：判断当前用户这句话，是否必须结合摄像头画面才能更好回答。',
      '只返回 JSON，不要返回 Markdown，不要解释。',
      'JSON schema: {"needsVision": boolean, "type": "none|describe_scene|identify_object|read_text|compare_change", "confidence": number, "reason": string}',
      `用户句子：${text}`,
    ].join('\n');

    try {
      const response = await fetch(ZHIPU_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: ZHIPU_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个只输出 JSON 的视觉分类器。',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 128,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        log.warn(`Vision classify: model request failed (${response.status})`, errorText);
        return null;
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        log.warn('Vision classify: model returned no string content');
        return null;
      }

      const parsed = JSON.parse(this.extractJson(content));
      const type = this.normalizeIntentType(parsed?.type);
      const confidence = Number(parsed?.confidence);

      log.info('Vision classify: model raw content', content);
      return {
        needsVision: Boolean(parsed?.needsVision),
        type,
        confidence: Number.isFinite(confidence) ? confidence : 0.7,
        source: 'model',
        reason: typeof parsed?.reason === 'string' ? parsed.reason : 'classified by glm-4.7-flash',
      };
    } catch {
      log.warn('Vision classify: model fallback threw or returned invalid JSON');
      return null;
    }
  }

  private extractJson(content: string): string {
    const trimmed = content.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }
    return trimmed;
  }

  private normalizeIntentType(value: unknown): VisionIntentType {
    if (
      value === 'describe_scene' ||
      value === 'identify_object' ||
      value === 'read_text' ||
      value === 'compare_change'
    ) {
      return value;
    }
    return 'none';
  }
}

export const visionIntentService = new VisionIntentService();
