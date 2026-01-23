/**
 * 開発環境・ビルド検証ユーティリティ
 *
 * Task 8.3: 開発環境・ビルド検証テスト
 * Requirements:
 *   - 13.3: `bun run dev` でポート4321に開発サーバー起動を確認
 *   - 13.4: `bun run preview` でビルド済みファイル配信を確認
 *   - 13.6: CI失敗時のデプロイブロックを確認
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as net from 'net';
import * as yaml from 'js-yaml';

/**
 * サーバー起動結果
 */
export interface ServerStartResult {
  success: boolean;
  port?: number;
  url?: string;
  error?: string;
  process?: ChildProcess;
}

/**
 * 開発サーバー設定
 */
export interface DevServerConfig {
  port: number;
  host: string;
  timeout: number;
}

/**
 * デフォルトの開発サーバー設定
 */
export const DEFAULT_DEV_CONFIG: DevServerConfig = {
  port: 4321,
  host: 'localhost',
  timeout: 30000,
};

/**
 * デフォルトのプレビューサーバー設定
 */
export const DEFAULT_PREVIEW_CONFIG: DevServerConfig = {
  port: 4321,
  host: 'localhost',
  timeout: 30000,
};

/**
 * 指定されたポートが使用可能かチェック
 */
export async function checkPortAvailable(port: number): Promise<boolean> {
  // 無効なポート番号のチェック
  if (port <= 0 || port > 65535) {
    return false;
  }

  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port);
  });
}

/**
 * 開発サーバー (astro dev) を起動
 *
 * Requirements 13.3: `bun run dev` でポート4321に開発サーバー起動を確認
 */
export async function startDevServer(
  workDir: string,
  config: Partial<DevServerConfig> = {}
): Promise<ServerStartResult> {
  const mergedConfig = { ...DEFAULT_DEV_CONFIG, ...config };

  // ディレクトリ存在チェック
  if (!existsSync(workDir)) {
    return {
      success: false,
      error: `Directory does not exist: ${workDir}`,
    };
  }

  // package.json存在チェック
  const packageJsonPath = join(workDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      success: false,
      error: `package.json not found in: ${workDir}`,
    };
  }

  try {
    const serverProcess = spawn(
      'bun',
      ['run', 'dev', '--port', String(mergedConfig.port)],
      {
        cwd: workDir,
        stdio: 'pipe',
        detached: false,
      }
    );

    const url = `http://${mergedConfig.host}:${mergedConfig.port}`;

    // サーバー起動を待機
    const started = await waitForServer(url, mergedConfig.timeout);

    if (started) {
      return {
        success: true,
        port: mergedConfig.port,
        url,
        process: serverProcess,
      };
    }

    // 起動失敗時はプロセスを終了
    serverProcess.kill();
    return {
      success: false,
      error: 'Server failed to start within timeout',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * プレビューサーバー (astro preview) を起動
 *
 * Requirements 13.4: `bun run preview` でビルド済みファイル配信を確認
 */
export async function startPreviewServer(
  workDir: string,
  config: Partial<DevServerConfig> = {}
): Promise<ServerStartResult> {
  const mergedConfig = { ...DEFAULT_PREVIEW_CONFIG, ...config };

  // ディレクトリ存在チェック
  if (!existsSync(workDir)) {
    return {
      success: false,
      error: `Directory does not exist: ${workDir}`,
    };
  }

  // dist ディレクトリ存在チェック
  const distDir = join(workDir, 'dist');
  if (!existsSync(distDir)) {
    return {
      success: false,
      error: `dist directory does not exist: ${distDir}. Run 'bun run build' first.`,
    };
  }

  try {
    const serverProcess = spawn(
      'bun',
      ['run', 'preview', '--port', String(mergedConfig.port)],
      {
        cwd: workDir,
        stdio: 'pipe',
        detached: false,
      }
    );

    const url = `http://${mergedConfig.host}:${mergedConfig.port}`;

    // サーバー起動を待機
    const started = await waitForServer(url, mergedConfig.timeout);

    if (started) {
      return {
        success: true,
        port: mergedConfig.port,
        url,
        process: serverProcess,
      };
    }

    // 起動失敗時はプロセスを終了
    serverProcess.kill();
    return {
      success: false,
      error: 'Preview server failed to start within timeout',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * サーバーが応答するまで待機
 */
export async function waitForServer(
  url: string,
  timeout: number = 30000
): Promise<boolean> {
  // URLの検証
  try {
    new URL(url);
  } catch {
    return false;
  }

  const startTime = Date.now();
  const interval = 100;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // サーバーがまだ起動していない
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * サーバープロセスを停止
 */
export async function stopServer(
  process: ChildProcess | null | undefined
): Promise<void> {
  if (!process) {
    return;
  }

  if (process.killed) {
    return;
  }

  try {
    process.kill('SIGTERM');
  } catch {
    // プロセスが既に終了している場合など
  }
}

/**
 * CI環境の検出
 */
export function isCI(): boolean {
  return (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.VITEST_INTEGRATION === 'true'
  );
}

/**
 * package.jsonからスクリプトコマンドを取得
 */
export async function getPackageScripts(
  workDir: string
): Promise<Record<string, string>> {
  const packageJsonPath = join(workDir, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    return packageJson.scripts || {};
  } catch {
    return {};
  }
}

/**
 * 開発サーバーの設定を検証
 *
 * astro.config.mjsの設定を確認
 */
export interface AstroConfigValidation {
  valid: boolean;
  outputMode?: string;
  serverPort?: number;
  errors: string[];
}

export async function validateAstroConfig(
  workDir: string
): Promise<AstroConfigValidation> {
  const configPath = join(workDir, 'astro.config.mjs');
  const errors: string[] = [];

  if (!existsSync(configPath)) {
    return {
      valid: false,
      errors: [`astro.config.mjs not found in: ${workDir}`],
    };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');

    // output mode の検出
    const outputMatch = content.match(/output:\s*['"](\w+)['"]/);
    const outputMode = outputMatch ? outputMatch[1] : undefined;

    // server port の検出（明示的な設定がある場合）
    const portMatch = content.match(/port:\s*(\d+)/);
    const serverPort = portMatch ? parseInt(portMatch[1], 10) : 4321;

    // output: 'static' の確認
    if (outputMode && outputMode !== 'static') {
      errors.push(`Expected output mode 'static', got '${outputMode}'`);
    }

    return {
      valid: errors.length === 0,
      outputMode: outputMode || 'static', // Astro 5のデフォルトは 'static'
      serverPort,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        error instanceof Error ? error.message : 'Failed to parse config',
      ],
    };
  }
}

/**
 * ビルド出力ディレクトリの存在を確認
 */
export async function checkDistExists(workDir: string): Promise<boolean> {
  const distPath = join(workDir, 'dist');
  return existsSync(distPath);
}

/**
 * CI/CD設定の検証
 *
 * Requirements 13.6: CI失敗時のデプロイブロックを確認
 */
export interface CIConfigValidation {
  valid: boolean;
  hasTestStep: boolean;
  hasBuildStep: boolean;
  hasDeployBlockOnFailure: boolean;
  errors: string[];
}

export async function validateCIConfig(
  workflowPath: string
): Promise<CIConfigValidation> {
  const errors: string[] = [];

  if (!existsSync(workflowPath)) {
    return {
      valid: false,
      hasTestStep: false,
      hasBuildStep: false,
      hasDeployBlockOnFailure: false,
      errors: [`Workflow file not found: ${workflowPath}`],
    };
  }

  try {
    const content = readFileSync(workflowPath, 'utf-8');
    const workflow = yaml.load(content) as Record<string, unknown>;
    const jobs = (workflow?.jobs || {}) as Record<string, unknown>;

    // テストステップの検出
    const hasTestStep = Object.keys(jobs).some((jobName) => {
      const job = jobs[jobName] as Record<string, unknown>;
      const steps = (job?.steps || []) as Record<string, unknown>[];
      return (
        jobName.includes('test') ||
        steps.some((step) => {
          const run = step.run as string | undefined;
          return (
            run &&
            (run.includes('test') ||
              run.includes('vitest') ||
              run.includes('jest'))
          );
        })
      );
    });

    // ビルドステップの検出
    const hasBuildStep = Object.keys(jobs).some((jobName) => {
      const job = jobs[jobName] as Record<string, unknown>;
      const steps = (job?.steps || []) as Record<string, unknown>[];
      return (
        jobName.includes('build') ||
        steps.some((step) => {
          const run = step.run as string | undefined;
          return run && run.includes('build');
        })
      );
    });

    // デプロイブロック（needs依存関係）の検出
    const hasDeployBlockOnFailure = Object.entries(jobs).some(
      ([jobName, job]) => {
        const jobRecord = job as Record<string, unknown>;
        if (jobName.includes('deploy')) {
          const needs = jobRecord.needs as string | string[] | undefined;
          // needs が存在し、かつ if 条件で成功を確認している場合
          const ifCondition = jobRecord.if as string | undefined;
          return (
            needs !== undefined &&
            (ifCondition?.includes('success') ||
              ifCondition?.includes('result'))
          );
        }
        return false;
      }
    );

    return {
      valid: true,
      hasTestStep,
      hasBuildStep,
      hasDeployBlockOnFailure,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      hasTestStep: false,
      hasBuildStep: false,
      hasDeployBlockOnFailure: false,
      errors: [
        error instanceof Error ? error.message : 'Failed to parse workflow',
      ],
    };
  }
}

/**
 * GitHub Actionsワークフローの依存関係を検証
 *
 * デプロイジョブがテスト/ビルドジョブに依存しているか確認
 */
export interface WorkflowDependencyCheck {
  valid: boolean;
  deployJobs: string[];
  dependsOnJobs: string[];
  hasProperDependencies: boolean;
}

export async function checkWorkflowDependencies(
  workflowPath: string
): Promise<WorkflowDependencyCheck> {
  if (!existsSync(workflowPath)) {
    return {
      valid: false,
      deployJobs: [],
      dependsOnJobs: [],
      hasProperDependencies: false,
    };
  }

  try {
    const content = readFileSync(workflowPath, 'utf-8');
    const workflow = yaml.load(content) as Record<string, unknown>;
    const jobs = (workflow?.jobs || {}) as Record<string, unknown>;

    const deployJobs: string[] = [];
    const dependsOnJobs: string[] = [];

    // デプロイジョブとその依存関係を収集
    for (const [jobName, job] of Object.entries(jobs)) {
      const jobRecord = job as Record<string, unknown>;

      if (jobName.includes('deploy')) {
        deployJobs.push(jobName);

        const needs = jobRecord.needs as string | string[] | undefined;
        if (needs) {
          const needsList = Array.isArray(needs) ? needs : [needs];
          for (const dep of needsList) {
            if (!dependsOnJobs.includes(dep)) {
              dependsOnJobs.push(dep);
            }
          }
        }
      }
    }

    // デプロイジョブがビルドジョブに依存しているか確認
    const hasProperDependencies = deployJobs.every((deployJob) => {
      const job = jobs[deployJob] as Record<string, unknown>;
      const needs = job?.needs as string | string[] | undefined;
      if (!needs) return false;

      const needsList = Array.isArray(needs) ? needs : [needs];
      // ビルドまたはテストジョブに依存しているか
      return needsList.some(
        (dep) =>
          dep.includes('build') ||
          dep.includes('test') ||
          dep.includes('detect')
      );
    });

    return {
      valid: true,
      deployJobs,
      dependsOnJobs,
      hasProperDependencies,
    };
  } catch (error) {
    return {
      valid: false,
      deployJobs: [],
      dependsOnJobs: [],
      hasProperDependencies: false,
    };
  }
}
