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
  setStatus(
    useAI
      ? 'در حال دریافت صفحه و تحلیل با هوش مصنوعی… این کار ممکن است تا یک دقیقه طول بکشد.'
      : 'در حال دریافت و تحلیل صفحه…'
  );

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, keyword, useAI }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'خطای ناشناخته رخ داد.');

    setStatus('');
    render(data);
    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'تحلیل کن';
  }
});

function render(data) {
  renderScore(data);
  renderSections(data.sections);
  renderStats(data.stats);
  renderFindings(data);
  renderRecommendations(data.recommendations);
  renderAI(data);
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

  const block = (title, body) => `<div class="ai-block"><h4>${title}</h4>${body}</div>`;
  const bullets = (arr) =>
    arr?.length
      ? `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
      : '<p class="empty">موردی ثبت نشد.</p>';

  const recs = (ai.recommendations || [])
    .map(
      (r) => `
      <div class="ai-rec">
        <div class="head">
          <strong>${escapeHtml(r.title)}</strong>
          <span class="priority ${PRIORITY_CLASS[r.priority] || 'low'}">اولویت ${escapeHtml(r.priority)}</span>
        </div>
        <p><span>چرا:</span> ${escapeHtml(r.why)}</p>
        <p><span>چگونه:</span> ${escapeHtml(r.how)}</p>
      </div>`
    )
    .join('');

  content.innerHTML = [
    block('ارزیابی کلی', `<p>${escapeHtml(ai.overallAssessment)}</p>`),
    block(
      'کیفیت محتوا',
      `<p>${fa(ai.contentQualityScore)} از ۱۰ — تطابق با قصد جستجو: <strong>${escapeHtml(ai.searchIntentMatch)}</strong><br />${escapeHtml(ai.searchIntentNote)}</p>`
    ),
    block('نقاط قوت محتوایی', bullets(ai.strengths)),
    block('موضوعات جاافتاده', bullets(ai.contentGaps)),
    block('پیشنهادهای تخصصی', recs || '<p class="empty">موردی ثبت نشد.</p>'),
    block('عناوین پیشنهادی', bullets(ai.titleSuggestions)),
    block(
      'متادیسکریپشن پیشنهادی',
      `<p>${escapeHtml(ai.metaDescriptionSuggestion || '')}</p>`
    ),
  ].join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}
