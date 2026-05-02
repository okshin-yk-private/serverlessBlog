/**
 * 記事タイトルのバリデーション
 * @param title タイトル文字列
 * @returns エラーメッセージ（正常な場合はnull）
 */
export const validatePostTitle = (title: string): string | null => {
  if (!title || title.trim().length === 0) {
    return 'タイトルは必須です';
  }
  if (title.length > 200) {
    return 'タイトルは200文字以内で入力してください';
  }
  return null;
};

/**
 * 記事本文のバリデーション
 * @param content 本文文字列
 * @returns エラーメッセージ（正常な場合はnull）
 */
export const validatePostContent = (content: string): string | null => {
  if (!content || content.trim().length === 0) {
    return '本文は必須です';
  }
  if (content.length > 50000) {
    return '本文は50000文字以内で入力してください';
  }
  return null;
};

/**
 * カテゴリのバリデーション
 * カテゴリが選択されているかのみを検証（有効なカテゴリはAPIから動的に取得されるため）
 * @param category カテゴリ文字列
 * @returns エラーメッセージ（正常な場合はnull）
 */
export const validateCategory = (category: string): string | null => {
  if (!category || category.trim().length === 0) {
    return 'カテゴリは必須です';
  }
  return null;
};

// kebab-case (lowercase a-z, digits, hyphen). Mirror of go domain.slugPattern.
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_MAX_LENGTH = 80;
const EXCERPT_MAX_LENGTH = 160;

/**
 * Slug のバリデーション。空欄は許容（未入力 = 自動生成にフォールバック）。
 */
export const validateSlug = (slug: string): string | null => {
  if (slug === '') {
    return null;
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return `slug は ${SLUG_MAX_LENGTH} 文字以内で入力してください`;
  }
  if (!SLUG_PATTERN.test(slug)) {
    return 'slug は英小文字・数字・ハイフンのみ使用できます';
  }
  return null;
};

/**
 * 概要文 (excerpt) のバリデーション。空欄は許容。
 */
export const validateExcerpt = (excerpt: string): string | null => {
  if (excerpt.length > EXCERPT_MAX_LENGTH) {
    return `概要は ${EXCERPT_MAX_LENGTH} 文字以内で入力してください`;
  }
  return null;
};
