import * as cheerio from 'cheerio';

// عناصری که بخشی از متن اصلی مقاله نیستند
const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  '.sidebar',
  '.comments',
  '#comments',
  '.advertisement',
  '.ads',
].join(',');

// نامزدهای احتمالی برای بدنه‌ی اصلی مقاله، به ترتیب اولویت
const ARTICLE_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.content',
  '#content',
];

/** متن را از فاصله‌های اضافی و نویسه‌های کنترلی پاک می‌کند. */
function clean(text) {
  return String(text || '')
    .replace(/‌/g, ' ') // نیم‌فاصله را برای شمارش، فاصله در نظر می‌گیریم
    .replace(/\s+/g, ' ')
    .trim();
}

/** تعداد کلمات را می‌شمارد (سازگار با فارسی و انگلیسی). */
export function countWords(text) {
  const c = clean(text);
  if (!c) return 0;
  return c.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** متن را به جملات تقسیم می‌کند (نقطه‌گذاری فارسی و لاتین). */
export function splitSentences(text) {
  return String(text || '')
    .split(/[.!?؟…۔]+|\n+/)
    .map((s) => clean(s))
    .filter((s) => countWords(s) > 0);
}

/**
 * بدنه‌ی اصلی مقاله را پیدا می‌کند: میان نامزدها، آن‌که بیشترین متن را دارد.
 * اگر هیچ‌کدام محتوای کافی نداشت، به body برمی‌گردد.
 */
function findArticleRoot($) {
  let best = null;
  let bestLength = 0;

  for (const selector of ARTICLE_SELECTORS) {
    $(selector).each((_, el) => {
      const length = clean($(el).text()).length;
      if (length > bestLength) {
        bestLength = length;
        best = $(el);
      }
    });
  }

  // اگر بهترین نامزد کمتر از ۲۰۰ نویسه داشت، احتمالاً بدنه‌ی واقعی نیست
  if (!best || bestLength < 200) return $('body');
  return best;
}

/**
 * HTML را تجزیه کرده و تمام داده‌های موردنیاز برای امتیازدهی سئو را استخراج می‌کند.
 * @param {string} html
 * @param {string} pageUrl آدرس نهایی صفحه (برای تشخیص لینک داخلی/خارجی)
 */
export function parseArticle(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);

  // --- بخش فنی: متادیتای head (پیش از حذف نویز خوانده می‌شود) ---
  const title = clean($('head > title').first().text());
  const metaDescription = clean(
    $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
  );
  const canonical = clean($('link[rel="canonical"]').attr('href') || '');
  const robots = clean($('meta[name="robots"]').attr('content') || '');
  const lang = clean($('html').attr('lang') || '');
  const viewport = clean($('meta[name="viewport"]').attr('content') || '');

  const openGraph = {
    title: clean($('meta[property="og:title"]').attr('content') || ''),
    description: clean($('meta[property="og:description"]').attr('content') || ''),
    image: clean($('meta[property="og:image"]').attr('content') || ''),
    url: clean($('meta[property="og:url"]').attr('content') || ''),
    type: clean($('meta[property="og:type"]').attr('content') || ''),
  };
  openGraph.count = Object.entries(openGraph).filter(
    ([k, v]) => k !== 'count' && v
  ).length;

  const twitterCard = clean($('meta[name="twitter:card"]').attr('content') || '');
  const hasStructuredData = $('script[type="application/ld+json"]').length > 0;

  // --- ساختار: هدینگ‌ها (پیش از حذف نویز، چون h1 گاهی در header است) ---
  const headings = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = clean($(el).text());
    if (text) headings[tag].push(text);
  });

  // ترتیب واقعی هدینگ‌ها، برای بررسی سلسله‌مراتب
  const headingSequence = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = Number(el.tagName.slice(1));
    const text = clean($(el).text());
    if (text) headingSequence.push({ level, text });
  });

  // --- محتوا: حالا نویز را حذف می‌کنیم ---
  const root = findArticleRoot($);
  root.find(NOISE_SELECTORS).remove();

  const paragraphs = [];
  root.find('p').each((_, el) => {
    const text = clean($(el).text());
    if (countWords(text) >= 3) paragraphs.push(text);
  });

  // اگر تگ p پیدا نشد، از کل متن بدنه استفاده می‌کنیم
  const bodyText = paragraphs.length
    ? paragraphs.join('\n\n')
    : clean(root.text());

  // --- تصاویر ---
  const images = [];
  root.find('img').each((_, el) => {
    const $img = $(el);
    const src = $img.attr('src') || $img.attr('data-src') || '';
    if (!src) return;
    images.push({
      src,
      alt: clean($img.attr('alt') || ''),
      hasAlt: $img.attr('alt') !== undefined && clean($img.attr('alt')) !== '',
      hasLazyLoading: $img.attr('loading') === 'lazy',
    });
  });

  // --- لینک‌ها ---
  const internalLinks = [];
  const externalLinks = [];
  root.find('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = clean($(el).text());
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) {
      return;
    }
    let resolved;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }
    const entry = {
      href: resolved.toString(),
      text,
      isEmptyAnchor: text.length === 0,
      rel: clean($(el).attr('rel') || ''),
    };
    if (resolved.hostname === base.hostname) internalLinks.push(entry);
    else externalLinks.push(entry);
  });

  const wordCount = countWords(bodyText);
  const sentences = splitSentences(bodyText);

  return {
    url: pageUrl,
    title,
    metaDescription,
    canonical,
    robots,
    lang,
    viewport,
    openGraph,
    twitterCard,
    hasStructuredData,
    headings,
    headingSequence,
    paragraphs,
    bodyText,
    wordCount,
    sentences,
    images,
    internalLinks,
    externalLinks,
  };
}
