import { describe, it, expect } from 'vitest';
import {
  validatePostTitle,
  validatePostContent,
  validateCategory,
  validateSlug,
  validateExcerpt,
} from './validation';

describe('validatePostTitle', () => {
  it('空文字列の場合はエラーメッセージを返す', () => {
    expect(validatePostTitle('')).toBe('タイトルは必須です');
  });

  it('スペースのみの場合はエラーメッセージを返す', () => {
    expect(validatePostTitle('   ')).toBe('タイトルは必須です');
  });

  it('200文字を超える場合はエラーメッセージを返す', () => {
    const longTitle = 'a'.repeat(201);
    expect(validatePostTitle(longTitle)).toBe(
      'タイトルは200文字以内で入力してください'
    );
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
    expect(validatePostContent(longContent)).toBe(
      '本文は50000文字以内で入力してください'
    );
  });

  it('正常な本文の場合はnullを返す', () => {
    expect(validatePostContent('有効な本文')).toBeNull();
  });
});

describe('validateCategory', () => {
  it('空文字列の場合はエラーメッセージを返す', () => {
    expect(validateCategory('')).toBe('カテゴリは必須です');
  });

  it('スペースのみの場合はエラーメッセージを返す', () => {
    expect(validateCategory('   ')).toBe('カテゴリは必須です');
  });

  it('任意のカテゴリ文字列の場合はnullを返す（動的カテゴリ対応）', () => {
    expect(validateCategory('tech')).toBeNull();
    expect(validateCategory('Think')).toBeNull();
    expect(validateCategory('custom-category')).toBeNull();
  });
});

describe('validateSlug', () => {
  it('空文字列はnullを返す（自動生成フォールバック）', () => {
    expect(validateSlug('')).toBeNull();
  });

  it('kebab-caseの正しいslugはnullを返す', () => {
    expect(validateSlug('hello-world')).toBeNull();
    expect(validateSlug('post-2026')).toBeNull();
    expect(validateSlug('a')).toBeNull();
  });

  it('大文字を含むslugはエラーを返す', () => {
    expect(validateSlug('Hello-World')).toBe(
      'slug は英小文字・数字・ハイフンのみ使用できます'
    );
  });

  it('スペースを含むslugはエラーを返す', () => {
    expect(validateSlug('hello world')).toBe(
      'slug は英小文字・数字・ハイフンのみ使用できます'
    );
  });

  it('80文字を超えるslugはエラーを返す', () => {
    expect(validateSlug('a'.repeat(81))).toBe(
      'slug は 80 文字以内で入力してください'
    );
  });

  it('80文字ちょうどはnullを返す', () => {
    expect(validateSlug('a'.repeat(80))).toBeNull();
  });
});

describe('validateExcerpt', () => {
  it('空文字列はnullを返す', () => {
    expect(validateExcerpt('')).toBeNull();
  });

  it('160文字以内はnullを返す', () => {
    expect(validateExcerpt('a'.repeat(160))).toBeNull();
  });

  it('161文字以上はエラーを返す', () => {
    expect(validateExcerpt('a'.repeat(161))).toBe(
      '概要は 160 文字以内で入力してください'
    );
  });
});
