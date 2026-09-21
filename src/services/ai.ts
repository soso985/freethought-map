export type AIConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const CONFIG_KEY = 'freethought-map:ai-config:v1';

export const DEFAULT_CONFIG: AIConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

export function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AIConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: AIConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[FreeThought Map] AI 配置保存失败', e);
  }
}

export function isConfigured(config: AIConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.model.trim());
}

/**
 * 系统提示词即产品的核心约束：AI 只是笔和资料库。
 * 只允许产出节点文本本身，禁止任何结构、层级、候选与建议。
 */
const SYSTEM_PROMPT = [
  '你是思维导图工具里的文字助手，用户是唯一的结构决策者。',
  '你只负责产出单个节点的正文文本。',
  '严格禁止：给出结构或层级建议、提出多个候选方案、主动拆分或归类主题、输出解释与寒暄、输出 Markdown 标题与列表符号。',
  '只输出一段纯文本正文，长度控制在 120 字以内。',
].join('\n');

/** 调用 OpenAI 兼容的 /chat/completions 接口。一次请求只返回一段文本。 */
export async function generate(config: AIConfig, userPrompt: string): Promise<string> {
  const base = config.baseUrl.trim().replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({
      model: config.model.trim(),
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`接口返回 ${res.status}${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('接口未返回文本内容');
  return text;
}
