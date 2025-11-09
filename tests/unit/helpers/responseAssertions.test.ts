/**
 * レスポンスアサーションヘルパーのテスト
 *
 * API Gatewayレスポンスの検証用ヘルパー関数のテスト
 */

import {
  expectSuccessResponse,
  expectErrorResponse,
  expectValidationError,
  expectNotFoundError,
  expectUnauthorizedError,
} from '../../helpers/assertions/responseAssertions';

describe('responseAssertions', () => {
  describe('expectSuccessResponse', () => {
    it('should validate successful response with 200 status', () => {
      const response = {
        statusCode: 200,
        body: JSON.stringify({ message: 'Success' }),
      };

      expect(() => expectSuccessResponse(response, 200)).not.toThrow();
    });

    it('should validate successful response with 201 status', () => {
      const response = {
        statusCode: 201,
        body: JSON.stringify({ id: '123' }),
      };

      expect(() => expectSuccessResponse(response, 201)).not.toThrow();
    });

    it('should throw error when status code does not match', () => {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ error: 'Bad Request' }),
      };

      expect(() => expectSuccessResponse(response, 200)).toThrow();
    });

    it('should validate response body structure', () => {
      const response = {
        statusCode: 200,
        body: JSON.stringify({ id: '123', title: 'Test Post' }),
      };

      expect(() =>
        expectSuccessResponse(response, 200, {
          id: expect.any(String),
          title: expect.any(String),
        })
      ).not.toThrow();
    });
  });

  describe('expectErrorResponse', () => {
    it('should validate error response with status code', () => {
      const response = {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error' }),
      };

      expect(() => expectErrorResponse(response, 500)).not.toThrow();
    });

    it('should validate error message', () => {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid input' }),
      };

      expect(() =>
        expectErrorResponse(response, 400, 'Invalid input')
      ).not.toThrow();
    });

    it('should throw error when status code does not match', () => {
      const response = {
        statusCode: 200,
        body: JSON.stringify({ message: 'Success' }),
      };

      expect(() => expectErrorResponse(response, 500)).toThrow();
    });
  });

  describe('expectValidationError', () => {
    it('should validate 400 validation error', () => {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'Validation failed' }),
      };

      expect(() => expectValidationError(response)).not.toThrow();
    });

    it('should validate error message contains expected text', () => {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'タイトルが必要です' }),
      };

      expect(() => expectValidationError(response, 'タイトル')).not.toThrow();
    });

    it('should throw error when status code is not 400', () => {
      const response = {
        statusCode: 500,
        body: JSON.stringify({ message: 'Server error' }),
      };

      expect(() => expectValidationError(response)).toThrow();
    });
  });

  describe('expectNotFoundError', () => {
    it('should validate 404 not found error', () => {
      const response = {
        statusCode: 404,
        body: JSON.stringify({ message: 'Not Found' }),
      };

      expect(() => expectNotFoundError(response)).not.toThrow();
    });

    it('should throw error when status code is not 404', () => {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'Bad Request' }),
      };

      expect(() => expectNotFoundError(response)).toThrow();
    });
  });

  describe('expectUnauthorizedError', () => {
    it('should validate 401 unauthorized error', () => {
      const response = {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };

      expect(() => expectUnauthorizedError(response)).not.toThrow();
    });

    it('should throw error when status code is not 401', () => {
      const response = {
        statusCode: 403,
        body: JSON.stringify({ message: 'Forbidden' }),
      };

      expect(() => expectUnauthorizedError(response)).toThrow();
    });
  });
});
