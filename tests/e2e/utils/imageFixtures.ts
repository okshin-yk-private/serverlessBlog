/**
 * テスト用画像フィクスチャ生成
 *
 * Playwright テストで Tiptap エディタへペースト/ドロップする画像 File を
 * その場で生成するためのヘルパー。実ファイルを用意せず、特定の MIME と
 * バイトサイズを持つダミー画像を返す。
 */

/**
 * 1x1 透明 PNG のバイト列。サイズは固定 67 バイト。
 * ペースト/ドロップ動作の検証用に十分。
 */
const ONE_BY_ONE_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000500010d0a2db40000000049454e44ae426082',
  'hex'
);

/**
 * テスト用 PNG 画像フィクスチャを生成する。
 * sizeKB を指定すると、PNG 末尾にダミーバイトをパディングして指定サイズに膨らませる
 * (アップロード上限 5MB の境界テスト等に利用)。
 */
export function fixturePng(opts: { name?: string; sizeKB?: number } = {}): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  const name = opts.name ?? 'test.png';
  const base = ONE_BY_ONE_PNG;
  if (!opts.sizeKB || opts.sizeKB * 1024 <= base.length) {
    return { name, mimeType: 'image/png', buffer: base };
  }
  const padding = Buffer.alloc(opts.sizeKB * 1024 - base.length, 0);
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.concat([base, padding]),
  };
}

/**
 * 1x1 JPEG 画像 (約 134 バイト)。MIME 別動作のスモークテスト用。
 */
const ONE_BY_ONE_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfbfffd9',
  'hex'
);

export function fixtureJpeg(opts: { name?: string } = {}): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  return {
    name: opts.name ?? 'test.jpg',
    mimeType: 'image/jpeg',
    buffer: ONE_BY_ONE_JPEG,
  };
}
