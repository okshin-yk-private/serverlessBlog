# セキュリティガイドライン

## 🔒 Private Repository のセキュリティ運用

このリポジトリはPrivateリポジトリとして管理されています。これにより、以下のセキュリティリスクが大幅に軽減されています：

✅ **インフラ構成の非公開化**
- Terraformコードが外部に公開されない
- システム設計図が保護される
- セキュリティ設定が非公開

✅ **GitHub Actionsログの保護**
- デプロイログは組織メンバーのみ閲覧可能
- AWS Account IDの露出リスクが最小化
- リソース情報が保護される

✅ **攻撃対象面の縮小**
- 攻撃者がシステム構成を把握できない
- 脆弱性の探索が困難
- 標的型攻撃のリスク低減

---

## 実装済みのセキュリティ対策

### 1. GitHub Actions ログマスキング

`.github/workflows/deploy.yml`で機密情報をマスキング：

- **AWS Account ID**: `::add-mask::`で隠蔽
- **S3バケット名**: マスク済み
- **CloudFront Distribution ID**: マスク済み
- **CDK Deploy出力**: ARN、URL、Stack Outputsをフィルタリング

**目的**:
- 内部メンバー間でも不要な情報露出を防ぐ
- ログのコピー＆ペーストによる情報漏洩を防止
- セキュリティベストプラクティスの遵守

### 2. CI/CDワークフローの分離

- **ci.yml**: テストのみ実行（AWS認証情報不要）
- **deploy.yml**: デプロイのみ実行（OIDC認証、ログマスキング済み）

### 3. OIDC認証によるセキュアなデプロイ

AWS Secretsを使わず、GitHub OIDC経由で認証：
- アクセスキー/シークレットキーの管理不要
- 短命な認証情報（セッショントークン）
- ロールベースのアクセス制御

---

## 本番環境運用のセキュリティベストプラクティス

### 必須対策（実装推奨）

#### 1. AWS WAF の有効化

**DDoS、SQLインジェクション、XSS攻撃から保護**

```typescript
// terraform/modules/api/ または terraform/modules/cdn/
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
  scope: 'REGIONAL', // API Gateway用はREGIONAL、CloudFront用はCLOUDFRONT
  defaultAction: { allow: {} },
  rules: [
    {
      name: 'AWSManagedRulesCommonRuleSet',
      priority: 1,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesCommonRuleSet',
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'CommonRuleSet',
      },
    },
  ],
  visibilityConfig: {
    sampledRequestsEnabled: true,
    cloudWatchMetricsEnabled: true,
    metricName: 'WebAcl',
  },
});
```

#### 2. GuardDuty の有効化

**脅威検知とセキュリティ監視**

```bash
# AWS Consoleから有効化
# または、CDKで実装（監視対象アカウント全体に適用）
```

有効化することで：
- 不正アクセスの検知
- 暗号通貨マイニングの検出
- データ漏洩の兆候検知
- CloudTrailログの異常パターン分析

#### 3. Security Hub の有効化

**セキュリティ状況の一元管理**

```bash
# AWS Consoleから有効化
# CIS AWS Foundations Benchmark を有効化推奨
```

#### 4. Cognito セキュリティ強化

**本番環境ではMFAを必須化**

```typescript
// terraform/modules/auth/
this.userPool = new cognito.UserPool(this, 'BlogUserPool', {
  // MFAを必須化（本番環境）
  mfa: cognito.Mfa.REQUIRED,
  mfaSecondFactor: {
    sms: true,
    otp: true,
  },
  // Advanced Security Mode有効化（推奨、コスト発生）
  advancedSecurityMode: cognito.AdvancedSecurityMode.ENFORCED,

  // パスワードポリシー（既に実装済み）
  passwordPolicy: {
    minLength: 12,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: true,
  },
});
```

**Advanced Security Mode の効果**:
- 不正ログイン試行の検出
- アカウント乗っ取り防止
- リスクベース認証
- デバイストラッキング

**コスト**: MAU（月間アクティブユーザー）課金

#### 5. CloudWatch Alarms 設定

**異常検知とアラート通知**

```typescript
// terraform/modules/monitoring/
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

// SNS Topic for alerts
const alertTopic = new sns.Topic(this, 'SecurityAlertTopic', {
  displayName: 'Security Alerts',
});

// メール通知を追加
alertTopic.addSubscription(
  new subscriptions.EmailSubscription('your-email@example.com')
);

// API Gateway エラー検知
const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
  metric: restApi.metricClientError({
    period: cdk.Duration.minutes(5),
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'API Gateway client errors exceeded threshold',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});
apiErrorAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

// Lambda エラー検知
const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
  metric: lambdaFunction.metricErrors({
    period: cdk.Duration.minutes(5),
  }),
  threshold: 5,
  evaluationPeriods: 2,
  alarmDescription: 'Lambda function errors exceeded threshold',
});
lambdaErrorAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

// DynamoDB スロットリング検知
const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
  metric: table.metricUserErrors({
    period: cdk.Duration.minutes(5),
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'DynamoDB throttling detected',
});
dynamoThrottleAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

---

## データ保護

### ユーザーデータの保管場所

✅ **全てAWS上で安全に保管**
- **DynamoDB**: ブログ記事データ（暗号化at-rest有効）
- **S3**: 画像ファイル（暗号化、バージョニング有効）
- **Cognito**: ユーザー認証情報（AWS管理）

✅ **GitHubリポジトリには一切含まれない**
- コードのみが保存される
- 環境変数はGitHub Secretsで管理
- データベースの内容は非公開

### バックアップとリカバリ

```typescript
// DynamoDBのPoint-in-Time Recovery
const table = new dynamodb.Table(this, 'BlogPostsTable', {
  pointInTimeRecovery: true, // 有効化推奨
  // ... 他の設定
});

// S3のバージョニング（既に有効）
const bucket = new s3.Bucket(this, 'ImageBucket', {
  versioned: true,
  lifecycleRules: [
    {
      noncurrentVersionExpiration: cdk.Duration.days(30),
    },
  ],
});
```

---

## アクセス制御

### GitHub Repository のアクセス管理

推奨設定：
- **Branch Protection Rules**: mainブランチへの直接pushを禁止
- **Required Reviews**: PRマージ前に1名以上のレビュー必須
- **Status Checks**: CI/CDパス必須
- **Dismiss stale reviews**: コード変更時にレビューを無効化

### AWS IAM のアクセス制御

- **最小権限の原則**: 必要最小限の権限のみ付与
- **MFA必須**: ルートユーザーとIAMユーザーでMFA有効化
- **ロール使用**: アクセスキーではなくロールを使用
- **定期監査**: IAM Access Analyzerで権限を定期確認

---

## インシデント対応計画

### セキュリティインシデント発生時の手順

#### 1. 検知
- CloudWatch Alarms
- GuardDuty alerts
- 異常なログパターン

#### 2. 初動対応
1. **影響範囲の特定**: CloudTrailログで不正アクセスを確認
2. **即座に隔離**: 疑わしいリソースを停止
3. **認証情報の無効化**: 漏洩した可能性のある認証情報をローテーション

#### 3. 調査
- CloudTrailログの詳細分析
- VPC Flow Logsの確認（有効化している場合）
- アプリケーションログの確認

#### 4. 復旧
1. 脆弱性の修正
2. システムの復旧
3. データの整合性確認

#### 5. 事後対応
- インシデントレポート作成
- 再発防止策の実施
- セキュリティ対策の見直し

---

## 環境別セキュリティ設定

### Development環境

現在の設定（コスト最適化）:
- MFA: OPTIONAL
- Advanced Security Mode: OFF
- AWS WAF: OFF（推奨: ON）
- GuardDuty: ON推奨

### Production環境

推奨設定（セキュリティ最大化）:
- ✅ MFA: **REQUIRED**
- ✅ Advanced Security Mode: **ENFORCED**
- ✅ AWS WAF: **ON**
- ✅ GuardDuty: **ON**
- ✅ Security Hub: **ON**
- ✅ CloudWatch Alarms: **設定済み**
- ✅ バックアップ: **有効**

---

## セキュリティチェックリスト

### デプロイ前

- [ ] 全テストがパス
- [ ] Checkov/Trivy セキュリティスキャンがパス
- [ ] セキュリティスキャン実施
- [ ] PRレビュー完了

### 本番環境デプロイ前（追加）

- [ ] AWS WAF設定確認
- [ ] Cognito MFA設定確認
- [ ] CloudWatch Alarms設定確認
- [ ] バックアップ設定確認
- [ ] インシデント対応計画の確認

### 定期確認（月次推奨）

- [ ] GuardDuty findings確認
- [ ] Security Hub スコア確認
- [ ] CloudTrailログ監査
- [ ] IAM Access Analyzer確認
- [ ] 不要なリソースの削除
- [ ] コスト最適化レビュー

---

## 参考資料

- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [AWS Well-Architected Framework - Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CDK Security Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html#best-practices-security)

---

## まとめ

✅ **Privateリポジトリによる基本的な保護は完了**

次のステップ:
1. 本番環境用のセキュリティ強化（AWS WAF、GuardDuty等）
2. CloudWatch Alarmsの設定
3. 定期的なセキュリティ監査の実施

Privateリポジトリへの移行により、セキュリティリスクが大幅に軽減されました。
上記のベストプラクティスを段階的に実装することで、より堅牢なシステムを構築できます。
