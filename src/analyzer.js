import { countWords, splitSentences } from './parser.js';

/**
 * وزن هر بخش از امتیاز نهایی (جمع = ۱۰۰)
 */
export const WEIGHTS = {
  content: 20,
  technical: 20,
  structure: 15,
  keyword: 20,
  readability: 15,
  links: 10,
};

const WORDS_PER_MINUTE = 200;

/**
 * متن را برای مقایسه‌ی کلمه کلیدی یکدست می‌کند:
 * حروف عربی به فارسی، حذف اعراب، حذف نیم‌فاصله، حروف کوچک.
 */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ؤئ]/g, 'ی')
    .replace(/[ً-ْٰ]/g, '') // اعراب
    .replace(/‌/g, ' ') // نیم‌فاصله
    .replace(/[.,،؛;:!?؟()«»"'\-–—_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** بررسی می‌کند آیا کلمه کلیدی در متن آمده است. */
function contains(haystack, keyword) {
  const h = normalize(haystack);
  const k = normalize(keyword);
  if (!h || !k) return false;
  return h.includes(k);
}

/** تعداد تکرار کلمه کلیدی در متن. */
function countOccurrences(text, keyword) {
  const h = normalize(text);
  const k = normalize(keyword);
  if (!h || !k) return 0;
  let count = 0;
  let index = h.indexOf(k);
  while (index !== -1) {
    count++;
    index = h.indexOf(k, index + k.length);
  }
  return count;
}

/** یک سازنده‌ی کمکی برای جمع‌آوری نتایج هر بخش. */
function section(maxScore) {
  return {
    score: 0,
    maxScore,
    checks: [],
    /** @param {string} label @param {boolean|'warn'} status @param {string} detail @param {number} points */
    add(label, status, detail, points) {
      this.checks.push({ label, status, detail, points });
      if (status === true) this.score += points;
      else if (status === 'warn') this.score += Math.round(points / 2);
    },
  };
}

// ─────────────────────────────────────────────────────────────
// ۱. Content SEO — طول مقاله، کیفیت محتوا، ساختار پاراگراف‌ها
// ─────────────────────────────────────────────────────────────
function analyzeContent(data) {
  const s = section(WEIGHTS.content);
  const { wordCount, paragraphs } = data;

  // طول مقاله (۱۰ امتیاز)
  if (wordCount >= 1200) {
    s.add('طول مقاله', true, `${wordCount} کلمه — طول عالی برای محتوای جامع.`, 10);
  } else if (wordCount >= 600) {
    s.add('طول مقاله', true, `${wordCount} کلمه — طول مناسب.`, 8);
  } else if (wordCount >= 300) {
    s.add('طول مقاله', 'warn', `${wordCount} کلمه — کوتاه است؛ حداقل ۶۰۰ کلمه توصیه می‌شود.`, 10);
  } else {
    s.add('طول مقاله', false, `${wordCount} کلمه — بسیار کوتاه (محتوای کم‌ارزش).`, 10);
  }

  // کیفیت محتوا: تنوع واژگان (۵ امتیاز)
  const words = normalize(data.bodyText).split(' ').filter(Boolean);
  const uniqueRatio = words.length ? new Set(words).size / words.length : 0;
  const richness = Math.round(uniqueRatio * 100);
  if (uniqueRatio >= 0.4) {
    s.add('تنوع واژگان', true, `${richness}٪ واژه‌های یکتا — محتوای غنی و غیرتکراری.`, 5);
  } else if (uniqueRatio >= 0.25) {
    s.add('تنوع واژگان', 'warn', `${richness}٪ واژه‌های یکتا — تا حدی تکراری است.`, 5);
  } else {
    s.add('تنوع واژگان', false, `${richness}٪ واژه‌های یکتا — محتوا بیش از حد تکراری است.`, 5);
  }

  // ساختار پاراگراف‌ها (۵ امتیاز)
  if (paragraphs.length >= 5) {
    s.add('ساختار پاراگراف‌ها', true, `${paragraphs.length} پاراگراف — متن به‌خوبی تفکیک شده.`, 5);
  } else if (paragraphs.length >= 2) {
    s.add('ساختار پاراگراف‌ها', 'warn', `فقط ${paragraphs.length} پاراگراف — متن را بیشتر بشکنید.`, 5);
  } else {
    s.add('ساختار پاراگراف‌ها', false, 'متن پاراگراف‌بندی نشده است.', 5);
  }

  return s;
}

// ─────────────────────────────────────────────────────────────
// ۲. Technical SEO — Title، Meta Description، Canonical، Open Graph
// ─────────────────────────────────────────────────────────────
function analyzeTechnical(data) {
  const s = section(WEIGHTS.technical);
  const { title, metaDescription, canonical, openGraph } = data;

  // Title (۷ امتیاز)
  const titleLen = title.length;
  if (!title) {
    s.add('تگ Title', false, 'صفحه تگ title ندارد.', 7);
  } else if (titleLen >= 30 && titleLen <= 60) {
    s.add('تگ Title', true, `${titleLen} نویسه — طول ایده‌آل.`, 7);
  } else if (titleLen < 30) {
    s.add('تگ Title', 'warn', `${titleLen} نویسه — کوتاه است (۳۰ تا ۶۰ توصیه می‌شود).`, 7);
  } else {
    s.add('تگ Title', 'warn', `${titleLen} نویسه — در نتایج گوگل بریده می‌شود.`, 7);
  }

  // Meta Description (۷ امتیاز)
  const descLen = metaDescription.length;
  if (!metaDescription) {
    s.add('Meta Description', false, 'متادیسکریپشن تعریف نشده است.', 7);
  } else if (descLen >= 120 && descLen <= 160) {
    s.add('Meta Description', true, `${descLen} نویسه — طول ایده‌آل.`, 7);
  } else if (descLen < 120) {
    s.add('Meta Description', 'warn', `${descLen} نویسه — کوتاه است (۱۲۰ تا ۱۶۰ توصیه می‌شود).`, 7);
  } else {
    s.add('Meta Description', 'warn', `${descLen} نویسه — بلند است و بریده می‌شود.`, 7);
  }

  // Canonical (۳ امتیاز)
  if (canonical) {
    s.add('تگ Canonical', true, 'آدرس canonical تعریف شده است.', 3);
  } else {
    s.add('تگ Canonical', false, 'canonical ندارد — خطر محتوای تکراری.', 3);
  }

  // Open Graph (۳ امتیاز)
  if (openGraph.count >= 4) {
    s.add('Open Graph', true, `${openGraph.count} تگ OG — اشتراک‌گذاری در شبکه‌های اجتماعی بهینه است.`, 3);
  } else if (openGraph.count >= 2) {
    s.add('Open Graph', 'warn', `فقط ${openGraph.count} تگ OG تعریف شده است.`, 3);
  } else {
    s.add('Open Graph', false, 'تگ‌های Open Graph تعریف نشده‌اند.', 3);
  }

  return s;
}

// ─────────────────────────────────────────────────────────────
// ۳. Structure SEO — H1، H2، H3، سلسله‌مراتب هدینگ‌ها
// ─────────────────────────────────────────────────────────────
function analyzeStructure(data) {
  const s = section(WEIGHTS.structure);
  const { headings, headingSequence } = data;

  // H1 (۵ امتیاز)
  if (headings.h1.length === 1) {
    s.add('تگ H1', true, 'دقیقاً یک H1 وجود دارد.', 5);
  } else if (headings.h1.length === 0) {
    s.add('تگ H1', false, 'صفحه H1 ندارد.', 5);
  } else {
    s.add('تگ H1', false, `${headings.h1.length} تگ H1 وجود دارد — باید فقط یکی باشد.`, 5);
  }

  // H2 (۴ امتیاز)
  if (headings.h2.length >= 3) {
    s.add('تگ‌های H2', true, `${headings.h2.length} زیرعنوان H2 — ساختار مناسب.`, 4);
  } else if (headings.h2.length >= 1) {
    s.add('تگ‌های H2', 'warn', `فقط ${headings.h2.length} تگ H2 — بخش‌بندی بیشتری لازم است.`, 4);
  } else {
    s.add('تگ‌های H2', false, 'هیچ تگ H2 وجود ندارد.', 4);
  }

  // H3 (۳ امتیاز)
  if (headings.h3.length >= 2) {
    s.add('تگ‌های H3', true, `${headings.h3.length} تگ H3 — عمق ساختاری خوب.`, 3);
  } else if (headings.h3.length === 1) {
    s.add('تگ‌های H3', 'warn', 'فقط یک تگ H3 وجود دارد.', 3);
  } else {
    s.add('تگ‌های H3', 'warn', 'تگ H3 ندارد — برای مقالات بلند توصیه می‌شود.', 3);
  }

  // سلسله‌مراتب (۳ امتیاز)
  const jumps = [];
  for (let i = 1; i < headingSequence.length; i++) {
    const prev = headingSequence[i - 1].level;
    const curr = headingSequence[i].level;
    if (curr - prev > 1) {
      jumps.push(`H${prev} → H${curr}`);
    }
  }
  if (headingSequence.length === 0) {
    s.add('سلسله‌مراتب هدینگ', false, 'هیچ هدینگی در صفحه نیست.', 3);
  } else if (jumps.length === 0) {
    s.add('سلسله‌مراتب هدینگ', true, 'ترتیب هدینگ‌ها بدون پرش و صحیح است.', 3);
  } else {
    s.add(
      'سلسله‌مراتب هدینگ',
      false,
      `${jumps.length} پرش در سطح هدینگ‌ها: ${jumps.slice(0, 3).join('، ')}`,
      3
    );
  }

  return s;
}

// ─────────────────────────────────────────────────────────────
// ۴. Keyword Optimization — حضور در بخش‌های مهم + چگالی طبیعی
// ─────────────────────────────────────────────────────────────
function analyzeKeyword(data, keyword) {
  const s = section(WEIGHTS.keyword);
  const { title, metaDescription, headings, paragraphs, bodyText, wordCount } = data;

  // حضور در Title (۵ امتیاز)
  s.add(
    'کلمه کلیدی در Title',
    contains(title, keyword),
    contains(title, keyword)
      ? 'کلمه کلیدی در عنوان صفحه آمده است.'
      : 'کلمه کلیدی در عنوان صفحه نیست — مهم‌ترین جایگاه.',
    5
  );

  // حضور در Meta Description (۳ امتیاز)
  s.add(
    'کلمه کلیدی در Meta Description',
    contains(metaDescription, keyword),
    contains(metaDescription, keyword)
      ? 'کلمه کلیدی در متادیسکریپشن آمده است.'
      : 'کلمه کلیدی در متادیسکریپشن نیست.',
    3
  );

  // حضور در H1 (۴ امتیاز)
  const inH1 = headings.h1.some((h) => contains(h, keyword));
  s.add(
    'کلمه کلیدی در H1',
    inH1,
    inH1 ? 'کلمه کلیدی در H1 آمده است.' : 'کلمه کلیدی در H1 نیست.',
    4
  );

  // حضور در پاراگراف اول (۳ امتیاز)
  const firstParagraph = paragraphs[0] || '';
  const inFirst = contains(firstParagraph, keyword);
  s.add(
    'کلمه کلیدی در پاراگراف اول',
    inFirst,
    inFirst
      ? 'کلمه کلیدی در ۱۰۰ کلمه‌ی ابتدایی آمده است.'
      : 'کلمه کلیدی در پاراگراف اول نیامده است.',
    3
  );

  // حضور در زیرعنوان‌ها (۲ امتیاز)
  const subHeadings = [...headings.h2, ...headings.h3];
  const inSubCount = subHeadings.filter((h) => contains(h, keyword)).length;
  if (inSubCount >= 1) {
    s.add('کلمه کلیدی در زیرعنوان‌ها', true, `در ${inSubCount} زیرعنوان آمده است.`, 2);
  } else {
    s.add('کلمه کلیدی در زیرعنوان‌ها', false, 'در هیچ زیرعنوانی نیامده است.', 2);
  }

  // چگالی کلمه کلیدی (۳ امتیاز)
  const occurrences = countOccurrences(bodyText, keyword);
  const density = wordCount ? (occurrences / wordCount) * 100 : 0;
  const densityText = `${occurrences} بار تکرار (${density.toFixed(2)}٪)`;

  if (density === 0) {
    s.add('چگالی کلمه کلیدی', false, `${densityText} — کلمه کلیدی در متن نیست.`, 3);
  } else if (density >= 0.5 && density <= 2.5) {
    s.add('چگالی کلمه کلیدی', true, `${densityText} — استفاده‌ی طبیعی و مناسب.`, 3);
  } else if (density < 0.5) {
    s.add('چگالی کلمه کلیدی', 'warn', `${densityText} — کمتر از حد مطلوب.`, 3);
  } else {
    s.add('چگالی کلمه کلیدی', false, `${densityText} — کلمه‌انباشتی (keyword stuffing).`, 3);
  }

  return { section: s, occurrences, density };
}

// ─────────────────────────────────────────────────────────────
// ۵. Readability — طول جملات، طول پاراگراف‌ها، زمان مطالعه
// ─────────────────────────────────────────────────────────────
function analyzeReadability(data) {
  const s = section(WEIGHTS.readability);
  const { sentences, paragraphs, wordCount } = data;

  // طول جملات (۶ امتیاز)
  const sentenceLengths = sentences.map((x) => countWords(x));
  const avgSentence = sentenceLengths.length
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;
  const longSentences = sentenceLengths.filter((n) => n > 30).length;

  if (avgSentence === 0) {
    s.add('طول جملات', false, 'جمله‌ای برای تحلیل یافت نشد.', 6);
  } else if (avgSentence <= 20) {
    s.add('طول جملات', true, `میانگین ${avgSentence.toFixed(1)} کلمه — بسیار خوانا.`, 6);
  } else if (avgSentence <= 25) {
    s.add('طول جملات', 'warn', `میانگین ${avgSentence.toFixed(1)} کلمه — کمی طولانی.`, 6);
  } else {
    s.add(
      'طول جملات',
      false,
      `میانگین ${avgSentence.toFixed(1)} کلمه — جملات بیش از حد طولانی (${longSentences} جمله بالای ۳۰ کلمه).`,
      6
    );
  }

  // طول پاراگراف‌ها (۶ امتیاز)
  const paragraphLengths = paragraphs.map((p) => countWords(p));
  const avgParagraph = paragraphLengths.length
    ? paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length
    : 0;
  const longParagraphs = paragraphLengths.filter((n) => n > 150).length;

  if (avgParagraph === 0) {
    s.add('طول پاراگراف‌ها', false, 'پاراگرافی برای تحلیل یافت نشد.', 6);
  } else if (avgParagraph <= 100) {
    s.add('طول پاراگراف‌ها', true, `میانگین ${Math.round(avgParagraph)} کلمه — اندازه مناسب.`, 6);
  } else if (avgParagraph <= 150) {
    s.add('طول پاراگراف‌ها', 'warn', `میانگین ${Math.round(avgParagraph)} کلمه — کمی سنگین.`, 6);
  } else {
    s.add(
      'طول پاراگراف‌ها',
      false,
      `میانگین ${Math.round(avgParagraph)} کلمه — ${longParagraphs} پاراگراف بسیار طولانی.`,
      6
    );
  }

  // زمان مطالعه (۳ امتیاز)
  const readingMinutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  if (readingMinutes >= 3 && readingMinutes <= 12) {
    s.add('زمان مطالعه', true, `حدود ${readingMinutes} دقیقه — طول ایده‌آل برای مقاله.`, 3);
  } else if (readingMinutes < 3) {
    s.add('زمان مطالعه', 'warn', `حدود ${readingMinutes} دقیقه — محتوا کوتاه است.`, 3);
  } else {
    s.add('زمان مطالعه', 'warn', `حدود ${readingMinutes} دقیقه — ممکن است خسته‌کننده شود.`, 3);
  }

  return {
    section: s,
    avgSentence: Number(avgSentence.toFixed(1)),
    avgParagraph: Math.round(avgParagraph),
    readingMinutes,
    longSentences,
    longParagraphs,
  };
}

// ─────────────────────────────────────────────────────────────
// ۶. Links — لینک‌های داخلی و خارجی
// ─────────────────────────────────────────────────────────────
function analyzeLinks(data) {
  const s = section(WEIGHTS.links);
  const { internalLinks, externalLinks } = data;

  // لینک داخلی (۵ امتیاز)
  if (internalLinks.length >= 3) {
    s.add('لینک‌های داخلی', true, `${internalLinks.length} لینک داخلی — ساختار لینک‌سازی خوب.`, 5);
  } else if (internalLinks.length >= 1) {
    s.add('لینک‌های داخلی', 'warn', `فقط ${internalLinks.length} لینک داخلی — حداقل ۳ توصیه می‌شود.`, 5);
  } else {
    s.add('لینک‌های داخلی', false, 'هیچ لینک داخلی وجود ندارد.', 5);
  }

  // لینک خارجی (۵ امتیاز)
  if (externalLinks.length >= 2) {
    s.add('لینک‌های خارجی', true, `${externalLinks.length} لینک خارجی — ارجاع به منابع معتبر.`, 5);
  } else if (externalLinks.length === 1) {
    s.add('لینک‌های خارجی', 'warn', 'فقط یک لینک خارجی وجود دارد.', 5);
  } else {
    s.add('لینک‌های خارجی', false, 'هیچ لینک خارجی وجود ندارد.', 5);
  }

  return s;
}

/** تبدیل امتیاز عددی به درجه‌ی کیفیت. */
export function getGrade(score) {
  if (score >= 85) return { label: 'Excellent', fa: 'عالی', color: '#16a34a' };
  if (score >= 70) return { label: 'Good', fa: 'خوب', color: '#65a30d' };
  if (score >= 50) return { label: 'Average', fa: 'متوسط', color: '#ea580c' };
  return { label: 'Poor', fa: 'ضعیف', color: '#dc2626' };
}

/**
 * از نتایج تمام بخش‌ها، مشکلات/هشدارها/نقاط قوت و پیشنهادها را استخراج می‌کند.
 */
function collectFindings(sections, data, extras) {
  const issues = [];
  const warnings = [];
  const strengths = [];
  const recommendations = [];

  for (const [name, s] of Object.entries(sections)) {
    for (const check of s.checks) {
      const entry = { category: name, label: check.label, detail: check.detail };
      if (check.status === true) strengths.push(entry);
      else if (check.status === 'warn') warnings.push(entry);
      else issues.push(entry);
    }
  }

  // پیشنهادهای اصلاحی مبتنی بر مشکلات واقعی
  if (!data.title) recommendations.push('یک تگ <title> یکتا و ۳۰ تا ۶۰ نویسه‌ای برای صفحه بنویسید.');
  if (!data.metaDescription)
    recommendations.push('یک متادیسکریپشن ۱۲۰ تا ۱۶۰ نویسه‌ای شامل کلمه کلیدی اضافه کنید.');
  if (!data.canonical)
    recommendations.push('تگ <link rel="canonical"> را برای جلوگیری از محتوای تکراری اضافه کنید.');
  if (data.openGraph.count < 4)
    recommendations.push('تگ‌های og:title، og:description، og:image و og:url را کامل کنید.');
  if (data.headings.h1.length !== 1)
    recommendations.push('دقیقاً یک تگ H1 در صفحه قرار دهید که موضوع اصلی مقاله را بیان کند.');
  if (data.headings.h2.length < 3)
    recommendations.push('مقاله را با حداقل ۳ زیرعنوان H2 به بخش‌های منطقی تقسیم کنید.');
  if (data.wordCount < 600)
    recommendations.push(`محتوا را به بیش از ۶۰۰ کلمه گسترش دهید (فعلاً ${data.wordCount} کلمه).`);
  if (extras.keyword.density === 0)
    recommendations.push('کلمه کلیدی هدف را به‌صورت طبیعی در متن مقاله به کار ببرید.');
  else if (extras.keyword.density > 2.5)
    recommendations.push('تکرار کلمه کلیدی را کم کنید و از مترادف‌ها و عبارات مرتبط استفاده کنید.');
  else if (extras.keyword.density < 0.5)
    recommendations.push('کلمه کلیدی را چند بار بیشتر و به‌صورت طبیعی در متن تکرار کنید.');
  if (extras.readability.avgSentence > 25)
    recommendations.push('جملات طولانی را به جملات کوتاه‌تر (زیر ۲۰ کلمه) بشکنید.');
  if (extras.readability.longParagraphs > 0)
    recommendations.push(`${extras.readability.longParagraphs} پاراگراف بسیار طولانی را تقسیم کنید.`);
  if (data.internalLinks.length < 3)
    recommendations.push('حداقل ۳ لینک داخلی به مقالات مرتبط سایت خود اضافه کنید.');
  if (data.externalLinks.length < 2)
    recommendations.push('به ۲ منبع معتبر خارجی لینک بدهید تا اعتبار محتوا افزایش یابد.');

  const imagesWithoutAlt = data.images.filter((i) => !i.hasAlt).length;
  if (imagesWithoutAlt > 0) {
    warnings.push({
      category: 'images',
      label: 'متن جایگزین تصاویر',
      detail: `${imagesWithoutAlt} تصویر از ${data.images.length} تصویر، ویژگی alt ندارند.`,
    });
    recommendations.push(`برای ${imagesWithoutAlt} تصویر بدون alt، متن جایگزین توصیفی بنویسید.`);
  }
  if (data.images.length === 0) {
    warnings.push({
      category: 'images',
      label: 'تصاویر',
      detail: 'مقاله هیچ تصویری ندارد.',
    });
    recommendations.push('حداقل یک تصویر مرتبط با متن alt توصیفی به مقاله اضافه کنید.');
  }

  return { issues, warnings, strengths, recommendations };
}

/**
 * تحلیل کامل سئو و محاسبه‌ی امتیاز ۰ تا ۱۰۰.
 * @param {object} data خروجی parseArticle
 * @param {string} keyword کلمه کلیدی هدف
 */
export function analyze(data, keyword) {
  const keywordResult = analyzeKeyword(data, keyword);
  const readabilityResult = analyzeReadability(data);

  const sections = {
    content: analyzeContent(data),
    technical: analyzeTechnical(data),
    structure: analyzeStructure(data),
    keyword: keywordResult.section,
    readability: readabilityResult.section,
    links: analyzeLinks(data),
  };

  const totalScore = Object.values(sections).reduce((sum, s) => sum + s.score, 0);
  const score = Math.max(0, Math.min(100, Math.round(totalScore)));

  const findings = collectFindings(sections, data, {
    keyword: keywordResult,
    readability: readabilityResult,
  });

  return {
    score,
    grade: getGrade(score),
    sections: Object.fromEntries(
      Object.entries(sections).map(([name, s]) => [
        name,
        { score: s.score, maxScore: s.maxScore, checks: s.checks },
      ])
    ),
    stats: {
      url: data.url,
      title: data.title,
      titleLength: data.title.length,
      metaDescription: data.metaDescription,
      metaDescriptionLength: data.metaDescription.length,
      canonical: data.canonical,
      lang: data.lang,
      wordCount: data.wordCount,
      paragraphCount: data.paragraphs.length,
      sentenceCount: data.sentences.length,
      readingMinutes: readabilityResult.readingMinutes,
      avgSentenceLength: readabilityResult.avgSentence,
      avgParagraphLength: readabilityResult.avgParagraph,
      headingCounts: Object.fromEntries(
        Object.entries(data.headings).map(([k, v]) => [k, v.length])
      ),
      imageCount: data.images.length,
      imagesWithoutAlt: data.images.filter((i) => !i.hasAlt).length,
      internalLinkCount: data.internalLinks.length,
      externalLinkCount: data.externalLinks.length,
      keyword,
      keywordOccurrences: keywordResult.occurrences,
      keywordDensity: Number(keywordResult.density.toFixed(2)),
      hasStructuredData: data.hasStructuredData,
      openGraphCount: data.openGraph.count,
    },
    ...findings,
  };
}
