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
