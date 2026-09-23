# 管理画面 TOTP の段階的導入（Issue #677）

## 実装と適用の境界

この変更は TOTP のコード確認、サインイン中の初回登録、初回パスワード変更から
TOTP への遷移、およびログイン後の任意登録を追加する。
この UI 変更では本番・開発環境の `mfa_configuration` を変更しない。
本番の必須化は承認済み（2026-09-23）。後続の Draft PR で `ON` への変更を用意し、
以下のデプロイ・登録確認が完了するまで適用を保留する。

`OPTIONAL` の未登録ユーザーにはサインイン時の登録チャレンジが出ないため、
既存管理者は管理画面の **Security** から自分の認証アプリを登録する。
QR コードはブラウザ内で生成する。登録用 URI と秘密鍵は React の状態にのみ保持し、
永続ストレージ、ログ、外部 QR サービスに保存・送信しない。

## 適用順序

1. UI を dev へデプロイし、実 Cognito で通常ログイン、初回パスワード変更、
   TOTP 登録、誤コードでの再試行、TOTP 再ログインを確認する。
   ローカル MSW の成功だけでは Cognito の設定・セッションの実動作は証明できない。
2. UI を本番へデプロイする。まだ `OPTIONAL` を維持する。
3. 各既存管理者が Security → 認証アプリを登録する → コード確認を実行する。
   ログアウト後にパスワードと認証コードで再ログインできることを本人が確認する。
   管理者全員の確認が完了するまで次へ進まない。既に TOTP が有効なユーザーに
   この画面から秘密鍵の再発行や MFA の解除は提供しない。
4. 管理画面と別の変更で `terraform/environments/prd/main.tf` の
   `mfa_configuration` を `ON` にする。dev は E2E 用に `OPTIONAL` のままにする。
   本番の必須化は承認済み。plan の差分と手順1〜3の完了を確認してから適用する。
5. 適用後に登録済み管理者の再ログインを確認する。新規ユーザーは初回の
   TOTP 登録チャレンジを経てログインする。

認証アプリを利用できなくなった場合は、本人確認と AWS 管理権限を持つ担当者による
復旧が必要。`ON` のままユーザーの MFA 設定だけを解除すれば必ず復旧する、とは
扱わない。状況に応じてプール設定も含めた復旧方法を判断する。

## SDK と根拠

- サインイン中: `signIn` / `confirmSignIn` の全応答で次ステップを判定し、
  TOTP 登録もコード確認も `confirmSignIn({ challengeResponse })` を使用する。
- ログイン後の任意登録: `setUpTOTP` → `verifyTOTPSetup` →
  `updateMFAPreference({ totp: 'PREFERRED' })`。この経路はサインイン中の API と異なる。
- QR は `qrcode` のブラウザ API で生成し、生成できなくても手入力キーを表示する。

一次資料（実装時に Amplify 6.20.0 のローカル型・実装とも照合）:

- [Amplify multi-step sign-in](https://docs.amplify.aws/react/frontend/auth/multi-step-sign-in/)
- [Amplify MFA](https://docs.amplify.aws/react/build-a-backend/auth/concepts/multi-factor-authentication/)
- [qrcode browser API](https://github.com/soldair/node-qrcode)
