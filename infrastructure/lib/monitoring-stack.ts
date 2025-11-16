/**
 * 監視スタック
 *
 * Task 10.1: 監視とロギングの統合検証 - CloudWatchアラームのセットアップ
 * Requirements: R27 (CloudWatch監視), R28 (X-Ray)
 *
 * このスタックは以下を提供します：
 * 1. Lambda関数のエラー率・実行時間・スロットルアラーム
 * 2. DynamoDBテーブルのスロットルアラーム
 * 3. API Gatewayの4xx/5xxエラー・レイテンシアラーム
 * 4. SNSトピックによるアラーム通知
 * 5. CloudWatch Dashboardによる統合監視ビュー
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export interface MonitoringStackProps extends cdk.StackProps {
  /**
   * 監視対象のLambda関数
   */
  lambdaFunctions: lambda.IFunction[];

  /**
   * 監視対象のDynamoDBテーブル
   */
  dynamodbTables: dynamodb.ITable[];

  /**
   * 監視対象のAPI Gateway
   */
  apiGateways: apigateway.IRestApi[];

  /**
   * アラーム通知先メールアドレス
   */
  alarmEmail: string;
}

export class MonitoringStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // SNSトピック作成（アラーム通知用）
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: 'Blog Platform Alarms',
      topicName: 'BlogPlatform-Alarms',
    });

    // SNSトピックにSSL強制ポリシーを追加
    this.alarmTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowPublishThroughSSLOnly',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['SNS:Publish'],
        resources: [this.alarmTopic.topicArn],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      })
    );

    // メールサブスクリプション追加
    this.alarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(props.alarmEmail)
    );

    // CloudWatch Dashboard作成
    this.dashboard = new cloudwatch.Dashboard(this, 'MonitoringDashboard', {
      dashboardName: 'BlogPlatform-Monitoring',
    });

    // Lambda関数のアラーム作成
    props.lambdaFunctions.forEach((fn) => {
      this.createLambdaAlarms(fn);
      this.addLambdaToDashboard(fn);
    });

    // DynamoDBテーブルのアラーム作成
    props.dynamodbTables.forEach((table) => {
      this.createDynamoDBAlarms(table);
      this.addDynamoDBToDashboard(table);
    });

    // API Gatewayのアラーム作成
    props.apiGateways.forEach((api) => {
      this.createApiGatewayAlarms(api);
      this.addApiGatewayToDashboard(api);
    });
  }

  /**
   * Lambda関数のアラームを作成
   */
  private createLambdaAlarms(fn: lambda.IFunction): void {
    // Lambda関数のリソース名を取得（スタック名とIDから）
    const functionId = cdk.Names.nodeUniqueId(fn.node);

    // エラー率アラーム
    const errorAlarm = new cloudwatch.Alarm(this, `${functionId}-ErrorRate`, {
      alarmName: `${functionId}-ErrorRate`,
      alarmDescription: `Lambda function error rate is too high`,
      metric: fn.metricErrors({
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 実行時間アラーム
    const durationAlarm = new cloudwatch.Alarm(this, `${functionId}-Duration`, {
      alarmName: `${functionId}-Duration`,
      alarmDescription: `Lambda function duration is too high`,
      metric: fn.metricDuration({
        statistic: cloudwatch.Stats.AVERAGE,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10000, // 10秒
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    durationAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );

    // スロットルアラーム
    const throttleAlarm = new cloudwatch.Alarm(
      this,
      `${functionId}-Throttles`,
      {
        alarmName: `${functionId}-Throttles`,
        alarmDescription: `Lambda function is being throttled`,
        metric: fn.metricThrottles({
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      }
    );

    throttleAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );
  }

  /**
   * DynamoDBテーブルのアラームを作成
   */
  private createDynamoDBAlarms(table: dynamodb.ITable): void {
    const tableId = cdk.Names.nodeUniqueId(table.node);

    // 読み取りスロットルアラーム
    const readThrottleAlarm = new cloudwatch.Alarm(
      this,
      `${tableId}-ReadThrottles`,
      {
        alarmName: `${tableId}-ReadThrottles`,
        alarmDescription: `DynamoDB table read throttles detected`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ReadThrottleEvents',
          dimensionsMap: {
            TableName: table.tableName,
          },
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      }
    );

    readThrottleAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );

    // 書き込みスロットルアラーム
    const writeThrottleAlarm = new cloudwatch.Alarm(
      this,
      `${tableId}-WriteThrottles`,
      {
        alarmName: `${tableId}-WriteThrottles`,
        alarmDescription: `DynamoDB table write throttles detected`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'WriteThrottleEvents',
          dimensionsMap: {
            TableName: table.tableName,
          },
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      }
    );

    writeThrottleAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );
  }

  /**
   * API Gatewayのアラームを作成
   */
  private createApiGatewayAlarms(api: apigateway.IRestApi): void {
    const apiId = cdk.Names.nodeUniqueId(api.node);

    // 4xxエラーアラーム
    const error4xxAlarm = new cloudwatch.Alarm(this, `${apiId}-4XXError`, {
      alarmName: `${apiId}-4XXError`,
      alarmDescription: `API Gateway 4XX error rate is too high`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: api.restApiName,
        },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10, // 5分間で10回以上の4xxエラー
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    error4xxAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );

    // 5xxエラーアラーム
    const error5xxAlarm = new cloudwatch.Alarm(this, `${apiId}-5XXError`, {
      alarmName: `${apiId}-5XXError`,
      alarmDescription: `API Gateway 5XX error rate is too high`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: api.restApiName,
        },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5分間で5回以上の5xxエラー
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    error5xxAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );

    // レイテンシアラーム
    const latencyAlarm = new cloudwatch.Alarm(this, `${apiId}-Latency`, {
      alarmName: `${apiId}-Latency`,
      alarmDescription: `API Gateway latency is too high`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: api.restApiName,
        },
        statistic: cloudwatch.Stats.AVERAGE,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 2000, // 2秒
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    latencyAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alarmTopic)
    );
  }

  /**
   * CloudWatch DashboardにLambdaメトリクスを追加
   */
  private addLambdaToDashboard(fn: lambda.IFunction): void {
    const functionId = cdk.Names.nodeUniqueId(fn.node);
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: `Lambda: ${functionId} - Errors & Invocations`,
        left: [fn.metricErrors(), fn.metricInvocations()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: `Lambda: ${functionId} - Duration & Throttles`,
        left: [fn.metricDuration()],
        right: [fn.metricThrottles()],
        width: 12,
      })
    );
  }

  /**
   * CloudWatch DashboardにDynamoDBメトリクスを追加
   */
  private addDynamoDBToDashboard(table: dynamodb.ITable): void {
    const tableId = cdk.Names.nodeUniqueId(table.node);

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: `DynamoDB: ${tableId} - Throttles`,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ReadThrottleEvents',
            dimensionsMap: { TableName: table.tableName },
            statistic: cloudwatch.Stats.SUM,
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'WriteThrottleEvents',
            dimensionsMap: { TableName: table.tableName },
            statistic: cloudwatch.Stats.SUM,
          }),
        ],
        width: 12,
      })
    );
  }

  /**
   * CloudWatch DashboardにAPI Gatewayメトリクスを追加
   */
  private addApiGatewayToDashboard(api: apigateway.IRestApi): void {
    const apiId = cdk.Names.nodeUniqueId(api.node);

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: `API Gateway: ${apiId} - Errors`,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: api.restApiName },
            statistic: cloudwatch.Stats.SUM,
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: api.restApiName },
            statistic: cloudwatch.Stats.SUM,
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: `API Gateway: ${apiId} - Latency`,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: api.restApiName },
            statistic: cloudwatch.Stats.AVERAGE,
          }),
        ],
        width: 12,
      })
    );
  }
}
