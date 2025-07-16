# Critical CSS Generator

A functional Critical CSS generator that uses the actual `critical` library to extract above-the-fold CSS from websites.

## Features

- **Real Critical CSS Generation**: Uses the actual `critical` library
- **Multiple Viewport Support**: Generate CSS for multiple device configurations
- **Combined Dimensions**: Generate single CSS file optimized for multiple viewports
- **Individual Generation**: Generate separate CSS files for each device
- **Download & Copy**: Easy export of generated CSS
- **Local Development**: Runs entirely on your local machine

## Installation

1. Clone or download the project files
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

## Usage

### Development Mode
Run both the server and client in development mode:
\`\`\`bash
npm run dev
\`\`\`

This will start:
- Frontend server on `http://localhost:3000`
- Backend API server on `http://localhost:3001`

### Production Build
\`\`\`bash
npm run build
npm start
\`\`\`

## API Usage

### Generate Critical CSS for Multiple Dimensions (Combined)
\`\`\`javascript
// Example: Generate single CSS for multiple viewports
const response = await fetch('/api/critical', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    combineDimensions: true,
    configs: [
      { width: 500, height: 200, device: 'mobile', name: 'Mobile' },
      { width: 1200, height: 900, device: 'desktop', name: 'Desktop' }
    ]
  })
});
\`\`\`

### Generate Individual CSS Files
\`\`\`javascript
// Example: Generate separate CSS for each viewport
const response = await fetch('/api/critical', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    combineDimensions: false,
    configs: [
      { width: 375, height: 667, device: 'mobile', name: 'iPhone SE' },
      { width: 1920, height: 1080, device: 'desktop', name: 'Desktop HD' }
    ]
  })
});
\`\`\`

## Critical Library Configuration

The server uses the following critical library configuration:

\`\`\`javascript
await critical.generate({
  base: '',
  src: url,
  dimensions: [
    { width: 500, height: 200 },
    { width: 1200, height: 900 }
  ], // For combined mode
  // OR
  width: 1920,
  height: 1080, // For individual mode
  inline: false,
  extract: false,
  timeout: 30000,
  penthouse: {
    timeout: 30000,
  },
  ignore: {
    atrule: ['@font-face'],
    rule: [/some-regexp/],
    decl: (node, value) => /big-image\.png/.test(value)
  }
});
\`\`\`

## Environment Requirements

- Node.js 16+ (required for the critical library)
- Modern browser with ES6+ support
- Internet connection (for analyzing external websites)

## Troubleshooting

1. **Port conflicts**: Change ports in `server.js` and `vite.config.js`
2. **Critical library errors**: Ensure you're running Node.js 16+
3. **CORS issues**: The server includes CORS middleware for cross-origin requests
4. **Timeout errors**: Increase timeout values in the critical configuration

## Performance Tips

- Use combined dimensions mode for better performance when targeting multiple viewports
- Set appropriate timeouts based on website complexity
- Consider ignoring non-critical CSS rules using the `ignore` configuration
