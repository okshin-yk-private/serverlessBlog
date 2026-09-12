---
name: terraform-to-drawio
description: TerraformまたはOpenTofuのAWS定義からdraw.io構成図を作成・更新する依頼に使う。
---

# Terraformからdraw.io構成図を作成

対象のHCL、既存図、出力先を依頼から特定する。CDK入力なら、合成済みTerraform
など対応する入力があるか確認し、HCL解析で対応できると推定しない。
図の作成依頼だけでAWSへのアクセスやTerraform applyを実行しない。

## 構成の読み取り

- 関連するresource・data・moduleと参照関係を調べ、未展開モジュールや
  不明な属性は明示する。推定接続を実測・コード由来の関係と混同しない。
- 配置判断には [placement-rules.md](references/placement-rules.md) の
  該当サービスの節を参照する。保存資料と実コードが矛盾する場合は公式資料で
  確認する。AWS調査の委譲は共有ルールに従う。
- SubnetはVPC内、VPCはRegion内に配置する。LambdaのVPC接続は
  `vpc_config` を確認し、S3やDynamoDBをVPC内のリソースとして描かない。
- 主経路と補助サービスを区別する。複雑な図の配置調整時だけ
  [layout.md](references/layout.md) を読む。配置寸法はローカルの目安であり、
  AWS公式仕様の保証ではない。

IAMポリシー、個別のSGルール、タグ、backend設定などは主経路を説明するために
必要な場合だけ描く。ユーザーが指定した要素は含め、省略範囲を報告する。

## XMLの生成

以下の最小構造に、親group・resource・edgeを追加する。

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

- 一意なcell IDを使い、子の座標は親groupからの相対座標にする。
- 確認済みのdraw.io AWSライブラリのshapeを使用する。shape名をサービス名から
  推測しない。対応が不明なら名前付きの汎用図形を使い、その旨を報告する。
- groupは `container=1`、矢印は `edge="1"` と有効な `source` / `target` を
  指定し、`mxGeometry relative="1" as="geometry"` を持たせる。
  `edgeStyle=orthogonalEdgeStyle` を基本とする。
- ラベル中のXML特殊文字をエスケープする。既存図のstyleは可能な限り保持する。

## 検証と完了

XMLパーサーで構文、一意ID、parent・source・targetの参照を検証する。
親groupの循環、子のはみ出し、ラベル切れ、線と無関係なアイコンの重なりも確認する。
利用可能なdraw.io表示手段で描画を確認し、表示未確認なら明示する。
ユーザー指定先に編集可能な `.drawio` を保存し、ファイルリンク、対象範囲、
省略したリソース、推定箇所、実施済みの検証を報告する。
