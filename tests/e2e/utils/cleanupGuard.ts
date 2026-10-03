/**
 * `bun run cleanup:test-data` の実行対象を dev に限定するガード。
 *
 * 設計 (Issue #737): deny リスト (「本番ドメインでなければ実行可」) ではなく、
 * 二つの独立したチェックを両方満たさない限り拒否する positive-allow にしている。
 *
 * 1. `CLEANUP_TARGET_ENV` が文字列として厳密に `'dev'` であること。
 *    「prd という文字列ではない」ではなく「dev だと明示されている」ことを要求する。
 *    未設定・空文字・`'production'` 以外の任意の値もすべて拒否する。
 * 2. 解決済み BASE_URL のホスト名が、既知の本番ホスト名 (prd CloudFront の
 *    `domain_names` = apex と www) のいずれとも一致しないこと。
 *    (1) だけでは `CLEANUP_TARGET_ENV=dev` を本番相手に誤設定した事故を防げないため、
 *    既知の本番ホストに対する明示的な deny を安全網として重ねている。
 *    サフィックス一致 (`*.boneofmyfallacy.net`) にはしない: DEV は
 *    `dev.boneofmyfallacy.net` で配信されており、サフィックス一致では DEV まで拒否する。
 *
 * どちらのチェックもネットワークアクセスの前に、同期的に完了する。
 */

/**
 * prd が配信するホスト名。terraform/environments/prd/main.tf の CDN
 * `domain_names = [var.domain_name, "www.${var.domain_name}"]` と、
 * `domain_name` の既定値 (prd/variables.tf) に合わせる。
 * apex は .github/workflows/deploy.yml の prd `SITE_URL` とも一致する。
 */
export const KNOWN_PRODUCTION_HOSTNAMES: readonly string[] = [
  'boneofmyfallacy.net',
  'www.boneofmyfallacy.net',
];

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

  // URL は hostname を小文字化するが、FQDN の末尾ドット (`boneofmyfallacy.net.`)
  // は残すので、同じホストとして比較できるよう取り除く。
  const normalizedHostname = hostname.replace(/\.$/, '');
  if (KNOWN_PRODUCTION_HOSTNAMES.includes(normalizedHostname)) {
    throw new CleanupGuardError(
      `The resolved target (${input.baseURL}) is a production domain ` +
        `(${normalizedHostname}). Refusing to run cleanup:test-data against prd.`
    );
  }
}
