/**
 * テストデータファクトリのエクスポート
 */

// ブログ記事ファクトリ
export {
  createMockPost,
  createMockPostData,
  type MockPost,
  type MockPostData,
} from './postFactory';

// API Gateway イベントファクトリ
export {
  createMockAPIGatewayEvent,
  createMockContext,
} from './eventFactory';
