/**
 * Request validation middleware using Zod schemas
 * 
 * This middleware validates incoming request data (body, query, params) against
 * Zod schemas and returns standardized validation error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validation target - which part of the request to validate
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Generic middleware to validate request data against a Zod schema
 * 
 * @param schema - Zod schema to validate against
 * @param target - Which part of the request to validate (body, query, or params)
 * @returns Express middleware function
 * 
 * @example
 * router.post('/refresh', validateRequest(RefreshTokenSchema, 'body'), refreshToken);
 */
export const validateRequest = <T>(
  schema: z.ZodSchema<T>,
  target: ValidationTarget = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate and parse the request data
      // This will throw a ZodError if validation fails
      const parsed = schema.parse(req[target]);
      
      // Replace the original data with parsed/transformed data
      // This ensures downstream handlers receive validated data
      // Note: req.query is read-only in Express, so we only reassign body and params
      if (target !== 'query') {
        req[target] = parsed;
      }
      // For query params, validation passes but we don't reassign (read-only property)
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Return standardized validation error response
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
      }
      
      // Unexpected error during validation
      next(error);
    }
  };
};

/**
 * Shorthand helper for validating request body
 * Most common validation target for POST/PUT/PATCH requests
 * 
 * @example
 * router.post('/refresh', validateBody(RefreshTokenSchema), refreshToken);
 */
export const validateBody = <T>(schema: z.ZodSchema<T>) =>
  validateRequest(schema, 'body');

/**
 * Shorthand helper for validating query parameters
 * Common for GET requests with parameters
 * 
 * @example
 * router.get('/callback', validateQuery(OAuthCallbackSchema), callback);
 */
export const validateQuery = <T>(schema: z.ZodSchema<T>) =>
  validateRequest(schema, 'query');

/**
 * Shorthand helper for validating route parameters
 * Used for dynamic route segments like /users/:id
 * 
 * @example
 * router.get('/users/:id', validateParams(UserIdSchema), getUser);
 */
export const validateParams = <T>(schema: z.ZodSchema<T>) =>
  validateRequest(schema, 'params');
