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
    // Note: compatibleArchitectures not set - pure JavaScript layers work on both x86_64 and arm64
    this.powertoolsLayer = new lambda.LayerVersion(this, 'PowertoolsLayer', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../layers/powertools')
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
      description:
        'AWS Lambda Powertools for TypeScript - Logger, Tracer, Metrics, Parameters',
      layerVersionName: 'serverless-blog-powertools',
    });

    // Common Utilities Layer
    // Note: compatibleArchitectures not set - pure JavaScript layers work on both x86_64 and arm64
    this.commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/common')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
      description:
        'Common utilities - Markdown conversion, S3 presigned URLs, DynamoDB helpers',
      layerVersionName: 'serverless-blog-common',
    });

    // Output Layer ARNs (no export to avoid cross-stack update issues)
    new cdk.CfnOutput(this, 'PowertoolsLayerVersionArn', {
      value: this.powertoolsLayer.layerVersionArn,
      description: 'ARN of the Powertools Layer',
    });

    new cdk.CfnOutput(this, 'CommonLayerVersionArn', {
      value: this.commonLayer.layerVersionArn,
      description: 'ARN of the Common Layer',
    });
  }
}
