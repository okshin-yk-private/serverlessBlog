---
name: terraform-to-drawio
description: >-
  Terraform または OpenTofu の AWS 定義（HCL・modules・environments）を読み取り、編集可能な draw.io（.drawio / diagrams.net）形式の AWS アーキテクチャ構成図を新規作成・最新化・再生成するときに使う。特定モジュールの図解、VPC や Subnet 配置の反映、既存 .drawio 図の最新化、英語の "Generate/draw an AWS architecture diagram from Terraform" など、IaC コードから構成図ファイルを作る依頼全般が対象。対象外: terraform validate/fmt/plan の実行・解析、HCL 自体の変更、Mermaid/ASCII などチャット内だけの図解、既存 .drawio の構文チェックのみ。
---

# Terraform から draw.io 構成図を作成

対象の HCL・既存図・出力先を依頼から特定する（本リポジトリに既存の構成図やアイコン定義 `docs/architecture/`・`aws-icon-manifest.json` がある場合は整合を確認する）。
CDK 入力の場合は、合成済み Terraform など対応可能な入力があるか確認し、HCL 解析で扱えると推測しない。図の作成依頼だけで AWS へのアクセスや `terraform apply` を実行しない。

## 構成の読み取り

- 関連する `resource`・`data`・`module` と参照関係を調べ、未展開モジュールや不明な属性は明示する。推測による接続をコード由来の実関係と混同しない。
- 配置判断は [placement-rules.md](references/placement-rules.md) の該当サービスの節を参照する。保存資料と実コードが矛盾する場合は公式資料で確認する（AWS 調査の委譲は共有ルールに従う）。
- Subnet は VPC 内、VPC は Region 内に配置する。Lambda の VPC 接続は `vpc_config` の有無を確認し、S3 や DynamoDB を VPC 内リソースとして描かない。
- 主経路と補助サービスを区別する。複雑な図の配置調整時だけ [layout.md](references/layout.md) を読む。配置寸法はローカルの目安であり、AWS 公式仕様の保証ではない。

IAM ポリシー・個別 SG ルール・タグ・backend 設定などは主経路の説明に必要な場合だけ描く。ユーザーが指定した要素は必ず含め、省略した範囲を報告する。

## XML の生成

次の最小構造に、親 group・resource・edge を追加する。

```xml
<mxfile host="app.diagrams.net" type="device">
  <diagram id="aws" name="AWS Architecture">
    <mxGraphModel grid="1" gridSize="10" page="1" pageWidth="1169" pageHeight="827">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="region" value="Region" style="swimlane;container=1;collapsible=0;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="500" height="300" as="geometry"/>
        </mxCell>
        <mxCell id="resource" value="Resource" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="region">
          <mxGeometry x="40" y="60" width="120" height="60" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

- 一意な cell ID を使い、子の座標は親 group からの相対座標にする。
- 確認済みの draw.io AWS ライブラリの shape を使用し、サービス名から shape 名を推測しない。対応が不明な場合は名前付きの汎用図形を使い、その旨を報告する。
- group は `container=1`、矢印は `edge="1"` と有効な `source` / `target` を指定し、`mxGeometry relative="1" as="geometry"` を持たせる。`edgeStyle=orthogonalEdgeStyle` を基本とする。
- ラベル中の XML 特殊文字をエスケープする。既存図を更新する場合は既存の style を可能な限り保持する。

## 検証と完了

XML パーサーで構文、一意 ID、`parent`・`source`・`target` の参照を検証する。
親 group の循環、子要素のはみ出し、ラベル切れ、線と無関係なアイコンの重なりも確認する。
利用可能な draw.io 表示手段で描画を確認し、表示未確認ならその旨を明示する。
指定先に編集可能な `.drawio` を保存し、ファイルリンク・対象範囲・省略したリソース・推測箇所・実施済みの検証を報告する。
