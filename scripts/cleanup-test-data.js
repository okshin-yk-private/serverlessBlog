#!/usr/bin/env node

/**
 * E2Eテスト後のテストデータクリーンアップスクリプト
 *
 * E2Eテストで作成されたテストデータ（記事、画像など）をDynamoDBから削除します。
 * テストデータは特定のプレフィックス（"test-"）で識別されます。
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// 環境変数から設定を取得
const TABLE_NAME = process.env.TABLE_NAME;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
const TEST_DATA_PREFIX = 'test-';

if (!TABLE_NAME) {
  console.error('❌ エラー: TABLE_NAME環境変数が設定されていません');
  process.exit(1);
}

// DynamoDB クライアント初期化
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * テストデータをスキャンして取得
 */
async function scanTestData() {
  console.log(`📊 テストデータをスキャン中... (テーブル: ${TABLE_NAME})`);

  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(title, :prefix) OR begins_with(id, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': TEST_DATA_PREFIX,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    try {
      const response = await docClient.send(new ScanCommand(params));

      if (response.Items && response.Items.length > 0) {
        items.push(...response.Items);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } catch (error) {
      console.error('❌ スキャンエラー:', error);
      throw error;
    }
  } while (lastEvaluatedKey);

  console.log(`✅ ${items.length}件のテストデータを検出しました`);
  return items;
}

/**
 * テストデータを削除
 */
async function deleteTestData(items) {
  if (items.length === 0) {
    console.log('ℹ️  削除対象のテストデータがありません');
    return 0;
  }

  console.log(`🗑️  ${items.length}件のテストデータを削除中...`);

  let deletedCount = 0;
  let errorCount = 0;

  for (const item of items) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          id: item.id,
        },
      }));

      deletedCount++;
      console.log(`  ✓ 削除: ${item.title || item.id}`);
    } catch (error) {
      errorCount++;
      console.error(`  ✗ 削除失敗: ${item.title || item.id}`, error.message);
    }
  }

  console.log(`\n✅ 削除完了: ${deletedCount}件`);
  if (errorCount > 0) {
    console.log(`⚠️  削除失敗: ${errorCount}件`);
  }

  return deletedCount;
}

/**
 * メイン処理
 */
async function main() {
  console.log('🧹 E2Eテストデータクリーンアップを開始します\n');
  console.log(`環境設定:`);
  console.log(`  - テーブル名: ${TABLE_NAME}`);
  console.log(`  - リージョン: ${AWS_REGION}`);
  console.log(`  - テストデータプレフィックス: ${TEST_DATA_PREFIX}`);
  console.log('');

  try {
    // テストデータをスキャン
    const testItems = await scanTestData();

    // テストデータを削除
    const deletedCount = await deleteTestData(testItems);

    console.log('\n✅ クリーンアップが正常に完了しました');
    console.log(`合計 ${deletedCount}件のテストデータを削除しました`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ クリーンアップ中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = { scanTestData, deleteTestData };
