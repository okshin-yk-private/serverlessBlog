#!/usr/bin/env node
/**
 * カバレッジバッジ生成スクリプト
 *
 * Requirement R45: 継続的テスト実行
 * Requirement R46: テストドキュメント
 *
 * このスクリプトは各コンポーネントのカバレッジ情報を読み取り、
 * shields.io形式のSVGバッジを生成します。
 *
 * 使用方法:
 *   node scripts/generate-coverage-badges.js
 *
 * 出力:
 *   docs/badges/coverage-backend.svg
 *   docs/badges/coverage-infrastructure.svg
 *   docs/badges/coverage-frontend-public.svg
 *   docs/badges/coverage-frontend-admin.svg
 *   docs/badges/coverage-overall.svg
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// バッジ色の決定関数
function getBadgeColor(percentage) {
  if (percentage === 100) return 'brightgreen';
  if (percentage >= 90) return 'green';
  if (percentage >= 80) return 'yellow';
  if (percentage >= 70) return 'orange';
  return 'red';
}

// SVGバッジの生成
function generateBadgeSVG(label, percentage) {
  const color = getBadgeColor(percentage);
  const value = `${percentage.toFixed(1)}%`;

  // shields.io スタイルのSVG
  const labelWidth = label.length * 7 + 10;
  const valueWidth = value.length * 7 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <path fill="#555" d="M0 0h${labelWidth}v20H0z"/>
    <path fill="#${color === 'brightgreen' ? '4c1' : color === 'green' ? '97ca00' : color === 'yellow' ? 'dfb317' : color === 'orange' ? 'fe7d37' : 'e05d44'}" d="M${labelWidth} 0h${valueWidth}v20H${labelWidth}z"/>
    <path fill="url(#b)" d="M0 0h${totalWidth}v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

// カバレッジ情報の読み取り
function readCoverageSummary(coveragePath) {
  try {
    const summaryPath = join(rootDir, coveragePath, 'coverage-summary.json');
    if (!existsSync(summaryPath)) {
      console.warn(`⚠️  カバレッジファイルが見つかりません: ${summaryPath}`);
      return null;
    }

    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
    const total = summary.total;

    return {
      statements: total.statements.pct,
      branches: total.branches.pct,
      functions: total.functions.pct,
      lines: total.lines.pct,
      average: (total.statements.pct + total.branches.pct + total.functions.pct + total.lines.pct) / 4
    };
  } catch (error) {
    console.error(`❌ カバレッジ読み取りエラー (${coveragePath}):`, error.message);
    return null;
  }
}

// メイン処理
function main() {
  console.log('📊 カバレッジバッジを生成中...\n');

  // バッジディレクトリの作成
  const badgesDir = join(rootDir, 'docs', 'badges');
  if (!existsSync(badgesDir)) {
    mkdirSync(badgesDir, { recursive: true });
  }

  // 各コンポーネントのカバレッジ情報
  const components = [
    { name: 'Backend', path: 'coverage', badgeName: 'coverage-backend.svg' },
    { name: 'Infrastructure', path: 'infrastructure/coverage', badgeName: 'coverage-infrastructure.svg' },
    { name: 'Frontend (Public)', path: 'frontend/public/coverage', badgeName: 'coverage-frontend-public.svg' },
    { name: 'Frontend (Admin)', path: 'frontend/admin/coverage', badgeName: 'coverage-frontend-admin.svg' }
  ];

  const coverageResults = [];

  // 各コンポーネントのバッジ生成
  components.forEach(component => {
    const coverage = readCoverageSummary(component.path);

    if (coverage) {
      const badgeSVG = generateBadgeSVG(component.name, coverage.average);
      const badgePath = join(badgesDir, component.badgeName);
      writeFileSync(badgePath, badgeSVG);

      console.log(`✅ ${component.name}: ${coverage.average.toFixed(1)}% (${badgePath})`);
      coverageResults.push(coverage.average);
    } else {
      console.log(`⏭️  ${component.name}: スキップ（カバレッジデータなし）`);
    }
  });

  // 全体のカバレッジバッジ生成
  if (coverageResults.length > 0) {
    const overallCoverage = coverageResults.reduce((sum, cov) => sum + cov, 0) / coverageResults.length;
    const overallBadgeSVG = generateBadgeSVG('coverage', overallCoverage);
    const overallBadgePath = join(badgesDir, 'coverage-overall.svg');
    writeFileSync(overallBadgePath, overallBadgeSVG);

    console.log(`\n✅ Overall Coverage: ${overallCoverage.toFixed(1)}% (${overallBadgePath})`);
  }

  console.log('\n✨ カバレッジバッジの生成が完了しました！');
}

main();
