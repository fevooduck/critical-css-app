# Batch Critical CSS Generator

A high-performance Critical CSS generator that processes **multiple websites simultaneously** with maximum agility. Perfect for agencies, developers, and teams managing multiple sites.

## 🚀 Key Features

### **Batch Processing**
- **Multiple URLs**: Process N websites simultaneously
- **Controlled Concurrency**: Processes 3 URLs at a time to prevent server overload
- **Progress Tracking**: Real-time progress updates for batch operations
- **Error Resilience**: Individual URL failures don't stop the entire batch

### **Flexible Generation Modes**
- **Individual Mode**: Generate separate CSS files for each device configuration
- **Combined Mode**: Generate single CSS file optimized for multiple viewports per URL
- **Mixed Processing**: Different URLs can have different configurations

### **Advanced Export Options**
- **Bulk Download**: Download all generated CSS files at once
- **JSON Export**: Export complete batch results with metadata
- **Organized Files**: Files named with hostname and configuration for easy identification

## 📊 Performance & Scalability

- **Concurrent Processing**: 3 URLs processed simultaneously
- **Memory Efficient**: Automatic cleanup of old batch jobs
- **Progress Monitoring**: Real-time updates on processing status
- **Error Handling**: Detailed error reporting per URL and configuration

## 🛠 Installation & Usage

### Prepare WSL Ubuntu
\`\`\`bash
sudo apt update\
sudo apt install -y \\
  libnss3 \\
  libatk-bridge2.0-0 \\
  libxcomposite1 \\
  libxrandr2 \\
  libxdamage1 \\
  libxss1 \\
  libpangocairo-1.0-0 \\
  libgtk-3-0 \\
  libgbm-dev \\
  libxshmfence-dev \\
  libx11-xcb1 \\
  libglu1-mesa \\
  libasound2t64 \\
  fonts-liberation \\
  xdg-utils \\
  wget\
\`\`\`

### Quick Start
\`\`\`bash
nvm use 20
npm install
npm run dev
\`\`\`

### Batch Processing Example
\`\`\`javascript
// Process 5 websites with 3 device configurations each
const response = await fetch('/api/critical/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    urls: [
      'https://example.com',
      'https://github.com',
      'https://stackoverflow.com',
      'https://developer.mozilla.org',
      'https://css-tricks.com'
    ],
    configs: [
      { width: 375, height: 667, device: 'mobile', name: 'iPhone SE' },
      { width: 1920, height: 1080, device: 'desktop', name: 'Desktop HD' },
      { width: 768, height: 1024, device: 'desktop', name: 'iPad Portrait' }
    ],
    combineDimensions: false // Generate individual CSS files
  })
});
\`\`\`

## 🎯 Use Cases

### **Agency Workflows**
- Process all client websites in one batch
- Generate critical CSS for entire portfolios
- Standardize performance optimizations across projects

### **Multi-Site Management**
- E-commerce sites with multiple domains
- Corporate websites with regional variations
- Development teams managing multiple projects

### **Performance Audits**
- Batch analyze competitor websites
- Generate critical CSS for A/B testing
- Performance optimization campaigns

## 📈 Batch Processing Benefits

1. **Time Efficiency**: Process 10+ websites in the time it takes to do 1
2. **Consistency**: Same configurations applied across all URLs
3. **Automation Ready**: JSON export for CI/CD integration
4. **Resource Optimization**: Controlled concurrency prevents server overload
5. **Error Resilience**: Individual failures don't stop the entire batch

## 🔧 API Endpoints

### Batch Processing
\`\`\`
POST /api/critical/batch
\`\`\`

### Job Status Monitoring
\`\`\`
GET /api/critical/batch/:jobId
\`\`\`

### Retry Failed URLs
\`\`\`
POST /api/critical/batch/:jobId/retry
\`\`\`

### Single URL (Backward Compatibility)
\`\`\`
POST /api/critical
\`\`\`

### Manual Capture (fallback for blocked domains)
\`\`\`
POST   /api/capture   { url, html }
GET    /api/capture
DELETE /api/capture   { url }
\`\`\`

### Domain Block History
\`\`\`
GET /api/domain-info?url=...
\`\`\`

## 📋 Sample Batch Configuration

The interface includes a "Load Samples" button that populates with:
- example.com
- github.com
- stackoverflow.com
- developer.mozilla.org
- css-tricks.com

Perfect for testing and demonstration purposes.

## 🎛 Advanced Features

- **Job Tracking**: Monitor batch progress with unique job IDs
- **Job Persistence**: Batch job history survives a server restart (`data/jobs.json`)
- **Automatic Cleanup**: Old batch jobs cleaned up hourly
- **Health Monitoring**: Server health endpoint with active job count
- **Flexible Timeouts**: Configurable timeouts per URL
- **Ignore Patterns**: Custom CSS ignore rules for optimization

## 🛡 Anti-Bot / WAF Resilience

Every URL is visited with a real, current Chromium (via Puppeteer) with basic
stealth patches, instead of a bot-identifying UA/old browser. Each visit is
checked for known WAF/challenge signals (Akamai, Cloudflare, Incapsula) before
any CSS is generated, so a blocked page never silently produces garbage CSS.

If direct access fails, the app falls back automatically, per URL:

1. **Direct** — the shared stealth browser (default, works for most sites)
2. **Proxy** — a domain-specific proxy, if configured in `proxies.json`
   (copy `proxies.example.json`; never committed, it can hold credentials)
3. **Manual capture** — HTML captured from your own real browser via the
   bookmarklet in the UI's "Captura manual" section, for domains that block
   every automated path (drag it to your bookmarks bar, open the blocked URL
   normally, click it)

The outcome of each visit is remembered per hostname (`data/domain-strategy.json`)
so the UI can eventually warn about domains that keep blocking direct access.
Requests to the same hostname are always serialized (never in parallel), since
hitting a protected domain concurrently is itself a common trigger for
rate-based bot rules.

Each result also includes the full (non-critical) CSS the page actually used —
not cssnano-optimized, since that pipeline can take minutes on the several MB
of CSS a CSS-in-JS-heavy SPA can produce — as a quick reference/audit export
alongside the critical CSS.

Failed URLs in a completed batch can be reprocessed on their own via
`POST /api/critical/batch/:jobId/retry`, without re-running the URLs that
already succeeded.
