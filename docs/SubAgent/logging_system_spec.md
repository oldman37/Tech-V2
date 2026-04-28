# Logging System Implementation Specification

**Date:** February 19, 2026  
**Status:** Specification  
**Priority:** HIGH  
**Related Issues:** Audit Report - Console Logging (High Priority Issue)  
**Author:** GitHub Copilot  
**Version:** 1.0.0

---

## Executive Summary

This specification outlines the implementation of a comprehensive, production-ready logging system for the Tech-V2 backend to replace 57+ unstructured console.log/console.error statements with a structured, performant, and secure logging solution.

**Problem Statement:**  
The current backend codebase uses raw console logging throughout, causing:
- **Performance overhead** - Synchronous console operations blocking event loop
- **Log pollution** - Unstructured data making debugging difficult
- **Security risks** - Potential exposure of sensitive information (tokens, PII)
- **No observability** - Cannot filter, search, or analyze logs effectively
- **Production issues** - Same verbose logging in dev and production

**Solution:**  
Implement Winston-based structured logging with log levels, log rotation, secure data handling, and environment-specific configuration.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Research Findings](#2-research-findings)
3. [Logging Library Recommendation](#3-logging-library-recommendation)
4. [Logger Configuration Design](#4-logger-configuration-design)
5. [Structured Logging Patterns](#5-structured-logging-patterns)
6. [Log Rotation Strategy](#6-log-rotation-strategy)
7. [Environment-Specific Configuration](#7-environment-specific-configuration)
8. [HTTP Request Logging](#8-http-request-logging)
9. [Security Considerations](#9-security-considerations)
10. [Migration Strategy](#10-migration-strategy)
11. [Performance Impact Assessment](#11-performance-impact-assessment)
12. [Testing Approach](#12-testing-approach)
13. [Implementation Steps](#13-implementation-steps)

---

## 1. Current State Analysis

### 1.1 Console Logging Inventory

**Total Console Statements: 57**

| File | Count | Lines | Issue Type |
|------|-------|-------|------------|
| `userSync.service.ts` | 14 | 335, 344, 356, 360, 366, 403, 444, 456, 465, 470, 478, 488, 491, 499, 503 | Info + Error mixing |
| `admin.routes.ts` | 12 | 29, 50, 94, 113, 140, 167, 191, 209, 217, 222, 225, 234 | Debugging + Error |
| `cronJobs.service.ts` | 12 | 12, 17, 33, 34, 38, 40, 49, 83, 91, 94, 97 | Lifecycle logging |
| `auth.controller.ts` | 9 | 47, 78, 144, 145, 249, 250, 256, 398, 400, 479, 481 | Debug + Error |
| `server.ts` | 5 | 95, 105, 106, 107, 115, 121 | Server lifecycle |
| `errorHandler.ts` | 1 | 53 | Unexpected errors |
| `config/entraId.ts` | 1 | 21 | MSAL logging |

### 1.2 Problem Categories

#### **A. Performance Issues**
```typescript
// ❌ CURRENT: Synchronous, blocks event loop
console.log(`Syncing user: ${entraId}`);
console.log(`User ${graphUser.displayName} location fields:`, {
  officeLocation: graphUser.officeLocation,
  // ... large object
});
```

- Console operations are synchronous
- Large object logging blocks event loop
- No asynchronous buffering

#### **B. Security Vulnerabilities**
```typescript
// ❌ SECURITY RISK: Logs tokens
console.log('Token request:', {
  code: code.substring(0, 20) + '...',  // Still reveals partial token
  scopes: loginScopes.scopes,
  redirectUri: process.env.REDIRECT_URI,
});

// ❌ SECURITY RISK: Logs group IDs (configuration details)
console.log('Group IDs:', {
  admin: process.env.ENTRA_ADMIN_GROUP_ID,
  // ... exposes infrastructure details
});
```

#### **C. Lack of Structure**
```typescript
// ❌ NO STRUCTURE: Can't parse or query
console.log(`Syncing user: ${entraId}`);
console.log(`Found ${members.length} members in group`);
```

- No correlation IDs for request tracing
- No log levels (all info level)
- Cannot filter by component or operation type
- Hard to search in production

#### **D. No Environment Differentiation**
```typescript
// ❌ SAME LOGS IN DEV AND PRODUCTION
console.log(`User ${graphUser.displayName} is in ${groupIds.length} groups`);
```

- Verbose debug logs run in production
- No way to adjust logging level per environment

---

## 2. Research Findings

### 2.1 Node.js Logging Libraries Comparison

Based on research from npm trends, GitHub stars, and production usage:

| Library | NPM Weekly Downloads | GitHub Stars | Performance | Structure | Ecosystem |
|---------|---------------------|--------------|-------------|-----------|-----------|
| **Winston** | ~7.5M | 22.5k | Good (1-2ms overhead) | Excellent | Extensive |
| **Pino** | ~6M | 13.7k | Excellent (<0.5ms) | Excellent | Good |
| **Bunyan** | ~900k | 7k | Good | Good | Limited |
| **Log4js** | ~1.3M | 5.8k | Good | Good | Moderate |

### 2.2 Key Research Sources

1. **Winston Documentation** (github.com/winstonjs/winston)
   - De facto standard for Node.js logging
   - Supports multiple transports (file, console, HTTP, streams)
   - Extensive formatting options
   - Strong community and ecosystem

2. **Pino Documentation** (github.com/pinojs/pino)
   - Fastest JSON logger
   - Asynchronous by design
   - Lower-level API (less features out of box)

3. **Express Morgan Middleware** (github.com/expressjs/morgan)
   - Standard for HTTP request logging
   - Works with any logger via streams
   - Common format patterns (combined, common, dev)

4. **Node.js Best Practices** (github.com/goldbergyoni/nodebestpractices)
   - Use structured logging (JSON)
   - Separate operational vs programming logs
   - Log levels: error, warn, info, http, debug
   - Never log sensitive data

5. **OWASP Logging Cheat Sheet** (cheatsheetseries.owasp.org)
   - Sanitize logs (no PII, passwords, tokens)
   - Include context (timestamp, user ID, correlation ID)
   - Protect log files (access control, rotation)

6. **12 Factor App - Logs** (12factor.net/logs)
   - Treat logs as event streams
   - Don't manage log files in app
   - Write to stdout/stderr
   - Let infrastructure handle rotation/aggregation

### 2.3 Industry Best Practices Summary

#### **Structured Logging**
```json
{
  "timestamp": "2026-02-19T10:30:45.123Z",
  "level": "info",
  "message": "User synced successfully",
  "service": "userSync",
  "operation": "syncUser",
  "userId": "abc123",
  "duration": 245,
  "requestId": "req-xyz789"
}
```

#### **Log Levels** (RFC 5424 Syslog standard)
- **error**: Error events that might still allow app to continue
- **warn**: Warning messages for potentially harmful situations
- **info**: Informational messages highlighting progress
- **http**: HTTP request/response logging
- **verbose**: Detailed informational events
- **debug**: Fine-grained informational for debugging
- **silly**: Most detailed (trace-level)

#### **Log Rotation**
- Rotate by size (10MB per file)
- Rotate by time (daily)
- Keep last 14 days of logs
- Compress old logs
- Use external tools (logrotate, winston-daily-rotate-file)

#### **Security**
- Redact sensitive fields (password, token, ssn, credit cards)
- Hash PII when needed for debugging
- Separate audit logs for compliance
- Restrict log file access

#### **Performance**
- Use asynchronous logging
- Buffer writes
- Avoid logging large objects
- Use sampling for high-frequency events
- Consider separate logging process

---

## 3. Logging Library Recommendation

### **Recommendation: Winston 3.x**

**Rationale:**

1. **Maturity & Community**
   - Industry standard (7.5M weekly downloads)
   - Extensive documentation
   - Large ecosystem of transports and formatters
   - Active maintenance

2. **Features Match Requirements**
   - Multiple transports (console, file, rotation)
   - Custom log levels
   - Structured JSON logging
   - Stream support for Morgan integration
   - Exception/rejection handling
   - Metadata support
   - Environment-based configuration

3. **TypeScript Support**
   - Official type definitions (@types/winston)
   - Strong typing for configuration and usage

4. **Performance**
   - Acceptable overhead (1-2ms) for our use case
   - Asynchronous transport option
   - Not performance-critical (not logging in hot paths)

5. **Extensibility**
   - Easy to add custom transports
   - Custom formatters
   - Integration with monitoring tools (Datadog, Splunk, ELK)

**Why Not Pino?**
- Pino is faster but has steeper learning curve
- Less feature-rich out of box
- Winston's ecosystem better for our needs
- Performance difference negligible for our scale

**Why Not Bunyan?**
- Declining popularity
- Smaller ecosystem
- Winston has surpassed it in adoption

---

## 4. Logger Configuration Design

### 4.1 Logger Module Structure

```
backend/src/
├── lib/
│   └── logger.ts          # Main logger instance
├── utils/
│   ├── redactSensitiveData.ts  # Data sanitization
│   └── loggerHelpers.ts        # Helper functions
├── middleware/
│   └── requestLogger.ts        # HTTP request logging
└── types/
    └── logger.types.ts        # Logger type definitions
```

### 4.2 Core Logger Configuration (`lib/logger.ts`)

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { redactSensitiveData } from '../utils/redactSensitiveData';

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.json()
);

// Human-readable format for development
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    const metaStr = Object.keys(metadata).length 
      ? '\n' + JSON.stringify(metadata, null, 2) 
      : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Determine log level from environment
const getLogLevel = (): string => {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

// Create logger instance
export const logger = winston.createLogger({
  level: getLogLevel(),
  format: process.env.NODE_ENV === 'production' 
    ? structuredFormat 
    : devFormat,
  defaultMeta: { 
    service: 'tech-v2-backend',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? structuredFormat
        : devFormat,
    }),
    
    // Error log file (errors only)
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '10m',
      maxFiles: '14d',
      format: structuredFormat,
    }),
    
    // Combined log file (all levels)
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
      format: structuredFormat,
    }),
  ],
  
  // Handle uncaught exceptions and unhandled rejections
  exceptionHandlers: [
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
    }),
  ],
});

// Create child loggers with context
export const createLogger = (context: string) => {
  return logger.child({ context });
};

// Helper methods for common patterns
export const loggers = {
  userSync: createLogger('UserSyncService'),
  auth: createLogger('AuthController'),
  cron: createLogger('CronJobsService'),
  http: createLogger('HTTPRequest'),
  db: createLogger('Database'),
};
```

### 4.3 Type Definitions (`types/logger.types.ts`)

```typescript
import { Logger } from 'winston';

export interface LogMetadata {
  [key: string]: any;
  userId?: string;
  requestId?: string;
  duration?: number;
  error?: Error;
  operationId?: string;
}

export interface StructuredLog {
  level: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
  message: string;
  metadata?: LogMetadata;
}

export type ContextualLogger = Logger;
```

### 4.4 Sensitive Data Redaction (`utils/redactSensitiveData.ts`)

```typescript
/**
 * Redact sensitive data from logs
 */
export const redactSensitiveData = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'cookie',
    'session',
    'apiKey',
    'secret',
    'ssn',
    'creditCard',
    'cvv',
    'pin',
  ];

  const redacted = Array.isArray(data) ? [...data] : { ...data };

  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    
    // Check if key contains sensitive field name
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      redacted[key] = '[REDACTED]';
    } 
    // Recursively redact nested objects
    else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  }

  return redacted;
};

/**
 * Redact email addresses (show only first 2 chars + domain)
 */
export const redactEmail = (email: string): string => {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain}`;
};

/**
 * Redact Entra ID (show only first/last 4 chars)
 */
export const redactEntraId = (id: string): string => {
  if (!id || id.length < 12) return '[REDACTED]';
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
};
```

---

## 5. Structured Logging Patterns

### 5.1 Basic Logging

```typescript
import { loggers } from '../lib/logger';

// ❌ OLD WAY
console.log(`Syncing user: ${entraId}`);

// ✅ NEW WAY
loggers.userSync.info('Starting user sync', {
  entraId: redactEntraId(entraId),
  operationId: requestId,
});
```

### 5.2 Error Logging

```typescript
// ❌ OLD WAY
console.error('Failed to sync user:', error);

// ✅ NEW WAY
loggers.userSync.error('User sync failed', {
  entraId: redactEntraId(entraId),
  error: {
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  },
  operationId: requestId,
});
```

### 5.3 Performance Logging

```typescript
// ✅ Track operation duration
const startTime = Date.now();

try {
  const user = await syncUser(entraId);
  
  loggers.userSync.info('User sync completed', {
    entraId: redactEntraId(entraId),
    userId: user.id,
    duration: Date.now() - startTime,
    operationId: requestId,
  });
} catch (error) {
  loggers.userSync.error('User sync failed', {
    entraId: redactEntraId(entraId),
    duration: Date.now() - startTime,
    error: error,
    operationId: requestId,
  });
}
```

### 5.4 Debug Logging (Development Only)

```typescript
// ✅ Debug logs automatically filtered in production
loggers.userSync.debug('User location fields', {
  entraId: redactEntraId(entraId),
  officeLocation: graphUser.officeLocation,
  physicalDeliveryOfficeName: graphUser.physicalDeliveryOfficeName,
  usageLocation: graphUser.usageLocation,
});
```

### 5.5 Request Context Pattern

```typescript
// Add request ID to all logs in a request lifecycle
import { v4 as uuidv4 } from 'uuid';

// In middleware
req.id = uuidv4();
req.logger = logger.child({ requestId: req.id });

// In handlers
req.logger.info('Processing user update', {
  userId: req.params.id,
  changes: redactSensitiveData(req.body),
});
```

---

## 6. Log Rotation Strategy

### 6.1 Rotation Configuration

**Using `winston-daily-rotate-file` transport:**

```typescript
new DailyRotateFile({
  filename: 'logs/combined-%DATE%.log',
  datePattern: 'YYYY-MM-DD',  // Daily rotation
  maxSize: '10m',             // Max 10MB per file
  maxFiles: '14d',            // Keep 14 days
  compress: 'gzip',           // Compress rotated files
  auditFile: 'logs/.audit.json', // Track rotations
})
```

### 6.2 Log Directory Structure

```
backend/
├── logs/
│   ├── combined-2026-02-19.log       # Today's logs
│   ├── combined-2026-02-18.log.gz    # Yesterday (compressed)
│   ├── error-2026-02-19.log          # Today's errors
│   ├── error-2026-02-18.log.gz       # Yesterday errors
│   ├── exceptions-2026-02-19.log     # Uncaught exceptions
│   ├── rejections-2026-02-19.log     # Unhandled rejections
│   ├── http-2026-02-19.log           # HTTP request logs
│   └── .audit.json                   # Rotation audit trail
└── .gitignore                        # Ignore logs/ directory
```

### 6.3 Log Retention Policy

| Log Type | Retention | Compression | Rotation |
|----------|-----------|-------------|----------|
| Combined | 14 days | gzip | Daily, 10MB |
| Error | 30 days | gzip | Daily, 10MB |
| Exceptions | 30 days | gzip | Daily, 10MB |
| HTTP | 7 days | gzip | Daily, 20MB |
| Audit | 90 days | gzip | Daily, 5MB |

### 6.4 Production Considerations

**For Docker/Kubernetes:**
```typescript
// Send logs to stdout instead of files
if (process.env.CONTAINER_MODE === 'true') {
  // Only console transport - let infrastructure handle rotation
  transports: [
    new winston.transports.Console({
      format: structuredFormat,
    }),
  ]
}
```

**For Cloud Logging:**
```typescript
// Use cloud provider transport
import { LoggingWinston } from '@google-cloud/logging-winston';

if (process.env.CLOUD_LOGGING === 'true') {
  transports: [
    new LoggingWinston(), // Google Cloud Logging
    // or AWS CloudWatch, Azure Monitor, etc.
  ]
}
```

---

## 7. Environment-Specific Configuration

### 7.1 Development Configuration

```typescript
// Development: Verbose, colorized, human-readable
{
  level: 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
  ),
  transports: [
    new winston.transports.Console(),
  ]
}
```

**Output Example:**
```
10:30:45.123 [info]: Starting user sync { entraId: "abc1...xyz9", requestId: "req-123" }
10:30:45.876 [debug]: User location fields { officeLocation: "Main Office", ... }
10:30:46.234 [info]: User sync completed { duration: 1111, userId: 42 }
```

### 7.2 Production Configuration

```typescript
// Production: Minimal overhead, structured JSON, file rotation
{
  level: 'info', // No debug logs
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(), // For container logs
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      maxSize: '10m',
      maxFiles: '14d',
    }),
  ]
}
```

**Output Example:**
```json
{
  "timestamp": "2026-02-19T10:30:45.123Z",
  "level": "info",
  "message": "User sync completed",
  "service": "tech-v2-backend",
  "context": "UserSyncService",
  "metadata": {
    "userId": 42,
    "duration": 1111,
    "requestId": "req-123"
  }
}
```

### 7.3 Test Configuration

```typescript
// Testing: Silent or minimal logging
{
  level: process.env.TEST_LOGS ? 'debug' : 'error',
  silent: process.env.TEST_LOGS !== 'true',
  transports: [
    new winston.transports.Console(),
  ]
}
```

### 7.4 Environment Variables

```bash
# .env.example
NODE_ENV=development              # development | production | test
LOG_LEVEL=debug                   # error | warn | info | http | verbose | debug | silly
LOG_TO_FILE=false                 # Enable file logging in dev
CONTAINER_MODE=false              # Use stdout only
CLOUD_LOGGING=false               # Enable cloud logging
LOG_PRETTY=true                   # Pretty print in dev
TEST_LOGS=false                   # Enable logs in tests
```

---

## 8. HTTP Request Logging

### 8.1 Morgan Integration

**HTTP Request Logger Middleware (`middleware/requestLogger.ts`):**

```typescript
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger';
import { Request, Response } from 'express';

// Add request ID to every request
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  
  // Attach logger with request context
  req.logger = logger.child({ requestId: req.id });
  
  next();
};

// Custom token for request ID
morgan.token('request-id', (req: Request) => req.id);

// Custom token for user ID
morgan.token('user-id', (req: Request) => {
  return (req as any).user?.id || 'anonymous';
});

// Development format (colorized, short)
const devFormat = ':method :url :status :response-time ms - :res[content-length]';

// Production format (JSON structured)
const prodFormat = JSON.stringify({
  method: ':method',
  url: ':url',
  status: ':status',
  responseTime: ':response-time',
  contentLength: ':res[content-length]',
  requestId: ':request-id',
  userId: ':user-id',
  userAgent: ':user-agent',
  remoteAddr: ':remote-addr',
});

// Winston stream for Morgan
const stream = {
  write: (message: string) => {
    // Parse JSON in production, use as-is in dev
    if (process.env.NODE_ENV === 'production') {
      try {
        const log = JSON.parse(message);
        logger.http('HTTP Request', log);
      } catch {
        logger.http(message.trim());
      }
    } else {
      logger.http(message.trim());
    }
  },
};

// Morgan middleware
export const httpLogger = morgan(
  process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  {
    stream,
    skip: (req) => {
      // Skip health checks and static assets
      return req.url === '/health' || req.url.startsWith('/static');
    },
  }
);
```

### 8.2 Integration in Server

```typescript
// server.ts
import { requestId, httpLogger } from './middleware/requestLogger';

app.use(requestId);  // Must be first
app.use(httpLogger); // After requestId
```

### 8.3 Sample HTTP Logs

**Development:**
```
GET /api/users 200 52ms - 1234
POST /api/auth/login 401 156ms - 89
```

**Production:**
```json
{
  "timestamp": "2026-02-19T10:30:45.123Z",
  "level": "http",
  "message": "HTTP Request",
  "method": "GET",
  "url": "/api/users",
  "status": 200,
  "responseTime": "52",
  "contentLength": "1234",
  "requestId": "req-abc123",
  "userId": "42",
  "userAgent": "Mozilla/5.0...",
  "remoteAddr": "192.168.1.100"
}
```

---

## 9. Security Considerations

### 9.1 Data Classification

**Never Log:**
- Passwords (plain or hashed)
- Access tokens (full or partial)
- API keys
- Session tokens
- Credit card numbers
- Social Security Numbers
- Full addresses
- Phone numbers

**Redact When Logging:**
- Email addresses (show only domain)
- User IDs (show partial)
- IP addresses (mask last octet)
- Authorization headers

**Safe to Log:**
- Public user identifiers (numeric IDs)
- Timestamps
- Operation names
- Status codes
- Duration metrics
- Non-sensitive metadata

### 9.2 Redaction Examples

```typescript
// ❌ DANGEROUS
logger.info('User login', {
  email: 'john.doe@example.com',
  password: password,  // NEVER!
  token: accessToken,  // NEVER!
});

// ✅ SAFE
logger.info('User login', {
  userId: user.id,  // Numeric ID is safe
  email: redactEmail('john.doe@example.com'),  // jo***@example.com
  authMethod: 'entraId',
});
```

### 9.3 Audit Logging

**Separate audit logs for compliance:**

```typescript
// Create audit logger
export const auditLogger = winston.createLogger({
  level: 'info',
  format: structuredFormat,
  transports: [
    new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d',  // Longer retention for compliance
      auditFile: 'logs/.audit-trail.json',
    }),
  ],
});

// Log security events
auditLogger.info('User role changed', {
  actor: req.user.id,
  targetUser: userId,
  oldRole: oldRole,
  newRole: newRole,
  timestamp: new Date().toISOString(),
  ipAddress: req.ip,
  requestId: req.id,
});
```

### 9.4 Log File Security

**Access Control:**
```bash
# Set restrictive permissions on log directory
chmod 750 logs/
chmod 640 logs/*.log

# Logs readable by app and ops only
chown app:ops logs/
```

**Environment Variables:**
```bash
# Don't log in plaintext files in production
LOG_ENCRYPTION=true
LOG_ENCRYPTION_KEY=<kms-key-id>
```

### 9.5 GDPR Compliance

```typescript
/**
 * Anonymize logs for GDPR compliance
 * Hash personal identifiers with salt
 */
import crypto from 'crypto';

export const anonymizeUserId = (userId: string): string => {
  const salt = process.env.LOG_ANONYMIZATION_SALT || 'default-salt';
  return crypto
    .createHash('sha256')
    .update(userId + salt)
    .digest('hex')
    .substring(0, 16);
};

// Usage
logger.info('User action', {
  userId: anonymizeUserId(user.id),  // Hash instead of real ID
  action: 'profile_update',
});
```

---

## 10. Migration Strategy

### 10.1 Migration Phases

#### **Phase 1: Foundation (Week 1)**
- Install dependencies (winston, winston-daily-rotate-file, morgan)
- Create logger module (`lib/logger.ts`)
- Create redaction utilities
- Add logger types
- Configure environment-specific settings
- Add HTTP request logging middleware
- Update `.gitignore` to exclude logs/

#### **Phase 2: High-Priority Services (Week 2)**
- **userSync.service.ts**: 14 console statements → structured logging
- **cronJobs.service.ts**: 12 console statements → structured logging
- Test synchronization workflows

#### **Phase 3: Controllers & Routes (Week 3)**
- **admin.routes.ts**: 12 console statements
- **auth.controller.ts**: 9 console statements
- Test authentication flows

#### **Phase 4: Infrastructure (Week 4)**
- **server.ts**: 5 console statements
- **errorHandler.ts**: 1 console statement
- **config/entraId.ts**: MSAL logging
- Integration testing

#### **Phase 5: Testing & Documentation (Week 5)**
- Create logging guidelines for developers
- Update code review checklist
- Add logging best practices to README
- Create runbook for log analysis

### 10.2 Migration Pattern

**Before:**
```typescript
console.log(`Syncing user: ${entraId}`);
console.log(`User ${graphUser.displayName} location fields:`, {
  officeLocation: graphUser.officeLocation,
  physicalDeliveryOfficeName: graphUser.physicalDeliveryOfficeName,
  usageLocation: graphUser.usageLocation
});
console.log(`User ${graphUser.displayName} is in ${groupIds.length} groups`);
console.log(`Assigned role: ${role} with ${permissions.length} permissions`);
console.log(`Mapped location: ${rawLocation} -> ${officeLocation}`);
```

**After:**
```typescript
import { loggers } from '../lib/logger';
import { redactEntraId } from '../utils/redactSensitiveData';

const operationLogger = loggers.userSync.child({ 
  operation: 'syncUser',
  entraId: redactEntraId(entraId),
});

operationLogger.info('Starting user sync');

operationLogger.debug('User location fields', {
  officeLocation: graphUser.officeLocation,
  physicalDeliveryOfficeName: graphUser.physicalDeliveryOfficeName,
  usageLocation: graphUser.usageLocation,
});

operationLogger.info('User groups retrieved', {
  groupCount: groupIds.length,
});

operationLogger.info('Role assigned', {
  role,
  permissionCount: permissions.length,
});

operationLogger.debug('Location mapped', {
  rawLocation,
  mappedLocation: officeLocation,
});
```

### 10.3 Code Review Checklist

**For reviewers:**
- [ ] No `console.log` or `console.error` in production code
- [ ] Logs use appropriate level (error/warn/info/debug)
- [ ] Sensitive data is redacted
- [ ] Structured metadata included
- [ ] Request ID included in logs
- [ ] Error logs include stack trace (dev only)
- [ ] Performance-critical paths don't log at debug level

### 10.4 Backwards Compatibility

During migration, support both old and new logging:

```typescript
// Temporary wrapper during migration
export const compatLog = {
  log: (...args: any[]) => {
    console.warn('[DEPRECATED] Use logger.info() instead');
    logger.info(args[0], args[1]);
  },
  error: (...args: any[]) => {
    console.warn('[DEPRECATED] Use logger.error() instead');
    logger.error(args[0], args[1]);
  },
};
```

---

## 11. Performance Impact Assessment

### 11.1 Baseline Performance

**Current Console Logging:**
- Synchronous I/O (blocks event loop)
- ~5-10ms per console.log with large objects
- No buffering

**Estimated Impact:**
- 57 console statements × 5ms = ~285ms overhead per full sync operation
- Blocks event loop during heavy logging

### 11.2 Winston Performance

**Benchmarks (from Winston docs):**
- Console transport: ~1-2ms per log
- File transport (async): <0.5ms per log
- JSON formatting: ~0.3ms per log

**Our Scenario:**
- 57 log statements → ~85ms total (70% improvement)
- Non-blocking I/O (asynchronous file writes)
- Buffering reduces disk I/O

### 11.3 Production Optimization

```typescript
// Use async transport in production
import 'winston-transport';

const AsyncTransport = require('winston-transport');

class AsyncFileTransport extends AsyncTransport {
  constructor(opts) {
    super(opts);
    this.buffer = [];
    this.bufferSize = opts.bufferSize || 100;
    
    // Flush buffer every 5 seconds
    setInterval(() => this.flush(), 5000);
  }
  
  log(info, callback) {
    this.buffer.push(info);
    
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
    
    callback();
  }
  
  async flush() {
    if (this.buffer.length === 0) return;
    
    const logs = this.buffer.splice(0);
    // Batch write to file
    await fs.appendFile(
      this.filename,
      logs.map(l => JSON.stringify(l)).join('\n') + '\n'
    );
  }
}
```

### 11.4 Sampling for High-Frequency Events

```typescript
// Sample 1% of debug logs in production
const shouldLog = (level: string) => {
  if (level === 'debug' && process.env.NODE_ENV === 'production') {
    return Math.random() < 0.01; // 1% sampling
  }
  return true;
};

export const conditionalLogger = {
  debug: (message: string, meta?: any) => {
    if (shouldLog('debug')) {
      logger.debug(message, meta);
    }
  },
  // ... other levels always log
};
```

### 11.5 Performance Testing Plan

**Load Test Scenarios:**
1. Baseline: Current console logging under load
2. Winston (sync): Immediate Winston implementation
3. Winston (async): Optimized with buffering
4. Winston (sampled): Production config with sampling

**Metrics:**
- Requests per second
- P95/P99 latency
- Event loop lag
- Memory usage
- Disk I/O

**Expected Results:**
- 50-70% latency improvement
- 80% reduction in event loop blocking
- ~2-5MB additional memory (buffers)
- More consistent performance (less jitter)

---

## 12. Testing Approach

### 12.1 Unit Testing

```typescript
// tests/logger.test.ts
import { logger, createLogger } from '../src/lib/logger';
import winston from 'winston';

describe('Logger', () => {
  let mockTransport: winston.transports.MemoryTransportInstance;
  
  beforeEach(() => {
    // Use memory transport for testing
    mockTransport = new winston.transports.Memory();
    logger.clear();
    logger.add(mockTransport);
  });
  
  it('should log at info level', () => {
    logger.info('Test message', { key: 'value' });
    
    const logs = mockTransport.logs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('Test message');
    expect(logs[0]).toContain('key');
  });
  
  it('should redact sensitive data', () => {
    logger.info('User login', {
      email: 'user@example.com',
      password: 'secret123',
    });
    
    const logs = mockTransport.logs;
    expect(logs[0]).not.toContain('secret123');
    expect(logs[0]).toContain('[REDACTED]');
  });
  
  it('should include request context', () => {
    const contextLogger = createLogger('TestContext');
    contextLogger.info('Test with context');
    
    const logs = mockTransport.logs;
    expect(logs[0]).toContain('TestContext');
  });
});
```

### 12.2 Integration Testing

```typescript
// tests/requestLogger.test.ts
import request from 'supertest';
import { app } from '../src/server';
import { logger } from '../src/lib/logger';

describe('HTTP Request Logger', () => {
  it('should log HTTP requests', async () => {
    const spy = jest.spyOn(logger, 'http');
    
    await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer token');
    
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/users'),
      expect.objectContaining({
        method: 'GET',
        url: '/api/users',
        status: expect.any(Number),
      })
    );
  });
  
  it('should include request ID', async () => {
    const response = await request(app).get('/api/users');
    
    expect(response.headers['x-request-id']).toBeDefined();
  });
});
```

### 12.3 Manual Testing Checklist

**Development Environment:**
- [ ] Logs are colorized and human-readable
- [ ] Debug logs appear
- [ ] Stack traces are shown for errors
- [ ] Metadata is pretty-printed

**Production Environment:**
- [ ] Logs are JSON formatted
- [ ] Debug logs are filtered out
- [ ] Files rotate daily
- [ ] Old logs are compressed
- [ ] Sensitive data is redacted
- [ ] Request IDs are included

**Performance:**
- [ ] No noticeable latency increase
- [ ] Event loop lag is acceptable
- [ ] Memory usage is stable
- [ ] Disk I/O is reasonable

### 12.4 Monitoring & Alerting

```typescript
// Monitor logger errors
logger.on('error', (error) => {
  // Send to error tracking service
  console.error('[LOGGER ERROR]', error);
  // Fallback to console if logger fails
});

// Monitor log volume
let logCount = 0;
logger.on('data', () => {
  logCount++;
  
  // Alert if logging rate is too high (potential log bomb)
  if (logCount > 1000) {
    console.warn('[LOGGER WARNING] High log volume detected');
    logCount = 0;
  }
});
```

---

## 13. Implementation Steps

### 13.1 Detailed Implementation Task List

#### **Step 1: Install Dependencies** (30 minutes)
```bash
cd backend
npm install winston winston-daily-rotate-file morgan uuid
npm install --save-dev @types/morgan @types/uuid
```

#### **Step 2: Create Logger Infrastructure** (2 hours)

**Task 2.1:** Create `backend/src/lib/logger.ts`
- Configure Winston instance
- Set up transports (console, file, rotation)
- Define log formats (dev vs production)
- Export logger and createLogger function

**Task 2.2:** Create `backend/src/utils/redactSensitiveData.ts`
- Implement redactSensitiveData function
- Implement redactEmail helper
- Implement redactEntraId helper
- Add unit tests

**Task 2.3:** Create `backend/src/types/logger.types.ts`
- Define LogMetadata interface
- Define StructuredLog interface
- Export types

**Task 2.4:** Create `backend/logs/` directory and configure gitignore
```bash
mkdir -p backend/logs
echo "logs/" >> backend/.gitignore
echo "*.log" >> backend/.gitignore
```

#### **Step 3: HTTP Request Logging** (1 hour)

**Task 3.1:** Create `backend/src/middleware/requestLogger.ts`
- Implement requestId middleware
- Configure Morgan with Winston stream
- Define dev and production formats
- Export httpLogger middleware

**Task 3.2:** Update `backend/src/server.ts`
- Import requestId and httpLogger
- Add middlewares early in chain
- Remove existing console.log statements (5 lines)

#### **Step 4: Migrate UserSync Service** (3 hours)

**Priority: HIGH** - Most console statements (14)

**Task 4.1:** Update imports in `backend/src/services/userSync.service.ts`
```typescript
import { loggers } from '../lib/logger';
import { redactEntraId } from '../utils/redactSensitiveData';
```

**Task 4.2:** Add operation logger to class
```typescript
class UserSyncService {
  private logger = loggers.userSync;
  // ...
}
```

**Task 4.3:** Replace console statements:
- Line 335: `console.log` → `this.logger.info('Starting user sync', { entraId })`
- Line 344: `console.log` → `this.logger.debug('User location fields', { ... })`
- Line 356: `console.log` → `this.logger.info('User groups retrieved', { ... })`
- Line 360: `console.log` → `this.logger.info('Role assigned', { ... })`
- Line 366: `console.log` → `this.logger.debug('Location mapped', { ... })`
- Line 403: `console.error` → `this.logger.error('User sync failed', { ... })`
- Lines 444-503: Similar pattern for group and bulk sync methods

**Task 4.4:** Add performance tracking
- Start timer at beginning of operations
- Log duration on completion

**Task 4.5:** Test sync workflows

#### **Step 5: Migrate Cron Jobs Service** (2 hours)

**Priority: HIGH** - 12 console statements

**Task 5.1:** Update `backend/src/services/cronJobs.service.ts`
- Import loggers
- Replace lifecycle console.log statements (lines 12, 17, 91, 94, 97)
- Replace job execution logs (lines 33, 34, 38, 40)
- Replace manual trigger logs (line 83)

**Task 5.2:** Test cron job execution and manual triggering

#### **Step 6: Migrate Admin Routes** (2 hours)

**Priority: HIGH** - 12 console statements

**Task 6.1:** Update `backend/src/routes/admin.routes.ts`
- Import loggers
- Replace debugging console.log (lines 50, 217, 222)
- Replace error console.error (lines 29, 94, 113, 140, 167, 191, 209, 225, 234)
- Add request context to logs

**Task 6.2:** Test admin endpoints

#### **Step 7: Migrate Auth Controller** (2 hours)

**Priority: HIGH** - 9 console statements

**Task 7.1:** Update `backend/src/controllers/auth.controller.ts`
- Import loggers
- Replace debug logs (lines 78, 144, 145)
- Replace error logs (lines 47, 249, 250, 256, 398, 400, 479, 481)
- Ensure token data is redacted

**Task 7.2:** Test authentication flows

#### **Step 8: Migrate Error Handler** (30 minutes)

**Priority: MEDIUM**

**Task 8.1:** Update `backend/src/utils/errorHandler.ts`
- Replace line 53: `console.error` → `logger.error('Unexpected error', { error })`
- Include request context if available

#### **Step 9: Migrate MSAL Config** (30 minutes)

**Priority: LOW**

**Task 9.1:** Update `backend/src/config/entraId.ts`
- Replace line 21: `console.log` with Winston logger
- Use debug level for MSAL internal logs

#### **Step 10: Update Environment Configuration** (30 minutes)

**Task 10.1:** Update `.env.example`
```bash
# Logging Configuration
LOG_LEVEL=debug                   # error | warn | info | http | verbose | debug | silly
LOG_TO_FILE=true                  # Enable file logging
LOG_PRETTY=true                   # Pretty print in development
```

**Task 10.2:** Update README with logging section

#### **Step 11: Documentation** (2 hours)

**Task 11.1:** Create `docs/LOGGING.md`
- Overview of logging system
- How to use logger
- Log levels guide
- Examples
- Best practices
- Troubleshooting

**Task 11.2:** Update development guidelines
- Add logging section to CONTRIBUTING.md
- Update code review checklist

#### **Step 12: Testing & Validation** (4 hours)

**Task 12.1:** Write unit tests for logger
**Task 12.2:** Write integration tests for HTTP logging
**Task 12.3:** Manual testing in development
**Task 12.4:** Manual testing in production-like environment
**Task 12.5:** Performance testing and benchmarking

#### **Step 13: Deployment** (1 hour)

**Task 13.1:** Deploy to staging
**Task 13.2:** Verify logs in staging
**Task 13.3:** Monitor performance metrics
**Task 13.4:** Deploy to production
**Task 13.5:** Set up log monitoring alerts

---

### 13.2 Priority Order

1. **P0 - Foundation** (Steps 1-2): Required for all other steps
2. **P1 - HTTP Logging** (Step 3): High value, low effort
3. **P2 - Critical Services** (Steps 4-5): Highest console.log count
4. **P3 - Controllers** (Steps 6-7): User-facing endpoints
5. **P4 - Infrastructure** (Steps 8-9): Error handling and config
6. **P5 - Documentation** (Steps 10-11): Enable team adoption
7. **P6 - Validation** (Steps 12-13): Ensure production readiness

---

### 13.3 Timeline Estimate

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Week 1: Foundation** | 5 days | Steps 1-3 |
| **Week 2: Services** | 5 days | Steps 4-5 |
| **Week 3: Controllers** | 5 days | Steps 6-7 |
| **Week 4: Infrastructure** | 3 days | Steps 8-9 |
| **Week 5: Documentation & Testing** | 5 days | Steps 10-13 |
| **Total** | **~23 days** | 13 steps |

**Resource Requirements:**
- 1 developer (full-time)
- Code reviews: 1-2 hours per step
- QA testing: 2 days
- DevOps support: 1 day (log infrastructure)

---

### 13.4 Success Criteria

**Technical:**
- [ ] Zero console.log/console.error in production code (except logger fallback)
- [ ] All logs use Winston with structured format
- [ ] Log rotation working (daily, 10MB, 14 days)
- [ ] Request IDs in all request-scoped logs
- [ ] Sensitive data redacted in all logs
- [ ] Performance overhead < 5% (P95 latency)

**Quality:**
- [ ] Unit tests for logger utilities (>80% coverage)
- [ ] Integration tests for HTTP logging
- [ ] Documentation complete (LOGGING.md)
- [ ] Developer guidelines updated

**Operational:**
- [ ] Logs searchable and parseable
- [ ] Error rates unchanged (no new bugs)
- [ ] Monitoring dashboards set up
- [ ] Team trained on new logging system

---

## 14. Dependencies and Prerequisites

### 14.1 NPM Packages

**Core Dependencies:**
```json
{
  "dependencies": {
    "winston": "^3.11.0",
    "winston-daily-rotate-file": "^4.7.1",
    "morgan": "^1.10.0",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/morgan": "^1.9.9",
    "@types/uuid": "^9.0.7"
  }
}
```

**Optional (Future):**
```json
{
  "dependencies": {
    "winston-cloudwatch": "^6.2.0",      // AWS CloudWatch
    "@google-cloud/logging-winston": "^5.3.0",  // Google Cloud Logging
    "winston-elasticsearch": "^0.17.4",  // Elasticsearch
  }
}
```

### 14.2 Infrastructure Requirements

**File System:**
- `backend/logs/` directory (writable)
- 500MB-1GB disk space for log storage
- Log rotation support

**Permissions:**
```bash
# Create logs directory with appropriate permissions
mkdir -p backend/logs
chmod 750 backend/logs
```

**Environment Variables:**
```bash
NODE_ENV=production
LOG_LEVEL=info
LOG_TO_FILE=true
```

### 14.3 Development Environment

**Local Setup:**
1. Node.js 18+ (current: check package.json)
2. TypeScript 5.x (current: 5.9.3)
3. Existing Express app
4. Existing middleware chain

**No Breaking Changes:**
- Logger is drop-in replacement for console
- Backwards compatible during migration
- Gradual rollout possible

---

## 15. Risks and Mitigation

### 15.1 Identified Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Performance degradation** | High | Low | Benchmark before/after, use async transports, implement sampling |
| **Disk space exhaustion** | High | Medium | Implement rotation, set max file size, alert on disk usage |
| **Logs contain sensitive data** | Critical | Medium | Comprehensive redaction, code review, automated testing |
| **Migration introduces bugs** | High | Medium | Gradual rollout, extensive testing, feature flags |
| **Logger failure breaks app** | Critical | Low | Fallback to console, error handling, monitoring |
| **Team resistance to change** | Medium | Low | Training, documentation, clear benefits |

### 15.2 Rollback Plan

**If critical issues arise:**

1. **Immediate Rollback** (< 5 minutes)
   ```bash
   git revert <commit-hash>
   npm run deploy
   ```

2. **Feature Flag** (recommended for gradual rollout)
   ```typescript
   const useWinston = process.env.USE_WINSTON === 'true';
   
   export const log = (message: string, meta?: any) => {
     if (useWinston) {
       logger.info(message, meta);
     } else {
       console.log(message, meta);
     }
   };
   ```

3. **Partial Rollback**
   - Keep HTTP logging (low risk)
   - Revert service migrations if needed
   - Maintain logger infrastructure for future use

### 15.3 Monitoring Plan

**Post-Deployment Monitoring (first 48 hours):**
- [ ] Error rate (should be unchanged)
- [ ] P95/P99 latency (< 5% increase acceptable)
- [ ] Memory usage (< 10MB increase)
- [ ] Disk usage (logs/ directory)
- [ ] Log volume (lines per minute)
- [ ] Logger errors (Winston failure events)

**Alerts:**
```typescript
// Alert on high error log rate
if (errorLogsPerMinute > 100) {
  sendAlert('High error log rate detected');
}

// Alert on disk space
if (diskUsage > 90%) {
  sendAlert('Log disk space critical');
}

// Alert on logger failure
logger.on('error', (error) => {
  sendAlert('Logger transport failed', error);
});
```

---

## 16. Future Enhancements

### 16.1 Phase 2 Improvements

**Centralized Log Aggregation:**
- Set up ELK stack (Elasticsearch, Logstash, Kibana)
- Or use cloud service (AWS CloudWatch, Google Cloud Logging, Azure Monitor)
- Ship logs via winston-elasticsearch or cloud transport

**Distributed Tracing:**
- Add OpenTelemetry integration
- Trace requests across services
- Correlate logs with traces

**Log Analytics:**
- Create dashboards for key metrics
- Set up anomaly detection
- Build alerting rules

**Advanced Redaction:**
- Automatic PII detection (ML-based)
- Regex-based pattern matching
- Configurable redaction rules

### 16.2 Long-Term Vision

```
┌─────────────────────────────────────────────────────────┐
│  Application Layer                                      │
│  ├─ Services (Winston Logger)                          │
│  ├─ HTTP Requests (Morgan + Winston)                   │
│  └─ Error Handling (Winston Error Transport)           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Log Aggregation Layer                                  │
│  ├─ Filebeat / Fluentd                                 │
│  ├─ Structured JSON parsing                            │
│  └─ Enrichment (add metadata)                          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Storage & Analysis                                     │
│  ├─ Elasticsearch (searchable logs)                    │
│  ├─ Long-term archive (S3, Glacier)                    │
│  └─ Real-time streaming (Kafka)                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Visualization & Alerting                               │
│  ├─ Kibana (dashboards, queries)                       │
│  ├─ Grafana (metrics + logs)                           │
│  └─ PagerDuty / Slack (alerts)                         │
└─────────────────────────────────────────────────────────┘
```

---

## 17. References and Resources

### 17.1 Official Documentation

1. **Winston**
   - GitHub: https://github.com/winstonjs/winston
   - NPM: https://www.npmjs.com/package/winston
   - Transports: https://github.com/winstonjs/winston/blob/master/docs/transports.md

2. **Winston Daily Rotate File**
   - GitHub: https://github.com/winstonjs/winston-daily-rotate-file
   - NPM: https://www.npmjs.com/package/winston-daily-rotate-file

3. **Morgan**
   - GitHub: https://github.com/expressjs/morgan
   - NPM: https://www.npmjs.com/package/morgan

4. **Pino** (alternative)
   - GitHub: https://github.com/pinojs/pino
   - NPM: https://www.npmjs.com/package/pino
   - Benchmarks: https://github.com/pinojs/pino/blob/master/docs/benchmarks.md

### 17.2 Best Practices Guides

5. **Node.js Best Practices - Logging**
   - GitHub: https://github.com/goldbergyoni/nodebestpractices#2-error-handling-practices
   - Sections: Structured Logging, Log Levels, Error Handling

6. **12 Factor App - Logs**
   - Website: https://12factor.net/logs
   - Treat logs as event streams
   - Don't manage log files

7. **OWASP Logging Cheat Sheet**
   - Website: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
   - Security best practices
   - Data to log / not log

8. **Google Cloud - Best practices for logging**
   - Docs: https://cloud.google.com/logging/docs/best-practices
   - Structured logging, sampling, quotas

### 17.3 Technical Articles

9. **"Logging Best Practices in Node.js Applications"** - LogRocket Blog
   - Comparison of logging libraries
   - Performance considerations
   - Production patterns

10. **"Production-Ready Node.js Logging"** - Better Stack
    - Winston configuration examples
    - Log rotation strategies
    - Real-world patterns

11. **"RFC 5424 - The Syslog Protocol"**
    - Standard log levels (0-7)
    - Message format
    - Best practices

### 17.4 Related Tech-V2 Documents

12. **Audit Report**
    - [docs/SubAgent/codebase_audit_review_feb2026.md](../codebase_audit_review_feb2026.md)
    - Section 2.2: Console logging issue identified
    - Priority: HIGH

13. **TypeScript Configuration**
    - [backend/tsconfig.json](../../backend/tsconfig.json)
    - Ensure logger types are properly resolved

14. **Package.json**
    - [backend/package.json](../../backend/package.json)
    - Add logging dependencies

---

## 18. Appendix

### 18.1 Complete Logger Implementation Example

See full implementation in migration steps. Key files:
- `backend/src/lib/logger.ts` - Main logger configuration
- `backend/src/utils/redactSensitiveData.ts` - Redaction utilities
- `backend/src/middleware/requestLogger.ts` - HTTP logging
- `backend/src/types/logger.types.ts` - Type definitions

### 18.2 Environment Variable Reference

```bash
# Logging Configuration
NODE_ENV=development              # development | production | test
LOG_LEVEL=debug                   # error | warn | info | http | verbose | debug | silly
LOG_TO_FILE=false                 # Enable file logging (auto-true in production)
LOG_PRETTY=true                   # Pretty print in dev (auto-false in production)
LOG_MAX_SIZE=10m                  # Max log file size before rotation
LOG_MAX_FILES=14d                 # Log retention period
LOG_DATE_PATTERN=YYYY-MM-DD       # Log file date pattern
TZ=America/Chicago                # Timezone for timestamps

# Advanced
CONTAINER_MODE=false              # Use stdout only (no files)
CLOUD_LOGGING=false               # Enable cloud logging
LOG_ANONYMIZATION_SALT=<secret>   # Salt for GDPR anonymization
TEST_LOGS=false                   # Enable logs in tests
```

### 18.3 Log Level Decision Matrix

| Scenario | Level | Rationale |
|----------|-------|-----------|
| User login success | info | Significant business event |
| User login failure | warn | Potential security issue |
| Database query executed | debug | Detailed debugging only |
| HTTP request received | http | Standard HTTP logging |
| Validation error | warn | Expected error, not critical |
| Unhandled exception | error | Critical error needs attention |
| Service startup | info | Lifecycle event |
| Configuration loaded | debug | Detailed startup info |
| Cron job started | info | Scheduled task execution |
| External API call failed | error | Service degradation |
| User data updated | info | Significant business event |
| Cache hit/miss | debug | Performance debugging |

### 18.4 Quick Reference Commands

```bash
# View real-time logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# View real-time logs (formatted)
tail -f logs/combined-$(date +%Y-%m-%d).log | jq '.'

# Search logs for errors
grep -r "\"level\":\"error\"" logs/ | jq '.'

# Count log levels
grep -oh "\"level\":\"[^\"]*\"" logs/combined-*.log | sort | uniq -c

# Find logs for specific request
grep "requestId\":\"req-123" logs/combined-*.log | jq '.'

# Find logs for specific user
grep "userId\":\"42" logs/combined-*.log | jq '.'

# Compress old logs manually
gzip logs/combined-2026-02-18.log

# Check log disk usage
du -sh logs/
```

---

## 19. Approval and Sign-off

### 19.1 Stakeholder Review

| Role | Name | Status | Date | Comments |
|------|------|--------|------|----------|
| **Tech Lead** | TBD | Pending | - | Review architecture and implementation plan |
| **Security** | TBD | Pending | - | Verify sensitive data handling |
| **DevOps** | TBD | Pending | - | Approve infrastructure changes |
| **QA Lead** | TBD | Pending | - | Review testing strategy |

### 19.2 Implementation Approval

- [ ] Architecture approved
- [ ] Library selection approved
- [ ] Security measures approved
- [ ] Migration strategy approved
- [ ] Timeline approved
- [ ] Resources allocated

### 19.3 Post-Implementation Review

**Review Date:** TBD (after 2 weeks in production)

**Review Criteria:**
- [ ] All console statements migrated
- [ ] Performance metrics within acceptable range
- [ ] No sensitive data in logs (audit)
- [ ] Team satisfied with new system
- [ ] Documentation complete and clear

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-19 | GitHub Copilot | Initial specification |

---

**End of Specification**

For questions or clarifications, refer to:
- [docs/LOGGING.md](../LOGGING.md) (to be created)
- Tech-V2 team chat
- GitHub issues
