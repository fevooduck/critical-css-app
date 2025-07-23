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

### Quick Start
\`\`\`bash
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

### Single URL (Backward Compatibility)
\`\`\`
POST /api/critical
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
- **Automatic Cleanup**: Old batch jobs cleaned up hourly
- **Health Monitoring**: Server health endpoint with active job count
- **Flexible Timeouts**: Configurable timeouts per URL
- **Ignore Patterns**: Custom CSS ignore rules for optimization
