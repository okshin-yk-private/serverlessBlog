import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly blogPostsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Blog Posts DynamoDB Table
    this.blogPostsTable = new dynamodb.Table(this, 'BlogPostsTable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      tableName: 'serverless-blog-posts',
    });

    // Category Index - for querying posts by category
    this.blogPostsTable.addGlobalSecondaryIndex({
      indexName: 'CategoryIndex',
      partitionKey: {
        name: 'category',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Publish Status Index - for querying published/draft posts
    this.blogPostsTable.addGlobalSecondaryIndex({
      indexName: 'PublishStatusIndex',
      partitionKey: {
        name: 'publishStatus',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Export table name and ARN for use in other stacks
    new cdk.CfnOutput(this, 'BlogPostsTableName', {
      value: this.blogPostsTable.tableName,
      description: 'Name of the Blog Posts DynamoDB table',
      exportName: 'BlogPostsTableName',
    });

    new cdk.CfnOutput(this, 'BlogPostsTableArn', {
      value: this.blogPostsTable.tableArn,
      description: 'ARN of the Blog Posts DynamoDB table',
      exportName: 'BlogPostsTableArn',
    });
  }
}
