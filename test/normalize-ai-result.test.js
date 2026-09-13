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
