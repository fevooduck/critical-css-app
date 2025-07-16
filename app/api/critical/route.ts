import { type NextRequest, NextResponse } from "next/server"

// Mock critical CSS generator since the actual critical library requires Node.js APIs
function generateMockCriticalCSS(
  config: { width: number; height: number; device: string; name: string },
  url: string,
): string {
  const baseCSS = `/* Critical CSS for ${config.name} (${config.width}x${config.height}) */
/* Generated from: ${url} */

/* Reset and base styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
}

/* Header styles */
header {
  background: #fff;
  border-bottom: 1px solid #e1e5e9;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-container {
  max-width: ${config.width > 768 ? "1200px" : "100%"};
  margin: 0 auto;
  padding: ${config.device === "mobile" ? "0 16px" : "0 24px"};
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: ${config.device === "mobile" ? "56px" : "64px"};
}

/* Navigation */
nav {
  display: ${config.device === "mobile" ? "none" : "flex"};
  gap: ${config.device === "mobile" ? "16px" : "32px"};
}

nav a {
  text-decoration: none;
  color: #333;
  font-weight: 500;
  transition: color 0.2s;
}

nav a:hover {
  color: #0066cc;
}

/* Hero section */
.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: ${config.device === "mobile" ? "60px 16px" : "120px 24px"};
  text-align: center;
}

.hero h1 {
  font-size: ${config.device === "mobile" ? "2rem" : "3.5rem"};
  font-weight: 700;
  margin-bottom: ${config.device === "mobile" ? "16px" : "24px"};
  line-height: 1.2;
}

.hero p {
  font-size: ${config.device === "mobile" ? "1.1rem" : "1.25rem"};
  opacity: 0.9;
  max-width: 600px;
  margin: 0 auto ${config.device === "mobile" ? "32px" : "48px"};
}

/* Buttons */
.btn {
  display: inline-block;
  padding: ${config.device === "mobile" ? "12px 24px" : "16px 32px"};
  background: #0066cc;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  transition: background 0.2s;
  border: none;
  cursor: pointer;
}

.btn:hover {
  background: #0052a3;
}

.btn-secondary {
  background: transparent;
  border: 2px solid white;
  color: white;
}

.btn-secondary:hover {
  background: white;
  color: #333;
}

/* Layout utilities */
.container {
  max-width: ${config.width > 768 ? "1200px" : "100%"};
  margin: 0 auto;
  padding: 0 ${config.device === "mobile" ? "16px" : "24px"};
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.text-center {
  text-align: center;
}

/* Mobile-specific styles */
${
  config.device === "mobile"
    ? `
.mobile-menu {
  display: block;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.hero h1 {
  font-size: 2.5rem;
}

.hero {
  padding: 80px 16px;
}
`
    : ""
}

/* Desktop-specific styles */
${
  config.device === "desktop"
    ? `
.desktop-only {
  display: block;
}

.mobile-only {
  display: none;
}

.hero {
  min-height: ${Math.min(config.height * 0.7, 600)}px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
`
    : ""
}

/* Critical above-the-fold content */
.above-fold {
  min-height: ${config.height}px;
}

/* Performance optimizations */
img {
  max-width: 100%;
  height: auto;
}

.lazy {
  opacity: 0;
  transition: opacity 0.3s;
}

.lazy.loaded {
  opacity: 1;
}`

  return baseCSS
}

export async function POST(request: NextRequest) {
  try {
    const { url, configs } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return NextResponse.json({ error: "At least one configuration is required" }, { status: 400 })
    }

    const results = []

    // Simulate processing time for each configuration
    for (const config of configs) {
      try {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000))

        // Generate mock critical CSS
        const criticalCSS = generateMockCriticalCSS(config, url)

        results.push({
          config,
          css: criticalCSS,
          success: true,
        })
      } catch (error) {
        console.error(`Error generating critical CSS for ${config.device} ${config.width}x${config.height}:`, error)
        results.push({
          config,
          css: "",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      results,
      url,
    })
  } catch (error) {
    console.error("Critical CSS generation error:", error)

    const errorMessage = error instanceof Error ? error.message : "Failed to generate critical CSS"

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
