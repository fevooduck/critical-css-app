import express from "express"
import cors from "cors"
import helmet from "helmet"
import * as critical from "critical"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import postcss from "postcss"
import cssnano from "cssnano"
import combineSelectors from "postcss-combine-duplicated-selectors"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 8001

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: "10mb" }))
app.use(express.static("dist"))

// Store active batch jobs
const batchJobs = new Map()

async function optimizeCSS(css) {
  const result = await postcss([
    combineSelectors({
      removeDuplicatedProperties: true
    }),
    cssnano({
      preset: ['default', {
        discardDuplicates: true,
        mergeRules: true,
        normalizeWhitespace: false
      }]
    })
  ]).process(css);

  return result.css;
}


// Critical CSS generation endpoint for multiple URLs
app.post("/api/critical/batch", async (req, res) => {
  try {
    const { urls, configs, combineDimensions = false, batchId } = req.body

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "At least one URL is required" })
    }

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: "At least one configuration is required" })
    }

    // Validate all URLs
    const invalidUrls = []
    urls.forEach((url, index) => {
      try {
        new URL(url)
      } catch {
        invalidUrls.push({ index, url })
      }
    })

    if (invalidUrls.length > 0) {
      return res.status(400).json({
        error: "Invalid URL format",
        invalidUrls,
      })
    }

    const jobId = batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Initialize batch job tracking
    batchJobs.set(jobId, {
      totalUrls: urls.length,
      totalConfigs: configs.length,
      completed: 0,
      results: [],
      status: "processing",
      startTime: new Date(),
    })

    // Process URLs in parallel with controlled concurrency
    const concurrencyLimit = 3 // Process 3 URLs simultaneously
    const results = []

    console.log(`🚀 Starting batch job ${jobId} for ${urls.length} URLs with ${configs.length} configurations`)

    // Process URLs in batches
    for (let i = 0; i < urls.length; i += concurrencyLimit) {
      const urlBatch = urls.slice(i, i + concurrencyLimit)

      const batchPromises = urlBatch.map(async (url, batchIndex) => {
        const urlIndex = i + batchIndex
        console.log(`📄 Processing URL ${urlIndex + 1}/${urls.length}: ${url}`)

        const urlResults = {
          url,
          urlIndex,
          configs: [],
          success: true,
          error: null,
          processingTime: 0,
        }

        const urlStartTime = Date.now()

        try {
          if (combineDimensions && configs.length > 1) {
            // Generate single CSS for multiple dimensions
            try {
              const dimensions = configs.map((config) => ({
                width: config.width,
                height: config.height,
              }))

              console.log(`  🔄 Generating combined critical CSS for ${dimensions.length} dimensions...`)

              const ignoredFiles = [
                'library-svgs.css',
                'print.css',
                'jquery-ui.css',
                'ln_tint_global.css',
                'ln_tint_connector_styles',
                'ln_srh_menuiq',
                'mmiq-new.css'
              ];

              const criticalCSS = await critical.generate({
                base: "base/",
                src: url,
                dimensions: dimensions,
                inline: false,
                extract: false,
                ignoreInlinedStyles: true,
                ignore: {
                  atrule: ['@font-face', '@keyframes'],
                  rule: [/^:root/],
                  decl: (node, value) => {
                    const isSvg = /\.svg/.test(value);
                    const isIgnoredFile = node.source?.input?.file
                      ? ignoredFiles.some(file => node.source.input.file.includes(file))
                      : false;
                    const isAnimation = /animation|transition/.test(node.prop);

                    return isSvg || isIgnoredFile || isAnimation;
                  }
                }
              })

              urlResults.configs.push({
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

              console.log(`  ✅ Combined critical CSS generated successfully`)
            } catch (error) {
              console.error(`  ❌ Error generating combined critical CSS:`, error.message)
              urlResults.configs.push({
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
                console.log(`  🔄 Generating critical CSS for ${config.name} (${config.width}×${config.height})...`)

                const criticalCSS = await critical.generate({
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

                urlResults.configs.push({
                  config,
                  css: criticalCSS,
                  success: true,
                  combined: false,
                })

                console.log(`  ✅ Critical CSS generated successfully for ${config.name}`)
              } catch (error) {
                console.error(`  ❌ Error generating critical CSS for ${config.name}:`, error.message)
                urlResults.configs.push({
                  config,
                  css: "",
                  success: false,
                  error: error.message,
                  combined: false,
                })
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error processing URL ${url}:`, error.message)
          urlResults.success = false
          urlResults.error = error.message
        }

        urlResults.processingTime = Date.now() - urlStartTime

        // Update batch job progress
        const job = batchJobs.get(jobId)
        if (job) {
          job.completed++
          job.results.push(urlResults)

          console.log(`📊 Progress: ${job.completed}/${job.totalUrls} URLs completed`)
        }

        return urlResults
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    // Update final job status
    const job = batchJobs.get(jobId)
    if (job) {
      job.status = "completed"
      job.endTime = new Date()
      job.totalTime = job.endTime - job.startTime
    }

    const successfulUrls = results.filter((r) => r.success).length
    const totalConfigs = results.reduce((sum, r) => sum + r.configs.filter((c) => c.success).length, 0)

    console.log(`🎉 Batch job ${jobId} completed: ${successfulUrls}/${urls.length} URLs processed successfully`)
    console.log(`📈 Total configurations generated: ${totalConfigs}`)


    // Após processar todos os resultados, gere um CSS otimizado
    const allCSS = results.reduce((combined, urlResult) => {
      if (!urlResult.success) return combined;
      const urlCSS = urlResult.configs.reduce((css, configResult) => {
        if (!configResult.success) return css;
        return css + `${configResult.css}`;
      }, '');
      
      return combined + urlCSS;
    }, '');

    // Otimize o CSS combinado
    const optimizedCSS = await optimizeCSS(allCSS);

    res.json({
      jobId,
      results,
      summary: {
        totalUrls: urls.length,
        successfulUrls,
        totalConfigs: configs.length,
        successfulConfigs: totalConfigs,
        combineDimensions,
        processingTime: job?.totalTime || 0,
      },
      optimizedCSS: {
        success: true,
        css: optimizedCSS,
        size: Buffer.from(optimizedCSS).length,
        originalSize: Buffer.from(allCSS).length
      }
    })
  } catch (error) {
    console.error("Batch critical CSS generation error:", error)
    res.status(500).json({
      error: error.message || "Failed to generate critical CSS",
    })
  }
})

// Get batch job status
app.get("/api/critical/batch/:jobId", (req, res) => {
  const { jobId } = req.params
  const job = batchJobs.get(jobId)

  if (!job) {
    return res.status(404).json({ error: "Job not found" })
  }

  res.json({
    jobId,
    status: job.status,
    progress: {
      completed: job.completed,
      total: job.totalUrls,
      percentage: Math.round((job.completed / job.totalUrls) * 100),
    },
    results: job.results,
    timing: {
      startTime: job.startTime,
      endTime: job.endTime,
      totalTime: job.totalTime,
    },
  })
})

// Single URL endpoint (backward compatibility)
app.post("/api/critical", async (req, res) => {
  const { url, configs, combineDimensions } = req.body

  // Convert single URL to batch format
  const batchRequest = {
    urls: [url],
    configs,
    combineDimensions,
  }

  // Forward to batch endpoint
  req.body = batchRequest
  return app._router.handle({ ...req, url: "/api/critical/batch", method: "POST" }, res)
})

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    activeBatchJobs: batchJobs.size,
  })
})

// Cleanup old batch jobs (run every hour)
setInterval(
  () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const [jobId, job] of batchJobs.entries()) {
      if (job.startTime.getTime() < oneHourAgo) {
        batchJobs.delete(jobId)
        console.log(`🧹 Cleaned up old batch job: ${jobId}`)
      }
    }
  },
  60 * 60 * 1000,
)

// Serve the frontend
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"))
})

app.listen(PORT, () => {
  console.log(`🚀 Critical CSS Generator server running on http://localhost:${PORT}`)
  console.log(`📊 Batch API endpoint: http://localhost:${PORT}/api/critical/batch`)
  console.log(`🔍 Single API endpoint: http://localhost:${PORT}/api/critical`)
})
