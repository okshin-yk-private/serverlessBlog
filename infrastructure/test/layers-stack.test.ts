import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { LayersStack } from '../lib/layers-stack';

describe('LayersStack', () => {
  let app: cdk.App;
  let stack: LayersStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new LayersStack(app, 'TestLayersStack', {
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

  test('Both layers should be created', () => {
    template.resourceCountIs('AWS::Lambda::LayerVersion', 2);
  });

  test('Powertools Layer should have correct runtime', () => {
    template.hasResourceProperties('AWS::Lambda::LayerVersion', {
      CompatibleRuntimes: Match.arrayWith(['nodejs24.x']),
    });
  });

  test('Powertools Layer should have description', () => {
    template.hasResourceProperties('AWS::Lambda::LayerVersion', {
      Description: Match.stringLikeRegexp('.*Powertools.*'),
    });
  });

  test('Powertools Layer should export LayerVersionArn', () => {
    template.hasOutput('PowertoolsLayerVersionArn', {
      Value: Match.objectLike({
        Ref: Match.anyValue(),
      }),
    });
  });

  test('Common Layer should have description', () => {
    template.hasResourceProperties('AWS::Lambda::LayerVersion', {
      Description: Match.stringLikeRegexp('.*Common utilities.*'),
    });
  });

  test('Common Layer should export LayerVersionArn', () => {
    template.hasOutput('CommonLayerVersionArn', {
      Value: Match.objectLike({
        Ref: Match.anyValue(),
      }),
    });
  });

  test('Snapshot test', () => {
    // Normalize asset hashes for stable snapshots
    const templateJson = template.toJSON();
    const templateString = JSON.stringify(templateJson, null, 2).replace(
      /"S3Key":\s*"[a-f0-9]{64}\.zip"/g,
      '"S3Key": "[ASSET_HASH].zip"'
    );
    expect(JSON.parse(templateString)).toMatchSnapshot();
  });
});
