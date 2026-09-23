# 管理画面のパスキー認証（Issue #677）

## 動作と設定範囲

通常のログインはメールアドレスとパスキーを使用する。パスキーを使えない場合は、
利用者が明示的にパスワードへ切り替え、既存の TOTP チャレンジを完了する。
パスキー失敗時にパスワード認証へ自動移行したり、未認証の状態でトークンを保存したりしない。

Security では、パスキー登録・追加・個別削除・全削除による OFF を提供する。
削除は確認画面を経由し、TOTP が有効なことを再確認する。パスキーの MFA 設定を
OFF にするだけでは資格情報は残るため、認証自体の OFF には削除を使う。

本番は MFA 必須を維持する（2026-09-23 ユーザー選択）。TOTP の OFF は表示するが
無効化し、理由を説明する。MFA 任意の DEV では、パスキーが一つもなく、利用者が
確認した場合だけ TOTP を OFF にできる。AWS が拒否した設定を成功扱いしない。
パスキー MFA には別方式の MFA が最低一つ必要なため、TOTP は代替手段として残す。
SMS・メール MFA の新規提供はこの変更の範囲外。

GetUser の公開仕様には WebAuthnMfaSettings.Enabled の読み戻しがない。
登録済み一覧を「MFA 有効」と同一視せず、MFA 利用の成功メッセージは有効化 API が
成功した直後だけ表示する。登録だけ成功した場合は一覧を取り直し、登録済みパスキーの
利用設定を再実行できる。ページを開いただけで設定を変更しない。

## 構成

- Cognito Essentials、USER_AUTH / WEB_AUTHN、本人確認 `required`。
- Pool: `FactorConfiguration=MULTI_FACTOR_WITH_USER_VERIFICATION`。
- User: TOTP 有効化後に `WebAuthnMfaSettings.Enabled=true`。
- RP ID は DEV `dev.boneofmyfallacy.net`、PRD `boneofmyfallacy.net` に分離する。
- Amplify の公開 API でパスキー登録・一覧・削除・認証を行う。
- Amplify 6.20 に不足する WebAuthn MFA 設定だけ、本人の access token で Cognito の
  公開 API を呼ぶ。ID token、IAM 認証情報、API レスポンスをログへ保存しない。

## 適用順序と Terraform の管理外設定

**PR #687 の本番 TOTP 必須化・再ログイン確認を先に完了する。** 本変更も本番 HCL の
`ON` を維持するが、現在の本番が `OPTIONAL` の場合、移行スクリプトは AWS 設定変更前に停止する。
これは初回 MFA 必須化とパスキー移行を一度に進めないための条件。

AWS Provider は `FactorConfiguration` に未対応であり、この項目は Terraform plan に
現れない。Provider の MFA 更新がこの項目を欠落させる可能性があるため、通常の
`terraform apply` だけで導入を完了したとは扱わない。デプロイは次の順序で実行する。

1. 既存プールの tier を読み取り、必要な場合のみ、`enable_passkeys=false` の plan で
   Essentials を先に準備する。この plan でも MFA 変更・プール再作成は拒否する。
2. GetUserPoolMfaConfig の既存 MFA 設定を保持し、RP ID・本人確認必須・Factor を
   SetUserPoolMfaConfig で設定する。読み戻しが一致しなければ停止する。
3. **その後に新しい Terraform plan を作成**する。Provider の MFA API 呼出しを起こす
   6項目の差分・未知値、プール作成・削除・置換があれば apply を拒否する。
4. 許可した plan を適用し、Factor、MFA、RP ID、tier、Pool の第一要素、Client の
   `ALLOW_USER_AUTH` を再取得する。一致しない場合はデプロイ失敗とする。
5. 管理画面ビルドも同じ読み取り確認を要求し、確認済みの MFA policy とパスキー有効化を埋め込む。

実装: `scripts/deploy_passkey_infrastructure.sh` と `scripts/configure_passkey_mfa.py`。
CLI は新フィールドに対応した AWS CLI v2 が必要（ローカル 2.36.23 のモデルで確認）。
SSM の対象環境 pool/client ID、Cognito Describe/Get/SetUserPoolMfaConfig 権限が必要。
SSO・リージョン・環境を切り替えて検証失敗を回避したり、本番 MFA を任意に下げたりしない。
RP ID が既存値と異なる場合も停止し、資格情報を無効にする変更を自動適用しない。

## 確認状況と残る受入条件

- DEV 読み取り: Essentials / MFA OPTIONAL / 第一要素 PASSWORD、TOTP 有効を確認。
- パスキー登録、本人確認付き署名、ログイン、設定有効化、削除は実 Amplify と
  Chromium の仮想認証器で検証する。AWS HTTP 応答は fixture であり、実 Cognito の
  新 MFA API の成功を証明する試験ではない。
- Terraform mock test、移行スクリプトの読み戻し・plan gate・失敗時停止を検証する。
- DEV で上記移行、実端末/1Password の登録、ログアウト後のパスキーログイン、
  パスワード＋TOTP への切り替え、キー追加・削除・全削除後の復帰を確認してから PRD に進む。
- 特に「WEB_AUTHN policy 有効化前の Factor 先行設定」と、MFA 必須下での利用者の
  WebAuthn 設定・最後のキー削除は実 Cognito での確認が必要。API 拒否を模擬試験で隠さない。
- 1Password の従来の自動サインインとの相互作用は実機確認対象。今回の変更だけで
  拡張機能側の問題が解消したとは判断しない。

一次資料:

- [AWS WebAuthnConfiguration](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnConfigurationType.html)
- [AWS WebAuthnMfaSettings](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnMfaSettingsType.html)
- [AWS SetUserMFAPreference](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SetUserMFAPreference.html)
- [AWS MFA とパスキーの条件](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)
- [Amplify パスキー管理](https://docs.amplify.aws/react/build-a-backend/auth/manage-users/manage-webauthn-credentials/)
