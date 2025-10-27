import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DatabaseStack } from '../lib/database-stack';

describe('DatabaseStack', () => {
  let app: cdk.App;
  let stack: DatabaseStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new DatabaseStack(app, 'TestDatabaseStack', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });
    template = Template.fromStack(stack);
  });

  test('Stack should be created', () => {
    expect(stack).toBeDefined();
  });

  test('DynamoDB table should be created', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
  });

  test('Table should have correct partition key', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: Match.arrayWith([
        {
          AttributeName: 'id',
          KeyType: 'HASH',
        },
      ]),
      AttributeDefinitions: Match.arrayWith([
        {
          AttributeName: 'id',
          AttributeType: 'S',
        },
      ]),
    });
  });

  test('Table should use on-demand billing mode', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('Table should have CategoryIndex GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'CategoryIndex',
          KeySchema: [
            {
              AttributeName: 'category',
              KeyType: 'HASH',
            },
            {
              AttributeName: 'createdAt',
              KeyType: 'RANGE',
            },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
        }),
      ]),
    });
  });

  test('Table should have PublishStatusIndex GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'PublishStatusIndex',
          KeySchema: [
            {
              AttributeName: 'publishStatus',
              KeyType: 'HASH',
            },
            {
              AttributeName: 'createdAt',
              KeyType: 'RANGE',
            },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
        }),
      ]),
    });
  });

  test('Table should have correct attribute definitions for GSIs', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'category', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'S' },
        { AttributeName: 'publishStatus', AttributeType: 'S' },
      ]),
    });
  });

  test('Table should have point-in-time recovery enabled', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
  });

  test('Table should export table name', () => {
    template.hasOutput('BlogPostsTableName', {
      Value: Match.objectLike({
        Ref: Match.anyValue(),
      }),
    });
  });

  test('Table should export table ARN', () => {
    template.hasOutput('BlogPostsTableArn', {
      Value: Match.objectLike({
        'Fn::GetAtt': Match.anyValue(),
      }),
    });
  });

  test('Snapshot test', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
