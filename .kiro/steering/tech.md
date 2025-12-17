# Technology Stack

## Core Technologies

- **Electron**: Desktop application framework with Node.js backend and web frontend
- **React 18**: Frontend UI framework with TypeScript
- **TypeScript**: Primary language for type safety
- **Prisma**: Database ORM with SQLite as the database
- **Tailwind CSS**: Utility-first CSS framework with @tailwindcss/forms
- **React Router**: Client-side routing

## Build System & Tooling

- **Webpack**: Module bundler with separate configs for main, renderer, and preload
- **Electron Forge**: Build, package, and distribution tooling
- **Vitest**: Testing framework with UI support
- **ESLint**: Code linting with TypeScript and React rules
- **PostCSS**: CSS processing with Autoprefixer

## Database & ORM

- **SQLite**: Embedded database with separate dev.db and test.db files
- **Prisma Client**: Type-safe database access
- **Environment Detection**: Automatic database switching based on NODE_ENV/VITEST flags

## Development Workflow

### Common Commands

```bash
# Development
npm run dev                    # Start development with hot reload
npm run dev:webpack           # Start webpack dev server only
npm run dev:electron          # Start electron in development mode

# Building & Packaging
npm run build                 # TypeScript compilation + electron-forge make
npm run package              # Package without creating installers
npm run make                 # Create platform-specific installers

# Testing
npm test                     # Run all tests once
npm run test:watch          # Run tests in watch mode
npm run test:ui             # Open Vitest UI
npm run test:db:reset       # Reset test database

# Database Management
npm run prisma:generate     # Generate Prisma client
npm run prisma:migrate      # Apply migrations to dev database
npm run prisma:studio       # Open Prisma Studio
npm run dev:db:reset        # Reset development database

# Code Quality
npm run lint                # Run ESLint
npm run watch               # TypeScript watch mode
```

### Database Environment Handling

The application automatically detects the environment:
- **Test**: Uses `prisma/test.db` when `VITEST=true` or `NODE_ENV=test`
- **Development**: Uses `prisma/dev.db` for all other cases

When testing any code changes, you MUST use the Test DB, and MUST NOT do any operation that would mutate the data in the Development DB.

### Webpack Configuration

- **Main Process**: `webpack.main.config.js` - Node.js backend
- **Renderer Process**: `webpack.renderer.config.js` - React frontend with dev server on port 3001
- **Preload Script**: `webpack.preload.config.js` - Bridge between main and renderer

### Testing Setup

- Tests run sequentially (`fileParallelism: false`) to avoid database conflicts
- Global test setup in `src/services/database.test.setup.ts`
- Test utilities in `src/services/database.test.utils.ts`
- Use `resetTestDatabase()` in `beforeEach` for clean test state

## Architecture Patterns

- **IPC Communication**: Electron's Inter-Process Communication for main ↔ renderer
- **Service Layer**: Database operations abstracted in service classes
- **Context Providers**: React Context for state management
- **Type Safety**: Comprehensive TypeScript coverage with strict mode