# پلن اجرای بهبود ظاهر و بخش هوش مصنوعی

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** گزارش سئو بلافاصله نمایش داده شود و تحلیل AI جداگانه و مقاوم‌شده بارگذاری شود، همراه با پولیش بصری بدون تغییر ساختار صفحه.

**Architecture:** یک درخواست بلند به دو درخواست شکسته می‌شود: `/api/analyze` گزارش را سریع برمی‌گرداند و مقالهٔ پارس‌شده را با یک `analysisId` در حافظه cache می‌کند؛ `/api/ai` با همان شناسه فقط مدل را صدا می‌زند. خروجی مدل قبل از رسیدن به UI از یک نرمال‌ساز عبور می‌کند که شکل داده را تضمین می‌کند.

**Tech Stack:** Node 20+، Express 4، HTML/CSS/JS خالص بدون build step، `node --test` برای تست‌ها.

## Global Constraints

- بدون افزودن هیچ dependency جدید به `package.json`. تست‌ها با `node --test` داخلی نوشته می‌شوند.
- بدون build step و بدون فریمورک فرانت‌اند. فایل‌های `public/` مستقیم سرو می‌شوند.
- ساختار `public/index.html` حفظ می‌شود؛ فقط لینک فونت، کلید تم و مارک‌آپ اسکلتون اضافه می‌شود.
- تمام متن‌های رو به کاربر فارسی‌اند.
- خطای AI هرگز نباید گزارش سئو را از بین ببرد.
- انیمیشن‌ها باید `prefers-reduced-motion: reduce` را رعایت کنند.
- `src/ai.js` کلید را از `AI_API_KEY` یا `OPENAI_API_KEY` می‌خواند — هیچ متن جدیدی نباید `GROQ_API_KEY` را ذکر کند.

---

### Task 1: نرمال‌سازی خروجی مدل

**Files:**
- Modify: `src/ai.js`
- Modify: `package.json` (افزودن اسکریپت `test`)
- Test: `test/normalize-ai-result.test.js`

**Interfaces:**
- Consumes: چیزی از تسک‌های قبلی.
- Produces: `normalizeAIResult(raw) -> NormalizedAI` که از `src/ai.js` export می‌شود.
  `NormalizedAI = { overallAssessment: string, contentQualityScore: number|null, searchIntentMatch: string, searchIntentNote: string, strengths: string[], contentGaps: string[], recommendations: {title,why,how,priority}[], titleSuggestions: string[], metaDescriptionSuggestion: string }`.
  تسک ۳ و ۶ به این شکل تکیه می‌کنند.

- [ ] **Step 1: افزودن اسکریپت تست به `package.json`**

در بخش `scripts`، بعد از `"dev"`، این خط اضافه شود:

```json
    "test": "node --test"
```

- [ ] **Step 2: نوشتن تست شکست‌خورده**

فایل `test/normalize-ai-result.test.js` ساخته شود:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAIResult } from '../src/ai.js';

const valid = {
  overallAssessment: 'متن ارزیابی',
  contentQualityScore: 7,
  searchIntentMatch: 'کامل',
  searchIntentNote: 'یادداشت',
  strengths: ['الف', 'ب'],
  contentGaps: ['پ'],
  recommendations: [{ title: 'ت', why: 'چون', how: 'اینطور', priority: 'بالا' }],
  titleSuggestions: ['عنوان'],
  metaDescriptionSuggestion: 'توضیح',
};

test('پاسخ معتبر را دست‌نخورده نگه می‌دارد', () => {
  assert.deepEqual(normalizeAIResult(valid), valid);
});

test('رشته به‌جای آرایه را به آرایه تبدیل می‌کند', () => {
  const result = normalizeAIResult({ ...valid, strengths: 'تنها یک مورد' });
  assert.deepEqual(result.strengths, ['تنها یک مورد']);
});

test('آیتم‌های غیررشته‌ای و خالی را از آرایه حذف می‌کند', () => {
  const result = normalizeAIResult({ ...valid, contentGaps: ['خوب', 42, null, '  ', 'هم خوب'] });
  assert.deepEqual(result.contentGaps, ['خوب', 'هم خوب']);
});

test('فیلدهای جاافتاده را با مقدار پیش‌فرض پر می‌کند', () => {
  const result = normalizeAIResult({ overallAssessment: 'فقط همین' });
  assert.equal(result.searchIntentNote, '');
  assert.deepEqual(result.strengths, []);
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.metaDescriptionSuggestion, '');
});

test('امتیاز خارج از بازه را clamp می‌کند', () => {
  assert.equal(normalizeAIResult({ ...valid, contentQualityScore: 99 }).contentQualityScore, 10);
  assert.equal(normalizeAIResult({ ...valid, contentQualityScore: -3 }).contentQualityScore, 1);
  assert.equal(normalizeAIResult({ ...valid, contentQualityScore: 7.6 }).contentQualityScore, 8);
});

test('امتیاز نامعتبر را null می‌کند', () => {
  assert.equal(normalizeAIResult({ ...valid, contentQualityScore: 'خوب' }).contentQualityScore, null);
  assert.equal(normalizeAIResult({ ...valid, contentQualityScore: null }).contentQualityScore, null);
  assert.equal(normalizeAIResult({ ...valid, contentQualityScore: '' }).contentQualityScore, null);
});

test('امتیاز عددی داخل رشته را می‌پذیرد', () => {
  assert.equal(normalizeAIResult({ ...valid, contentQualityScore: '6' }).contentQualityScore, 6);
});

test('قصد جستجوی نامعتبر را «نامشخص» می‌کند', () => {
  assert.equal(normalizeAIResult({ ...valid, searchIntentMatch: 'عالی' }).searchIntentMatch, 'نامشخص');
});

test('اولویت نامعتبر را «متوسط» می‌کند', () => {
  const result = normalizeAIResult({
    ...valid,
    recommendations: [{ title: 'ت', why: 'چ', how: 'چط', priority: 'فوری' }],
  });
  assert.equal(result.recommendations[0].priority, 'متوسط');
});

test('پیشنهاد بدون عنوان را حذف می‌کند', () => {
  const result = normalizeAIResult({
    ...valid,
    recommendations: [{ why: 'بی‌عنوان' }, 'رشته', null, { title: 'معتبر' }],
  });
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].title, 'معتبر');
  assert.equal(result.recommendations[0].why, '');
});

test('پاسخ بی‌ربط را رد می‌کند', () => {
  assert.throws(() => normalizeAIResult({ foo: 'bar' }), /فیلدهای مورد انتظار/);
  assert.throws(() => normalizeAIResult(null), /قابل استفاده نبود/);
  assert.throws(() => normalizeAIResult([1, 2]), /قابل استفاده نبود/);
});
```

- [ ] **Step 3: اجرای تست برای اطمینان از شکست**

```bash
npm test
```

Expected: FAIL — `normalizeAIResult` از `src/ai.js` export نشده (`SyntaxError: The requested module does not provide an export named 'normalizeAIResult'`).

- [ ] **Step 4: پیاده‌سازی `normalizeAIResult`**

در `src/ai.js`، بلافاصله **بعد از** تابع `extractJson` این کد اضافه شود:

```js
const INTENT_VALUES = ['کامل', 'نسبی', 'ضعیف'];
const PRIORITY_VALUES = ['بالا', 'متوسط', 'پایین'];
const AI_FIELDS = [
  'overallAssessment',
  'contentQualityScore',
  'searchIntentMatch',
  'searchIntentNote',
  'strengths',
  'contentGaps',
  'recommendations',
  'titleSuggestions',
  'metaDescriptionSuggestion',
];

/** هر مقداری را به رشته‌ی تمیز تبدیل می‌کند؛ غیررشته‌ها رشته‌ی خالی می‌شوند. */
function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** مقدار را به آرایه‌ی رشته تبدیل می‌کند؛ رشته‌ی تکی در آرایه پیچیده می‌شود. */
function toTextList(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return list.map(toText).filter(Boolean);
}

/**
 * امتیاز را به عدد صحیح ۱ تا ۱۰ می‌برد؛ نامعتبر را null می‌کند.
 * عمداً از Number(value) خام استفاده نمی‌شود چون Number(null) برابر صفر است
 * و امتیاز نداشته را به ۱ تبدیل می‌کرد.
 */
function toScore(value) {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim()) n = Number(value.trim());

  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

/** یک پیشنهاد را نرمال می‌کند؛ بدون عنوان معتبر null برمی‌گرداند. */
function toRecommendation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const title = toText(value.title);
  if (!title) return null;
  const priority = toText(value.priority);
  return {
    title,
    why: toText(value.why),
    how: toText(value.how),
    priority: PRIORITY_VALUES.includes(priority) ? priority : 'متوسط',
  };
}

/**
 * شکل خروجی مدل را تضمین می‌کند تا رابط کاربری به داده‌ی مدل اعتماد نکند.
 * @param {unknown} raw خروجی پارس‌شده‌ی مدل
 * @returns {object} شیء با فیلدهای تضمین‌شده
 */
export function normalizeAIResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('ساختار پاسخ هوش مصنوعی قابل استفاده نبود.');
  }

  if (!AI_FIELDS.some((field) => field in raw)) {
    throw new Error('پاسخ هوش مصنوعی هیچ‌کدام از فیلدهای مورد انتظار را نداشت.');
  }

  const intent = toText(raw.searchIntentMatch);
  const rawRecs = Array.isArray(raw.recommendations) ? raw.recommendations : [];

  return {
    overallAssessment: toText(raw.overallAssessment),
    contentQualityScore: toScore(raw.contentQualityScore),
    searchIntentMatch: INTENT_VALUES.includes(intent) ? intent : 'نامشخص',
    searchIntentNote: toText(raw.searchIntentNote),
    strengths: toTextList(raw.strengths),
    contentGaps: toTextList(raw.contentGaps),
    recommendations: rawRecs.map(toRecommendation).filter(Boolean),
    titleSuggestions: toTextList(raw.titleSuggestions),
    metaDescriptionSuggestion: toText(raw.metaDescriptionSuggestion),
  };
}
```

- [ ] **Step 5: اتصال نرمال‌ساز به `analyzeWithAI`**

در `src/ai.js`، بلوک انتهایی `analyzeWithAI` که الان این است:

```js
  try {
    return extractJson(content);
  } catch {
    // چاپ خروجی واقعی در کنسول برای خطایابی سریع
    console.error('--- خروجی خام هوش مصنوعی که JSON معتبر نبود: ---');
    console.error(content);
    console.error('--------------------------------------------------');
    throw new Error('خروجی مدل هوش مصنوعی یک JSON معتبر نبود.');
  }
```

با این جایگزین شود — خطای نرمال‌سازی نباید با پیام «JSON معتبر نبود» پوشانده شود:

```js
  let parsed;
  try {
    parsed = extractJson(content);
  } catch {
    // چاپ خروجی واقعی در کنسول برای خطایابی سریع
    console.error('--- خروجی خام هوش مصنوعی که JSON معتبر نبود: ---');
    console.error(content);
    console.error('--------------------------------------------------');
    throw new Error('خروجی مدل هوش مصنوعی یک JSON معتبر نبود.');
  }

  return normalizeAIResult(parsed);
```

- [ ] **Step 6: اجرای تست‌ها**

```bash
npm test
```

Expected: PASS — هر ۱۰ تست سبز.

- [ ] **Step 7: Commit**

```bash
git add src/ai.js package.json test/normalize-ai-result.test.js
git commit -m "feat: نرمال‌سازی خروجی مدل هوش مصنوعی"
```

---

### Task 2: حافظه‌ی موقت تحلیل

**Files:**
- Create: `src/analysis-cache.js`
- Test: `test/analysis-cache.test.js`

**Interfaces:**
- Consumes: چیزی از تسک‌های قبلی.
- Produces: `saveAnalysis(value, now?) -> string` و `getAnalysis(id, now?) -> value|null`.
  پارامتر `now` (میلی‌ثانیه) اختیاری است و فقط برای تست‌پذیریِ انقضا وجود دارد؛ پیش‌فرض `Date.now()`.
  تسک ۳ این دو تابع را مصرف می‌کند.

- [ ] **Step 1: نوشتن تست شکست‌خورده**

فایل `test/analysis-cache.test.js` ساخته شود:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAnalysis, getAnalysis, TTL_MS, MAX_ENTRIES } from '../src/analysis-cache.js';

test('مقدار ذخیره‌شده را با همان شناسه برمی‌گرداند', () => {
  const id = saveAnalysis({ hello: 'world' });
  assert.equal(typeof id, 'string');
  assert.deepEqual(getAnalysis(id), { hello: 'world' });
});

test('برای شناسه‌ی ناشناخته null برمی‌گرداند', () => {
  assert.equal(getAnalysis('does-not-exist'), null);
});

test('شناسه‌های متفاوت تولید می‌کند', () => {
  const a = saveAnalysis({ n: 1 });
  const b = saveAnalysis({ n: 2 });
  assert.notEqual(a, b);
  assert.deepEqual(getAnalysis(a), { n: 1 });
  assert.deepEqual(getAnalysis(b), { n: 2 });
});

test('پس از انقضا null برمی‌گرداند', () => {
  const now = 1_000_000;
  const id = saveAnalysis({ n: 1 }, now);
  assert.deepEqual(getAnalysis(id, now + TTL_MS - 1), { n: 1 });
  assert.equal(getAnalysis(id, now + TTL_MS), null);
});

test('با پر شدن ظرفیت، قدیمی‌ترین ورودی را حذف می‌کند', () => {
  const first = saveAnalysis({ tag: 'first' });
  for (let i = 0; i < MAX_ENTRIES; i += 1) saveAnalysis({ tag: i });
  assert.equal(getAnalysis(first), null);
});
```

- [ ] **Step 2: اجرای تست برای اطمینان از شکست**

```bash
npm test
```

Expected: FAIL — `Cannot find module ... src/analysis-cache.js`.

- [ ] **Step 3: پیاده‌سازی حافظه‌ی موقت**

فایل `src/analysis-cache.js` ساخته شود:

```js
import { randomUUID } from 'node:crypto';

/** مدت اعتبار هر تحلیل؛ پس از آن باید دوباره تحلیل شود. */
export const TTL_MS = 10 * 60 * 1000;

/** سقف تعداد تحلیل‌های نگه‌داشته‌شده در حافظه. */
export const MAX_ENTRIES = 50;

// ابزار تک‌کاربره و محلی است؛ حافظه‌ی فرآیند کافی است و نیازی به ذخیره‌سازی پایدار نیست.
const store = new Map();

/** ورودی‌های منقضی را پاک می‌کند. */
function sweep(now) {
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

/**
 * یک تحلیل را ذخیره و شناسه‌ی آن را برمی‌گرداند.
 * @param {object} value داده‌ی تحلیل
 * @param {number} [now] زمان فعلی به میلی‌ثانیه (فقط برای تست)
 * @returns {string} شناسه‌ی تحلیل
 */
export function saveAnalysis(value, now = Date.now()) {
  sweep(now);

  // Map ترتیب درج را نگه می‌دارد، پس اولین کلید قدیمی‌ترین ورودی است.
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }

  const id = randomUUID();
  store.set(id, { value, expiresAt: now + TTL_MS });
  return id;
}

/**
 * تحلیل ذخیره‌شده را برمی‌گرداند؛ اگر نبود یا منقضی شده باشد null.
 * @param {string} id شناسه‌ی تحلیل
 * @param {number} [now] زمان فعلی به میلی‌ثانیه (فقط برای تست)
 * @returns {object|null}
 */
export function getAnalysis(id, now = Date.now()) {
  const entry = store.get(id);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    store.delete(id);
    return null;
  }

  return entry.value;
}
```

- [ ] **Step 4: اجرای تست‌ها**

```bash
npm test
```

Expected: PASS — تست‌های هر دو فایل سبز.

- [ ] **Step 5: Commit**

```bash
git add src/analysis-cache.js test/analysis-cache.test.js
git commit -m "feat: حافظه موقت تحلیل برای جریان دو مرحله‌ای"
```

---

### Task 3: جریان دو مرحله‌ای در سرور

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `saveAnalysis`/`getAnalysis` از تسک ۲، `analyzeWithAI`/`isAIConfigured` از `src/ai.js`.
- Produces: `POST /api/analyze` که `{ ...report, analysisId, aiConfigured }` برمی‌گرداند، و `POST /api/ai` که با بدنه‌ی `{ analysisId }` یکی از `{ ai }` یا `{ error }` برمی‌گرداند. تسک ۴ این قرارداد را مصرف می‌کند.

- [ ] **Step 1: افزودن import حافظه‌ی موقت**

در `server.js` بعد از خط `import { analyzeWithAI, isAIConfigured } from './src/ai.js';` اضافه شود:

```js
import { saveAnalysis, getAnalysis } from './src/analysis-cache.js';
```

- [ ] **Step 2: حذف فراخوانی AI از `/api/analyze`**

در `server.js` این بلوک (که با کامنت `// ۳) تحلیل هوش مصنوعی` شروع می‌شود) به‌طور کامل حذف شود:

```js
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
```

و با این جایگزین شود:

```js
  // ۳) نگه‌داشتن مقاله برای مرحله‌ی دوم (تحلیل هوش مصنوعی)
  const analysisId = saveAnalysis({ article, report });

  res.json({ ...report, analysisId, aiConfigured: isAIConfigured() });
```

- [ ] **Step 3: حذف پارامتر بلااستفاده‌ی `useAI`**

خط استخراج بدنه در `/api/analyze` که الان این است:

```js
  const { url, keyword, useAI = true } = req.body || {};
```

به این تغییر کند — تصمیم درباره‌ی AI حالا سمت کلاینت گرفته می‌شود:

```js
  const { url, keyword } = req.body || {};
```

- [ ] **Step 4: افزودن اندپوینت `/api/ai`**

بلافاصله بعد از بسته‌شدن `app.post('/api/analyze', ...)` اضافه شود:

```js
app.post('/api/ai', async (req, res) => {
  const { analysisId } = req.body || {};
  const entry = getAnalysis(String(analysisId || ''));

  if (!entry) {
    return res
      .status(404)
      .json({ error: 'نتیجه‌ی این تحلیل منقضی شده است. لطفاً دوباره تحلیل کنید.' });
  }

  if (!isAIConfigured()) {
    return res.json({
      error: 'کلید API تنظیم نشده است (AI_API_KEY را در فایل .env بگذارید).',
    });
  }

  // خطای هوش مصنوعی نباید گزارش سئو را از بین ببرد؛ با کد ۲۰۰ و فیلد error برمی‌گردد.
  try {
    const ai = await analyzeWithAI(entry.article, entry.report);
    res.json({ ai });
  } catch (err) {
    res.json({ error: err.message });
  }
});
```

- [ ] **Step 5: رفع پیام منسوخ هنگام بالا آمدن سرور**

در `server.js` خط هشدار که الان این است:

```js
    console.warn('⚠️  کلید هوش مصنوعی تنظیم نشده — GROQ_API_KEY را در .env بگذارید (بقیه‌ی گزارش کار می‌کند).');
```

به این تغییر کند:

```js
    console.warn('⚠️  کلید هوش مصنوعی تنظیم نشده — AI_API_KEY را در .env بگذارید (بقیه‌ی گزارش کار می‌کند).');
```

- [ ] **Step 6: تست دستی اندپوینت‌ها**

سرور در یک ترمینال اجرا شود:

```bash
npm start
```

سپس در ترمینال دیگر:

```bash
curl -s -X POST http://localhost:3000/api/analyze -H 'Content-Type: application/json' -d '{"url":"https://example.com","keyword":"example"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('score:',j.score,'analysisId:',typeof j.analysisId,'aiConfigured:',j.aiConfigured)})"
```

Expected: خطی مثل `score: 45 analysisId: string aiConfigured: true` — یعنی گزارش بدون انتظار برای AI برگشته است.

سپس شناسه‌ی نامعتبر بررسی شود:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/ai -H 'Content-Type: application/json' -d '{"analysisId":"nope"}'
```

Expected: `404`

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat: جریان دو مرحله‌ای تحلیل و اندپوینت جداگانه هوش مصنوعی"
```

---

### Task 4: جریان دو مرحله‌ای در کلاینت

**Files:**
- Modify: `public/app.js:39-84` (هندلر submit و تابع `render`)
- Modify: `public/app.js:187-240` (تابع `renderAI`)
- Modify: `public/index.html` (مارک‌آپ اسکلتون داخل کارت AI)

**Interfaces:**
- Consumes: قرارداد `/api/analyze` و `/api/ai` از تسک ۳، و شکل `NormalizedAI` از تسک ۱.
- Produces: `renderAI({ ai, error })` با امضای جدید؛ تسک ۶ آن را بازنویسی می‌کند.

- [ ] **Step 1: افزودن مارک‌آپ اسکلتون به کارت AI**

در `public/index.html`، بلوک کارت AI که الان این است:

```html
        <div class="card ai-card" id="ai-card" hidden>
          <h3>تحلیل هوش مصنوعی</h3>
          <div id="ai-content"></div>
        </div>
```

با این جایگزین شود:

```html
        <div class="card ai-card" id="ai-card" hidden>
          <h3>تحلیل هوش مصنوعی</h3>
          <div id="ai-loading" class="ai-loading" hidden>
            <p class="ai-loading-text">در حال تحلیل با هوش مصنوعی… ممکن است تا یک دقیقه طول بکشد.</p>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-block"></div>
          </div>
          <div id="ai-content"></div>
        </div>
```

- [ ] **Step 2: بازنویسی هندلر submit برای دو مرحله**

در `public/app.js`، کل بلوک `form.addEventListener('submit', ...)` (خطوط ۳۹ تا ۷۵) با این جایگزین شود:

```js
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const url = document.getElementById('url').value.trim();
  const keyword = document.getElementById('keyword').value.trim();
  const useAI = document.getElementById('useAI').checked;

  submitBtn.disabled = true;
  submitBtn.textContent = 'در حال تحلیل…';
  resultsEl.hidden = true;
  setStatus('در حال دریافت و تحلیل صفحه…');

  try {
    // مرحله‌ی ۱: گزارش سئو — سریع است و بلافاصله نمایش داده می‌شود.
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, keyword }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'خطای ناشناخته رخ داد.');

    setStatus('');
    render(data);
    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // مرحله‌ی ۲: تحلیل هوش مصنوعی — کند است و جداگانه کارت خودش را پر می‌کند.
    if (useAI) {
      await loadAI(data.analysisId);
    } else {
      document.getElementById('ai-card').hidden = true;
    }
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'تحلیل کن';
  }
});

/** کارت هوش مصنوعی را جداگانه بارگذاری می‌کند؛ خطایش گزارش سئو را از بین نمی‌برد. */
async function loadAI(analysisId) {
  const card = document.getElementById('ai-card');
  const loading = document.getElementById('ai-loading');
  const content = document.getElementById('ai-content');

  card.hidden = false;
  loading.hidden = false;
  content.innerHTML = '';

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId }),
    });
    const data = await response.json();
    renderAI(data);
  } catch (err) {
    renderAI({ error: err.message });
  } finally {
    loading.hidden = true;
  }
}
```

- [ ] **Step 3: حذف `renderAI` از تابع `render`**

تابع `render` که الان این است:

```js
function render(data) {
  renderScore(data);
  renderSections(data.sections);
  renderStats(data.stats);
  renderFindings(data);
  renderRecommendations(data.recommendations);
  renderAI(data);
}
```

به این تغییر کند — AI دیگر بخشی از رندر مرحله‌ی اول نیست:

```js
function render(data) {
  renderScore(data);
  renderSections(data.sections);
  renderStats(data.stats);
  renderFindings(data);
  renderRecommendations(data.recommendations);
}
```

- [ ] **Step 4: تطبیق امضای `renderAI` با قرارداد جدید**

ابتدای تابع `renderAI` که الان این است:

```js
function renderAI(data) {
  const card = document.getElementById('ai-card');
  const content = document.getElementById('ai-content');

  if (data.aiError) {
    card.hidden = false;
    content.innerHTML = `<p class="ai-error">تحلیل هوش مصنوعی انجام نشد: ${escapeHtml(data.aiError)}</p>`;
    return;
  }

  if (!data.ai) {
    card.hidden = true;
    return;
  }

  const ai = data.ai;
  card.hidden = false;
```

با این جایگزین شود:

```js
function renderAI(data) {
  const card = document.getElementById('ai-card');
  const content = document.getElementById('ai-content');
  card.hidden = false;

  if (data.error) {
    content.innerHTML = `<p class="ai-error">تحلیل هوش مصنوعی انجام نشد: ${escapeHtml(data.error)}</p>`;
    return;
  }

  if (!data.ai) {
    content.innerHTML = '<p class="ai-error">پاسخی از هوش مصنوعی دریافت نشد.</p>';
    return;
  }

  const ai = data.ai;
```

- [ ] **Step 5: راستی‌آزمایی در مرورگر**

سرور با `npm start` اجرا شود، سپس در Browser pane آدرس `http://localhost:3000` باز شود. یک URL واقعی و یک کلمه کلیدی وارد و ثبت شود.

Expected:
- گزارش سئو در چند ثانیه ظاهر می‌شود (نه بعد از یک دقیقه).
- کارت AI بلافاصله با اسکلتون و متن «در حال تحلیل با هوش مصنوعی…» دیده می‌شود.
- پس از پایان، اسکلتون جای خود را به تحلیل می‌دهد.
- با برداشتن تیک AI، کارت AI اصلاً نمایش داده نمی‌شود و گزارش کامل است.

خطاهای کنسول با `read_console_messages` بررسی شود — باید خالی باشد.

- [ ] **Step 6: Commit**

```bash
git add public/app.js public/index.html
git commit -m "feat: بارگذاری جداگانه تحلیل هوش مصنوعی با اسکلتون"
```

---

### Task 5: پولیش بصری و کلید دارک‌مود

**Files:**
- Modify: `public/index.html` (لینک فونت، کلید تم)
- Modify: `public/style.css` (توکن‌ها، تایپوگرافی، حالت‌های تعاملی، اسکلتون)
- Modify: `public/app.js` (منطق کلید تم)

**Interfaces:**
- Consumes: مارک‌آپ اسکلتون از تسک ۴ (کلاس‌های `skeleton`، `skeleton-line`، `skeleton-block`).
- Produces: توکن‌های CSS `--surface`، `--surface-2`، `--accent-soft`، `--critical-soft`، `--warning-soft`، `--success-soft`، `--shadow`، و کلاس‌های `.skeleton*`. تسک ۶ از این توکن‌ها استفاده می‌کند.

- [ ] **Step 1: بارگذاری فونت وزیرمتن و افزودن کلید تم**

در `public/index.html` داخل `<head>`، **قبل از** `<link rel="stylesheet" href="style.css" />` اضافه شود:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
```

سپس بلوک `<header class="site-header">` که الان این است:

```html
    <header class="site-header">
      <h1>تحلیلگر سئوی مقالات</h1>
      <p>آدرس مقاله و کلمه کلیدی هدف را وارد کنید تا گزارش کامل سئو دریافت کنید.</p>
    </header>
```

با این جایگزین شود:

```html
    <header class="site-header">
      <div class="site-header-text">
        <h1>تحلیلگر سئوی مقالات</h1>
        <p>آدرس مقاله و کلمه کلیدی هدف را وارد کنید تا گزارش کامل سئو دریافت کنید.</p>
      </div>
      <button
        id="theme-toggle"
        class="theme-toggle"
        type="button"
        aria-label="تغییر پوسته روشن و تیره"
      >
        <span aria-hidden="true">🌓</span>
      </button>
    </header>
```

- [ ] **Step 2: جایگزینی بلوک توکن‌ها در CSS**

در `public/style.css`، خطوط ۱ تا ۲۲ (بلوک `:root` و `@media (prefers-color-scheme: dark)`) با این جایگزین شود:

```css
:root {
  color-scheme: light;

  --bg: #f4f6f9;
  --surface: #ffffff;
  --surface-2: #eef1f5;
  --text: #14161a;
  --muted: #636b78;
  --border: #e1e5ea;

  --accent: #2563eb;
  --accent-soft: rgba(37, 99, 235, 0.1);
  --critical: #d92d20;
  --critical-soft: rgba(217, 45, 32, 0.1);
  --warning: #d97706;
  --warning-soft: rgba(217, 119, 6, 0.12);
  --success: #159b5b;
  --success-soft: rgba(21, 155, 91, 0.12);

  --shimmer: rgba(255, 255, 255, 0.65);
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 6px 16px rgba(16, 24, 40, 0.06);

  --radius: 14px;
  --radius-sm: 10px;
}

/* پوسته‌ی تیره: هم خودکار (سیستم) و هم دستی از طریق data-theme */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;

    --bg: #0e1014;
    --surface: #171a20;
    --surface-2: #1f232b;
    --text: #e8eaed;
    --muted: #98a0ac;
    --border: #272c35;

    --accent: #5b8bff;
    --accent-soft: rgba(91, 139, 255, 0.14);
    --critical: #f87171;
    --critical-soft: rgba(248, 113, 113, 0.14);
    --warning: #fbbf24;
    --warning-soft: rgba(251, 191, 36, 0.14);
    --success: #4ade80;
    --success-soft: rgba(74, 222, 128, 0.14);

    --shimmer: rgba(255, 255, 255, 0.06);
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 6px 16px rgba(0, 0, 0, 0.35);
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;

  --bg: #0e1014;
  --surface: #171a20;
  --surface-2: #1f232b;
  --text: #e8eaed;
  --muted: #98a0ac;
  --border: #272c35;

  --accent: #5b8bff;
  --accent-soft: rgba(91, 139, 255, 0.14);
  --critical: #f87171;
  --critical-soft: rgba(248, 113, 113, 0.14);
  --warning: #fbbf24;
  --warning-soft: rgba(251, 191, 36, 0.14);
  --success: #4ade80;
  --success-soft: rgba(74, 222, 128, 0.14);

  --shimmer: rgba(255, 255, 255, 0.06);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 6px 16px rgba(0, 0, 0, 0.35);
}
```

- [ ] **Step 3: جایگزینی `--card` با `--surface` در کل فایل**

توکن `--card` در بلوک جدید وجود ندارد، پس هر سه استفاده‌ی آن باید به `var(--surface)` تغییر کند. با ابزار Edit و `replace_all` روی `public/style.css`:

- `old_string`: `var(--card)`
- `new_string`: `var(--surface)`
- `replace_all`: `true`

سه مورد تحت تأثیرند: قانون `.card`، `.status`، و `.score-ring::before`.

پس از ویرایش، تأیید شود که هیچ `--card` باقی نمانده:

```bash
grep -c 'var(--card)' public/style.css
```

Expected: `0`

- [ ] **Step 4: پولیش تایپوگرافی، کارت‌ها و حالت‌های تعاملی**

در `public/style.css`، قانون `body` که الان این است:

```css
body {
  margin: 0;
  padding: 0 1rem 4rem;
  background: var(--bg);
  color: var(--text);
  font-family: 'Vazirmatn', 'Segoe UI', Tahoma, sans-serif;
  line-height: 1.8;
}
```

به این تغییر کند:

```css
body {
  margin: 0;
  padding: 0 1rem 4rem;
  background: var(--bg);
  color: var(--text);
  font-family: 'Vazirmatn', 'Segoe UI', Tahoma, sans-serif;
  line-height: 1.85;
  -webkit-font-smoothing: antialiased;
}
```

قانون `.site-header` به این تغییر کند تا کلید تم در کنار عنوان بنشیند:

```css
.site-header {
  max-width: 980px;
  margin: 0 auto;
  padding: 2.5rem 0 1.5rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.site-header-text {
  min-width: 0;
}

.theme-toggle {
  flex: 0 0 auto;
  width: 2.6rem;
  height: 2.6rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease;
}

.theme-toggle:hover {
  background: var(--surface-2);
  border-color: var(--accent);
}
```

قانون `.card` به این تغییر کند:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  margin-bottom: 1.25rem;
  box-shadow: var(--shadow);
}
```

قانون `input[type='text']:focus` به این تغییر کند تا فقط هنگام پیمایش با کیبورد حلقه نشان دهد و در حالت عادی هم بازخورد بدهد:

```css
input[type='text']:hover {
  border-color: var(--muted);
}

input[type='text']:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
}

button:focus-visible,
.theme-toggle:focus-visible,
a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

قانون `button:hover:not(:disabled)` به این تغییر کند:

```css
button:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

button {
  transition: filter 150ms ease, transform 150ms ease;
}
```

**توجه:** قانون دوم باید با قانون `button` موجود (خط ~۱۰۸) ادغام شود، نه تکرار — خط `transition` به همان قانون اضافه شود.

قانون‌های کارت یافته‌ها برای استفاده از تینت‌ها:

```css
.finding-card.critical {
  background: linear-gradient(var(--critical-soft), var(--critical-soft)), var(--surface);
}
.finding-card.warning {
  background: linear-gradient(var(--warning-soft), var(--warning-soft)), var(--surface);
}
.finding-card.success {
  background: linear-gradient(var(--success-soft), var(--success-soft)), var(--surface);
}
```

قانون `.stat` برای بازخورد hover:

```css
.stat {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.75rem 0.9rem;
  transition: border-color 150ms ease;
}

.stat:hover {
  border-color: var(--accent);
}
```

- [ ] **Step 5: افزودن اسکلتون و انیمیشن حلقه‌ی امتیاز**

در انتهای `public/style.css` اضافه شود:

```css
/* ── اسکلتون لودینگ ──────────────────────────── */
.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--surface-2);
  border-radius: 8px;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(100%);
  background: linear-gradient(90deg, transparent, var(--shimmer), transparent);
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    transform: translateX(-100%);
  }
}

.skeleton-line {
  height: 0.9rem;
  margin-bottom: 0.6rem;
}

.skeleton-line.short {
  width: 55%;
}

.skeleton-block {
  height: 5rem;
  margin-top: 1rem;
}

.ai-loading-text {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.9rem;
}

/* ── انیمیشن پرشدن حلقه‌ی امتیاز ─────────────── */
@property --ring-deg {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.score-ring {
  transition: --ring-deg 900ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 6: افزودن منطق کلید تم**

در انتهای `public/app.js` اضافه شود:

```js
/* ── پوسته‌ی روشن/تیره ───────────────────────── */
const THEME_KEY = 'seo-analyzer-theme';

/** پوسته را اعمال می‌کند؛ مقدار null یعنی تبعیت از سیستم. */
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** پوسته‌ی فعلیِ مؤثر را برمی‌گرداند. */
function currentTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

applyTheme(localStorage.getItem(THEME_KEY));

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});
```

- [ ] **Step 7: راستی‌آزمایی در مرورگر**

سرور با `npm start` اجرا و `http://localhost:3000` باز شود.

Expected:
- متن‌ها با فونت وزیرمتن رندر می‌شوند (نه Tahoma) — با `javascript_tool` بررسی شود:
  `getComputedStyle(document.body).fontFamily` باید با `Vazirmatn` شروع شود.
- کلیک روی کلید تم بین روشن و تیره جابه‌جا می‌کند و پس از refresh حفظ می‌شود.
- با `resize_window` روی preset موبایل، هدر و کلید تم بدون سرریز نمایش داده می‌شوند.
- هنگام بارگذاری AI، اسکلتون شیمر حرکت می‌کند.
- حلقه‌ی امتیاز با انیمیشن پر می‌شود.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/style.css public/app.js
git commit -m "feat: پولیش بصری، فونت وزیرمتن و کلید دارک‌مود"
```

---

### Task 6: بازطراحی نمایش کارت هوش مصنوعی

**Files:**
- Modify: `public/app.js` (تابع `renderAI`)
- Modify: `public/style.css` (استایل‌های کارت AI)

**Interfaces:**
- Consumes: شکل `NormalizedAI` از تسک ۱، توکن‌های CSS از تسک ۵، امضای `renderAI({ai, error})` از تسک ۴.
- Produces: چیزی برای تسک‌های بعدی.

- [ ] **Step 1: بازنویسی بدنه‌ی `renderAI`**

در `public/app.js`، بخش بعد از `const ai = data.ai;` تا انتهای تابع `renderAI` با این جایگزین شود:

```js
  const block = (title, body) => `<div class="ai-block"><h4>${title}</h4>${body}</div>`;
  const bullets = (arr) =>
    arr.length
      ? `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
      : '<p class="empty">موردی ثبت نشد.</p>';

  // متنی که کاربر احتمالاً می‌خواهد کپی کند، با دکمه‌ی کپی کنار آن.
  const copyable = (text) =>
    `<div class="copyable">
       <span>${escapeHtml(text)}</span>
       <button type="button" class="copy-btn" data-copy="${escapeHtml(text)}">کپی</button>
     </div>`;

  const copyableList = (arr) =>
    arr.length ? arr.map(copyable).join('') : '<p class="empty">موردی ثبت نشد.</p>';

  const scoreBlock = () => {
    if (ai.contentQualityScore === null) return '';
    const percent = ai.contentQualityScore * 10;
    const color =
      percent >= 80 ? 'var(--success)' : percent >= 50 ? 'var(--warning)' : 'var(--critical)';
    return `
      <div class="ai-score">
        <div class="ai-score-head">
          <strong>${fa(ai.contentQualityScore)} از ۱۰</strong>
          <span>تطابق با قصد جستجو: <b>${escapeHtml(ai.searchIntentMatch)}</b></span>
        </div>
        <div class="ai-score-track">
          <i style="width:${percent}%;background:${color}"></i>
        </div>
        ${ai.searchIntentNote ? `<p class="ai-score-note">${escapeHtml(ai.searchIntentNote)}</p>` : ''}
      </div>`;
  };

  // مرتب‌سازی بر اساس اولویت تا مهم‌ترین پیشنهادها اول دیده شوند.
  const ORDER = { بالا: 0, متوسط: 1, پایین: 2 };
  const sorted = [...ai.recommendations].sort(
    (a, b) => ORDER[a.priority] - ORDER[b.priority]
  );

  const recs = sorted
    .map(
      (r) => `
      <div class="ai-rec ${PRIORITY_CLASS[r.priority] || 'medium'}">
        <div class="head">
          <strong>${escapeHtml(r.title)}</strong>
          <span class="priority ${PRIORITY_CLASS[r.priority] || 'medium'}">اولویت ${escapeHtml(r.priority)}</span>
        </div>
        ${r.why ? `<p><span>چرا:</span> ${escapeHtml(r.why)}</p>` : ''}
        ${r.how ? `<p><span>چگونه:</span> ${escapeHtml(r.how)}</p>` : ''}
      </div>`
    )
    .join('');

  content.innerHTML = [
    ai.overallAssessment ? block('ارزیابی کلی', `<p>${escapeHtml(ai.overallAssessment)}</p>`) : '',
    scoreBlock() ? block('کیفیت محتوا', scoreBlock()) : '',
    block('نقاط قوت محتوایی', bullets(ai.strengths)),
    block('موضوعات جاافتاده', bullets(ai.contentGaps)),
    block('پیشنهادهای تخصصی', recs || '<p class="empty">موردی ثبت نشد.</p>'),
    block('عناوین پیشنهادی', copyableList(ai.titleSuggestions)),
    block(
      'متادیسکریپشن پیشنهادی',
      ai.metaDescriptionSuggestion
        ? copyable(ai.metaDescriptionSuggestion)
        : '<p class="empty">موردی ثبت نشد.</p>'
    ),
  ]
    .filter(Boolean)
    .join('');
}
```

- [ ] **Step 2: افزودن هندلر دکمه‌های کپی**

در `public/app.js`، قبل از بلوک پوسته، اضافه شود:

```js
/* ── دکمه‌های کپی در کارت هوش مصنوعی ─────────── */
document.getElementById('ai-content').addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-btn');
  if (!button) return;

  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    const original = button.textContent;
    button.textContent = 'کپی شد';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove('copied');
    }, 1500);
  } catch {
    button.textContent = 'کپی نشد';
  }
});
```

- [ ] **Step 3: افزودن استایل‌های کارت AI**

در `public/style.css`، قانون‌های موجود `.ai-rec` و `.priority` حفظ می‌شوند و این‌ها در انتهای فایل اضافه می‌شود:

```css
/* ── تمایز بصری کارت هوش مصنوعی ──────────────── */
.ai-card {
  border-color: var(--accent);
  background: linear-gradient(var(--accent-soft), var(--accent-soft)), var(--surface);
}

.ai-card > h3::before {
  content: '✦ ';
  color: var(--accent);
}

/* متر امتیاز کیفیت */
.ai-score-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.ai-score-head strong {
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.ai-score-track {
  height: 10px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.ai-score-track > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 700ms ease-out;
}

.ai-score-note {
  margin: 0.6rem 0 0;
  color: var(--muted);
  font-size: 0.88rem;
}

/* نوار رنگی اولویت کنار هر پیشنهاد */
.ai-rec {
  border-inline-start-width: 4px;
}

.ai-rec.high {
  border-inline-start-color: var(--critical);
}
.ai-rec.medium {
  border-inline-start-color: var(--warning);
}
.ai-rec.low {
  border-inline-start-color: var(--muted);
}

/* متن‌های قابل کپی */
.copyable {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 0.9rem;
}

.copyable > span {
  flex: 1 1 auto;
  min-width: 0;
}

.copy-btn {
  flex: 0 0 auto;
  width: auto;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.copy-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.copy-btn.copied {
  border-color: var(--success);
  color: var(--success);
}
```

**توجه:** قانون عمومی `button` عرض ۱۰۰٪ می‌دهد؛ `.copy-btn` و `.theme-toggle` آن را با `width: auto` و `width: 2.6rem` بازنویسی می‌کنند. ترتیب قانون‌ها در فایل باید بعد از قانون `button` باشد.

- [ ] **Step 4: راستی‌آزمایی در مرورگر**

سرور اجرا و یک تحلیل با AI انجام شود.

Expected:
- کارت AI بردر accent و نشان ✦ دارد و از بقیه‌ی کارت‌ها متمایز است.
- امتیاز کیفیت به‌صورت نوار رنگی دیده می‌شود، نه متن خام.
- پیشنهادها از اولویت بالا به پایین مرتب‌اند و نوار رنگی کناری دارند.
- کلیک روی «کپی» متن را کپی و برچسب را به «کپی شد» تغییر می‌دهد؛ با `javascript_tool` بررسی شود:
  `navigator.clipboard.readText()` همان متن را برگرداند.
- در هر دو پوسته‌ی روشن و تیره خوانا باشد.

- [ ] **Step 5: تست مقاوم‌سازی در عمل**

برای اطمینان از اینکه UI با خروجی ناقص مدل کرش نمی‌کند، در کنسول مرورگر اجرا شود:

```js
renderAI({ ai: { overallAssessment: 'فقط همین فیلد', contentQualityScore: null,
  searchIntentMatch: 'نامشخص', searchIntentNote: '', strengths: [], contentGaps: [],
  recommendations: [], titleSuggestions: [], metaDescriptionSuggestion: '' } })
```

Expected: کارت بدون خطا رندر می‌شود، بلوک کیفیت محتوا حذف می‌شود و بقیه «موردی ثبت نشد.» نشان می‌دهند.

- [ ] **Step 6: اجرای کل تست‌ها و Commit**

```bash
npm test
```

Expected: PASS — همه‌ی تست‌های تسک ۱ و ۲ همچنان سبز.

```bash
git add public/app.js public/style.css
git commit -m "feat: بازطراحی نمایش کارت هوش مصنوعی با متر کیفیت و دکمه کپی"
```

---

## یادداشت اجرا

اصلاحات دور قبل (امن‌سازی `test.mjs`، به‌روزرسانی `.env.example`، حذف `undici`، رفع باگ کاراکترهای کنترلی در `extractJson`) هنوز commit نشده‌اند و روی همین شاخه در working tree هستند. **قبل از شروع تسک ۱** باید در یک commit جدا ثبت شوند:

```bash
git add .env.example .gitignore package.json package-lock.json src/ai.js
git commit -m "fix: امن‌سازی کلید API و پاک‌سازی پیکربندی"
```
