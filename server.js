import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as critical from 'critical';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import postcss from 'postcss';
import cssnano from 'cssnano';
import combineSelectors from 'postcss-combine-duplicated-selectors';
import {
  getSharedBrowser,
  getRealUserAgent,
  closeSharedBrowser,
} from './lib/browser-manager.js';
import { resolvePage } from './lib/page-resolver.js';
import { runExclusive } from './lib/hostname-lock.js';
import * as jobStore from './lib/job-store.js';
import {
  saveCapture,
  getCapture,
  deleteCapture,
  listCaptures,
} from './lib/manual-capture.js';
import { getDomainInfo } from './lib/domain-strategy.js';

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 9001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('dist'));

// Store active batch jobs (mirrored to disk via jobStore so history and
// in-flight progress survive a server restart)
const batchJobs = new Map();
await jobStore.loadInto(batchJobs);

async function optimizeCSS(css) {
  const result = await postcss([
    combineSelectors({
      removeDuplicatedProperties: true,
    }),
    cssnano({
      preset: [
        'default',
        {
          discardDuplicates: true,
          mergeRules: true,
          normalizeWhitespace: false,
        },
      ],
    }),
  ]).process(css);

  return result.css;
}

// Critical CSS generation endpoint for multiple URLs
app.post('/api/critical/batch', async (req, res) => {
  try {
    const { urls, configs, combineDimensions = false, batchId } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'At least one URL is required' });
    }

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res
        .status(400)
        .json({ error: 'At least one configuration is required' });
    }

    // Validate all URLs
    const invalidUrls = [];
    urls.forEach((url, index) => {
      try {
        new URL(url);
      } catch {
        invalidUrls.push({ index, url });
      }
    });

    if (invalidUrls.length > 0) {
      return res.status(400).json({
        error: 'Invalid URL format',
        invalidUrls,
      });
    }

    const jobId =
      batchId ||
      `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize batch job tracking
    batchJobs.set(jobId, {
      totalUrls: urls.length,
      totalConfigs: configs.length,
      completed: 0,
      results: [],
      status: 'processing',
      startTime: new Date(),
      configs,
      combineDimensions,
    });
    await jobStore.persist(batchJobs);

    // Process URLs in parallel with controlled concurrency
    const concurrencyLimit = 3; // Process 3 URLs simultaneously
    const results = [];

    console.log(
      `🚀 Starting batch job ${jobId} for ${urls.length} URLs with ${configs.length} configurations`,
    );

    // Process URLs in batches
    for (let i = 0; i < urls.length; i += concurrencyLimit) {
      const urlBatch = urls.slice(i, i + concurrencyLimit);

      const batchPromises = urlBatch.map(async (url, batchIndex) => {
        const urlIndex = i + batchIndex;
        console.log(`📄 Processing URL ${urlIndex + 1}/${urls.length}: ${url}`);

        const urlResults = {
          url,
          urlIndex,
          configs: [],
          success: true,
          error: null,
          blocked: false,
          strategy: null,
          processingTime: 0,
        };

        const urlStartTime = Date.now();
        const hostname = hostnameOf(url);

        try {
          console.log(`  🛡️  Visiting ${url} with real browser (block check + snapshot)...`);
          // Serialized per hostname: never hit the same WAF-protected domain
          // with two visits at once, even if other URLs in this batch do.
          const {
            blockResult,
            html: renderedHtml,
            css: rawCss,
            strategy,
          } = await runExclusive(hostname, () => resolvePage(url));

          urlResults.strategy = strategy;

          if (blockResult.blocked) {
            console.warn(`  🚫 Blocked before generating CSS: ${blockResult.reason}`);
            urlResults.success = false;
            urlResults.blocked = true;
            urlResults.error = blockResult.reason;
            urlResults.blockDetails = blockResult;
            urlResults.processingTime = Date.now() - urlStartTime;

            const blockedJob = batchJobs.get(jobId);
            if (blockedJob) {
              blockedJob.completed++;
              blockedJob.results.push(urlResults);
              await jobStore.persist(batchJobs);
            }

            return urlResults;
          }

          if (strategy !== 'manual-capture' && rawCss) {
            // Deliberately NOT running this through the cssnano pipeline used
            // for the critical CSS below: modern CSS-in-JS sites (e.g. GitHub)
            // can produce several MB of raw CSS, and cssnano's default preset
            // (mergeRules/discardDuplicates) can take minutes on input that
            // size — a bad trade for what's meant to be a quick reference
            // export, not a production-optimized bundle.
            urlResults.fullCss = {
              css: rawCss,
              size: Buffer.from(rawCss).length,
              originalSize: Buffer.from(rawCss).length,
            };
          }

          if (combineDimensions && configs.length > 1) {
            // Generate single CSS for multiple dimensions
            try {
              const dimensions = configs.map((config) => ({
                width: config.width,
                height: config.height,
              }));

              console.log(
                `  🔄 Generating combined critical CSS for ${dimensions.length} dimensions...`,
              );

              const ignoredFiles = [
                'library-svgs.css',
                'print.css',
                'jquery-ui.css',
                'ln_tint_global.css',
                'ln_tint_connector_styles',
                'ln_srh_menuiq',
                'mmiq-new.css',
              ];

              const criticalCSS = await critical.generate({
                base: 'base/',
                html: renderedHtml,
                dimensions: dimensions,
                inline: false,
                extract: false,
                ignoreInlinedStyles: false,
                // We've already resolved every asset URL via the real browser
                // render, so skip critical's own asset-rebasing pass (it's
                // pointless here and, for CSS-in-JS-heavy pages, logs a
                // "Not rebasing assets" warning containing the *entire* CSS
                // text per inline stylesheet).
                rebase: false,
                ignore: {
                  atrule: ['@font-face', '@keyframes'],
                  rule: [/modal/, /tint/],
                  decl: (node, value) => {
                    const isSvg = /\.svg/.test(value);
                    const isIgnoredFile = node.source?.input?.file
                      ? ignoredFiles.some((file) =>
                          node.source.input.file.includes(file),
                        )
                      : false;
                    const isAnimation = /animation|transition/.test(node.prop);

                    return isSvg || isIgnoredFile || isAnimation;
                  },
                },
                penthouse: {
                  getBrowser: getSharedBrowser,
                  userAgent: await getRealUserAgent(),
                  blockJSRequests: true, // 🚫 bloqueia JS externo (CSP, cookies, trackers)
                  timeout: 180000, // aumenta o tempo limite (3min) — páginas com muito CSS (ex: SPAs com CSS-in-JS) demoram mais
                  strict: false, // evita erros fatais por regras CSS inválidas
                  renderWaitTime: 500, // espera um pouco mais antes de tirar o "snapshot"
                },
              });

              urlResults.configs.push({
                config: {
                  name: `Combined (${configs
                    .map((c) => `${c.width}×${c.height}`)
                    .join(', ')})`,
                  device: 'combined',
                  width: Math.max(...configs.map((c) => c.width)),
                  height: Math.max(...configs.map((c) => c.height)),
                  dimensions: dimensions,
                },
                css: criticalCSS.css,
                success: true,
                combined: true,
              });

              console.log(`  ✅ Combined critical CSS generated successfully`);
            } catch (error) {
              console.error(
                `  ❌ Error generating combined critical CSS:`,
                error.message,
              );
              urlResults.configs.push({
                config: {
                  name: 'Combined Generation',
                  device: 'combined',
                },
                css: '',
                success: false,
                error: error.message,
                combined: true,
              });
            }
          } else {
            // Generate individual CSS for each configuration
            for (const config of configs) {
              try {
                console.log(
                  `  🔄 Generating critical CSS for ${config.name} (${config.width}×${config.height})...`,
                );

                const criticalCSS = await critical.generate({
                  base: 'base/',
                  html: renderedHtml,
                  width: config.width,
                  height: config.height,
                  inline: false,
                  extract: false,
                  ignoreInlinedStyles: false,
                  rebase: false,
                  ignore: {
                    atrule: ['@font-face'],
                    rule: [/some-regexp/],
                    decl: (node, value) => /big-image\.png/.test(value),
                  },
                  penthouse: {
                    getBrowser: getSharedBrowser,
                    userAgent: await getRealUserAgent(),
                    blockJSRequests: true,
                    timeout: 180000,
                    strict: false,
                    renderWaitTime: 500,
                  },
                });

                urlResults.configs.push({
                  config,
                  css: criticalCSS.css,
                  success: true,
                  combined: false,
                });

                console.log(
                  `  ✅ Critical CSS generated successfully for ${config.name}`,
                );
              } catch (error) {
                console.error(
                  `  ❌ Error generating critical CSS for ${config.name}:`,
                  error.message,
                );
                urlResults.configs.push({
                  config,
                  css: '',
                  success: false,
                  error: error.message,
                  combined: false,
                });
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error processing URL ${url}:`, error.message);
          urlResults.success = false;
          urlResults.error = error.message;
        }

        urlResults.processingTime = Date.now() - urlStartTime;

        // Update batch job progress
        const job = batchJobs.get(jobId);
        if (job) {
          job.completed++;
          job.results.push(urlResults);
          await jobStore.persist(batchJobs);

          console.log(
            `📊 Progress: ${job.completed}/${job.totalUrls} URLs completed`,
          );
        }

        return urlResults;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Update final job status
    const job = batchJobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.endTime = new Date();
      job.totalTime = job.endTime - new Date(job.startTime);
      await jobStore.persist(batchJobs);
    }

    const successfulUrls = results.filter((r) => r.success).length;
    const totalConfigs = results.reduce(
      (sum, r) => sum + r.configs.filter((c) => c.success).length,
      0,
    );

    console.log(
      `🎉 Batch job ${jobId} completed: ${successfulUrls}/${urls.length} URLs processed successfully`,
    );
    console.log(`📈 Total configurations generated: ${totalConfigs}`);

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
        totalUrls: urls.length,
        url: urls[0],
        size: Buffer.from(optimizedCSS).length,
        originalSize: Buffer.from(allCSS).length,
      },
    });
  } catch (error) {
    console.error('Batch critical CSS generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate critical CSS',
    });
  }
});

// Get batch job status
app.get('/api/critical/batch/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = batchJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
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
  });
});

// Reprocess only the URLs that failed in a previous batch job
app.post('/api/critical/batch/:jobId/retry', async (req, res) => {
  const { jobId } = req.params;
  const originalJob = batchJobs.get(jobId);

  if (!originalJob) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const failedUrls = (originalJob.results || [])
    .filter((result) => !result.success)
    .map((result) => result.url);

  if (failedUrls.length === 0) {
    return res.status(400).json({ error: 'No failed URLs to retry in this job' });
  }

  req.body = {
    urls: failedUrls,
    configs: originalJob.configs,
    combineDimensions: originalJob.combineDimensions,
  };

  return app._router.handle(
    { ...req, url: '/api/critical/batch', method: 'POST' },
    res,
  );
});

// Manual capture: a bookmarklet run from the user's own real browser posts
// the rendered page here so a domain that blocks every automated path can
// still be processed (used as the last fallback tier in resolvePage()).
app.post('/api/capture', async (req, res) => {
  const { url, html } = req.body;

  if (!url || !html) {
    return res.status(400).json({ error: 'url and html are required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  await saveCapture(url, html);
  res.json({ success: true });
});

app.get('/api/capture', async (req, res) => {
  res.json({ captures: await listCaptures() });
});

app.delete('/api/capture', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  await deleteCapture(url);
  res.json({ success: true });
});

// Per-domain block history, so the UI can warn upfront about domains that
// have been blocking direct access
app.get('/api/domain-info', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url query param is required' });
  }
  res.json({ domain: await getDomainInfo(url) });
});

// Single URL endpoint (backward compatibility)
app.post('/api/critical', async (req, res) => {
  const { url, configs, combineDimensions } = req.body;

  // Convert single URL to batch format
  const batchRequest = {
    urls: [url],
    configs,
    combineDimensions,
  };

  // Forward to batch endpoint
  req.body = batchRequest;
  return app._router.handle(
    { ...req, url: '/api/critical/batch', method: 'POST' },
    res,
  );
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    activeBatchJobs: batchJobs.size,
  });
});

// Cleanup old batch jobs (run every hour)
setInterval(async () => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let removed = false;
  for (const [jobId, job] of batchJobs.entries()) {
    // startTime is a Date for jobs created this run, but an ISO string for
    // jobs restored from disk at startup — new Date(...) handles both.
    if (new Date(job.startTime).getTime() < oneHourAgo) {
      batchJobs.delete(jobId);
      removed = true;
      console.log(`🧹 Cleaned up old batch job: ${jobId}`);
    }
  }
  if (removed) await jobStore.persist(batchJobs);
}, 60 * 60 * 1000);

// Serve the frontend
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(
    `🚀 Critical CSS Generator server running on http://localhost:${PORT}`,
  );
  console.log(
    `📊 Batch API endpoint: http://localhost:${PORT}/api/critical/batch`,
  );
  console.log(`🔍 Single API endpoint: http://localhost:${PORT}/api/critical`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, closing shared browser...`);
  await closeSharedBrowser();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
