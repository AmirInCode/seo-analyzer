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
