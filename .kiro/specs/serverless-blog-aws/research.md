# Research & Design Decisions Template

---
**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.

**Usage**:
- Log research activities and outcomes during the discovery phase.
- Document design decision trade-offs that are too detailed for `design.md`.
- Provide references and evidence for future audits or reuse.
---

## Summary
- **Feature**: `serverless-blog-aws`
- **Discovery Scope**: Extension（DEV環境Basic認証追加）
- **Key Findings**:
  - CloudFront Functionsは認証処理に最適（Lambda@Edgeの1/6のコスト、200万リクエスト無料枠）
  - CloudFront FunctionsはSecrets Managerへの直接アクセス不可（ネットワーク呼び出し・環境変数なし）
  - 認証情報はCDKデプロイ時に関数コードに埋め込む方式を採用（簡素性とコストを優先）
  - Playwright httpCredentialsはextraHTTPHeadersを使用した方が確実

## Research Log

### CloudFront Functions vs Lambda@Edge for Basic Authentication

- **Context**: DEV環境のパブリックサイトにBasic認証を追加する方法を検討
- **Sources Consulted**:
  - [Easy Implementation with CloudFront Functions: Use Cases for Basic Authentication](https://medium.com/@yoshiyuki.watanabe/easy-implementation-with-cloudfront-functions-use-cases-for-basic-authentication-and-redirects-ed82949e0301)
  - [How to secure CloudFront access using Basic Auth](https://medium.com/@aashari/how-to-secure-cloudfront-access-using-basic-auth-c370b46c77ac)
  - [Customize at the edge with CloudFront Functions - Amazon CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)
- **Findings**:
  - **CloudFront Functions**: 軽量タスク（Basic認証、URLリダイレクト、ヘッダー修正）に最適
  - **コスト**: Lambda@Edgeの1/6のコスト、無料枠2,000,000リクエスト/月
  - **パフォーマンス**: 実行時間制限1ms、JavaScriptのみ（ES5.1）
  - **制約**: ネットワーク呼び出し不可、環境変数なし、すべてのヘッダー名は小文字
  - **推奨**: Basic認証にはCloudFront Functionsが2025年時点で推奨される解決策
- **Implications**: CloudFront Functions採用により、コスト効率的かつシンプルな実装が可能

### AWS Secrets Manager統合の制約

- **Context**: 認証情報を安全に管理する方法を検討
- **Sources Consulted**:
  - [Securing CloudFront Distributions using OpenID Connect and AWS Secrets Manager](https://aws.amazon.com/blogs/networking-and-content-delivery/securing-cloudfront-distributions-using-openid-connect-and-aws-secrets-manager/)
  - [CloudFront Function: Secret/Config management · aws/aws-cdk · Discussion #18339](https://github.com/aws/aws-cdk/discussions/18339)
  - [Securing and Accessing Secrets from Lambda@Edge using AWS Secrets Manager](https://aws.amazon.com/blogs/networking-and-content-delivery/securing-and-accessing-secrets-from-lambdaedge-using-aws-secrets-manager/)
- **Findings**:
  - **CloudFront Functionsの制約**: 環境変数なし、ネットワーク呼び出し不可 → Secrets Manager直接アクセス不可
  - **Lambda@Edgeの場合**: Secrets Managerへのアクセス可能、ただしコスト高、実装複雑
  - **回避策**:
    1. CDKコンテキストに認証情報を保存し、デプロイ時に関数コードに埋め込む
    2. Lambda@Edgeに切り替える（コスト増加）
    3. 簡易的にハードコード（セキュリティリスク、ローテーション不可）
- **Implications**: 本プロジェクトでは簡素性とコストを優先し、認証情報をCDKデプロイ時に関数コードに埋め込む方式を採用

### Playwright Basic Authentication テスト戦略

- **Context**: GitHub ActionsでPlaywrightテストがDEV環境のBasic認証を通過する方法を検討
- **Sources Consulted**:
  - [Authentication | Playwright](https://playwright.dev/docs/auth)
  - [Playwright — Automating HTTP Basic Auth (Browser Login Dialog)](https://www.devassure.io/blog/playwright-basic-auth/)
  - [Web Authentication with Playwright: Basic and Digest Explained](https://medium.com/@thananjayan1988/web-authentication-with-playwright-basic-and-digest-explained-aab9ce78dc3e)
- **Findings**:
  - **httpCredentials方式**: playwright.config.tsで`httpCredentials: { username, password }`を設定
    - 動作: 最初のリクエストはAuthorizationヘッダーなし → 401レスポンス → 認証情報付きで再リクエスト
    - 問題: 403レスポンスの場合は動作しない、プロキシとの競合、APIRequestContextで無視されることがある
  - **extraHTTPHeaders方式（推奨）**: Base64エンコードした認証情報をすべてのリクエストに手動追加
    - 利点: より確実、すべてのリクエストに適用、レスポンスコードに依存しない
    - 実装: `Authorization: Basic ${base64Encode(username:password)}`
- **Implications**: Playwright設定でextraHTTPHeadersを使用し、GitHub Actions環境変数から認証情報を取得

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| CloudFront Functions | CloudFront Functionsでviewer-requestイベントでBasic認証実施 | コスト効率（Lambda@Edgeの1/6）、シンプル実装、200万リクエスト無料枠 | Secrets Manager直接アクセス不可、認証情報ローテーション手動、JavaScript ES5.1のみ | **採用**: 簡素性とコストを優先 |
| Lambda@Edge | Lambda@Edgeでviewer-requestイベントでBasic認証実施 | Secrets Manager統合可能、認証情報ローテーション自動、より複雑なロジック対応 | コスト高（CloudFront Functionsの6倍）、実装複雑、リージョンレプリケーション必要 | 不採用: コストと複雑性が高い |
| WAF IP Set | WAF IP Setでアクセス元IPを制限 | AWSネイティブ、簡単設定 | IPアドレス管理必要、動的IP対応困難、認証なし | 不採用: GitHub Actionsの動的IPに対応不可 |

## Design Decisions

### Decision: CloudFront Functions + CDKデプロイ時認証情報埋め込み

- **Context**: DEV環境のパブリックサイトへのアクセスを保護する必要があり、コスト効率とシンプルさを優先したい
- **Alternatives Considered**:
  1. **CloudFront Functions + Secrets Manager**: Secrets Managerから認証情報を動的取得 → CloudFront Functionsの制約（ネットワーク呼び出し不可）により不可能
  2. **Lambda@Edge + Secrets Manager**: Lambda@EdgeでSecrets Managerから認証情報を取得 → コスト高（CloudFront Functionsの6倍）、実装複雑
  3. **WAF IP Set**: 特定IPアドレスのみアクセス許可 → GitHub ActionsのIPアドレスが動的で管理困難
- **Selected Approach**: **CloudFront Functions + CDKデプロイ時にCDKコンテキストから認証情報を関数コードに埋め込む**
- **Rationale**:
  - **コスト効率**: Lambda@Edgeの1/6のコスト、200万リクエスト無料枠
  - **シンプル実装**: CloudFront Functionsのviewer-requestイベントで認証ヘッダーをチェック、Base64デコード、比較のみ
  - **DEV環境限定**: 本番環境では不要、DEV環境のみ適用
  - **認証情報管理**: CDKコンテキスト（cdk.context.json）に認証情報を保存、デプロイ時に関数コードに埋め込み
  - **セキュリティ**: cdk.context.jsonは.gitignoreに追加、GitHub Secretsには含めない、DEV環境のみ適用
- **Trade-offs**:
  - **利点**: コスト効率、シンプル実装、低レイテンシ、GitHub Actions統合容易
  - **欠点**: 認証情報ローテーションが手動、Secrets Manager統合なし、CloudFront Functions再デプロイ必要
- **Follow-up**: 本番環境では認証不要のため、DEV環境デプロイ時のみCloudFront Functionを関連付ける

### Decision: Playwright extraHTTPHeaders方式

- **Context**: GitHub ActionsでPlaywrightテストがDEV環境のBasic認証を通過する必要がある
- **Alternatives Considered**:
  1. **httpCredentials方式**: playwright.config.tsで`httpCredentials`を設定 → 401レスポンス前提、プロキシとの競合リスク
  2. **URL埋め込み方式**: `https://username:password@example.com` → 非推奨、一部ブラウザで動作しない
- **Selected Approach**: **extraHTTPHeaders方式でBase64エンコードした認証情報を手動追加**
- **Rationale**: すべてのリクエストに確実に認証ヘッダーを追加、レスポンスコードに依存しない、プロキシとの競合なし
- **Trade-offs**: 手動でBase64エンコード必要、設定が若干複雑

## Risks & Mitigations

- **Risk 1: 認証情報のハードコード** → 対策: cdk.context.jsonを.gitignoreに追加、GitHub Secretsには含めない、DEV環境のみ適用
- **Risk 2: CloudFront Functionsの実行時間制限（1ms）** → 対策: 認証処理は100μs未満で完了（Base64デコード、文字列比較のみ）
- **Risk 3: 認証情報ローテーション手動** → 対策: DEV環境のため、ローテーション頻度は低い、必要時にCDK再デプロイ

## References

- [Easy Implementation with CloudFront Functions: Use Cases for Basic Authentication](https://medium.com/@yoshiyuki.watanabe/easy-implementation-with-cloudfront-functions-use-cases-for-basic-authentication-and-redirects-ed82949e0301)
- [How to secure CloudFront access using Basic Auth](https://medium.com/@aashari/how-to-secure-cloudfront-access-using-basic-auth-c370b46c77ac)
- [Customize at the edge with CloudFront Functions - Amazon CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)
- [CloudFront Function: Secret/Config management · aws/aws-cdk · Discussion #18339](https://github.com/aws/aws-cdk/discussions/18339)
- [Authentication | Playwright](https://playwright.dev/docs/auth)
- [Playwright — Automating HTTP Basic Auth (Browser Login Dialog)](https://www.devassure.io/blog/playwright-basic-auth/)
