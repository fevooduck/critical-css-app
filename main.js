// Configuration presets — standardized on first-fold desktop + mobile only,
// so critical CSS output stays consistent and predictably sized across
// projects (more combined viewports means a larger unioned critical CSS).
const presetConfigs = {
	"desktop-1366": {
		width: 1366,
		height: 768,
		device: "desktop",
		name: "Desktop 1366×768",
	},
	"mobile-375": {
		width: 375,
		height: 667,
		device: "mobile",
		name: "iPhone SE (375×667)",
	},
};

// State management
const state = {
	urls: ["https://www.receitasnestle.com.br"],
	results: [],
  optimizedCSS: [],
	isLoading: false,
	error: "",
	combineDimensions: true,
	batchProgress: null,
	currentJobId: null,
	lastJobId: null,
	captures: [],
};

// Utility functions
function showToast(message, type = "success") {
	const toast = document.createElement("div");
	toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
		type === "success"
			? "bg-green-500 text-white"
			: type === "info"
			? "bg-blue-500 text-white"
			: "bg-red-500 text-white"
	}`;
	toast.textContent = message;
	document.body.appendChild(toast);

	setTimeout(() => {
		toast.remove();
	}, 4000);
}

function formatFileSize(bytes) {
	return Math.round(bytes / 1024) + "KB";
}

function formatTime(ms) {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${seconds}s`;
}

// URL management
function addUrl() {
	state.urls.push("");
	render();
}

function removeUrl(index) {
	if (state.urls.length > 1) {
		state.urls.splice(index, 1);
		render();
	}
}

function updateUrl(index, value) {
	state.urls[index] = value;
	render();
}

function loadSampleUrls() {
	state.urls = [
		"https://www.receitasnestle.com.br",
		"https://www.receitasnestle.com.br/nossas-receitas/receitas-festa-junina",
		"https://www.receitasnestle.com.br/aulas-on-line",
		"https://www.receitasnestle.com.br/aulas-on-line/curso-de-bolos-especiais-com-beca-milano",
		"https://www.receitasnestle.com.br/aulas-on-line/curso-de-bolos-especiais-com-beca-milano/bolo-baba-de-moca-com-nozes",
		"https://www.receitasnestle.com.br/livros-de-receitas",
		"https://www.receitasnestle.com.br/nossas-receitas",
		"https://www.receitasnestle.com.br/receitas/receita-morango-amor",
		"https://www.receitasnestle.com.br/artigos/receitas-caldo",
		"https://www.receitasnestle.com.br/artigos",
		"https://www.receitasnestle.com.br/artigos/alimentacao-saudavel",
		"https://www.receitasnestle.com.br/listas-de-receitas",
		"https://www.receitasnestle.com.br/listas-de-receitas/receitas-da-nutricionista-beatriz-forli",
		"https://www.receitasnestle.com.br/videos",
		"https://www.receitasnestle.com.br/videos/faz-na-air-fryer",
		"https://www.receitasnestle.com.br/videos/faz-na-air-fryer/mais-saudaveis",
	];
	render();
}

// Batch processing
async function handleBatchGenerate() {
	const validUrls = state.urls.filter((url) => url.trim() !== "");

	if (validUrls.length === 0) {
		state.error = "Please enter at least one valid URL";
		render();
		return;
	}

	state.isLoading = true;
	state.error = "";
	state.results = [];
	state.optimizedCSS = [];
	state.batchProgress = { completed: 0, total: validUrls.length };
	render();

	try {
		// Fixed, standardized viewports (see presetConfigs) — not user-selectable
		const configs = Object.values(presetConfigs);
		const jobId = `batch_${Date.now()}_${Math.random()
			.toString(36)
			.substr(2, 9)}`;
		state.currentJobId = jobId;

		showToast(
			`Starting batch processing of ${validUrls.length} URLs...`,
			"info",
		);

		const response = await fetch("/api/critical/batch", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				urls: validUrls,
				configs,
				combineDimensions: state.combineDimensions,
				batchId: jobId,
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || "Failed to generate critical CSS");
		}

		state.results = data.results;
    state.optimizedCSS = data.optimizedCSS || [];
		state.batchProgress = null;
		state.lastJobId = data.jobId;

		const { summary } = data;
		showToast(
			`Batch Complete! ${summary.successfulUrls}/${
				summary.totalUrls
			} URLs processed, ${
				summary.successfulConfigs
			} CSS files generated in ${formatTime(summary.processingTime)}`,
		);
	} catch (err) {
		state.error = err.message;
		showToast(err.message, "error");
	} finally {
		state.isLoading = false;
		state.currentJobId = null;
		render();
	}
}

// Export functions
async function handleCopy(css, configName, url) {
	const wrapped = `<style>\n${css}\n</style>`;
	try {
		await navigator.clipboard.writeText(wrapped);
		showToast(
			`${configName} CSS from ${new URL(url).hostname} copied to clipboard`,
		);
	} catch (err) {
		console.error("Failed to copy to clipboard:", url);
		showToast("Failed to copy to clipboard", "error");
	}
}

function handleDownload(css, configName, url) {
	const hostname = new URL(url).hostname.replace(/\./g, "-");
	const blob = new Blob([css], { type: "text/css" });
	const downloadUrl = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = downloadUrl;
	a.download = `critical-${hostname}-${configName
		.toLowerCase()
		.replace(/\s+/g, "-")}.css`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(downloadUrl);

	showToast(`${configName} CSS from ${hostname} downloaded`);
}

function handleDownloadAll() {
	let downloadCount = 0;

	state.results.forEach((urlResult) => {
		if (urlResult.success) {
			urlResult.configs.forEach((configResult) => {
				if (configResult.success) {
					handleDownload(
						configResult.css,
						configResult.config.name,
						urlResult.url,
					);
					downloadCount++;
				}
			});
		}
	});

	if (downloadCount > 0) {
		showToast(`Downloaded ${downloadCount} CSS files`);
	}
}

function exportBatchResults() {
	const exportData = {
		timestamp: new Date().toISOString(),
		summary: {
			totalUrls: state.results.length,
			successfulUrls: state.results.filter((r) => r.success).length,
			totalConfigs: state.results.reduce((sum, r) => sum + r.configs.length, 0),
			successfulConfigs: state.results.reduce(
				(sum, r) => sum + r.configs.filter((c) => c.success).length,
				0,
			),
		},
		results: state.results.map((urlResult) => ({
			url: urlResult.url,
			success: urlResult.success,
			error: urlResult.error,
			processingTime: urlResult.processingTime,
			configs: urlResult.configs.map((configResult) => ({
				name: configResult.config.name,
				device: configResult.config.device,
				width: configResult.config.width,
				height: configResult.config.height,
				success: configResult.success,
				error: configResult.error,
				cssSize: configResult.css.length,
				css: configResult.css,
			})),
		})),
	};

	const blob = new Blob([JSON.stringify(exportData, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `critical-css-batch-${
		new Date().toISOString().split("T")[0]
	}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	showToast("Batch results exported as JSON");
}

// Retry only the URLs that failed in the last batch job
async function handleRetryFailed() {
	if (!state.lastJobId) return;

	state.isLoading = true;
	render();

	try {
		const response = await fetch(
			`/api/critical/batch/${state.lastJobId}/retry`,
			{ method: "POST" },
		);
		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || "Failed to retry");
		}

		const retriedByUrl = new Map(data.results.map((r) => [r.url, r]));
		state.results = state.results.map((r) => retriedByUrl.get(r.url) || r);
		state.lastJobId = data.jobId;

		showToast(
			`Retry: ${data.summary.successfulUrls}/${data.summary.totalUrls} succeeded. (O CSS otimizado combinado acima ainda é o da execução original.)`,
		);
	} catch (err) {
		showToast(err.message, "error");
	} finally {
		state.isLoading = false;
		render();
	}
}

// Manual capture (fallback for domains that block every automated path)
function buildBookmarklet() {
	const apiOrigin = `${location.protocol}//${location.hostname}:9001`;
	const code = `
    (function(){
      try {
        var css=[];
        for (var i=0;i<document.styleSheets.length;i++){
          try{
            var rules=document.styleSheets[i].cssRules;
            var t='';
            for (var j=0;j<rules.length;j++) t+=rules[j].cssText;
            css.push(t);
          }catch(e){}
        }
        var clone=document.documentElement.cloneNode(true);
        var junk=clone.querySelectorAll('link[rel=stylesheet], style, script');
        junk.forEach(function(el){el.remove();});
        var styleTag=document.createElement('style');
        styleTag.textContent=css.join('\\n');
        var head=clone.querySelector('head');
        if (head) head.insertBefore(styleTag, head.firstChild);
        var html='<html>'+clone.innerHTML+'</html>';
        fetch('${apiOrigin}/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:location.href,html:html})})
          .then(function(){alert('Pagina capturada! Volte ao Critical CSS Generator para reprocessar esta URL.');})
          .catch(function(e){alert('Falha ao enviar captura: '+e.message);});
      } catch(e) { alert('Erro ao capturar: '+e.message); }
    })();
  `;
	return "javascript:" + encodeURIComponent(code.replace(/\s+/g, " ").trim());
}

async function loadCaptures() {
	try {
		const res = await fetch("/api/capture");
		const data = await res.json();
		state.captures = data.captures || [];
		render();
	} catch (err) {
		console.error("Failed to load captures", err);
	}
}

async function handleDeleteCapture(url) {
	try {
		await fetch("/api/capture", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});
		await loadCaptures();
		showToast("Captura removida");
	} catch (err) {
		showToast("Falha ao remover captura", "error");
	}
}

// Render functions
function renderUrlsSection() {
	return `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <label class="text-base font-medium text-gray-900">Website URLs</label>
        <div class="flex gap-2">
          <button
            onclick="loadSampleUrls()"
            class="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <i class="fas fa-magic mr-1"></i>Load Samples
          </button>
          <button
            onclick="addUrl()"
            class="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <i class="fas fa-plus mr-1"></i>Add URL
          </button>
        </div>
      </div>

      <div class="space-y-2">
        ${state.urls
					.map(
						(url, index) => `
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500 w-8">${index + 1}.</span>
            <input
              type="url"
              placeholder="https://example.com"
              value="${url}"
              onchange="updateUrl(${index}, this.value)"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            ${
							state.urls.length > 1
								? `
              <button
                onclick="removeUrl(${index})"
                class="px-2 py-2 text-red-600 hover:bg-red-50 rounded-md"
                title="Remove URL"
              >
                <i class="fas fa-trash"></i>
              </button>
            `
								: ""
						}
          </div>
        `,
					)
					.join("")}
      </div>

      <div class="text-sm text-gray-600">
        <i class="fas fa-info-circle mr-1"></i>
        ${
					state.urls.filter((url) => url.trim() !== "").length
				} valid URLs will be processed
      </div>
    </div>
  `;
}

function renderConfigurationCard() {
	return `
    <div class="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Batch Configuration</h2>
        <p class="text-gray-600">Configure as URLs para gerar o CSS crítico da primeira dobra (desktop + mobile) em lote</p>
      </div>

      ${renderUrlsSection()}

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <label class="text-base font-medium text-gray-900">Generation Mode</label>
        </div>
        
        <div class="flex items-center space-x-4">
          <label class="flex items-center">
            <input
              type="radio"
              name="mode"
              value="individual"
              ${!state.combineDimensions ? "checked" : ""}
              onchange="state.combineDimensions = false; render();"
              class="mr-2"
            />
            <span class="text-sm">Individual CSS for each device</span>
          </label>
          <label class="flex items-center">
            <input
              type="radio"
              name="mode"
              value="combined"
              ${state.combineDimensions ? "checked" : ""}
              onchange="state.combineDimensions = true; render();"
              class="mr-2"
            />
            <span class="text-sm">Single CSS for all dimensions</span>
          </label>
        </div>
      </div>

      <div class="space-y-3">
        <label class="text-base font-medium text-gray-900">Device Configurations</label>
        <div class="flex flex-wrap gap-3">
          ${Object.values(presetConfigs)
						.map(
							(config) => `
            <div class="flex items-center gap-2 px-3 py-2 border rounded-lg bg-gray-50">
              <i class="fas ${
								config.device === "mobile" ? "fa-mobile-alt text-green-600" : "fa-desktop text-blue-600"
							}"></i>
              <div>
                <div class="font-medium text-sm">${config.name}</div>
                <div class="text-xs text-gray-500">${config.width} × ${config.height}</div>
              </div>
            </div>
          `,
						)
						.join("")}
        </div>
        <div class="text-sm text-gray-600">
          Padronizado para primeira dobra (desktop + mobile) em todas as URLs — não configurável.
        </div>
      </div>

      ${
				state.batchProgress
					? `
        <div class="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-blue-900">Processing URLs...</span>
            <span class="text-sm text-blue-700">${
							state.batchProgress.completed
						}/${state.batchProgress.total}</span>
          </div>
          <div class="w-full bg-blue-200 rounded-full h-2">
            <div 
              class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style="width: ${
								(state.batchProgress.completed / state.batchProgress.total) *
								100
							}%"
            ></div>
          </div>
        </div>
      `
					: ""
			}

      <button
        onclick="handleBatchGenerate()"
        ${
					state.isLoading ||
					state.urls.filter((url) => url.trim() !== "").length === 0
						? "disabled"
						: ""
				}
        class="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ${
					state.isLoading
						? `
          <i class="fas fa-spinner fa-spin mr-2"></i>
          Processing ${
						state.urls.filter((url) => url.trim() !== "").length
					} URLs...
        `
						: `
          <i class="fas fa-rocket mr-2"></i>
          Generate Critical CSS for ${
						state.urls.filter((url) => url.trim() !== "").length
					} URLs
        `
				}
      </button>

      ${
				state.error
					? `
        <div class="p-4 bg-red-50 border border-red-200 rounded-md">
          <p class="text-red-800 text-sm">${state.error}</p>
        </div>
      `
					: ""
			}
    </div>
  `;
}

function renderManualCaptureSection() {
	const bookmarkletHref = buildBookmarklet();

	return `
    <div class="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Captura manual (URLs bloqueadas)</h2>
        <p class="text-gray-600 text-sm">
          Para domínios que bloqueiam até o navegador automatizado, arraste o botão abaixo para a barra de
          favoritos, abra a URL bloqueada no seu navegador normal (sessão real, já logado) e clique nele.
          A página capturada passa a ser usada automaticamente como alternativa ao gerar CSS para essa mesma URL.
        </p>
      </div>
      <a
        href="${bookmarkletHref}"
        onclick="return false;"
        class="inline-block px-4 py-2 bg-gray-800 text-white rounded-md text-sm cursor-move"
        title="Arraste para a barra de favoritos"
      >
        <i class="fas fa-bookmark mr-2"></i>Capturar página (arraste-me para os favoritos)
      </a>
      ${
				state.captures.length > 0
					? `
        <div class="mt-4 space-y-2">
          <div class="text-sm font-medium text-gray-900">Páginas capturadas (${state.captures.length})</div>
          ${state.captures
						.map(
							(capture) => `
            <div class="flex items-center justify-between p-2 border rounded-md text-sm">
              <span class="truncate flex-1 mr-2" title="${capture.url}">${capture.url}</span>
              <span class="text-gray-500 mr-2 whitespace-nowrap">${formatFileSize(capture.size)}</span>
              <button class="delete-capture-btn text-red-600 hover:bg-red-50 px-2 py-1 rounded" data-url="${capture.url}">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `,
						)
						.join("")}
        </div>
      `
					: ""
			}
    </div>
  `;
}

function renderResults() {
	if (state.results.length === 0) return "";

	const totalConfigs = state.results.reduce(
		(sum, r) => sum + r.configs.length,
		0,
	);
	const successfulConfigs = state.results.reduce(
		(sum, r) => sum + r.configs.filter((c) => c.success).length,
		0,
	);
	const cssResult = state.optimizedCSS;

	return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-gray-900">Batch Results</h2>
          <p class="text-gray-600">
            Processed ${
							state.results.length
						} URLs • Generated ${successfulConfigs}/${totalConfigs} CSS files
          </p>
        </div>
        <div class="flex gap-2">
          ${
						state.results.some((r) => !r.success) && state.lastJobId
							? `
            <button
              onclick="handleRetryFailed()"
              ${state.isLoading ? "disabled" : ""}
              class="px-4 py-2 border border-yellow-300 text-yellow-800 bg-yellow-50 rounded-md hover:bg-yellow-100 disabled:opacity-50"
            >
              <i class="fas fa-redo mr-2"></i>Reprocessar falhas
            </button>
          `
							: ""
					}
          <button
            onclick="exportBatchResults()"
            class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <i class="fas fa-file-export mr-2"></i>Export JSON
          </button>
          <button
            onclick="handleDownloadAll()"
            ${successfulConfigs === 0 ? "disabled" : ""}
            class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <i class="fas fa-download mr-2"></i>Download All CSS
          </button>
        </div>
      </div>

      <div class="space-y-6">
        ${state.results
					.map(
						(urlResult, urlIndex) => `
          <div class="border rounded-lg">
            <div class="p-4 border-b bg-gray-50">
              <div class="flex items-center gap-3">
                ${
									urlResult.success
										? '<i class="fas fa-check-circle text-green-500"></i>'
										: urlResult.blocked
										? '<i class="fas fa-shield-alt text-yellow-600"></i>'
										: '<i class="fas fa-times-circle text-red-500"></i>'
								}
                <div class="flex-1">
                  <div class="font-medium">${
										new URL(urlResult.url).hostname
									}</div>
                  <div class="text-sm text-gray-500">
                    ${urlResult.url} • ${
							urlResult.configs.filter((c) => c.success).length
						}/${urlResult.configs.length} configs successful
                    ${
											urlResult.processingTime
												? ` • ${formatTime(urlResult.processingTime)}`
												: ""
										}
                  </div>
                </div>
                ${
									urlResult.strategy && urlResult.strategy !== "direct"
										? `
                  <span class="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-800" title="Este resultado não veio de uma visita direta">
                    ${
											urlResult.strategy === "proxy"
												? "via proxy"
												: "via captura manual"
										}
                  </span>
                `
										: ""
								}
                <span class="px-2 py-1 text-xs rounded ${
									urlResult.success
										? "bg-green-100 text-green-800"
										: urlResult.blocked
										? "bg-yellow-100 text-yellow-800"
										: "bg-red-100 text-red-800"
								}">
                  ${
										urlResult.success
											? "Success"
											: urlResult.blocked
											? "Blocked"
											: "Failed"
									}
                </span>
              </div>
              ${
								urlResult.error
									? `
                <div class="mt-3 p-3 ${
									urlResult.blocked
										? "bg-yellow-50 border border-yellow-200"
										: "bg-red-50 border border-red-200"
								} rounded-md">
                  <p class="${
										urlResult.blocked ? "text-yellow-800" : "text-red-800"
									} text-sm">
                    <strong>${
											urlResult.blocked
												? "Bloqueado por proteção anti-bot:"
												: "Error:"
										}</strong> ${urlResult.error}
                  </p>
                </div>
              `
									: ""
							}
            </div>
            
            ${
							urlResult.success
								? `
              <div class="p-4">
                <div class="space-y-4">
                  ${urlResult.configs
										.map(
											(configResult, configIndex) => `
                    <div class="border rounded-lg">
                      <div class="p-3 border-b bg-gray-50">
                        <div class="flex items-center gap-3">
                          ${
														configResult.success
															? '<i class="fas fa-check-circle text-green-500 text-sm"></i>'
															: '<i class="fas fa-times-circle text-red-500 text-sm"></i>'
													}
                          <div class="flex-1">
                            <div class="font-medium text-sm">${
															configResult.config.name
														}</div>
                            <div class="text-xs text-gray-500">
                              ${
																configResult.combined
																	? `Combined dimensions: ${
																			configResult.config.dimensions
																				?.map((d) => `${d.width}×${d.height}`)
																				.join(", ") || "Multiple"
																	  }`
																	: `${configResult.config.width} × ${configResult.config.height}`
															}
                              ${
																configResult.success
																	? ` • ${formatFileSize(
																			configResult.css.length,
																	  )}`
																	: " • Failed"
															}
                            </div>
                          </div>
                          <span class="px-2 py-1 text-xs rounded ${
														configResult.config.device === "mobile"
															? "bg-green-100 text-green-800"
															: configResult.config.device === "combined"
															? "bg-purple-100 text-purple-800"
															: "bg-blue-100 text-blue-800"
													}">
                            ${
															configResult.config.device === "combined"
																? "Combined"
																: configResult.config.device
														}
                          </span>
                        </div>
                      </div>
                      
                      <div class="p-3">
                        ${
													configResult.success
														? `
                          <div class="space-y-3">
                            <div class="flex gap-2">
                              <button
                                class="copy-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                                data-url-index="${urlIndex}"
                                data-config-index="${configIndex}"
                              >
                                <i class="fas fa-copy mr-1"></i>Copy
                              </button>
                              <button
                                class="download-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                                data-url-index="${urlIndex}"
                                data-config-index="${configIndex}"
                              >
                                <i class="fas fa-download mr-1"></i>Download
                              </button>
                            </div>
                            <textarea
                              readonly
                              class="w-full h-32 p-2 font-mono text-xs border border-gray-300 rounded-md bg-gray-50"
                              placeholder="Critical CSS will appear here..."
                            >${configResult.css}</textarea>
                          </div>
                        `
														: `
                          <div class="p-3 bg-red-50 border border-red-200 rounded-md">
                            <p class="text-red-800 text-xs">
                              <strong>Error:</strong> ${
																configResult.error || "Unknown error occurred"
															}
                            </p>
                          </div>
                        `
												}
                      </div>
                    </div>
                  `,
										)
										.join("")}
                  ${
										urlResult.fullCss
											? `
                    <div class="border rounded-lg">
                      <div class="p-3 border-b bg-gray-50">
                        <div class="flex items-center gap-3">
                          <i class="fas fa-file-code text-purple-600 text-sm"></i>
                          <div class="flex-1">
                            <div class="font-medium text-sm">CSS completo da página</div>
                            <div class="text-xs text-gray-500">
                              Todo o CSS usado pela página, não só o crítico acima da dobra
                              • ${formatFileSize(urlResult.fullCss.size)}
                            </div>
                          </div>
                          <span class="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">Full CSS</span>
                        </div>
                      </div>
                      <div class="p-3">
                        <div class="space-y-3">
                          <div class="flex gap-2">
                            <button
                              class="copy-full-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                              data-url-index="${urlIndex}"
                            >
                              <i class="fas fa-copy mr-1"></i>Copy
                            </button>
                            <button
                              class="download-full-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                              data-url-index="${urlIndex}"
                            >
                              <i class="fas fa-download mr-1"></i>Download
                            </button>
                          </div>
                          <textarea
                            readonly
                            class="w-full h-32 p-2 font-mono text-xs border border-gray-300 rounded-md bg-gray-50"
                          >${urlResult.fullCss.css}</textarea>
                        </div>
                      </div>
                    </div>
                  `
											: ""
									}
                </div>
              </div>
            `
								: ""
						}
          </div>
        `,
					)
					.join("")}
      </div>
     <div class="space-y-6">
    <div class="border rounded-lg">
      <div class="p-4 border-b bg-gray-50">
        <div class="flex items-center gap-3">
          <i class="fas fa-check-circle text-green-500"></i>
          <div class="flex-1">
            <div class="font-medium">CSS Optimized</div>
            <div class="text-sm text-gray-500">
              Original Size: ${formatFileSize(cssResult.originalSize)} • Final Size: ${
		formatFileSize(cssResult.size)
	} 
            </div>
          </div>
          <span class="px-2 py-1 text-xs rounded bg-green-100 text-green-800">
            Success
          </span>
        </div>
      </div>

      ${
				cssResult.success
					? `
        <div class="border rounded-lg">
          <div class="p-3">
            <div class="space-y-3">
              <div class="flex gap-2">
                <button
                  class="copy-btn-optimized px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  <i class="fas fa-copy mr-1"></i>Copy
                </button>
                <button
                  class="download-btn-optimized px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  <i class="fas fa-download mr-1"></i>Download
                </button>
              </div>
              <textarea
                readonly
                class="w-full h-32 p-2 font-mono text-xs border border-gray-300 rounded-md bg-gray-50"
                placeholder="Critical CSS will appear here..."
              >${cssResult.css}</textarea>
            </div>
          </div>
        </div>
      `
					: ""
			}
    </div>
  </div>

      <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h4 class="font-medium text-blue-900 mb-2">Batch Processing Tips:</h4>
        <ul class="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Use combined dimensions mode for better performance when targeting multiple viewports</li>
          <li>Process similar websites together for consistent results</li>
          <li>Export results as JSON for further analysis or automation</li>
          <li>Download all CSS files at once for easy deployment</li>
        </ul>
      </div>
    </div>
  `;
}

function render() {
	const app = document.getElementById("app");
	app.innerHTML = `
    <div class="max-w-6xl mx-auto p-4 space-y-6">
      <div class="text-center space-y-2">
        <div class="flex items-center justify-center gap-2">
          <i class="fas fa-rocket text-2xl text-blue-600"></i>
          <h1 class="text-3xl font-bold text-gray-900">Batch Critical CSS Generator</h1>
        </div>
        <p class="text-gray-600">
          Generate critical CSS for multiple websites simultaneously with maximum agility
        </p>
      </div>

      ${renderConfigurationCard()}
      ${renderResults()}
      ${renderManualCaptureSection()}
    </div>
  `;
	attachEventListeners();
}

function attachEventListeners() {
	document.querySelectorAll(".copy-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const { urlIndex, configIndex } = btn.dataset;
			const urlResult = state.results[urlIndex];
			const configResult = urlResult.configs[configIndex];
			handleCopy(configResult.css, configResult.config.name, urlResult.url);
		});
	});
	document.querySelectorAll(".download-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const { urlIndex, configIndex } = btn.dataset;
			const urlResult = state.results[urlIndex];
			const configResult = urlResult.configs[configIndex];
			handleDownload(configResult.css, configResult.config.name, urlResult.url);
		});
	});

	document.querySelectorAll(".copy-full-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const urlResult = state.results[btn.dataset.urlIndex];
			handleCopy(urlResult.fullCss.css, "Full CSS", urlResult.url);
		});
	});
	document.querySelectorAll(".download-full-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const urlResult = state.results[btn.dataset.urlIndex];
			handleDownload(urlResult.fullCss.css, "full", urlResult.url);
		});
	});

	document.querySelectorAll(".copy-btn-optimized").forEach((btn) => {
		btn.addEventListener("click", () => {
			const result = state.optimizedCSS;
			const urlsLength = `Total de Urls: ${result.totalUrls}`;
			handleCopy(result.css, urlsLength, result.url);
		});
	});
	document.querySelectorAll(".download-btn-optimized").forEach((btn) => {
		btn.addEventListener("click", () => {
			const result = state.optimizedCSS;
			handleDownload(result.css, "optimized", result.url);
		});
	});

	document.querySelectorAll(".delete-capture-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			handleDeleteCapture(btn.dataset.url);
		});
	});
}

// Initialize the app
render();
loadCaptures();

// Make functions globally available
window.addUrl = addUrl;
window.removeUrl = removeUrl;
window.updateUrl = updateUrl;
window.loadSampleUrls = loadSampleUrls;
window.handleBatchGenerate = handleBatchGenerate;
window.handleCopy = handleCopy;
window.handleDownload = handleDownload;
window.handleDownloadAll = handleDownloadAll;
window.exportBatchResults = exportBatchResults;
window.handleRetryFailed = handleRetryFailed;
window.state = state;
window.render = render;
