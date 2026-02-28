# LLRT導入評価 ギャップ分析レポート

## エグゼクティブサマリー

本ドキュメントは、サーバーレスブログプラットフォームの各Lambda関数に対するLLRT（Low Latency Runtime）導入可能性のギャップ分析結果をまとめたものである。

### 主要な発見事項

| 項目 | 現状 | LLRT互換性 | 影響 |
|------|------|------------|------|
| Lambda Powertools | 全11関数で使用 | ❌ 非互換 | **致命的** - 監視・ロギング機能喪失 |
| AWS SDK v3 (DynamoDB, S3, Cognito) | 全関数で使用 | ✅ 対応 | 問題なし |
| marked (Markdown変換) | Common Layerで使用 | ⚠️ 要検証 | 中程度 |
| isomorphic-dompurify (XSS対策) | Common Layerで使用 | ❌ 非互換可能性高 | **致命的** - jsdom依存 |
| ARM64アーキテクチャ | 全関数でGraviton2使用 | ✅ 対応 | 問題なし |

### 結論

**現時点でのLLRT導入は推奨しない**。Lambda Powertoolsの非互換性が最大のブロッカーであり、監視・ロギング機能の代替手段なしに本番環境での運用は困難である。

---

## 1. 現状調査

### 1.1 評価対象Lambda関数一覧

| 関数名 | ファイルパス | AWS SDK使用 | Powertools |
|--------|-------------|-------------|------------|
| createPost | `functions/posts/createPost/handler.ts` | DynamoDB | Logger, Tracer, Metrics |
| getPost | `functions/posts/getPost/handler.ts` | DynamoDB | Logger, Tracer, Metrics |
| getPublicPost | `functions/posts/getPublicPost/handler.ts` | DynamoDB | Logger, Tracer, Metrics |
| updatePost | `functions/posts/updatePost/handler.ts` | DynamoDB | Logger, Tracer, Metrics |
| deletePost | `functions/posts/deletePost/handler.ts` | DynamoDB, S3 | Logger, Tracer, Metrics |
| listPosts | `functions/posts/listPosts/handler.ts` | DynamoDB | Logger, Tracer, Metrics |
| login | `functions/auth/login/handler.ts` | Cognito | Logger, Tracer, Metrics |
| logout | `functions/auth/logout/handler.ts` | Cognito | Logger, Tracer, Metrics |
| refresh | `functions/auth/refresh/handler.ts` | Cognito | Logger, Tracer, Metrics |
| getUploadUrl | `functions/images/getUploadUrl/handler.ts` | S3 | Logger, Tracer, Metrics |
| deleteImage | `functions/images/deleteImage/handler.ts` | S3 | Logger, Tracer, Metrics |

### 1.2 依存関係マトリクス

#### Lambda Layers

| Layer | 依存パッケージ | LLRT互換性 |
|-------|---------------|-----------|
| Powertools Layer | @aws-lambda-powertools/logger | ❌ 非互換 ([GitHub Issue #2050](https://github.com/aws-powertools/powertools-lambda-typescript/issues/2050)) |
| | @aws-lambda-powertools/tracer | ❌ 非互換 |
| | @aws-lambda-powertools/metrics | ❌ 非互換 |
| | @aws-lambda-powertools/parameters | ⚠️ 未確認 |
| Common Layer | marked | ⚠️ 要検証 |
| | isomorphic-dompurify | ❌ 非互換可能性高（jsdom依存） |
| | @aws-sdk/client-s3 | ✅ LLRT内蔵 |
| | @aws-sdk/s3-request-presigner | ✅ LLRT内蔵 |
| | @aws-sdk/client-dynamodb | ✅ LLRT内蔵 |
| | @aws-sdk/lib-dynamodb | ✅ LLRT内蔵 |

#### 関数固有の依存

| 関数 | 追加依存 | LLRT互換性 |
|------|----------|-----------|
| auth/* | @aws-sdk/client-cognito-identity-provider | ✅ LLRT内蔵（std-sdk） |
| posts/deletePost | @aws-sdk/client-s3 (DeleteObjectsCommand) | ✅ LLRT内蔵 |

### 1.3 現在のCDK設定

`infrastructure/lib/lambda-functions-stack.ts` より：

```typescript
const commonFunctionProps = {
  runtime: lambda.Runtime.NODEJS_24_X,
  architecture: lambda.Architecture.ARM_64,
  layers: [powertoolsLayer, commonLayer],
  environment: {
    POWERTOOLS_SERVICE_NAME: 'blog-platform',
    POWERTOOLS_METRICS_NAMESPACE: 'BlogPlatform',
    LOG_LEVEL: 'INFO',
  },
  tracing: lambda.Tracing.ACTIVE,
};
```

### 1.4 アーキテクチャパターン

- **NodejsFunction**: esbuildによるバンドリング使用
- **外部モジュール設定**: Powertoolsは`externalModules`として指定（Layer参照）
- **ARM64**: 全関数でGraviton2アーキテクチャ採用

---

## 2. LLRT技術調査結果

### 2.1 LLRTの現状

| 項目 | 詳細 |
|------|------|
| 最新バージョン | v0.7.0-beta (2025年9月リリース) |
| リリースステータス | **実験的（Experimental）** |
| JavaScript Engine | QuickJS |
| サポートモジュール形式 | ESMのみ（CommonJS非対応） |

Sources:
- [LLRT GitHub](https://github.com/awslabs/llrt)
- [InfoQ: AWS LLRT](https://www.infoq.com/news/2024/02/aws-llrt-lambda-experimental/)

### 2.2 LLRT内蔵AWS SDKクライアント

LLRTは以下のSDKクライアントを内蔵（std-sdkバンドル）：

✅ **対応済み（プロジェクトで使用）**
- DynamoDB
- S3
- Cognito Identity Provider
- X-Ray
- CloudWatch Logs

⚠️ **注意事項**
- ストリームレスポンスは非対応
- `response.Body.transformToString()` または `response.Body.transformToByteArray()` を使用する必要あり

### 2.3 Node.js API互換性

#### 部分対応 (⚠️)
- `node:crypto` - 一部メソッドのみ
- `node:buffer`
- `node:fs` - 一部メソッドのみ
- `node:streams`
- `node:console` - **Powertoolsブロッカー**
- `node:events`
- `node:net`

#### 非対応 (✘)
- `node:cluster`
- `node:dgram`
- `node:http` / `node:https` / `node:tls` サーバー機能
- `node:worker_threads`
- `node:vm`

### 2.4 Lambda Powertools非互換の詳細

**ブロッカー**: LLRTの`node:console`実装が不完全

```
Error resolving module '/var/task/console'
```

- [GitHub Issue #2050](https://github.com/aws-powertools/powertools-lambda-typescript/issues/2050)で追跡中
- ステータス: **on-hold**（LLRT側のAPI実装待ち）
- Powertoolsチームはワークアラウンドを提供していない

---

## 3. 実装アプローチオプション

### Option A: 完全移行（非推奨）

**前提**: 全関数をLLRTに移行

**ブロッカー**:
- Lambda Powertoolsが使用不可
- isomorphic-dompurifyが使用不可（jsdom依存）

**必要な変更**:
1. Logger/Tracer/Metricsの代替実装（カスタム or console.log）
2. markdownToHtml処理の代替実装（DOMPurify無し or 別ライブラリ）
3. ESMへの完全移行

**トレードオフ**:
- ✅ コールドスタート最大10倍高速化
- ✅ メモリ使用量削減
- ❌ 監視機能の大幅低下
- ❌ XSS対策の再実装必要
- ❌ 実験的ランタイムへの依存
- ❌ 実装工数が膨大

**工数**: XL (2週間以上)
**リスク**: High

---

### Option B: 選択的移行（条件付き推奨）

**前提**: Powertools/DOMPurify不要な関数のみ移行

**対象候補関数**:

| 関数 | Powertools代替可否 | DOMPurify使用 | 移行候補 |
|------|-------------------|---------------|---------|
| getPublicPost | 必要 | なし | ⚠️ 検討可 |
| listPosts | 必要 | なし | ⚠️ 検討可 |
| getUploadUrl | 必要 | なし | ⚠️ 検討可 |
| deleteImage | 必要 | なし | ⚠️ 検討可 |
| login/logout/refresh | 必要 | なし | ⚠️ 検討可 |
| createPost | 必要 | **あり** | ❌ 不可 |
| updatePost | 必要 | **あり** | ❌ 不可 |

**問題点**:
- Powertoolsが必須であるため、監視一貫性が失われる
- 一部関数のみ移行するメリットが薄い

**トレードオフ**:
- ✅ 一部関数のコールドスタート改善
- ❌ 監視の一貫性喪失
- ❌ 運用複雑化（2つのランタイム管理）
- ❌ テスト環境の複雑化

**工数**: L (1-2週間)
**リスク**: Medium-High

---

### Option C: 待機（推奨）

**前提**: LLRTの成熟を待つ

**再評価トリガー条件**:
1. Lambda PowertoolsがLLRT対応を表明（Issue #2050クローズ）
2. LLRT v1.0（GA）リリース
3. `node:console` API完全実装

**代替案の検討**:
- **Lambda SnapStart** (Java/Python向け、Node.jsは2025年時点で未対応)
- **Provisioned Concurrency** - コールドスタート回避（コスト増）
- **ARM64最適化** - 既に実施済み

**トレードオフ**:
- ✅ 現行の監視・セキュリティ機能維持
- ✅ 安定した運用継続
- ✅ 実験的技術のリスク回避
- ❌ コールドスタート改善の機会を見送り

**工数**: S (1-3日、調査レポート作成のみ)
**リスク**: Low

---

## 4. 要件-アセットマッピング

### Requirement 1: 依存関係互換性調査

| 受入基準 | 対応アセット | ギャップ |
|----------|-------------|---------|
| npmパッケージ一覧作成 | 本ドキュメントSection 1.2 | ✅ 完了 |
| LLRT互換性確認 | 本ドキュメントSection 2 | ✅ 完了 |
| Lambda Powertools調査 | Section 2.4 | ✅ 非互換確認 |
| AWS SDK v3調査 | Section 2.2 | ✅ 対応確認 |
| 代替手段調査 | Section 3 | ⚠️ 実用的代替なし |
| Node.js API使用箇所特定 | - | 🔬 Research Needed |

### Requirement 2: パフォーマンス評価基準

| 受入基準 | 対応アセット | ギャップ |
|----------|-------------|---------|
| コールドスタート測定方法 | - | 🔬 Research Needed |
| ウォームスタート測定方法 | - | 🔬 Research Needed |
| メモリ使用量測定方法 | - | 🔬 Research Needed |

**Note**: Powertoolsが使用不可のため、標準的なベンチマーク手法の再検討が必要

### Requirement 3-7

Requirement 1-2の結果により、完全評価フェーズへの移行は推奨しない。
Option Cを選択した場合、最小限の調査レポート作成に留める。

---

## 5. 推奨事項と設計フェーズへの引き継ぎ

### 5.1 推奨アプローチ

**Option C: 待機** を推奨する。

**理由**:
1. Lambda Powertoolsの非互換は致命的であり、監視・ロギングの品質低下は許容できない
2. isomorphic-dompurifyの非互換はセキュリティリスク（XSS対策）に直結する
3. LLRTは実験的ステータスであり、本番環境での使用はAWSも推奨していない
4. 代替案の実装工数が、コールドスタート改善のメリットを上回る

### 5.2 設計フェーズへの引き継ぎ事項

**設計フェーズで実施すべき作業**:

1. **調査レポートテンプレート作成**
   - LLRT互換性マトリクスの最終版
   - パフォーマンス比較（Node.js 24.x現行値のベースライン取得）
   - リスク評価サマリー

2. **再評価プロセス定義**
   - 再評価トリガー条件の文書化
   - モニタリング方法（GitHub Issues、AWS Announcements）

3. **代替案の詳細評価**
   - Provisioned Concurrencyのコスト試算
   - Lambda関数のメモリ/タイムアウト最適化

### 5.3 Research Needed Items

| 項目 | 優先度 | 備考 |
|------|--------|------|
| Lambda Powertools Issue #2050の進捗監視 | High | 月次チェック推奨 |
| LLRT v1.0リリース予定確認 | Medium | AWS公式アナウンス待ち |
| marked ライブラリのLLRT互換性検証 | Low | Powertoolsが解決するまで不要 |
| 代替XSSサニタイザーの調査 | Low | 同上 |

---

## 6. AWS MCP追加調査結果（2026-01-03）

### 6.1 AWS公式ドキュメント調査

AWS公式ドキュメントを検索した結果、**LLRTに関する公式ドキュメントは存在しない**ことが確認された。これはLLRTが実験的プロジェクトであり、AWSの正式サポート対象ではないことを示している。

#### Node.js 24.x ランタイム情報（現行環境）

| 項目 | 詳細 |
|------|------|
| リリース日 | 2025年11月25日 |
| LTS状態 | Active LTS（2028年4月までサポート） |
| 主要変更 | callback-based handlerのサポート終了、新RIC実装 |
| Powertools対応 | ✅ 完全対応 |

**Node.js 24.xの主要改善点**:
- Explicit Resource Management（`using`/`await using`構文）
- Undici 7による`fetch`パフォーマンス向上
- `AsyncLocalStorage`の`AsyncContextFrame`最適化
- ESMインラインCloud Formation関数サポート

### 6.2 Lambda SnapStart対応状況

| ランタイム | SnapStart対応 |
|-----------|--------------|
| Java 11+ | ✅ 対応 |
| Python 3.12+ | ✅ 対応 |
| .NET 8+ | ✅ 対応 |
| **Node.js 24.x** | ❌ **非対応** |

**重要**: Node.jsランタイムはSnapStart非対応のため、コールドスタート改善にはProvisioned Concurrencyを使用する必要がある。

### 6.3 コールドスタート対策の代替案

#### Provisioned Concurrency

| 項目 | 詳細 |
|------|------|
| 効果 | コールドスタートを完全に回避（2桁ミリ秒のレスポンス） |
| コスト | 追加料金発生（プロビジョニング料金 + 実行料金） |
| 設定 | 関数バージョン/エイリアスに対して設定 |
| Auto Scaling | Application Auto Scalingと統合可能 |

**Smartsheet事例**:
- Provisioned Concurrency導入により**P95レイテンシ83%削減**
- Graviton2（ARM64）移行で**20%コスト削減**

#### 現行最適化状況

本プロジェクトは既に以下の最適化を実施済み：
- ✅ ARM64（Graviton2）アーキテクチャ採用
- ✅ Node.js 24.x（最新LTS）
- ✅ Lambda Powertools導入
- ✅ esbuildによるバンドリング最適化

### 6.4 LLRT詳細情報（GitHub調査）

#### バンドル構成

| バンドル | 内容 | ユースケース |
|----------|------|-------------|
| no-sdk | AWS SDK無し | SDK不要なアプリ |
| std-sdk | 主要SDKクライアント（60+） | 一般的なAWSアプリ |
| full-sdk | 全SDKクライアント | ML/AI、分析等 |

#### パフォーマンス特性

| 項目 | LLRTの特性 |
|------|----------|
| コールドスタート | Node.js 20比で**最大10倍高速** |
| 総コスト | **最大2倍削減** |
| JITコンパイラ | ❌ 無し（QuickJS） |
| 計算集約型ワークロード | ⚠️ Node.jsより低速 |

**適合するワークロード**:
- データ変換
- リアルタイム処理
- AWSサービス統合
- バリデーション処理

**不適合なワークロード**:
- 計算集約型処理
- 複雑なビジネスロジック
- Node.js固有APIを多用するアプリ

### 6.5 Lambda Powertools Issue #2050 最新状況

| 項目 | 詳細 |
|------|------|
| ステータス | **Open（On hold）** |
| 根本原因 | LLRTの`console`モジュール実装不完全 |
| エラー | `Error resolving module '/var/task/console'` |
| ワークアラウンド | **なし** |
| 解決予定 | 未定（LLRT側の修正待ち） |

**Powertoolsチームの見解**:
- AWS管理ランタイム（16.x, 18.x, 20.x, 24.x）を公式サポート
- 実験的ランタイムへの対応は優先度低
- LLRT側で`console`モジュールを修正する必要あり

### 6.6 CDK統合オプション

#### cdk-lambda-llrt コンストラクト

サードパーティ製CDKコンストラクト（[constructs.dev](https://constructs.dev/packages/cdk-lambda-llrt)）が利用可能。

**使用例（参考）**:
```typescript
import { LlrtFunction } from 'cdk-lambda-llrt';

new LlrtFunction(this, 'MyLlrtFunction', {
  entry: 'lambda/index.ts',
  llrtVersion: 'v0.7.0-beta',
  bundling: {
    llrtBundle: 'std-sdk', // または 'no-sdk', 'full-sdk'
  },
});
```

**注意**: 本プロジェクトでは現時点での採用は推奨しない。

### 6.7 調査結論の更新

AWS MCP調査により、以下が追加で確認された：

1. **LLRT公式サポート無し**: AWS公式ドキュメントに記載なし
2. **Node.js SnapStart非対応**: コールドスタート改善にはProvisioned Concurrencyのみ
3. **Powertools Issue進展なし**: On hold状態、解決時期未定
4. **現行環境の最適化済み**: ARM64 + Node.js 24.x + Powertools

**最終推奨**: 引き続き**Option C（待機）**を維持。コールドスタートが課題となる場合はProvisioned Concurrencyを検討。

---

## 7. 参考リンク

- [LLRT GitHub Repository](https://github.com/awslabs/llrt)
- [Lambda Powertools LLRT Support Issue #2050](https://github.com/aws-powertools/powertools-lambda-typescript/issues/2050)
- [theburningmonk: First impressions of LLRT](https://theburningmonk.com/2024/02/first-impressions-of-the-fastest-javascript-runtime-for-lambda/)
- [InfoQ: AWS LLRT Introduction](https://www.infoq.com/news/2024/02/aws-llrt-lambda-experimental/)
- [cdk-lambda-llrt Construct Hub](https://constructs.dev/packages/cdk-lambda-llrt)
- [AWS Bites: What's up with LLRT](https://awsbites.com/114-what-s-up-with-llrt-aws-new-lambda-runtime/)
