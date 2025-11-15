import * as cdk from 'aws-cdk-lib';
import { Annotations } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { StorageStack } from './lib/storage-stack';
import { AuthStack } from './lib/auth-stack';
import { ApiStack } from './lib/api-stack';

console.log('=== StorageStack CDK Nag Errors ===');
const app1 = new cdk.App();
const storageStack = new StorageStack(app1, 'TestStorageStack', {
  env: { account: '123456789012', region: 'ap-northeast-1' },
});
cdk.Aspects.of(app1).add(new AwsSolutionsChecks({ verbose: true }));
app1.synth();

const storageErrors = Annotations.fromStack(storageStack).findError('*', /.*/);
console.log(`Found ${storageErrors.length} errors`);
storageErrors.forEach((error, index) => {
  console.log(`\nError ${index + 1}:`);
  console.log(JSON.stringify(error, null, 2));
});

console.log('\n=== AuthStack CDK Nag Errors ===');
const app2 = new cdk.App();
const authStack = new AuthStack(app2, 'TestAuthStack', {
  env: { account: '123456789012', region: 'ap-northeast-1' },
});
cdk.Aspects.of(app2).add(new AwsSolutionsChecks({ verbose: true }));
app2.synth();

const authErrors = Annotations.fromStack(authStack).findError('*', /.*/);
console.log(`Found ${authErrors.length} errors`);
authErrors.forEach((error, index) => {
  console.log(`\nError ${index + 1}:`);
  console.log(JSON.stringify(error, null, 2));
});

console.log('\n=== ApiStack CDK Nag Errors ===');
const app3 = new cdk.App();
const authStack3 = new AuthStack(app3, 'TestAuthStack', {
  env: { account: '123456789012', region: 'ap-northeast-1' },
});
const apiStack = new ApiStack(app3, 'TestApiStack', {
  env: { account: '123456789012', region: 'ap-northeast-1' },
  userPool: authStack3.userPool,
});
cdk.Aspects.of(app3).add(new AwsSolutionsChecks({ verbose: true }));
app3.synth();

const apiErrors = Annotations.fromStack(apiStack).findError('*', /.*/);
console.log(`Found ${apiErrors.length} errors`);
apiErrors.forEach((error, index) => {
  console.log(`\nError ${index + 1}:`);
  console.log(JSON.stringify(error, null, 2));
});
