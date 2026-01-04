import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

/**
 * Lambda functions interface for API integrations
 */
export interface LambdaFunctions {
  // Posts domain
  createPostFunction: lambda.IFunction;
  getPostFunction: lambda.IFunction;
  getPublicPostFunction: lambda.IFunction;
  listPostsFunction: lambda.IFunction;
  updatePostFunction: lambda.IFunction;
  deletePostFunction: lambda.IFunction;
  // Images domain
  uploadUrlFunction: lambda.IFunction;
  deleteImageFunction: lambda.IFunction;
  // Auth domain (optional, only Rust has these)
  loginFunction?: lambda.IFunction;
  logoutFunction?: lambda.IFunction;
  refreshFunction?: lambda.IFunction;
}

export interface ApiIntegrationsStackProps extends cdk.StackProps {
  restApi: apigateway.IRestApi;
  authorizer: apigateway.IAuthorizer;
  lambdaFunctions: LambdaFunctions;
  /**
   * Label for the Lambda implementation (e.g., 'Node.js' or 'Rust')
   * Used for documentation and logging
   */
  implementationLabel?: string;
}

/**
 * ApiIntegrationsStack - Handles all API Gateway method integrations
 *
 * This stack is responsible for wiring Lambda functions to API Gateway methods.
 * It can be configured to use either Node.js or Rust Lambda functions.
 *
 * By separating API integrations into its own stack, we can:
 * - Switch between Node.js and Rust implementations easily
 * - Avoid CloudFormation export deletion issues
 * - Keep Lambda stacks focused on function creation only
 */
export class ApiIntegrationsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiIntegrationsStackProps) {
    super(scope, id, props);

    const {
      restApi,
      authorizer,
      lambdaFunctions,
      implementationLabel = 'Lambda',
    } = props;

    // Get existing resources from API Gateway
    // Note: We need to use getResource() to get existing resources created in ApiStack
    const adminResource = restApi.root.getResource('admin');
    const postsResource = restApi.root.getResource('posts');

    if (!adminResource) {
      throw new Error('Admin resource not found in API Gateway');
    }
    if (!postsResource) {
      throw new Error('Posts resource not found in API Gateway');
    }

    // =====================
    // Admin Posts Endpoints
    // =====================

    // Create /admin/posts resource
    const adminPostsResource = adminResource.addResource('posts');

    // POST /admin/posts - Create post
    adminPostsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(lambdaFunctions.createPostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // GET /admin/posts - List posts (admin)
    adminPostsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(lambdaFunctions.listPostsFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Create /admin/posts/{id} resource
    const adminPostByIdResource = adminPostsResource.addResource('{id}');

    // GET /admin/posts/{id} - Get post
    adminPostByIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(lambdaFunctions.getPostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // PUT /admin/posts/{id} - Update post
    adminPostByIdResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(lambdaFunctions.updatePostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // DELETE /admin/posts/{id} - Delete post
    adminPostByIdResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(lambdaFunctions.deletePostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // =====================
    // Admin Images Endpoints
    // =====================

    // Create /admin/images resource
    const adminImagesResource = adminResource.addResource('images');

    // POST /admin/images/upload-url - Get upload URL
    const uploadUrlResource = adminImagesResource.addResource('upload-url');
    uploadUrlResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(lambdaFunctions.uploadUrlFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // DELETE /admin/images/{key+} - Delete image
    const deleteImageResource = adminImagesResource.addResource('{key+}');
    deleteImageResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(lambdaFunctions.deleteImageFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // =====================
    // Admin Auth Endpoints (optional, Rust only)
    // =====================

    if (
      lambdaFunctions.loginFunction &&
      lambdaFunctions.logoutFunction &&
      lambdaFunctions.refreshFunction
    ) {
      const adminAuthResource = adminResource.addResource('auth');

      // POST /admin/auth/login
      const loginResource = adminAuthResource.addResource('login');
      const loginMethod = loginResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(lambdaFunctions.loginFunction),
        {
          authorizationType: apigateway.AuthorizationType.NONE,
        }
      );

      // POST /admin/auth/logout
      const logoutResource = adminAuthResource.addResource('logout');
      logoutResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(lambdaFunctions.logoutFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // POST /admin/auth/refresh
      const refreshResource = adminAuthResource.addResource('refresh');
      const refreshMethod = refreshResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(lambdaFunctions.refreshFunction),
        {
          authorizationType: apigateway.AuthorizationType.NONE,
        }
      );

      // CDK Nag Suppressions for auth endpoints
      // login and refresh endpoints intentionally do not require authorization
      // because they are the endpoints that provide authentication tokens
      const authEndpointSuppression = [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'Auth endpoints (login/refresh) intentionally do not require authorization - they provide authentication.',
        },
        {
          id: 'AwsSolutions-COG4',
          reason:
            'Auth endpoints (login/refresh) use AuthorizationType.NONE - users authenticate via these endpoints.',
        },
      ];

      NagSuppressions.addResourceSuppressions(
        loginMethod,
        authEndpointSuppression,
        true
      );
      NagSuppressions.addResourceSuppressions(
        refreshMethod,
        authEndpointSuppression,
        true
      );
    }

    // =====================
    // Public Posts Endpoints
    // =====================

    // GET /posts - List posts (public)
    const listPostsMethod = postsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(lambdaFunctions.listPostsFunction),
      {
        authorizationType: apigateway.AuthorizationType.NONE,
      }
    );

    // GET /posts/{id} - Get post (public)
    const publicPostByIdResource = postsResource.addResource('{id}');
    const getPublicPostMethod = publicPostByIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(lambdaFunctions.getPublicPostFunction),
      {
        authorizationType: apigateway.AuthorizationType.NONE,
      }
    );

    // CDK Nag Suppressions for public endpoints
    // These methods intentionally do not require authorization for public blog access
    const publicEndpointSuppression = [
      {
        id: 'AwsSolutions-APIG4',
        reason:
          'Public blog endpoints (/posts) intentionally do not require authorization for public access.',
      },
      {
        id: 'AwsSolutions-COG4',
        reason:
          'Public blog endpoints (/posts) use AuthorizationType.NONE intentionally for public access.',
      },
    ];

    NagSuppressions.addResourceSuppressions(
      listPostsMethod,
      publicEndpointSuppression,
      true
    );
    NagSuppressions.addResourceSuppressions(
      getPublicPostMethod,
      publicEndpointSuppression,
      true
    );

    // CDK Nag Suppressions
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-APIG4',
        reason:
          'Public endpoints (/posts) intentionally do not require authorization for public blog access.',
      },
      {
        id: 'AwsSolutions-COG4',
        reason:
          'Public endpoints (/posts) use AuthorizationType.NONE intentionally for public access.',
      },
    ]);

    // Output which implementation is being used
    new cdk.CfnOutput(this, 'ApiImplementation', {
      value: implementationLabel,
      description: 'Lambda implementation used for API integrations',
    });
  }
}
