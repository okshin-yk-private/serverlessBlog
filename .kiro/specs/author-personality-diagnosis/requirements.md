# Requirements Document

## Introduction
本機能は、ブログ記事の内容と執筆パターンからAIが筆者の性格を分析し、RPG風のステータス画面としてAboutページに公開表示する機能である。大手ブログプラットフォームでは、AI分析コスト、審査プロセス、個人情報の取り扱いなどの制約により実現困難な、個人サイトならではの独創的な機能を提供する。

AWS Bedrock AgentCoreとClaude Sonnet 4.5を活用し、Knowledge Base（S3 Vectors）による筆者プロフィール参照、AgentCore Gatewayを通じたSemantic Scholar APIによる最新心理学論文検索、AgentCore Memory Strategyによる診断履歴の長期記憶を統合する。性格特性はBIG5やMBTIに限定せず、最新の心理学研究を動的に参照し、日本語カジュアル表現（「好奇心」「計画性」「おだやかさ」など）で親しみやすく表示する。

## Requirements

### Requirement 1: 性格診断結果の表示
**Objective:** 訪問者として、筆者の性格をRPG風ステータス形式で閲覧したい。筆者の人となりを直感的に理解できるようにするため。

#### Acceptance Criteria
1. When ユーザーがAboutページにアクセスした時, the フロントエンドアプリケーション shall 診断結果をRPG風ステータスカード形式で表示する
2. The RPGステータスカード shall クラス名（例：深夜の探求者）、レベル、経験値バーを表示する
3. The RPGステータスカード shall 5〜7項目の性格特性をプログレスバー（0-100）と共に表示する
4. The RPGステータスカード shall 性格的特徴を3〜5個の箇条書きで表示する
5. The RPGステータスカード shall 獲得称号（例：孤高の研究者、深夜の思索家）を表示する
6. The RPGステータスカード shall 診断に参照した論文情報（著者名、年、タイトル）を表示する
7. While 診断結果が存在しない時, the フロントエンドアプリケーション shall 「診断結果がありません」メッセージを表示する
8. While 診断結果を取得中, the フロントエンドアプリケーション shall ローディングインジケータを表示する

### Requirement 2: 診断結果API
**Objective:** フロントエンド開発者として、診断結果を取得するAPIエンドポイントを利用したい。AboutページでRPGステータスカードを表示するため。

#### Acceptance Criteria
1. The API Gateway shall `GET /diagnosis` エンドポイントを認証不要で提供する
2. When `GET /diagnosis` リクエストを受信した時, the getDiagnosis Lambda shall DynamoDBから最新の診断結果を取得して返却する
3. The getDiagnosis Lambda shall 診断結果をJSON形式（className, level, experience, personalityTraits, characteristics, titles, writingPatterns, researchReferences）で返却する
4. If 診断結果が存在しない場合, then the getDiagnosis Lambda shall HTTPステータス404とエラーメッセージを返却する
5. If DynamoDBアクセスエラーが発生した場合, then the getDiagnosis Lambda shall HTTPステータス500とエラーメッセージを返却する

### Requirement 3: 自動診断トリガー
**Objective:** 管理者として、記事公開時に自動的に性格診断が実行されるようにしたい。手動操作なしで常に最新の診断結果を維持するため。

#### Acceptance Criteria
1. When BlogPostsテーブルのpublishStatusがdraftからpublishedに変更された時, the DynamoDB Streams shall analyzeDiagnosis Lambdaをトリガーする
2. When analyzeDiagnosis Lambdaがトリガーされた時, the analyzeDiagnosis Lambda shall AgentCore Runtimeを呼び出して診断を実行する
3. When 診断が正常に完了した時, the analyzeDiagnosis Lambda shall 診断結果をAuthorDiagnosisテーブルに保存する
4. If AgentCore Runtime呼び出しがタイムアウトした場合, then the analyzeDiagnosis Lambda shall エラーをCloudWatch Logsに記録してリトライキューに追加する
5. The analyzeDiagnosis Lambda shall 非同期で実行され、記事公開処理をブロックしない

### Requirement 4: 手動診断トリガー
**Objective:** 管理者として、任意のタイミングで性格診断を実行したい。記事公開以外のタイミングでも診断結果を更新できるようにするため。

#### Acceptance Criteria
1. The API Gateway shall `POST /admin/diagnosis/analyze` エンドポイントをCognito認証付きで提供する
2. When 認証済みユーザーが`POST /admin/diagnosis/analyze`を呼び出した時, the analyzeDiagnosis Lambda shall AgentCore Runtimeを呼び出して診断を実行する
3. When 診断が正常に完了した時, the API Gateway shall HTTPステータス202とジョブIDを返却する
4. If 認証トークンが無効な場合, then the API Gateway shall HTTPステータス401を返却する

### Requirement 5: AgentCore Runtime診断エージェント
**Objective:** システム管理者として、AIエージェントが性格診断を実行できるようにしたい。ブログ記事と最新研究を統合した高精度な診断を提供するため。

#### Acceptance Criteria
1. The AgentCore Runtime shall Claude Sonnet 4.5モデルを使用してPythonエージェントを実行する
2. The AgentCore Runtime shall MCPプロトコルでKnowledge BaseとGatewayと通信する
3. When 診断リクエストを受信した時, the 診断エージェント shall Knowledge Baseから筆者プロフィール情報を取得する
4. When 診断リクエストを受信した時, the 診断エージェント shall Gateway経由でSemantic Scholar APIから最新の心理学論文を検索する
5. When 診断リクエストを受信した時, the 診断エージェント shall BlogPostsテーブルから全記事を取得して分析する
6. The 診断エージェント shall 性格特性をBIG5/MBTIに限定せず、検索した論文に基づいて動的に決定する
7. The 診断エージェント shall 性格特性名を日本語カジュアル表現（好奇心、計画性、おだやかさなど）で出力する
8. The 診断エージェント shall 診断結果を指定されたJSON形式で出力する

### Requirement 6: Knowledge Base（筆者プロフィール）
**Objective:** AIエージェントとして、筆者のプロフィール情報を参照したい。診断の精度と文脈を向上させるため。

#### Acceptance Criteria
1. The Bedrock Knowledge Base shall S3 Vectorsをベクトルストアとして使用する（OpenSearch Serverless不使用）
2. The Bedrock Knowledge Base shall amazon.titan-embed-text-v2:0モデルで文書を埋め込む
3. The S3データソースバケット shall 筆者プロフィール文書（経歴、スキル、興味分野、価値観、執筆スタイル）を格納する
4. When データソースバケットに文書がアップロードされた時, the システム管理者 shall 手動でIngestion Jobを実行してベクトルインデックスを更新できる
5. The S3 Vectors shall 1024次元のベクトルインデックスをcosine距離メトリクスで作成する

### Requirement 7: AgentCore Gateway（外部API統合）
**Objective:** AIエージェントとして、Semantic Scholar APIにアクセスしたい。最新の心理学研究を診断に反映するため。

#### Acceptance Criteria
1. The AgentCore Gateway shall AWS_IAM認証でMCPプロトコルをサポートする
2. The AgentCore Gateway Target shall paperSearch Lambda関数をMCPツールとして公開する
3. When paperSearch Lambdaが呼び出された時, the paperSearch Lambda shall Semantic Scholar APIに心理学論文検索リクエストを送信する
4. The paperSearch Lambda shall fieldsOfStudy=Psychologyフィルタを適用して検索する
5. The paperSearch Lambda shall 検索結果を著者名、年、タイトル、要約を含むJSON形式で返却する
6. If Semantic Scholar APIがレートリミットを返却した場合, then the paperSearch Lambda shall 1秒待機してリトライする

### Requirement 8: AgentCore Memory Strategy（長期記憶）
**Objective:** AIエージェントとして、過去の診断結果を記憶したい。時系列での性格変化を追跡するため。

#### Acceptance Criteria
1. The AgentCore Memory shall 診断履歴を365日間保持する
2. The AgentCore Memory Strategy shall SEMANTIC typeで診断コンテキストを記憶する
3. When 新しい診断が実行される時, the 診断エージェント shall 過去の診断結果をMemoryから参照して性格変化を考慮する
4. The Memory Strategy shall defaultネームスペースで診断データを管理する

### Requirement 9: Terraformインフラストラクチャ
**Objective:** インフラ管理者として、AgentCore関連リソースをTerraformで管理したい。Infrastructure as Codeの原則に従い、再現可能なデプロイを実現するため。

#### Acceptance Criteria
1. The terraform/modules/agentcore shall S3 Vectors（vector bucket, index）リソースを定義する
2. The terraform/modules/agentcore shall Bedrock Knowledge Base（knowledge base, data source）リソースを定義する
3. The terraform/modules/agentcore shall AgentCore Runtime（agent runtime）リソースを定義する
4. The terraform/modules/agentcore shall AgentCore Gateway（gateway, gateway target）リソースを定義する
5. The terraform/modules/agentcore shall AgentCore Memory（memory, memory strategy）リソースを定義する
6. The terraform/modules/agentcore shall ECRリポジトリ（エージェントコンテナ用）リソースを定義する
7. The terraform/modules/agentcore shall DynamoDB AuthorDiagnosisテーブルリソースを定義する
8. The terraform/modules/agentcore shall 必要なIAMロール・ポリシーを最小権限の原則で定義する
9. The terraform/environments/dev/main.tf shall agentcoreモジュールを呼び出す

### Requirement 10: DynamoDB AuthorDiagnosisテーブル
**Objective:** システムとして、診断結果を永続化したい。高速な読み取りと信頼性の高いストレージを提供するため。

#### Acceptance Criteria
1. The DynamoDB AuthorDiagnosisテーブル shall PAY_PER_REQUEST課金モードで作成される
2. The DynamoDB AuthorDiagnosisテーブル shall id（String）をパーティションキーとする
3. The DynamoDB AuthorDiagnosisテーブル shall Point-in-Time Recoveryを有効にする
4. The DynamoDB AuthorDiagnosisテーブル shall サーバーサイド暗号化（AWS管理キー）を有効にする
5. The 診断結果レコード shall className, level, experience, personalityTraits, characteristics, titles, writingPatterns, researchReferences, analyzedAt属性を含む

### Requirement 11: Go Lambda関数
**Objective:** バックエンド開発者として、Go言語でLambda関数を実装したい。既存のプロジェクト構成と一貫性を保つため。

#### Acceptance Criteria
1. The go-functions/cmd/diagnosis/get/main.go shall getDiagnosis Lambdaハンドラを実装する
2. The go-functions/cmd/diagnosis/analyze/main.go shall analyzeDiagnosis Lambdaハンドラを実装する
3. The go-functions/cmd/paper_search/main.go shall paperSearch Lambdaハンドラを実装する
4. The go-functions/internal/domain/diagnosis.go shall Diagnosis、PersonalityTrait、ResearchReference型を定義する
5. The Lambda関数 shall 既存のinternal/middleware（Logger、Tracer、Metrics）を使用する
6. The Lambda関数 shall ARM64（provided.al2023）アーキテクチャでビルドされる

### Requirement 12: フロントエンドコンポーネント
**Objective:** フロントエンド開発者として、RPGステータスカードコンポーネントを実装したい。魅力的なUIで診断結果を表示するため。

#### Acceptance Criteria
1. The frontend/public/src/types/diagnosis.ts shall Diagnosis、PersonalityTrait、ResearchReference TypeScript型を定義する
2. The frontend/public/src/services/api.ts shall fetchDiagnosis関数を実装する
3. The frontend/public/src/components/diagnosis/RPGStatusCard.tsx shall RPGステータスカードコンポーネントを実装する
4. The RPGStatusCard shall クラス名、レベル、経験値バー、性格特性プログレスバー、特徴リスト、称号、参考文献を表示する
5. The frontend/public/src/pages/AboutPage.tsx shall RPGStatusCardコンポーネントを統合する
6. The RPGStatusCard shall レスポンシブデザインに対応する
7. The RPGStatusCard shall ローディング状態とエラー状態を適切に処理する

### Requirement 13: 診断エージェントコード
**Objective:** AI開発者として、Pythonで診断エージェントを実装したい。AgentCore Runtimeで実行される診断ロジックを提供するため。

#### Acceptance Criteria
1. The agent/personality_diagnosis/main.py shall MCPプロトコル対応の診断エージェントを実装する
2. The agent/personality_diagnosis/tools.py shall MCPツール定義（論文検索、Knowledge Base参照、記事取得）を実装する
3. The agent/Dockerfile shall Pythonエージェントをコンテナイメージとしてビルドする
4. The 診断エージェント shall 指定されたJSON形式で診断結果を出力する
5. The 診断エージェント shall エラーハンドリングとロギングを適切に実装する

### Requirement 14: 筆者プロフィール文書
**Objective:** 管理者として、筆者プロフィール文書を管理したい。Knowledge Baseの参照データを提供するため。

#### Acceptance Criteria
1. The data/author_profile/profile.md shall 筆者の基本情報（名前、役職、専門）を含む
2. The data/author_profile/profile.md shall 筆者の経歴（資格、経験、プロジェクト）を含む
3. The data/author_profile/profile.md shall 筆者の興味分野を含む
4. The data/author_profile/profile.md shall 筆者の執筆スタイルと価値観を含む
5. The プロフィール文書 shall マークダウン形式で記述される

### Requirement 15: テストとカバレッジ
**Objective:** 品質管理担当者として、十分なテストカバレッジを確保したい。コードの信頼性を保証するため。

#### Acceptance Criteria
1. The Go Lambda関数 shall 90%以上のテストカバレッジを達成する
2. The フロントエンドコンポーネント shall 100%のテストカバレッジを達成する
3. The Terraformモジュール shall `terraform validate`で構文エラーがないことを検証する
4. The Terraformモジュール shall Checkovセキュリティスキャンに合格する

### Requirement 16: セキュリティ
**Objective:** セキュリティ管理者として、適切なアクセス制御と暗号化を実装したい。データとシステムを保護するため。

#### Acceptance Criteria
1. The IAMロール shall 最小権限の原則に従って定義される
2. The S3バケット shall パブリックアクセスブロックを有効にする
3. The S3バケット shall SSE-S3暗号化を有効にする
4. The DynamoDBテーブル shall 保管時の暗号化を有効にする
5. The API Gateway診断取得エンドポイント shall 認証なしでアクセス可能とする（公開情報）
6. The API Gateway診断実行エンドポイント shall Cognito認証を必須とする

### Requirement 17: コスト最適化
**Objective:** 運用管理者として、月額コストを$40以下に抑えたい。個人ブログとして持続可能な運用を実現するため。

#### Acceptance Criteria
1. The S3 Vectors shall OpenSearch Serverless比で90%のコスト削減を実現する
2. The AgentCore Runtime shall アクティブ時間のみ課金される（I/O待機は無料）
3. The DynamoDB shall PAY_PER_REQUEST課金モードを使用する
4. The Lambda関数 shall 無料枠内で運用可能とする（低頻度実行）
