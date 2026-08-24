const USER_AGENT =
  'Mozilla/5.0 (compatible; SEOAnalyzerBot/1.0; +https://example.com/bot)';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const TIMEOUT_MS = 20_000;

/**
 * آدرس ورودی کاربر را اعتبارسنجی و نرمال‌سازی می‌کند.
 * فقط http/https پذیرفته می‌شود تا از دسترسی به پروتکل‌های محلی جلوگیری شود.
 */
export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('آدرس مقاله وارد نشده است.');

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error('آدرس واردشده معتبر نیست.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('فقط آدرس‌های http و https پشتیبانی می‌شوند.');
  }
  return url.toString();
}

/**
 * محتوای HTML صفحه را دریافت می‌کند.
 * @returns {Promise<{html: string, finalUrl: string, status: number, loadTimeMs: number}>}
 */
export async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fa,en;q=0.8',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('زمان دریافت صفحه به پایان رسید (بیش از ۲۰ ثانیه).');
    }
    throw new Error(`دریافت صفحه ناموفق بود: ${err.message}`);
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new Error(
      `سرور مقصد کد ${response.status} برگرداند. صفحه قابل بررسی نیست.`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('html')) {
    throw new Error(
      `محتوای این آدرس HTML نیست (${contentType || 'نامشخص'}). فقط صفحات وب قابل تحلیل هستند.`
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error('حجم صفحه بیش از ۵ مگابایت است و تحلیل نمی‌شود.');
  }

  return {
    html: new TextDecoder('utf-8').decode(buffer),
    finalUrl: response.url || url,
    status: response.status,
    loadTimeMs: Date.now() - startedAt,
  };
}
