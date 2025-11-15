import * as cdk from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { StorageStack } from '../lib/storage-stack';

describe('CDK Nag Debug', () => {
  test('StorageStack - show all CDK Nag messages', () => {
    const app = new cdk.App();
    const stack = new StorageStack(app, 'TestStorageStack', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });
    cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
    app.synth();

    const errors = Annotations.fromStack(stack).findError('*', /.*/);
    const warnings = Annotations.fromStack(stack).findWarning('*', /.*/);

    console.log(`\n=== StorageStack CDK Nag Results ===`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);

    if (errors.length > 0) {
      console.log('\n--- Errors ---');
      errors.forEach((error, index) => {
        console.log(`\nError ${index + 1}:`);
        console.log(JSON.stringify(error, null, 2));
      });
    }

    if (warnings.length > 0) {
      console.log('\n--- Warnings ---');
      warnings.forEach((warning, index) => {
        console.log(`\nWarning ${index + 1}:`);
        console.log(JSON.stringify(warning, null, 2));
      });
    }
  });
});
