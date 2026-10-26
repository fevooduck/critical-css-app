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
import {
  removeExcludedElements,
  buildCssIgnoreRules,
  filterCssByExcludedRules,
} from './lib/html-cleaner.js';
import {
  optimizeCriticalCSS,
  auditCssBudget,
  TCP_INITCWND_CEILING_BYTES,
  IDEAL_CRITICAL_GZIP_BYTES,
} from './lib/css-optimizer.js';

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

async function optimizeCSS(css, aggressivePruning = true) {
  const result = await optimizeCriticalCSS(css, {
    aggressivePruning,
    combineDuplicates: true,
  });
  return result.css;
}

// Critical CSS generation endpoint for multiple URLs
app.post('/api/critical/batch', async (req, res) => {
  try {
    const {
      urls,
      configs,
      combineDimensions = false,
      batchId,
      excludedSelectors = [
        '.modal',
        '#onetrust-banner-sdk',
        '.dropdown-content',
      ],
      aggressivePruning = true,
      isolateFirstFold = true,
      targetLimit = TCP_INITCWND_CEILING_BYTES,
      idealLimit = IDEAL_CRITICAL_GZIP_BYTES,
    } = req.body;

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
      excludedSelectors,
      aggressivePruning,
      isolateFirstFold,
      targetLimit,
      idealLimit,
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
          } = await runExclusive(hostname, () =>
            resolvePage(url, { isolateFirstFold }),
          );

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

          let cleanHtml = renderedHtml;
          if (Array.isArray(excludedSelectors) && excludedSelectors.length > 0) {
            const cleanResult = removeExcludedElements(
              renderedHtml,
              excludedSelectors,
            );
            cleanHtml = cleanResult.html;
            if (cleanResult.removedCount > 0) {
              console.log(
                `  🧹 Removed ${cleanResult.removedCount} excluded DOM element(s) matching: ${cleanResult.removedDetails
                  .map((d) => `${d.selector} (${d.count})`)
                  .join(', ')}`,
              );
            }
          }

          const ignoreRules = buildCssIgnoreRules(excludedSelectors);

          const declFilter = (node, value) => {
            const isSvg = /\.svg/i.test(value);
            const isAnimation = /animation|transition/i.test(node.prop);
            const isLargeDataUri =
              /data:(image|font)\//i.test(value) && value.length > 300;
            return isSvg || isAnimation || isLargeDataUri;
          };

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

              // Ignored stylesheets (library-svgs.css, print.css, ...) are
              // already dropped from the snapshot in visitUrl — see
              // IGNORED_STYLESHEETS in lib/browser-manager.js.
              const criticalCSS = await critical.generate({
                base: 'base/',
                html: cleanHtml,
                dimensions: dimensions,
                inline: false,
                extract: false,
                ignoreInlinedStyles: false,
                rebase: false,
                ignore: {
                  atrule: ['@font-face', '@keyframes'],
                  rule: ignoreRules,
                  decl: declFilter,
                },
                penthouse: {
                  getBrowser: getSharedBrowser,
                  userAgent: await getRealUserAgent(),
                  blockJSRequests: true, // 🚫 bloqueia JS externo (CSP, cookies, trackers)
                  timeout: 180000, // aumenta o tempo limite (3min)
                  strict: false, // evita erros fatais por regras CSS inválidas
                  renderWaitTime: 500,
                  forceExclude: ignoreRules,
                },
              });

              const filteredCss = filterCssByExcludedRules(
                criticalCSS.css,
                ignoreRules,
              );

              const { css: finalCss, audit } = await optimizeCriticalCSS(
                filteredCss,
                {
                  aggressivePruning,
                  combineDuplicates: true,
                  targetLimit,
                  idealLimit,
                },
              );

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
                css: finalCss,
                rawSize: audit.rawBytes,
                gzipSize: audit.gzipBytes,
                budget: audit,
                success: true,
                combined: true,
              });

              console.log(
                `  ✅ Combined critical CSS generated successfully (${audit.rawFormatted} raw, ${audit.gzipFormatted} gzip - ${audit.status.toUpperCase()})`,
              );
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
                  html: cleanHtml,
                  width: config.width,
                  height: config.height,
                  inline: false,
                  extract: false,
                  ignoreInlinedStyles: false,
                  rebase: false,
                  ignore: {
                    atrule: ['@font-face', '@keyframes'],
                    rule: ignoreRules,
                    decl: declFilter,
                  },
                  penthouse: {
                    getBrowser: getSharedBrowser,
                    userAgent: await getRealUserAgent(),
                    blockJSRequests: true,
                    timeout: 180000,
                    strict: false,
                    renderWaitTime: 500,
                    forceExclude: ignoreRules,
                  },
                });

                const filteredCss = filterCssByExcludedRules(
                  criticalCSS.css,
                  ignoreRules,
                );

                const { css: finalCss, audit } = await optimizeCriticalCSS(
                  filteredCss,
                  {
                    aggressivePruning,
                    combineDuplicates: true,
                    targetLimit,
                    idealLimit,
                  },
                );

                urlResults.configs.push({
                  config,
                  css: finalCss,
                  rawSize: audit.rawBytes,
                  gzipSize: audit.gzipBytes,
                  budget: audit,
                  success: true,
                  combined: false,
                });

                console.log(
                  `  ✅ Critical CSS generated successfully for ${config.name} (${audit.rawFormatted} raw, ${audit.gzipFormatted} gzip - ${audit.status.toUpperCase()})`,
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

    // Global budget statistics across all processed configurations
    let totalRawBytes = 0;
    let totalGzipBytes = 0;
    let budgetOptimalCount = 0;
    let budgetWarningCount = 0;
    let budgetExceededCount = 0;

    results.forEach((r) => {
      if (!r.success) return;
      r.configs.forEach((c) => {
        if (!c.success || !c.budget) return;
        totalRawBytes += c.budget.rawBytes;
        totalGzipBytes += c.budget.gzipBytes;
        if (c.budget.status === 'optimal') budgetOptimalCount++;
        else if (c.budget.status === 'warning') budgetWarningCount++;
        else if (c.budget.status === 'exceeded') budgetExceededCount++;
      });
    });

    const primaryUrlResult = results.find((r) => r.success);
    const primaryConfigResult = primaryUrlResult?.configs?.find((c) => c.success);
    const primaryCss = primaryConfigResult?.css || '';
    const primaryAudit = primaryConfigResult?.budget || auditCssBudget(primaryCss, targetLimit, idealLimit);

    res.json({
      jobId,
      results,
      summary: {
        totalUrls: urls.length,
        successfulUrls,
        totalConfigs: configs.length,
        successfulConfigs: totalConfigs,
        combineDimensions,
        aggressivePruning,
        isolateFirstFold,
        processingTime: job?.totalTime || 0,
        budgetSummary: {
          totalRawBytes,
          totalGzipBytes,
          budgetOptimalCount,
          budgetWarningCount,
          budgetExceededCount,
          targetLimit,
          idealLimit,
        },
      },
      optimizedCSS: {
        success: !!primaryCss,
        css: primaryCss,
        totalUrls: urls.length,
        url: primaryUrlResult?.url || urls[0],
        size: primaryAudit.rawBytes,
        gzipSize: primaryAudit.gzipBytes,
        budget: primaryAudit,
        originalSize: primaryConfigResult?.rawSize || primaryAudit.rawBytes,
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
    excludedSelectors: originalJob.excludedSelectors,
    aggressivePruning: originalJob.aggressivePruning !== false,
    isolateFirstFold: originalJob.isolateFirstFold !== false,
    targetLimit: originalJob.targetLimit,
    idealLimit: originalJob.idealLimit,
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
  const { url, configs, combineDimensions, excludedSelectors } = req.body;

  // Convert single URL to batch format
  const batchRequest = {
    urls: [url],
    configs,
    combineDimensions,
    excludedSelectors,
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
