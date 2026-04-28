/**
 * Custom error classes for application-specific errors
 * 
 * These error classes extend the base Error class and include additional
 * metadata like HTTP status codes and error codes for consistent error handling.
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'APP_ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for debugging
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400 Bad Request)
 * Used when request data fails validation
 */
export class ValidationError extends AppError {
  constructor(message: string, public field?: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication error (401 Unauthorized)
 * Used when authentication is required but not provided or invalid
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: unknown) {
    super(message, 401, 'AUTH_ERROR', details);
  }
}

/**
 * Authorization error (403 Forbidden)
 * Used when authenticated user lacks required permissions
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

/**
 * Not found error (404 Not Found)
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * External API error (502 Bad Gateway)
 * Used when an external service (like Microsoft Graph) fails
 */
export class ExternalAPIError extends AppError {
  constructor(
    service: string,
    message: string,
    public originalError?: unknown
  ) {
    super(
      `External API error (${service}): ${message}`,
      502,
      'EXTERNAL_API_ERROR',
      originalError
    );
  }
}

/**
 * Type guard to check if an error is an AppError instance
 * Used in error handlers to provide appropriate error responses
 * 
 * @param error - Value to check
 * @returns True if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
