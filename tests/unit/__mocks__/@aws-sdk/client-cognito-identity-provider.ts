/**
 * Manual mock for @aws-sdk/client-cognito-identity-provider
 * This mock is automatically used by Jest for all imports of @aws-sdk/client-cognito-identity-provider
 */

// Export mockCognitoSend to be accessible from tests
const mockCognitoSendFn = jest.fn();
export const mockCognitoSend = mockCognitoSendFn;

export class CognitoIdentityProviderClient {
  constructor(config?: any) {}
  send = mockCognitoSendFn;
}

export class InitiateAuthCommand {
  constructor(public input: any) {}
}

export class RespondToAuthChallengeCommand {
  constructor(public input: any) {}
}

export class GlobalSignOutCommand {
  constructor(public input: any) {}
}
