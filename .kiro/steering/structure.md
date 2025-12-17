# Project Structure

## Root Directory

```
├── src/                    # Source code
├── prisma/                 # Database schema and migrations
├── scripts/                # Utility scripts
├── docs/                   # Documentation
├── .webpack/               # Webpack build output
├── dist/                   # TypeScript compilation output
└── node_modules/           # Dependencies
```

## Source Code Organization (`src/`)

### Main Process (`src/main/`)
- `index.ts` - Entry point, window creation, IPC handler setup
- `ipcHandlers.*.ts` - Modular IPC handlers for specific features

### Renderer Process (`src/renderer/`)
- `index.tsx` - React app entry point
- `App.tsx` - Main app component with routing
- `components/` - Reusable UI components
- `pages/` - Route-specific page components
- `context/` - React Context providers
- `utils/` - Frontend utility functions
- `types/` - TypeScript type definitions

### Services (`src/services/`)
- `database.ts` - Main database service with Prisma operations
- `database.*.test.ts` - Database service tests
- `database.test.*.ts` - Test utilities and setup
- `creditCardService.ts` - Credit card specific operations
- `investmentService.ts` - Investment portfolio operations

### Shared (`src/shared/`)
- `accountTypes.ts` - Shared type definitions
- `dateUtils.ts` - Date manipulation utilities

### Other Files
- `preload.ts` - Electron preload script for secure IPC
- `main.js` - Legacy main entry (consider removing)
- `index.css` - Global styles

## Database (`prisma/`)

```
├── schema.prisma           # Database schema definition
├── migrations/             # Database migration files
├── dev.db                  # Development database
├── test.db                 # Test database (gitignored)
├── seed.js                 # Database seeding script (compiled)
└── seed.ts                 # Database seeding source
```

## Configuration Files

- `tsconfig.json` - TypeScript configuration with path aliases
- `webpack.*.config.js` - Webpack configurations for different processes
- `forge.config.js` - Electron Forge packaging configuration
- `vitest.config.ts` - Test configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS configuration

## Naming Conventions

### Files
- **Components**: PascalCase (e.g., `AccountModal.tsx`)
- **Pages**: PascalCase (e.g., `AccountTransactionsPage.tsx`)
- **Services**: camelCase (e.g., `creditCardService.ts`)
- **Utilities**: camelCase (e.g., `dateUtils.ts`)
- **Tests**: `*.test.ts` or `*.test.tsx`

### Code
- **React Components**: PascalCase
- **Functions/Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Types/Interfaces**: PascalCase
- **Database Models**: PascalCase (Prisma convention)

## Import Patterns

### Path Aliases
- `@/*` maps to `src/renderer/*` for frontend imports
- Relative imports for same-directory files
- Absolute imports from `src/` root for cross-module dependencies

### Service Dependencies
- Services should not import from renderer
- Renderer can import from services and shared
- Main process imports services and shared
- Shared modules have no internal dependencies

## Testing Structure

### Test Files Location
- Co-located with source files using `*.test.ts` suffix
- Test utilities in `src/services/database.test.*.ts`
- Global test setup in `src/services/database.test.setup.ts`

### Test Categories
- **Unit Tests**: Individual function/component testing
- **Integration Tests**: Database service operations
- **Component Tests**: React component behavior

## Build Output

### Development
- `.webpack/` - Webpack dev build output
- Hot reload enabled for renderer process

### Production
- `dist/` - TypeScript compilation output
- Platform-specific installers in `out/` (created by electron-forge)

## Key Architectural Decisions

1. **Separation of Concerns**: Clear boundaries between main/renderer processes
2. **Service Layer**: Database operations abstracted from UI components
3. **Type Safety**: Comprehensive TypeScript usage throughout
4. **Test Isolation**: Separate test database with sequential test execution
5. **Modular IPC**: Feature-specific IPC handler files for maintainability