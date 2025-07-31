// Configuration presets
const presetConfigs = {
	"desktop-1920": {
		width: 1920,
		height: 1080,
		device: "desktop",
		name: "Desktop 1920×1080",
	},
	"desktop-1366": {
		width: 1366,
		height: 768,
		device: "desktop",
		name: "Desktop 1366×768",
	},
	"desktop-1280": {
		width: 1280,
		height: 720,
		device: "desktop",
		name: "Desktop 1280×720",
	},
	"mobile-375": {
		width: 375,
		height: 667,
		device: "mobile",
		name: "iPhone SE",
	},
	"mobile-414": {
		width: 414,
		height: 896,
		device: "mobile",
		name: "iPhone 11 Pro Max",
	},
	"mobile-360": {
		width: 360,
		height: 640,
		device: "mobile",
		name: "Android Small",
	},
	"tablet-768": {
		width: 768,
		height: 1024,
		device: "desktop",
		name: "iPad Portrait",
	},
	"tablet-1024": {
		width: 1024,
		height: 768,
		device: "desktop",
		name: "iPad Landscape",
	},
};

// State management
const state = {
	urls: ["https://www.receitasnestle.com.br"],
	selectedConfigs: ["desktop-1366", "mobile-360"],
	results: [],
  optimizedCSS: [],
	isLoading: false,
	error: "",
	combineDimensions: true,
	batchProgress: null,
	currentJobId: null,
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

// Configuration management
function handleConfigToggle(configKey) {
	if (state.selectedConfigs.includes(configKey)) {
		state.selectedConfigs = state.selectedConfigs.filter(
			(key) => key !== configKey,
		);
	} else {
		state.selectedConfigs = [...state.selectedConfigs, configKey];
	}
	render();
}

function selectAllDesktop() {
	const desktopConfigs = Object.entries(presetConfigs)
		.filter(([_, config]) => config.device === "desktop")
		.map(([key]) => key);

	const withoutDesktop = state.selectedConfigs.filter(
		(key) => presetConfigs[key]?.device !== "desktop",
	);
	state.selectedConfigs = [...withoutDesktop, ...desktopConfigs];
	render();
}

function selectAllMobile() {
	const mobileConfigs = Object.entries(presetConfigs)
		.filter(([_, config]) => config.device === "mobile")
		.map(([key]) => key);

	const withoutMobile = state.selectedConfigs.filter(
		(key) => presetConfigs[key]?.device !== "mobile",
	);
	state.selectedConfigs = [...withoutMobile, ...mobileConfigs];
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

	if (state.selectedConfigs.length === 0) {
		state.error = "Please select at least one device configuration";
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
		const configs = state.selectedConfigs.map((key) => presetConfigs[key]);
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
	try {
		await navigator.clipboard.writeText(css);
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
	const desktopConfigs = Object.entries(presetConfigs).filter(
		([_, config]) => config.device === "desktop",
	);
	const mobileConfigs = Object.entries(presetConfigs).filter(
		([_, config]) => config.device === "mobile",
	);

	return `
    <div class="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Batch Configuration</h2>
        <p class="text-gray-600">Configure multiple URLs and device settings for batch critical CSS generation</p>
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

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <label class="text-base font-medium text-gray-900">Device Configurations</label>
          <div class="flex gap-2">
            <button
              onclick="selectAllDesktop()"
              class="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <i class="fas fa-desktop mr-1"></i>All Desktop
            </button>
            <button
              onclick="selectAllMobile()"
              class="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <i class="fas fa-mobile-alt mr-1"></i>All Mobile
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <i class="fas fa-desktop text-blue-600"></i>
              <h3 class="font-medium">Desktop & Tablet</h3>
            </div>
            <div class="space-y-2">
              ${desktopConfigs
								.map(
									([key, config]) => `
                <div class="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    id="${key}"
                    ${state.selectedConfigs.includes(key) ? "checked" : ""}
                    onchange="handleConfigToggle('${key}')"
                    class="rounded"
                  />
                  <label for="${key}" class="flex-1 cursor-pointer">
                    <div class="font-medium">${config.name}</div>
                    <div class="text-sm text-gray-500">${config.width} × ${
										config.height
									}</div>
                  </label>
                  <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">Desktop</span>
                </div>
              `,
								)
								.join("")}
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <i class="fas fa-mobile-alt text-green-600"></i>
              <h3 class="font-medium">Mobile</h3>
            </div>
            <div class="space-y-2">
              ${mobileConfigs
								.map(
									([key, config]) => `
                <div class="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    id="${key}"
                    ${state.selectedConfigs.includes(key) ? "checked" : ""}
                    onchange="handleConfigToggle('${key}')"
                    class="rounded"
                  />
                  <label for="${key}" class="flex-1 cursor-pointer">
                    <div class="font-medium">${config.name}</div>
                    <div class="text-sm text-gray-500">${config.width} × ${
										config.height
									}</div>
                  </label>
                  <span class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Mobile</span>
                </div>
              `,
								)
								.join("")}
            </div>
          </div>
        </div>

        <div class="text-sm text-gray-600">
          Selected: ${state.selectedConfigs.length} configuration${
		state.selectedConfigs.length !== 1 ? "s" : ""
	}
          ${
						state.combineDimensions
							? " (will generate single combined CSS per URL)"
							: ""
					}
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
					state.urls.filter((url) => url.trim() !== "").length === 0 ||
					state.selectedConfigs.length === 0
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
                <span class="px-2 py-1 text-xs rounded ${
									urlResult.success
										? "bg-green-100 text-green-800"
										: "bg-red-100 text-red-800"
								}">
                  ${urlResult.success ? "Success" : "Failed"}
                </span>
              </div>
              ${
								urlResult.error
									? `
                <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p class="text-red-800 text-sm">
                    <strong>Error:</strong> ${urlResult.error}
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
                                data-index="${configIndex}"
                              >
                                <i class="fas fa-copy mr-1"></i>Copy
                              </button>
                              <button
                                class="download-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                                data-index="${configIndex}"
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
                  class="download-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
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
    </div>
  `;
	attachEventListeners();
}

function attachEventListeners() {
	document.querySelectorAll(".copy-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const index = btn.dataset.index;
			const result = state.results[index].configs[0];
			handleCopy(result.css, result.config.name, state.results[index].url);
		});
	});
	document.querySelectorAll(".copy-btn-optimized").forEach((btn) => {
		btn.addEventListener("click", () => {
			const result = state.optimizedCSS;
			const urlsLength = `Total de Urls: ${result.totalUrls}`;
			handleCopy(result.css, urlsLength, result.url);
		});
	});

	document.querySelectorAll(".download-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const index = btn.dataset.index;
			const result = state.results[index].configs[0];
			handleDownload(result.css, result.config.name, state.results[index].url);
		});
	});
}

// Initialize the app
render();

// Make functions globally available
window.addUrl = addUrl;
window.removeUrl = removeUrl;
window.updateUrl = updateUrl;
window.loadSampleUrls = loadSampleUrls;
window.handleConfigToggle = handleConfigToggle;
window.selectAllDesktop = selectAllDesktop;
window.selectAllMobile = selectAllMobile;
window.handleBatchGenerate = handleBatchGenerate;
window.handleCopy = handleCopy;
window.handleDownload = handleDownload;
window.handleDownloadAll = handleDownloadAll;
window.exportBatchResults = exportBatchResults;
window.state = state;
window.render = render;
