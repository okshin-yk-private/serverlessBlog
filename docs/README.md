# ドキュメント索引

このディレクトリ配下のドキュメントを目的別に整理しています。

## まず読む
- [デプロイメントガイド](./deployment.md)
- [週次の本番リリース](./WEEKLY_PRODUCTION_RELEASE.md)
- [アーキテクチャ（構成図）](./architecture/README.md)
- [テスト戦略](./testing-strategy.md)
- [カバレッジガイド](./coverage.md)

## 記事公開と配信
- [記事公開ビルドの構成と進捗表示](./codebuild-architecture.md) - Astro SSG ビルド・デプロイ
- [公開サイトの atomic deployment](./atomic-public-deployment.md)
- [記事保存と公開データの整合性](./publication-consistency.md)

## 運用・品質
- [監視とロギング](./monitoring.md)
- [Go Lambda の構造化ログ](./structured-logging.md)
- [セキュリティ](./SECURITY.md)
- [セキュリティスキャン運用](./SECURITY_SCANNING.md)
- [Dependabot 自動マージ](./DEPENDABOT_AUTOMERGE.md)
- [パフォーマンス最適化](./performance-optimization.md) - 一部が CDK / Node.js Lambda 時代の記述（要更新）

## 認証とアクセス
- [開発時の Basic 認証](./DEV_BASIC_AUTH.md) - 一部が CDK 時代の記述（要更新）
- [管理画面の TOTP 導入](./security/admin-totp-rollout.md)
- [管理画面のパスキー導入](./security/admin-passkey-rollout.md)

## AI エージェント向け
- [共通ルール](./ai-shared-rules.md)
- [変更範囲ごとの検証](./ai-verification.md)

## 記録
- [Go 1.26 更新の検証記録](./go-1.26-upgrade-validation.md)
- [テスト体制監査レポート](./TESTING_AUDIT.md)
- [実装メモ](./implementation-notes) - 2025 年の実装記録（現行構成とは異なる可能性がある）

## 仕様・設計（別ディレクトリ）
- [要件定義](../.kiro/specs/serverless-blog-aws/requirements.md)
- [設計書](../.kiro/specs/serverless-blog-aws/design.md)
- [タスク管理](../.kiro/specs/serverless-blog-aws/tasks.md)
