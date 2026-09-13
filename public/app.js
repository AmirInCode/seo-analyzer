const form = document.getElementById('analyze-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

const SECTION_LABELS = {
  content: 'محتوا (Content SEO)',
  technical: 'فنی (Technical SEO)',
  structure: 'ساختار (Structure SEO)',
  keyword: 'کلمه کلیدی (Keyword)',
  readability: 'خوانایی (Readability)',
  links: 'لینک‌ها (Links)',
};

const PRIORITY_CLASS = { بالا: 'high', متوسط: 'medium', پایین: 'low' };

/** عدد را با ارقام فارسی نمایش می‌دهد. */
const fa = (n) => Number(n).toLocaleString('fa-IR');

/**
 * ارقام لاتین داخل یک متن را به ارقام فارسی تبدیل می‌کند.
 * ارقامی که بلافاصله پس از حرف لاتین می‌آیند (مثل H1 و og:image) دست‌نخورده می‌مانند.
 */
const faDigits = (text) =>
  String(text ?? '')
    .replace(/(?<![A-Za-z])[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
    .replace(/(?<=[۰-۹])\.(?=[۰-۹])/g, '٫'); // جداکننده اعشار فارسی

function setStatus(message, isError = false) {
  if (!message) {
    statusEl.hidden = true;
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

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

function render(data) {
  renderScore(data);
  renderSections(data.sections);
  renderStats(data.stats);
  renderFindings(data);
  renderRecommendations(data.recommendations);
}

function renderScore(data) {
  const ring = document.getElementById('score-ring');
  ring.style.setProperty('--ring-color', data.grade.color);
  ring.style.setProperty('--ring-deg', `${(data.score / 100) * 360}deg`);

  document.getElementById('score-value').textContent = fa(data.score);

  const badge = document.getElementById('grade-badge');
  badge.textContent = `${data.grade.fa} — ${data.grade.label}`;
  badge.style.background = data.grade.color;

  document.getElementById('result-title').textContent =
    data.stats.title || '(بدون عنوان)';

  const link = document.getElementById('result-url');
  link.href = data.stats.url;
  link.textContent = data.stats.url;
}

function renderSections(sections) {
  const container = document.getElementById('sections');
  container.innerHTML = '';

  for (const [key, section] of Object.entries(sections)) {
    const percent = Math.round((section.score / section.maxScore) * 100);
    const color =
      percent >= 80 ? 'var(--success)' : percent >= 50 ? 'var(--warning)' : 'var(--critical)';

    const row = document.createElement('div');
    row.className = 'section-row';
    row.innerHTML = `
      <span class="name">${SECTION_LABELS[key] || key}</span>
      <span class="value">${fa(section.score)} از ${fa(section.maxScore)} — ${fa(percent)}٪</span>
      <div class="bar"><i style="width:${percent}%;background:${color}"></i></div>
    `;
    container.appendChild(row);
  }
}

function renderStats(stats) {
  const items = [
    ['تعداد کلمات', fa(stats.wordCount)],
    ['زمان مطالعه', `${fa(stats.readingMinutes)} دقیقه`],
    ['تعداد پاراگراف', fa(stats.paragraphCount)],
    ['میانگین طول جمله', `${fa(stats.avgSentenceLength)} کلمه`],
    ['میانگین طول پاراگراف', `${fa(stats.avgParagraphLength)} کلمه`],
    ['طول عنوان', `${fa(stats.titleLength)} نویسه`],
    ['طول متادیسکریپشن', `${fa(stats.metaDescriptionLength)} نویسه`],
    ['هدینگ H1 / H2 / H3', `${fa(stats.headingCounts.h1)} / ${fa(stats.headingCounts.h2)} / ${fa(stats.headingCounts.h3)}`],
    ['تکرار کلمه کلیدی', `${fa(stats.keywordOccurrences)} بار`],
    ['چگالی کلمه کلیدی', `${fa(stats.keywordDensity)}٪`],
    ['لینک داخلی', fa(stats.internalLinkCount)],
    ['لینک خارجی', fa(stats.externalLinkCount)],
    ['تصاویر', fa(stats.imageCount)],
    ['تصاویر بدون alt', fa(stats.imagesWithoutAlt)],
    ['داده ساختاریافته', stats.hasStructuredData ? 'دارد' : 'ندارد'],
    ['تگ‌های Open Graph', fa(stats.openGraphCount)],
  ];

  document.getElementById('stats').innerHTML = items
    .map(
      ([label, value]) =>
        `<div class="stat"><span class="label">${label}</span><span class="value">${value}</span></div>`
    )
    .join('');
}

function renderList(elementId, countId, items, emptyText) {
  const list = document.getElementById(elementId);
  document.getElementById(countId).textContent = fa(items.length);

  if (!items.length) {
    list.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }

  list.innerHTML = items
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.label)}</strong><span>${faDigits(escapeHtml(item.detail))}</span></li>`
    )
    .join('');
}

function renderFindings(data) {
  renderList('issues', 'issues-count', data.issues, 'مشکل مهمی یافت نشد. 🎉');
  renderList('warnings', 'warnings-count', data.warnings, 'هشداری وجود ندارد.');
  renderList('strengths', 'strengths-count', data.strengths, 'نقطه قوتی ثبت نشد.');
}

function renderRecommendations(recommendations) {
  const list = document.getElementById('recommendations');
  if (!recommendations.length) {
    list.innerHTML = '<p class="empty">پیشنهاد اصلاحی خاصی وجود ندارد.</p>';
    return;
  }
  list.innerHTML = recommendations
    .map((r) => `<li>${faDigits(escapeHtml(r))}</li>`)
    .join('');
}

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

/* ── دکمه‌های کپی در کارت هوش مصنوعی ─────────── */

/** روش قدیمی کپی؛ در محیط‌هایی کار می‌کند که Clipboard API رد می‌شود. */
function copyViaTextarea(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(textarea);
  return ok;
}

/**
 * متن را در کلیپ‌بورد می‌گذارد.
 * برخی مرورگرها و محیط‌های میزبان Clipboard API را رد می‌کنند،
 * پس در صورت شکست به روش قدیمی برمی‌گردیم.
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaTextarea(text);
  }
}

document.getElementById('ai-content').addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-btn');
  if (!button) return;

  const ok = await copyText(button.dataset.copy);

  button.textContent = ok ? 'کپی شد' : 'کپی نشد';
  button.classList.toggle('copied', ok);
  setTimeout(() => {
    button.textContent = 'کپی';
    button.classList.remove('copied');
  }, 1500);
});

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
