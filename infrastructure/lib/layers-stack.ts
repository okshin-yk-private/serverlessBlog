import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

export class LayersStack extends cdk.Stack {
  public readonly powertoolsLayer: lambda.LayerVersion;
  public readonly commonLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda Powertools Layer
    this.powertoolsLayer = new lambda.LayerVersion(this, 'PowertoolsLayer', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../layers/powertools')
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description:
        'AWS Lambda Powertools for TypeScript - Logger, Tracer, Metrics, Parameters',
      layerVersionName: 'serverless-blog-powertools',
    });

    // Common Utilities Layer
    this.commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/common')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description:
        'Common utilities - Markdown conversion, S3 presigned URLs, DynamoDB helpers',
      layerVersionName: 'serverless-blog-common',
    });

    // Export Layer ARNs for use in other stacks
    new cdk.CfnOutput(this, 'PowertoolsLayerVersionArn', {
      value: this.powertoolsLayer.layerVersionArn,
      description: 'ARN of the Powertools Layer',
      exportName: 'PowertoolsLayerVersionArn',
    });

    new cdk.CfnOutput(this, 'CommonLayerVersionArn', {
      value: this.commonLayer.layerVersionArn,
      description: 'ARN of the Common Layer',
      exportName: 'CommonLayerVersionArn',
    });
  }
}
