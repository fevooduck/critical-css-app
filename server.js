import express from "express"
import cors from "cors"
import helmet from "helmet"
import { generate } from "critical"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: "10mb" }))
app.use(express.static("dist"))

// Critical CSS generation endpoint
app.post("/api/critical", async (req, res) => {
  try {
    const { url, configs, combineDimensions = false } = req.body

    if (!url) {
      return res.status(400).json({ error: "URL is required" })
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return res.status(400).json({ error: "Invalid URL format" })
    }

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: "At least one configuration is required" })
    }

    const results = []

    if (combineDimensions && configs.length > 1) {
      // Generate single CSS for multiple dimensions
      try {
        console.log(`Generating combined critical CSS for ${configs.length} dimensions...`)

        const dimensions = configs.map((config) => ({
          width: config.width,
          height: config.height,
        }))

        const criticalCSS = await generate({
          base: "base/",
          src: url,
          dimensions: dimensions,
          inline: false,
          extract: false,
          ignore: {
            atrule: ["@font-face"],
            rule: [/some-regexp/],
            decl: (node, value) => /big-image\.png/.test(value),
          },
        })

        results.push({
          config: {
            name: `Combined (${configs.map((c) => `${c.width}×${c.height}`).join(", ")})`,
            device: "combined",
            width: Math.max(...configs.map((c) => c.width)),
            height: Math.max(...configs.map((c) => c.height)),
            dimensions: dimensions,
          },
          css: criticalCSS.css,
          success: true,
          combined: true,
        })

        console.log("Combined critical CSS generated successfully")
      } catch (error) {
        console.error("Error generating combined critical CSS:", error)
        results.push({
          config: {
            name: "Combined Generation",
            device: "combined",
          },
          css: "",
          success: false,
          error: error.message,
          combined: true,
        })
      }
    } else {
      // Generate individual CSS for each configuration
      for (const config of configs) {
        try {
          console.log(`Generating critical CSS for ${config.name} (${config.width}×${config.height})...`)

          const criticalCSS = await generate({
            base: "base/",
            src: url,
            width: config.width,
            height: config.height,
            inline: false,
            extract: false,
            ignore: {
              atrule: ["@font-face"],
              rule: [/some-regexp/],
              decl: (node, value) => /big-image\.png/.test(value),
            },
          })

          results.push({
            config,
            css: criticalCSS.css,
            success: true,
            combined: false,
          })

          console.log(`Critical CSS generated successfully for ${config.name}`)
        } catch (error) {
          console.error(`Error generating critical CSS for ${config.name}:`, error)
          results.push({
            config,
            css: "",
            success: false,
            error: error.message,
            combined: false,
          })
        }
      }
    }

    res.json({
      results,
      url,
      combineDimensions,
    })
  } catch (error) {
    console.error("Critical CSS generation error:", error)
    res.status(500).json({
      error: error.message || "Failed to generate critical CSS",
    })
  }
})

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() })
})

// Serve the frontend
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"))
})

app.listen(PORT, () => {
  console.log(`🚀 Critical CSS Generator server running on http://localhost:${PORT}`)
  console.log(`📊 API endpoint: http://localhost:${PORT}/api/critical`)
})
