import { describe, it, expect } from 'vitest';
import { validatePostTitle, validatePostContent, validateCategory } from './validation';

describe('validatePostTitle', () => {
  it('空文字列の場合はエラーメッセージを返す', () => {
    expect(validatePostTitle('')).toBe('タイトルは必須です');
  });

  it('スペースのみの場合はエラーメッセージを返す', () => {
    expect(validatePostTitle('   ')).toBe('タイトルは必須です');
  });

  it('200文字を超える場合はエラーメッセージを返す', () => {
    const longTitle = 'a'.repeat(201);
    expect(validatePostTitle(longTitle)).toBe('タイトルは200文字以内で入力してください');
  });

  it('200文字ちょうどの場合はnullを返す', () => {
    const title = 'a'.repeat(200);
    expect(validatePostTitle(title)).toBeNull();
  });

  it('正常なタイトルの場合はnullを返す', () => {
    expect(validatePostTitle('有効なタイトル')).toBeNull();
  });
});

describe('validatePostContent', () => {
  it('空文字列の場合はエラーメッセージを返す', () => {
    expect(validatePostContent('')).toBe('本文は必須です');
  });

  it('スペースのみの場合はエラーメッセージを返す', () => {
    expect(validatePostContent('   ')).toBe('本文は必須です');
  });

  it('50000文字を超える場合はエラーメッセージを返す', () => {
    const longContent = 'a'.repeat(50001);
    expect(validatePostContent(longContent)).toBe('本文は50000文字以内で入力してください');
  });

  it('正常な本文の場合はnullを返す', () => {
    expect(validatePostContent('有効な本文')).toBeNull();
  });
});

describe('validateCategory', () => {
  it('空文字列の場合はエラーメッセージを返す', () => {
    expect(validateCategory('')).toBe('カテゴリは必須です');
  });

  it('無効なカテゴリの場合はエラーメッセージを返す', () => {
    expect(validateCategory('invalid')).toContain('tech, life, business, other');
  });

  it('techカテゴリの場合はnullを返す', () => {
    expect(validateCategory('tech')).toBeNull();
  });

  it('lifeカテゴリの場合はnullを返す', () => {
    expect(validateCategory('life')).toBeNull();
  });

  it('businessカテゴリの場合はnullを返す', () => {
    expect(validateCategory('business')).toBeNull();
  });

  it('otherカテゴリの場合はnullを返す', () => {
    expect(validateCategory('other')).toBeNull();
  });
});
