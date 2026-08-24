import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeUrl, fetchPage } from './src/fetcher.js';
import { parseArticle } from './src/parser.js';
import { analyze } from './src/analyzer.js';
import { analyzeWithAI, isAIConfigured } from './src/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: isAIConfigured() });
});

app.post('/api/analyze', async (req, res) => {
  const { url, keyword, useAI = true } = req.body || {};

  if (!keyword || !String(keyword).trim()) {
    return res.status(400).json({ error: 'کلمه کلیدی هدف را وارد کنید.' });
  }

  let targetUrl;
  try {
    targetUrl = normalizeUrl(url);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // ۱) دریافت و تجزیه‌ی صفحه
  let article;
  let loadTimeMs;
  try {
    const page = await fetchPage(targetUrl);
    loadTimeMs = page.loadTimeMs;
    article = parseArticle(page.html, page.finalUrl);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  if (article.wordCount < 20) {
    return res.status(422).json({
      error:
        'متنی از این صفحه استخراج نشد. ممکن است محتوا با جاوااسکریپت بارگذاری شود یا صفحه دسترسی را مسدود کرده باشد.',
    });
  }

  // ۲) امتیازدهی خودکار
  const report = analyze(article, String(keyword).trim());
  report.stats.loadTimeMs = loadTimeMs;

  // ۳) تحلیل هوش مصنوعی (اختیاری — اگر خطا داد، گزارش اصلی حفظ می‌شود)
  if (useAI && isAIConfigured()) {
    try {
      report.ai = await analyzeWithAI(article, report);
    } catch (err) {
      report.aiError = err.message;
    }
  } else if (useAI) {
    report.aiError = 'کلید API تنظیم نشده است (GROQ_API_KEY را در فایل .env بگذارید).';
  }

  res.json(report);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`✅ SEO Analyzer روی http://localhost:${port} در حال اجراست`);
  if (!isAIConfigured()) {
    console.warn('⚠️  کلید هوش مصنوعی تنظیم نشده — GROQ_API_KEY را در .env بگذارید (بقیه‌ی گزارش کار می‌کند).');
  }
});
