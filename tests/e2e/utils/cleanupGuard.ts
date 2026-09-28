/**
 * `bun run cleanup:test-data` の実行対象を dev に限定するガード。
 *
 * 設計 (Issue #737): deny リスト (「本番ドメインでなければ実行可」) ではなく、
 * 二つの独立したチェックを両方満たさない限り拒否する positive-allow にしている。
 *
 * 1. `CLEANUP_TARGET_ENV` が文字列として厳密に `'dev'` であること。
 *    「prd という文字列ではない」ではなく「dev だと明示されている」ことを要求する。
 *    未設定・空文字・`'production'` 以外の任意の値もすべて拒否する。
 * 2. 解決済み BASE_URL のホスト名が、既知の本番ドメイン
 *    (`.github/workflows/deploy.yml` の prd `SITE_URL`) と一致しないこと。
 *    (1) だけでは `CLEANUP_TARGET_ENV=dev` を本番相手に誤設定した事故を防げないため、
 *    既知の本番ホストに対する明示的な deny を安全網として重ねている。
 *
 * どちらのチェックもネットワークアクセスの前に、同期的に完了する。
 */

/** .github/workflows/deploy.yml の prd ジョブが設定する SITE_URL と同じ値。 */
export const KNOWN_PRODUCTION_HOSTNAME = 'boneofmyfallacy.net';

export class CleanupGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CleanupGuardError';
  }
}

export interface CleanupGuardInput {
  /** `process.env.CLEANUP_TARGET_ENV` */
  targetEnv: string | undefined;
  /** 掃除対象として解決済みの admin ベース URL (もしくは BASE_URL) */
  baseURL: string;
}

/**
 * dev 以外を対象にしている場合は `CleanupGuardError` を投げる。
 * 呼び出し側はこれを await/呼び出しの一番最初、ログインや HTTP 呼び出しより前に行う。
 */
export function assertCleanupTargetsDev(input: CleanupGuardInput): void {
  if (input.targetEnv !== 'dev') {
    throw new CleanupGuardError(
      `CLEANUP_TARGET_ENV must be exactly "dev" to run cleanup:test-data ` +
        `(got: ${input.targetEnv === undefined ? 'unset' : JSON.stringify(input.targetEnv)}). ` +
        'Refusing to run. Set CLEANUP_TARGET_ENV=dev explicitly when the target is DEV.'
    );
  }

  let hostname: string;
  try {
    hostname = new URL(input.baseURL).hostname;
  } catch {
    throw new CleanupGuardError(
      `BASE_URL/ADMIN_BASE_URL is not a valid URL: ${JSON.stringify(input.baseURL)}. Refusing to run.`
    );
  }

  // prd serves both the apex and www (terraform/environments/prd/main.tf
  // domain_names), so refuse the apex and any of its subdomains.
  if (
    hostname === KNOWN_PRODUCTION_HOSTNAME ||
    hostname.endsWith(`.${KNOWN_PRODUCTION_HOSTNAME}`)
  ) {
    throw new CleanupGuardError(
      `The resolved target (${input.baseURL}) is the production domain ` +
        `(${KNOWN_PRODUCTION_HOSTNAME}). Refusing to run cleanup:test-data against prd.`
    );
  }
}
