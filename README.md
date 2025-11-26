# Bucky - Personal Bookkeeping Software

Personal bookkeeping software built with Electron, React, and Prisma.

## Database Architecture

Bucky uses SQLite databases with automatic environment detection to separate test and development data.

### Database Files

The application maintains two separate database files:

- **Development Database**: `prisma/dev.db`
  - Used when running the application with `npm run dev`
  - Contains your actual bookkeeping data
  - Persists between application restarts
  - **Should be backed up regularly**

- **Test Database**: `prisma/test.db`
  - Used automatically when running tests with `npm test`
  - Isolated from development data
  - Reset between test runs
  - Excluded from version control (`.gitignore`)

### Environment Detection

The database service automatically detects the runtime environment:

- **Test Environment**: Detected when `VITEST=true` or `NODE_ENV=test`
  - Routes all database operations to `prisma/test.db`
  - Enables minimal logging (errors only)
  - Automatically resets database between tests

- **Development Environment**: Detected when `NODE_ENV=development` or no environment is set
  - Routes all database operations to `prisma/dev.db`
  - Enables verbose logging (queries, info, warnings, errors)
  - Data persists between sessions

## Database Management

### Development Database

#### Reset Development Database
Deletes all data and recreates the database with default accounts:
```bash
npm run dev:db:reset
```

#### Apply Schema Migrations
Apply pending migrations to the development database:
```bash
npm run prisma:migrate
```

#### Open Prisma Studio
Visual database browser for development database:
```bash
npm run prisma:studio
```

### Test Database

#### Reset Test Database
Deletes the test database file and recreates it with the current schema:
```bash
npm run test:db:reset
```

#### Apply Schema to Test Database
Push the current schema to the test database (useful after schema changes):
```bash
npm run test:db:push
```

**Note**: The test database is automatically initialized when you run tests for the first time. You only need to manually reset it if you encounter issues.

## Running Tests

### Run All Tests Once
```bash
npm test
```

### Run Tests in Watch Mode
Automatically re-runs tests when files change:
```bash
npm run test:watch
```

### Run Tests with UI
Opens Vitest UI for interactive test exploration:
```bash
npm run test:ui
```

### Enable Verbose Database Logging in Tests
Useful for debugging database operations during tests:
```bash
DB_VERBOSE=true npm test
```

## Development Workflow

### Starting Development
```bash
npm run dev
```

### Making Schema Changes

1. **Modify the schema**: Edit `prisma/schema.prisma`

2. **Create and apply migration** (development database):
   ```bash
   npm run prisma:migrate
   ```

3. **Update test database** (if tests fail):
   ```bash
   npm run test:db:push
   ```

4. **Run tests** to verify changes:
   ```bash
   npm test
   ```

### Writing Tests

All tests automatically use the test database. Follow this pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { databaseService } from './database';
import { resetTestDatabase } from './database.test.utils';

describe('My Feature Tests', () => {
  beforeEach(async () => {
    // Reset database to clean state before each test
    await resetTestDatabase();
  });

  it('should perform operation', async () => {
    // Your test code here
    // All database operations automatically use test.db
  });
});
```

## Troubleshooting

### Test Database Issues

#### Error: "Test database schema has not been applied"
**Solution**: Run `npm run test:db:push` to apply the schema to the test database.

#### Error: "Database file is locked"
**Cause**: Another process is accessing the test database.
**Solution**: 
1. Stop all running tests
2. Close any database browsers (Prisma Studio)
3. Run `npm run test:db:reset`

#### Tests are failing after schema changes
**Solution**: Update the test database schema:
```bash
npm run test:db:push
npm test
```

### Development Database Issues

#### Lost development data after running tests
**Cause**: This should not happen with proper environment detection.
**Solution**: 
1. Check that tests are using `test.db` (look for log: `[DatabaseService] Using database: file:./test.db`)
2. Restore from backup if available
3. Report the issue

#### Database is corrupted
**Solution**: Reset and recreate the database:
```bash
npm run dev:db:reset
```
**Warning**: This will delete all your data. Back up first if possible.

### Migration Issues

#### Migration fails on test database
**Solution**: The test database uses `db push` instead of migrations:
```bash
npm run test:db:push
```

#### Migration conflicts
**Solution**: 
1. Resolve conflicts in `prisma/schema.prisma`
2. Create a new migration: `npm run prisma:migrate`
3. Update test database: `npm run test:db:push`

## Database Backup

### Manual Backup
Copy the development database file:
```bash
cp prisma/dev.db prisma/dev.db.backup
```

### Restore from Backup
```bash
cp prisma/dev.db.backup prisma/dev.db
```

**Recommendation**: Set up regular automated backups of `prisma/dev.db` to prevent data loss.

## Technical Details

### Database Service Implementation

The `DatabaseService` class (in `src/services/database.ts`) implements a singleton pattern with environment-aware database selection:

- Detects environment variables on initialization
- Configures Prisma Client with the appropriate database URL
- Logs the selected database path for debugging
- Defaults to development database if environment is ambiguous

### Test Utilities

Test utilities are provided in `src/services/database.test.utils.ts`:

- `resetTestDatabase()`: Clears all data and recreates default accounts
- `initializeTestDatabase()`: Creates database file and applies schema
- `seedTestDatabase(data)`: Seeds database with test data
- `getTestDatabasePath()`: Returns path to test database for debugging

### Global Test Setup

The file `src/services/database.test.setup.ts` runs before all tests:
- Initializes the test database
- Connects the database service
- Disconnects after all tests complete

This is configured in `vitest.config.ts` via the `setupFiles` option.

## Contributing

When contributing code that involves database operations:

1. Write tests that use the test database (automatic)
2. Ensure tests clean up after themselves (use `beforeEach` with `resetTestDatabase()`)
3. Update schema migrations for development database
4. Update test database schema with `npm run test:db:push`
5. Verify all tests pass before submitting

## License

MIT
