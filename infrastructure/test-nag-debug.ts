import * as cdk from 'aws-cdk-lib';
import { Annotations } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { StorageStack } from './lib/storage-stack';

const app = new cdk.App();
const stack = new StorageStack(app, 'TestStorageStack', {
  env: {
    account: '123456789012',
    region: 'ap-northeast-1',
  },
});

cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
app.synth();

const annotations = Annotations.fromStack(stack);
const errors = annotations.findError('*', /.*/);
const warnings = annotations.findWarning('*', /.*/);

console.log('=== ERRORS ===');
errors.forEach((error) => {
  console.log(JSON.stringify(error, null, 2));
});

console.log('\n=== WARNINGS ===');
warnings.forEach((warning) => {
  console.log(JSON.stringify(warning, null, 2));
});
