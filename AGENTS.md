# Agent Development Guide for Mepto

## Current Goal
Transition all JS files to TS files without breaking functionality.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
The Vite dev server starts at `http://localhost:3000`

### 3. Build the Library
```bash
npm run build
```

---

## LLM Test Harness (For Safe Code Testing)

We have built a secure Puppeteer-based testing harness at `tools/llm-test-harness/` that allows safe execution of JavaScript/TypeScript code.

### Why Use the Harness?
- **Security**: Runs code in an isolated browser sandbox
- **Safety**: Detects and blocks prompt injection attempts
- **Convenience**: Single command starts both Vite and Puppeteer
- **Console Access**: Captures all console output for debugging

### Installation
```bash
# Install harness dependencies
cd tools/llm-test-harness && npm install
cd ../..
```

### Usage Examples

#### Test Mepto DOM Manipulation
```bash
# Test adding a class
node tools/llm-test-harness/bin/mepto-test.js \
  --code="$('.test').addClass('active').hasClass('active')" \
  --html="<div class='test'></div>" \
  --json

# Test element selection
node tools/llm-test-harness/bin/mepto-test.js \
  --code="$('div').length" \
  --html="<div>A</div><div>B</div>"

# Test event handling
node tools/llm-test-harness/bin/mepto-test.js \
  --code="
    var clicked = false;
    $('.btn').on('click', function() { clicked = true; });
    $('.btn').trigger('click');
    return clicked;
  " \
  --html="<button class='btn'>Click</button>"
```

#### Validate Code Before Execution
```bash
# Check if code is safe (doesn't execute)
node tools/llm-test-harness/bin/mepto-test.js \
  --validate \
  --code="$('.item').length"
```

#### Run From File
```bash
# Execute code from file
node tools/llm-test-harness/bin/mepto-test.js \
  --file=./my-test.js \
  --html-file=./fixture.html
```

#### Interactive Mode (Visible Browser)
```bash
# See the browser while testing
node tools/llm-test-harness/bin/mepto-test.js \
  --code="$('.test').fadeIn()" \
  --html="<div class='test' style='display:none'>Hello</div>" \
  --no-headless
```

### Output Format

The harness returns JSON:
```json
{
  "success": true,
  "result": true,
  "console": [
    {"type": "log", "message": "Mepto loaded", "timestamp": "2024-01-01T00:00:00Z"}
  ],
  "timing": {
    "duration": 523
  },
  "security": {
    "safe": true,
    "violations": [],
    "warnings": []
  }
}
```

### Security Features

The harness automatically blocks:
- `eval()` and `Function()` constructor
- Dynamic imports and external network requests
- Access to `process`, `require`, filesystem
- Prompt injection patterns (system/user/assistant markers)
- Script injection attempts

---

## Project Structure

```
mepto/
├── src/                      # Source TypeScript files
│   ├── zepto.ts             # Core module
│   ├── event.ts             # Event handling
│   ├── ajax.ts              # AJAX functionality
│   ├── form.ts              # Form utilities
│   ├── fx.ts                # Animations
│   └── ...                  # Other modules
├── tools/
│   └── llm-test-harness/    # Testing harness for agents
│       ├── bin/mepto-test.js
│       └── src/
├── test/                     # Test files
│   └── blank.html           # Test page template
├── vite.config.ts           # Vite configuration
└── tsconfig.json            # TypeScript configuration
```

---

## Development Workflow

### 1. Make Changes to Source Files
Edit files in `src/` - all files are now TypeScript (`.ts`)

### 2. Test Changes with Harness
Use the LLM harness to verify functionality without risk:
```bash
node tools/llm-test-harness/bin/mepto-test.js \
  --code="YOUR_TEST_CODE" \
  --html="<div>fixture</div>"
```

### 3. Build and Verify
```bash
npm run build
```

### 4. Run Linting
```bash
npm run lint
```

---

## TypeScript Configuration

The project uses relaxed TypeScript settings (`tsconfig.json`):
- `strict: false` - Allows gradual typing
- `allowJs: true` - Can import JavaScript
- `noImplicitAny: false` - No errors on implicit any

This enables progressive enhancement - add types as needed without breaking existing code.

---

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build library to `dist/` |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run typecheck` | Check TypeScript |

### Harness Commands

| Command | Description |
|---------|-------------|
| `mepto-test --code="..."` | Execute code with auto-start |
| `mepto-test --validate --code="..."` | Validate without executing |
| `mepto-test --file=./test.js` | Run code from file |
| `mepto-test --no-headless` | Show browser window |

---

## Testing Tips

1. **Always use the harness first** - Test your changes in isolation before running full test suite
2. **Use `--json` flag** - For programmatic result parsing
3. **Use `--validate`** - Check code safety before execution
4. **Start with simple fixtures** - Test with minimal HTML, then add complexity

---

## Migration Notes

- All source files converted from `.js` to `.ts`
- Original Zepto IIFE pattern preserved in `zepto.ts`
- Modules use `;(function($){...})(Zepto)` pattern
- Entry point is `src/meptos.ts` which imports all modules

---

## Need Help?

1. Check the harness architecture in `plans/llm-test-harness.md`
2. Review example tests in `test/` directory
3. Use `--json` flag for structured output when debugging
