require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_API_URL = process.env.KIMI_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
const KIMI_MODEL = process.env.KIMI_MODEL || 'moonshot-v1-8k';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 简单的内存级速率限制（按 IP），防止 Key 被滥用
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const arr = (rateMap.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  arr.push(now);
  rateMap.set(ip, arr);
  next();
}

app.post('/api/chat', rateLimit, async (req, res) => {
  if (!KIMI_API_KEY) {
    return res.status(500).json({ error: '服务器未配置 KIMI_API_KEY' });
  }
  const { messages = [], systemPrompt = '' } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }

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
      console.error('Kimi API error:', err);
      return res.status(resp.status).json({ error: err.error?.message || 'Kimi API 请求失败' });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    res.json({ content });
  } catch (e) {
    console.error('Kimi API call failed:', e);
    res.status(502).json({ error: 'Kimi API 调用异常: ' + e.message });
  }
});

// 健康检查（Render 会用到）
app.get('/health', (req, res) => res.json({ ok: true }));

// 兜底：返回首页
app.get('*', (req, res) => {
  const index = path.join(__dirname, 'public', 'ke_dao_assessment.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(404).send('Not Found');
});

app.listen(PORT, () => {
  console.log(`kedao-assessment server listening on :${PORT}`);
});
