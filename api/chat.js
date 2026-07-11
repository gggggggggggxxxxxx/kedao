// Vercel Serverless Function: /api/chat
// 代理 Kimi (Moonshot) API，将 API Key 藏在服务端环境变量中

const KIMI_API_URL = process.env.KIMI_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';

// 内存级速率限制（按 IP）。注意：serverless 实例可能短暂保留也可能被回收，
// 这里做基础防护即可，真正要严格限流建议用 Upstash Redis。
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

module.exports = async function handler(req, res) {
  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const KIMI_API_KEY = process.env.KIMI_API_KEY;
  if (!KIMI_API_KEY) {
    return res.status(500).json({ error: '服务器未配置 KIMI_API_KEY' });
  }

  const { messages = [], systemPrompt = '' } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }

  // 速率限制
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const arr = (rateMap.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  arr.push(now);
  rateMap.set(ip, arr);

  try {
    const resp = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + KIMI_API_KEY,
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        ],
        temperature: 0.8,
        max_tokens: 200,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(resp.status).json({ error: err.error?.message || 'Kimi API 请求失败' });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ content });
  } catch (e) {
    return res.status(502).json({ error: 'Kimi API 调用异常: ' + e.message });
  }
};
