# Routify - API Route Hunter

**Routify** is a professional-level VS Code extension that eliminates the time developers waste searching for API endpoint definitions in large backend projects. Unlike basic extensions, Routify uses Abstract Syntax Tree (AST) parsing to understand the actual code structure, ignoring comments and avoiding false positives.

## Features

### Intelligent AST-Based Scanning
- Analyzes code structure using Babel AST parser
- Detects HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD) from Express and NestJS frameworks
- Ignores comments and code within strings to avoid false positives
- Supports both JavaScript and TypeScript

### 🚀 Postman Collection Export (NEW!)
- **Export entire API to Postman Collection v2.1** - One click to export all routes
- **Export by controller/group** - Right-click any controller to export just that group
- **Automatic request body examples** - Intelligent body generation based on endpoint type (login, register, user, product, etc.)
- **Variables support** - Uses `{{baseUrl}}` and path variables like `{{id}}`
- **Environment file generation** - Export Postman environment with baseUrl and token variables
- **Auto-detects authentication** - Adds `Authorization: Bearer {{token}}` header for protected routes
- **Organized by controllers** - Each controller becomes a folder in Postman
- **Ready to use** - Import directly into Postman and start testing!

### Visual Route Map in Sidebar
- Dedicated sidebar panel showing all detected routes hierarchically
- Three grouping modes:
  - **By File**: See all routes organized by the file they're defined in
  - **By HTTP Method**: Group routes by GET, POST, PUT, DELETE, etc.
  - **By Path**: Organize routes by their base path

### One-Click Navigation
- Click any route to jump directly to its definition
- Highlights the exact line where the handler is defined
- Temporary highlight effect for easy visual identification

### Real-Time Updates
- Automatically refreshes route list when files change
- Watches for file creation, modification, and deletion
- Configurable auto-refresh behavior

### Rich Tooltips
- Hover over routes to see detailed information:
  - Full path and HTTP method
  - Handler function name
  - File location (file:line)
  - Middleware stack
  - Route parameters

### Powerful Search & Filtering
- Quick search through all routes via Command Palette
- Filter routes by HTTP method
- Copy route paths or full URLs to clipboard

### Statistics Dashboard
- View aggregated statistics about your API:
  - Total number of routes
  - Distribution by HTTP method
  - Distribution by framework
  - Number of files with routes

## How It Works

1. **Parsing**: Takes your JavaScript/TypeScript files and converts them to an AST (Abstract Syntax Tree)
2. **Traversing**: Walks the AST looking for specific patterns that match route definitions
3. **UI Injection**: Uses VS Code's TreeDataProvider API to display routes in the native sidebar

## Installation

1. Clone this repository
2. Run `pnpm install` (or `npm install`)
3. Press `F5` to open a new VS Code window with the extension loaded
4. Open a project with Express routes

## Usage

### View Routes
1. Click the Routify icon in the Activity Bar (sidebar)
2. Routes will automatically be scanned and displayed

### Navigate to Route
- Click any route in the tree view to jump to its definition

### Search Routes
- Click the search icon in the Routify panel
- Or use Command Palette: `Routify: Search Routes`

### Group Routes
- Click grouping buttons in panel toolbar:
  - File icon: Group by file
  - Method icon: Group by HTTP method
  - Folder icon: Group by path

### Filter by Method
- Click filter icon in panel toolbar
- Select HTTP method to show only routes of that type

### Copy Path/URL
- Right-click any route
- Select "Copy Route Path" or "Copy Full URL"

### Export to Postman
1. **Export all routes:**
   - Click the export icon in the Routify panel toolbar
   - Or use Command Palette: `Routify: Export All Routes to Postman Collection`
   - Choose where to save the `.postman_collection.json` file
   - Optionally export environment variables

2. **Export a single controller:**
   - Right-click any controller/group in the tree
   - Select "Export Group to Postman Collection"
   - Save the collection file

3. **Import to Postman:**
   - Open Postman
   - Click "Import" button
   - Select the exported `.postman_collection.json` file
   - Optionally import the environment file
   - All routes are ready to test!

## Extension Settings

This extension contributes the following settings:

- `routify.autoRefresh`: Automatically refresh routes when files change (default: `true`)
- `routify.defaultGrouping`: Default grouping mode: "file", "method", or "path" (default: `"file"`)
- `routify.excludePatterns`: File patterns to exclude from scanning (default: node_modules, dist, build, etc.)
- `routify.includePatterns`: File patterns to include in scanning (default: `**/*.js`, `**/*.ts`)
- `routify.baseUrl`: Base URL for generating full route URLs (default: `"http://localhost:3000"`)
- `routify.enabledFrameworks`: Frameworks to scan (default: `["express"]`)
- `routify.showMiddleware`: Show middleware information in tooltips (default: `true`)
- `routify.debugMode`: Enable debug logging to Output panel (default: `false`)

## Supported Patterns

### Express Routes

```javascript
// Direct app routes
app.get('/users', handler);
app.post('/users', middleware, handler);

// Router routes
const router = express.Router();
router.get('/products/:id', handler);
router.delete('/products/:id', auth, isAdmin, handler);

// Named functions
app.get('/profile', getUserProfile);

// Anonymous functions
app.post('/login', (req, res) => { });

// With middleware arrays
app.put('/update', [auth, validate], handler);
```

## Commands

- `Routify: Refresh Routes` - Manually refresh the route list
- `Routify: Search Routes` - Open quick search for routes
- `Routify: Group by File` - Group routes by file
- `Routify: Group by HTTP Method` - Group routes by method
- `Routify: Group by Path` - Group routes by path
- `Routify: Filter by Method` - Show only routes of a specific method
- `Routify: Show Statistics` - Display API statistics
- `Routify: Clear Cache` - Clear cache and refresh
- `Routify: Copy Route Path` - Copy route path to clipboard
- `Routify: Copy Full URL` - Copy full URL to clipboard
- `Routify: Export All Routes to Postman Collection` - Export entire API to Postman
- `Routify: Export Group to Postman Collection` - Export a controller/group to Postman
- `Routify: Export Postman Environment` - Export environment variables for Postman

## Future Enhancements

- ✅ ~~Support for NestJS framework~~ (DONE!)
- ✅ ~~Export routes to Postman collection~~ (DONE!)
- Support for Fastify framework
- Advanced route grouping by modules/microservices
- Export to OpenAPI/Swagger specification
- Security analysis (detect unprotected endpoints)
- Automatic test generation
- Performance metrics per route

## Requirements

- VS Code 1.107.0 or higher
- Node.js project with Express routes

## Known Issues

- Routes defined programmatically (in loops, conditionally) may not be detected
- Dynamic route paths from variables are shown as `:param`

## Release Notes

### 0.0.1

Initial release of Routify
- AST-based Express route detection
- Visual sidebar tree view with grouping
- One-click navigation to route definitions
- Real-time file watching and updates
- Search and filter capabilities
- Statistics dashboard

---

**Enjoy efficient API route navigation with Routify!**
