/**
 * auth-utils.ts のユニットテスト
 */
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getUserIdFromEvent } from '../../../functions/shared/auth-utils';

describe('getUserIdFromEvent', () => {
  it('正常系: requestContext.authorizer.claims.subが存在する場合、ユーザーIDを返す', () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
          },
        },
      },
    } as any as APIGatewayProxyEvent;

    const result = getUserIdFromEvent(event);

    expect(result).toBe('user-123');
  });

  it('requestContextが存在しない場合、undefinedを返す', () => {
    const event = {
      requestContext: undefined,
    } as any as APIGatewayProxyEvent;

    const result = getUserIdFromEvent(event);

    expect(result).toBeUndefined();
  });

  it('authorizerが存在しない場合、undefinedを返す', () => {
    const event = {
      requestContext: {
        authorizer: undefined,
      },
    } as any as APIGatewayProxyEvent;

    const result = getUserIdFromEvent(event);

    expect(result).toBeUndefined();
  });

  it('claimsが存在しない場合、undefinedを返す', () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: undefined,
        },
      },
    } as any as APIGatewayProxyEvent;

    const result = getUserIdFromEvent(event);

    expect(result).toBeUndefined();
  });

  it('subが存在しない場合、undefinedを返す', () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: undefined,
          },
        },
      },
    } as any as APIGatewayProxyEvent;

    const result = getUserIdFromEvent(event);

    expect(result).toBeUndefined();
  });
});
