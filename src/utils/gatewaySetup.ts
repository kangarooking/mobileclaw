import { base64ToUint8, uint8ToString } from '@/utils/rnCompat';

export interface ImportedGatewaySetup {
  name?: string;
  wsUrl: string;
  token?: string;
  description?: string;
  requiresManualToken?: boolean;
}

type RawSetupPayload = {
  type?: string;
  name?: string;
  url?: string;
  wsUrl?: string;
  token?: string;
  bootstrapToken?: string;
  password?: string;
  description?: string;
};

function parseBase64UrlJson(raw: string): RawSetupPayload | null {
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const bytes = base64ToUint8(padded);
    return JSON.parse(uint8ToString(bytes)) as RawSetupPayload;
  } catch {
    return null;
  }
}

function parseJson(raw: string): RawSetupPayload | null {
  try {
    return JSON.parse(raw) as RawSetupPayload;
  } catch {
    return null;
  }
}

function normalizeWsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('二维码里没有可用的 Gateway 地址。');
  }

  const candidate = /^wss?:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
  const url = new URL(candidate);
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'ws:' && protocol !== 'wss:' && protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('二维码里的 Gateway 地址协议不受支持。');
  }
  const resolvedProtocol = protocol === 'http:' ? 'ws:' : protocol === 'https:' ? 'wss:' : protocol;
  return `${resolvedProtocol}//${url.host}`;
}

export function parseGatewaySetupInput(raw: string): ImportedGatewaySetup {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('二维码内容为空。');
  }

  const payload =
    parseJson(trimmed) ??
    (trimmed.startsWith('mobileclaw://setup?')
      ? parseJson(decodeURIComponent(trimmed.split('data=')[1] || ''))
      : null) ??
    parseBase64UrlJson(trimmed);

  if (!payload) {
    throw new Error('无法识别二维码内容。请使用 OpenClaw 的 `openclaw qr` 输出，或包含 wsUrl/token 的 JSON。');
  }

  if (payload.password && !payload.token && !payload.bootstrapToken) {
    throw new Error('当前 MobileClaw 只支持 token 型 Gateway 认证，请在 OpenClaw 侧改为 token 后重新生成二维码。');
  }

  const wsUrl = normalizeWsUrl(payload.wsUrl || payload.url || '');
  return {
    name: payload.name?.trim(),
    wsUrl,
    token: payload.token?.trim(),
    description: payload.description?.trim(),
    requiresManualToken: Boolean(payload.bootstrapToken && !payload.token),
  };
}
