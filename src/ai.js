import OpenAI from 'openai';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

// اگر روی سیستم پروکسی (فیلترشکن) فعال باشد، fetch داخلی Node آن را نادیده می‌گیرد
// و درخواست مستقیم می‌رود؛ سرویس‌هایی مثل Groq/NVIDIA ممکن است به‌خاطر محدودیت
// جغرافیایی آن را با ۴۰۳ رد کنند. این agent درخواست‌های هوش مصنوعی را از پروکسی عبور می‌دهد.
const PROXY_URL =
  process.env.AI_PROXY || // تنظیم صریح در .env (مطمئن‌ترین، مستقل از محیط اجرا)
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  '';
const proxyAgent = PROXY_URL ? new ProxyAgent(PROXY_URL) : null;

// endpoint سازگار با OpenAI — به‌طور پیش‌فرض Groq (سریع و رایگان)، اما با env قابل تغییر است.
// برای هر ارائه‌دهنده‌ی سازگار با OpenAI (Groq، NVIDIA، Ollama محلی و…) فقط
// AI_BASE_URL و AI_MODEL را در .env عوض کنید.
const BASE_URL = process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1';
const MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

// حداکثر طول متنی که برای تحلیل به مدل فرستاده می‌شود.
// پیش‌فرض محافظه‌کارانه تا زیر سقف رایگان Groq (۱۲۰۰۰ توکن/دقیقه) بماند.
// روی tier پولی می‌توانید AI_MAX_BODY_CHARS را بزرگ‌تر کنید.
const MAX_BODY_CHARS = Number(process.env.AI_MAX_BODY_CHARS) || 8_000;

// سقف توکن خروجی. خروجی JSON معمولاً کوتاه است؛ این هم در TPM حساب می‌شود.
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 2_500;

/** آیا endpoint یک سرویس محلی (Ollama / LM Studio) است که نیازی به کلید ندارد؟ */
function isLocalEndpoint() {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(BASE_URL);
}

/** کلید را از چند نام متغیر ممکن می‌خواند تا با تنظیمات مختلف سازگار باشد. */
function getApiKey() {
  return (
    process.env.AI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  );
}

/** بررسی می‌کند آیا تحلیل هوش مصنوعی قابل استفاده است (کلید موجود یا endpoint محلی). */
export function isAIConfigured() {
  return Boolean(getApiKey()) || isLocalEndpoint();
}

const SYSTEM_PROMPT = `تو یک متخصص ارشد سئو و استراتژیست محتوا هستی که سال‌ها روی رتبه‌گیری مقالات فارسی و انگلیسی در گوگل کار کرده‌ای.

به تو داده‌های استخراج‌شده از یک مقاله و نتیجه‌ی تحلیل خودکار سئو داده می‌شود. وظیفه‌ی تو ارائه‌ی تحلیل کیفی است — چیزی که ابزار خودکار نمی‌تواند بسنجد:

- آیا محتوا واقعاً قصد جستجوی کاربر (search intent) پشت کلمه کلیدی را برآورده می‌کند؟
- کیفیت، عمق، اصالت و اعتبار (E-E-A-T) محتوا چطور است؟
- چه موضوعات و پرسش‌های مهمی جا افتاده که رقبا پوشش داده‌اند؟
- عنوان و متادیسکریپشن چقدر روی نرخ کلیک اثر می‌گذارند؟

قواعد:
- همه‌ی خروجی را به زبان فارسی بنویس.
- مشخص و عملی باش. به جای «محتوا را بهبود دهید» بنویس دقیقاً چه چیزی، کجا و چگونه.
- فقط بر اساس متنی که به تو داده شده قضاوت کن؛ چیزی از خودت نساز.
- اگر متن استخراج‌شده ناقص به نظر می‌رسد، همین را در ارزیابی کلی ذکر کن.
- پیشنهادها را بر اساس تأثیر واقعی روی رتبه اولویت‌بندی کن.

بسیار مهم — قالب خروجی:
پاسخ تو باید **فقط و فقط یک شیء JSON معتبر** باشد، بدون هیچ متن توضیحی قبل یا بعد از آن، و بدون بلاک کد (بدون \`\`\`). دقیقاً از این ساختار پیروی کن:

{
  "overallAssessment": "ارزیابی کلی محتوا در ۲ تا ۴ جمله",
  "contentQualityScore": عددی صحیح بین ۱ تا ۱۰,
  "searchIntentMatch": یکی از این مقادیر: "کامل" یا "نسبی" یا "ضعیف",
  "searchIntentNote": "توضیح کوتاه درباره‌ی تطابق با قصد جستجو",
  "strengths": ["نقطه قوت ۱", "نقطه قوت ۲"],
  "contentGaps": ["موضوع جاافتاده ۱", "موضوع جاافتاده ۲"],
  "recommendations": [
    {
      "title": "عنوان کوتاه پیشنهاد",
      "why": "چرا این کار مهم است",
      "how": "دقیقاً چگونه انجام شود",
      "priority": یکی از این مقادیر: "بالا" یا "متوسط" یا "پایین"
    }
  ],
  "titleSuggestions": ["عنوان جایگزین ۱", "عنوان جایگزین ۲"],
  "metaDescriptionSuggestion": "یک متادیسکریپشن پیشنهادی ۱۲۰ تا ۱۶۰ نویسه‌ای"
}

قواعد ساختار: strengths بین ۲ تا ۵ مورد، contentGaps بین ۲ تا ۵ مورد، recommendations بین ۳ تا ۶ مورد، titleSuggestions بین ۲ تا ۳ مورد.`;

/** داده‌های تحلیل را به یک متن فشرده برای مدل تبدیل می‌کند. */
function buildPrompt(article, report) {
  const { stats } = report;
  const body =
    article.bodyText.length > MAX_BODY_CHARS
      ? `${article.bodyText.slice(0, MAX_BODY_CHARS)}\n\n[... متن به دلیل طول زیاد کوتاه شده است ...]`
      : article.bodyText;

  return `# اطلاعات مقاله

- آدرس: ${stats.url}
- کلمه کلیدی هدف: ${stats.keyword}
- عنوان (Title): ${stats.title || '— ندارد —'}
- متادیسکریپشن: ${stats.metaDescription || '— ندارد —'}

# آمار سئو

- تعداد کلمات: ${stats.wordCount}
- زمان مطالعه: ${stats.readingMinutes} دقیقه
- تعداد پاراگراف: ${stats.paragraphCount} | میانگین طول پاراگراف: ${stats.avgParagraphLength} کلمه
- میانگین طول جمله: ${stats.avgSentenceLength} کلمه
- هدینگ‌ها: H1=${stats.headingCounts.h1}، H2=${stats.headingCounts.h2}، H3=${stats.headingCounts.h3}
- تکرار کلمه کلیدی: ${stats.keywordOccurrences} بار (چگالی ${stats.keywordDensity}٪)
- لینک داخلی: ${stats.internalLinkCount} | لینک خارجی: ${stats.externalLinkCount}
- تصاویر: ${stats.imageCount} (بدون alt: ${stats.imagesWithoutAlt})
- امتیاز خودکار سئو: ${report.score}/100 (${report.grade.fa})

# ساختار هدینگ‌ها

${article.headingSequence.map((h) => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text}`).join('\n') || '— هیچ هدینگی یافت نشد —'}

# مشکلات شناسایی‌شده توسط تحلیل خودکار

${report.issues.map((i) => `- ${i.label}: ${i.detail}`).join('\n') || '— موردی نبود —'}

# متن مقاله

${body}

---

بر اساس داده‌های بالا، تحلیل تخصصی خود را ارائه بده و فقط شیء JSON خواسته‌شده را برگردان.`;
}

/**
 * از پاسخ مدل، شیء JSON را استخراج می‌کند.
 * مقاوم در برابر بلاک‌های reasoning (<think>...</think>)، حصار کد (```json)
 * و متن اضافی قبل/بعد از JSON.
 */
function extractJson(raw) {
  let text = String(raw || '').trim();

  // حذف بلاک‌های تفکر مدل‌های reasoning
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // حذف حصار کد
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  // اگر هنوز متن اضافه هست، از اولین { تا آخرین } را جدا می‌کنیم
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }

  return JSON.parse(text);
}

/**
 * تحلیل هوشمند محتوا با استفاده از یک مدل سازگار با OpenAI (پیش‌فرض: NVIDIA / GLM).
 * @param {object} article خروجی parseArticle
 * @param {object} report خروجی analyze
 * @returns {Promise<object>} تحلیل ساختاریافته
 */
export async function analyzeWithAI(article, report) {
  const apiKey = getApiKey();
  if (!apiKey && !isLocalEndpoint()) {
    throw new Error(
      'کلید API تنظیم نشده است. متغیر GROQ_API_KEY را در فایل .env قرار دهید.'
    );
  }

  // درخواست‌های ابری را از پروکسی عبور می‌دهیم؛ endpoint محلی (Ollama) مستقیم می‌ماند.
  const useProxy = proxyAgent && !isLocalEndpoint();
  const proxiedFetch = useProxy
    ? (url, init = {}) => undiciFetch(url, { ...init, dispatcher: proxyAgent })
    : undefined;

  // Ollama محلی نیازی به کلید ندارد؛ SDK اوپن‌ای‌آی یک مقدار غیرخالی می‌خواهد.
  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: BASE_URL,
    fetch: proxiedFetch,
  });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(article, report) },
      ],
      temperature: 0.4,
      top_p: 0.9,
      max_tokens: MAX_TOKENS,
    });
  } catch (err) {
    // پیام‌های خطای واضح برای مشکلات رایج
    const status = err?.status;
    if (status === 401 || status === 403) {
      throw new Error(
        'دسترسی رد شد (۴۰۱/۴۰۳). کلید API را بررسی کنید؛ اگر پشت فیلترشکن هستید AI_PROXY را در .env تنظیم کنید.'
      );
    }
    if (status === 413) {
      throw new Error(
        'حجم درخواست از سقف رایگان مدل بیشتر شد. مقدار AI_MAX_BODY_CHARS را در .env کمتر کنید یا مقاله‌ی کوتاه‌تری امتحان کنید.'
      );
    }
    if (status === 429) {
      throw new Error(
        'به محدودیت نرخ سرویس رسیدید (۴۲۹). چند لحظه صبر کنید و دوباره امتحان کنید.'
      );
    }
    const code = status ? ` (کد ${status})` : '';
    throw new Error(`ارتباط با سرویس هوش مصنوعی ناموفق بود${code}: ${err.message}`);
  }

  const content = completion?.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error('پاسخ خالی از مدل هوش مصنوعی دریافت شد.');
  }

  try {
    return extractJson(content);
  } catch {
    throw new Error('خروجی مدل هوش مصنوعی یک JSON معتبر نبود.');
  }
}
