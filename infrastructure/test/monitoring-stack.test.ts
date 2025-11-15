/**
 * 監視スタックのユニットテスト
 *
 * Task 10.1: 監視とロギングの統合検証 - CloudWatchアラームのセットアップ
 * Requirements: R27 (CloudWatch監視), R28 (X-Ray)
 *
 * このテストは以下を検証します：
 * 1. Lambda関数のエラー率アラームが作成されること
 * 2. Lambda関数の実行時間アラームが作成されること
 * 3. DynamoDBのスロットルアラームが作成されること
 * 4. API Gatewayの4xx/5xxエラーアラームが作成されること
 * 5. SNSトピックが作成され、アラーム通知が設定されること
 */

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MonitoringStack } from '../lib/monitoring-stack';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Table, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

describe('MonitoringStack', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let monitoringStack: MonitoringStack;
  let testLambdaFunction: Function;
  let testTable: Table;
  let testApi: apigateway.RestApi;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');

    // テスト用Lambda関数を作成
    testLambdaFunction = new Function(stack, 'TestFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: Code.fromInline(
        'exports.handler = async () => ({ statusCode: 200 });'
      ),
    });

    // テスト用DynamoDBテーブルを作成
    testTable = new Table(stack, 'TestTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
    });

    // テスト用API Gatewayを作成
    testApi = new apigateway.RestApi(stack, 'TestApi');

    // ダミーのリソースとメソッドを追加（CDK検証のため）
    const resource = testApi.root.addResource('test');
    resource.addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          'application/json': '{ "statusCode": 200 }',
        },
      }),
      {
        methodResponses: [{ statusCode: '200' }],
      }
    );

    // MonitoringStackを作成
    monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
      lambdaFunctions: [testLambdaFunction],
      dynamodbTables: [testTable],
      apiGateways: [testApi],
      alarmEmail: 'test@example.com',
    });
  });

  describe('SNS トピック', () => {
    test('アラーム通知用のSNSトピックが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.resourceCountIs('AWS::SNS::Topic', 1);
      template.hasResourceProperties('AWS::SNS::Topic', {
        DisplayName: 'Blog Platform Alarms',
      });
    });

    test('SNSトピックにメールサブスクリプションが設定されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.resourceCountIs('AWS::SNS::Subscription', 1);
      template.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
        Endpoint: 'test@example.com',
      });
    });
  });

  describe('Lambda関数のアラーム', () => {
    test('Lambda関数のエラー率アラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-ErrorRate'),
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Period: 300, // 5分
        EvaluationPeriods: 1,
        Threshold: 1, // エラー率1%
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
      });
    });

    test('Lambda関数の実行時間アラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-Duration'),
        MetricName: 'Duration',
        Namespace: 'AWS/Lambda',
        Statistic: 'Average',
        Period: 300,
        EvaluationPeriods: 2,
        Threshold: 10000, // 10秒
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    test('Lambda関数のスロットルアラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-Throttles'),
        MetricName: 'Throttles',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });
  });

  describe('DynamoDBテーブルのアラーム', () => {
    test('DynamoDBテーブルの読み取りスロットルアラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-ReadThrottles'),
        MetricName: 'ReadThrottleEvents',
        Namespace: 'AWS/DynamoDB',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    test('DynamoDBテーブルの書き込みスロットルアラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-WriteThrottles'),
        MetricName: 'WriteThrottleEvents',
        Namespace: 'AWS/DynamoDB',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });
  });

  describe('API Gatewayのアラーム', () => {
    test('API Gatewayの4xxエラーアラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-4XXError'),
        MetricName: '4XXError',
        Namespace: 'AWS/ApiGateway',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 10, // 5分間で10回以上の4xxエラー
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    test('API Gatewayの5xxエラーアラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-5XXError'),
        MetricName: '5XXError',
        Namespace: 'AWS/ApiGateway',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 5, // 5分間で5回以上の5xxエラー
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    test('API Gatewayのレイテンシアラームが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: Match.stringLikeRegexp('.*-Latency'),
        MetricName: 'Latency',
        Namespace: 'AWS/ApiGateway',
        Statistic: 'Average',
        Period: 300,
        EvaluationPeriods: 2,
        Threshold: 2000, // 2秒
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });
  });

  describe('アラームアクション', () => {
    test('すべてのアラームがSNSトピックに通知を送信すること', () => {
      const template = Template.fromStack(monitoringStack);

      // すべてのアラームにAlarmActionsが設定されていること
      const alarms = template.findResources('AWS::CloudWatch::Alarm');
      Object.values(alarms).forEach((alarm: any) => {
        expect(alarm.Properties.AlarmActions).toBeDefined();
        expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('CloudWatch Dashboard', () => {
    test('CloudWatch Dashboardが作成されること', () => {
      const template = Template.fromStack(monitoringStack);

      template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'BlogPlatform-Monitoring',
      });
    });

    test('CloudWatch DashboardにLambdaメトリクスウィジェットが含まれること', () => {
      const template = Template.fromStack(monitoringStack);

      // DashboardBodyにLambdaメトリクスが含まれることを確認
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const dashboardBody = JSON.stringify(dashboards);
      expect(dashboardBody).toContain('AWS/Lambda');
    });

    test('CloudWatch DashboardにDynamoDBメトリクスウィジェットが含まれること', () => {
      const template = Template.fromStack(monitoringStack);

      // DashboardBodyにDynamoDBメトリクスが含まれることを確認
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const dashboardBody = JSON.stringify(dashboards);
      expect(dashboardBody).toContain('AWS/DynamoDB');
    });

    test('CloudWatch DashboardにAPI Gatewayメトリクスウィジェットが含まれること', () => {
      const template = Template.fromStack(monitoringStack);

      // DashboardBodyにAPI Gatewayメトリクスが含まれることを確認
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const dashboardBody = JSON.stringify(dashboards);
      expect(dashboardBody).toContain('AWS/ApiGateway');
    });
  });

  describe('スナップショットテスト', () => {
    test('MonitoringStackスナップショットが一致すること', () => {
      const template = Template.fromStack(monitoringStack);
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});
