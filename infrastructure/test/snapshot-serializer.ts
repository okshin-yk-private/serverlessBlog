/**
 * CDKスナップショット用カスタムシリアライザー
 *
 * Lambda LayerのS3Keyは環境によって異なるハッシュ値を生成するため、
 * スナップショットテストが不安定になる問題を解決します。
 *
 * 問題の原因:
 * - lambda.Code.fromAsset()がディレクトリ全体（node_modules含む）のハッシュを計算
 * - node_modulesの内容はOS/npmバージョンにより微妙に異なる
 * - 結果として、ローカル(macOS)とCI(Ubuntu)でS3Keyが異なる
 *
 * 解決策:
 * - S3Keyプロパティを検出し、プレースホルダーに置換
 * - 環境非依存の安定したスナップショット比較を実現
 */

const PLACEHOLDER = '[ASSET_HASH].zip';

type PrinterFn = (
  val: unknown,
  config: unknown,
  indentation: string,
  depth: number,
  refs: unknown[]
) => string;

module.exports = {
  /**
   * S3Keyプロパティを持つオブジェクトを検出
   * 既にプレースホルダーに置換されている場合はスキップ（再帰防止）
   */
  test(val: unknown): boolean {
    if (typeof val !== 'object' || val === null) {
      return false;
    }
    const obj = val as Record<string, unknown>;
    return (
      'S3Key' in obj &&
      typeof obj.S3Key === 'string' &&
      obj.S3Key !== PLACEHOLDER
    );
  },

  /**
   * S3Keyをプレースホルダーに置換してシリアライズ
   */
  serialize(
    val: Record<string, unknown>,
    config: unknown,
    indentation: string,
    depth: number,
    refs: unknown[],
    printer: PrinterFn
  ): string {
    const sanitized = {
      ...val,
      S3Key: PLACEHOLDER,
    };
    return printer(sanitized, config, indentation, depth, refs);
  },
};
