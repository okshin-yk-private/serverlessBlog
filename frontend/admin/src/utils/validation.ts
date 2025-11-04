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
 * @param category カテゴリ文字列
 * @returns エラーメッセージ（正常な場合はnull）
 */
export const validateCategory = (category: string): string | null => {
  const validCategories = ['tech', 'life', 'business', 'other'];
  if (!category) {
    return 'カテゴリは必須です';
  }
  if (!validCategories.includes(category)) {
    return `カテゴリは ${validCategories.join(', ')} のいずれかを選択してください`;
  }
  return null;
};
