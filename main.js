// Configuration presets
const presetConfigs = {
  "desktop-1920": { width: 1920, height: 1080, device: "desktop", name: "Desktop 1920×1080" },
  "desktop-1366": { width: 1366, height: 768, device: "desktop", name: "Desktop 1366×768" },
  "desktop-1280": { width: 1280, height: 720, device: "desktop", name: "Desktop 1280×720" },
  "mobile-375": { width: 375, height: 667, device: "mobile", name: "iPhone SE" },
  "mobile-414": { width: 414, height: 896, device: "mobile", name: "iPhone 11 Pro Max" },
  "mobile-360": { width: 360, height: 640, device: "mobile", name: "Android Small" },
  "tablet-768": { width: 768, height: 1024, device: "desktop", name: "iPad Portrait" },
  "tablet-1024": { width: 1024, height: 768, device: "desktop", name: "iPad Landscape" },
}

// State management
const state = {
  url: "https://example.com",
  selectedConfigs: ["desktop-1920", "mobile-375"],
  results: [],
  isLoading: false,
  error: "",
  combineDimensions: false,
}

// Utility functions
function showToast(message, type = "success") {
  const toast = document.createElement("div")
  toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
    type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
  }`
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, 3000)
}

function formatFileSize(bytes) {
  return Math.round(bytes / 1024) + "KB"
}

// Event handlers
function handleConfigToggle(configKey) {
  if (state.selectedConfigs.includes(configKey)) {
    state.selectedConfigs = state.selectedConfigs.filter((key) => key !== configKey)
  } else {
    state.selectedConfigs = [...state.selectedConfigs, configKey]
  }
  render()
}

function selectAllDesktop() {
  const desktopConfigs = Object.entries(presetConfigs)
    .filter(([_, config]) => config.device === "desktop")
    .map(([key]) => key)

  const withoutDesktop = state.selectedConfigs.filter((key) => presetConfigs[key]?.device !== "desktop")
  state.selectedConfigs = [...withoutDesktop, ...desktopConfigs]
  render()
}

function selectAllMobile() {
  const mobileConfigs = Object.entries(presetConfigs)
    .filter(([_, config]) => config.device === "mobile")
    .map(([key]) => key)

  const withoutMobile = state.selectedConfigs.filter((key) => presetConfigs[key]?.device !== "mobile")
  state.selectedConfigs = [...withoutMobile, ...mobileConfigs]
  render()
}

async function handleGenerate() {
  if (!state.url) {
    state.error = "Please enter a valid URL"
    render()
    return
  }

  if (state.selectedConfigs.length === 0) {
    state.error = "Please select at least one device configuration"
    render()
    return
  }

  state.isLoading = true
  state.error = ""
  state.results = []
  render()

  try {
    const configs = state.selectedConfigs.map((key) => presetConfigs[key])

    const response = await fetch("/api/critical", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: state.url,
        configs,
        combineDimensions: state.combineDimensions,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate critical CSS")
    }

    state.results = data.results

    const successCount = data.results.filter((r) => r.success).length
    const totalCount = data.results.length

    showToast(`Generation Complete! ${successCount}/${totalCount} configurations processed successfully`)
  } catch (err) {
    state.error = err.message
    showToast(err.message, "error")
  } finally {
    state.isLoading = false
    render()
  }
}

async function handleCopy(css, configName) {
  try {
    await navigator.clipboard.writeText(css)
    showToast(`${configName} CSS copied to clipboard`)
  } catch (err) {
    showToast("Failed to copy to clipboard", "error")
  }
}

function handleDownload(css, configName) {
  const blob = new Blob([css], { type: "text/css" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `critical-${configName.toLowerCase().replace(/\s+/g, "-")}.css`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  showToast(`${configName} CSS file downloaded`)
}

function handleDownloadAll() {
  const successfulResults = state.results.filter((r) => r.success)
  if (successfulResults.length === 0) return

  successfulResults.forEach((result) => {
    handleDownload(result.css, result.config.name)
  })
}

// Render functions
function renderConfigurationCard() {
  const desktopConfigs = Object.entries(presetConfigs).filter(([_, config]) => config.device === "desktop")
  const mobileConfigs = Object.entries(presetConfigs).filter(([_, config]) => config.device === "mobile")

  return `
    <div class="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Configuration</h2>
        <p class="text-gray-600">Enter a URL and select device configurations to generate critical CSS</p>
      </div>

      <div class="space-y-2">
        <label for="url" class="block text-sm font-medium text-gray-700">Website URL</label>
        <input
          id="url"
          type="url"
          placeholder="https://example.com"
          value="${state.url}"
          onchange="state.url = this.value; render();"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

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
                    <div class="text-sm text-gray-500">${config.width} × ${config.height}</div>
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
                    <div class="text-sm text-gray-500">${config.width} × ${config.height}</div>
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
          Selected: ${state.selectedConfigs.length} configuration${state.selectedConfigs.length !== 1 ? "s" : ""}
          ${state.combineDimensions ? " (will generate single combined CSS)" : ""}
        </div>
      </div>

      <button
        onclick="handleGenerate()"
        ${state.isLoading || !state.url || state.selectedConfigs.length === 0 ? "disabled" : ""}
        class="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ${
          state.isLoading
            ? `
          <i class="fas fa-spinner fa-spin mr-2"></i>
          Generating Critical CSS for ${state.selectedConfigs.length} device${state.selectedConfigs.length !== 1 ? "s" : ""}...
        `
            : `
          <i class="fas fa-bolt mr-2"></i>
          Generate Critical CSS (${state.selectedConfigs.length} device${state.selectedConfigs.length !== 1 ? "s" : ""})
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
  `
}

function renderResults() {
  if (state.results.length === 0) return ""

  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-gray-900">Generated Critical CSS</h2>
          <p class="text-gray-600">
            Critical CSS generated for ${state.results.length} configuration${state.results.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onclick="handleDownloadAll()"
          ${!state.results.some((r) => r.success) ? "disabled" : ""}
          class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <i class="fas fa-download mr-2"></i>Download All
        </button>
      </div>

      <div class="space-y-4">
        ${state.results
          .map(
            (result, index) => `
          <div class="border rounded-lg">
            <div class="p-4 border-b bg-gray-50">
              <div class="flex items-center gap-3">
                ${
                  result.success
                    ? '<i class="fas fa-check-circle text-green-500"></i>'
                    : '<i class="fas fa-times-circle text-red-500"></i>'
                }
                <div class="flex-1">
                  <div class="font-medium">${result.config.name}</div>
                  <div class="text-sm text-gray-500">
                    ${
                      result.combined
                        ? `Combined dimensions: ${result.config.dimensions?.map((d) => `${d.width}×${d.height}`).join(", ") || "Multiple"}`
                        : `${result.config.width} × ${result.config.height}`
                    }
                    ${result.success ? ` • ${formatFileSize(result.css.length)}` : " • Failed"}
                  </div>
                </div>
                <span class="px-2 py-1 text-xs rounded ${
                  result.config.device === "mobile"
                    ? "bg-green-100 text-green-800"
                    : result.config.device === "combined"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-blue-100 text-blue-800"
                }">
                  ${result.config.device === "combined" ? "Combined" : result.config.device}
                </span>
              </div>
            </div>
            
            <div class="p-4">
              ${
                result.success
                  ? `
                <div class="space-y-4">
                  <div class="flex gap-2">
                    <button
                      class="copy-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                      data-index="${index}"
                    >
                      <i class="fas fa-copy mr-1"></i>Copy
                    </button>
                    <button
                      class="download-btn px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                      data-index="${index}"
                    >
                      <i class="fas fa-download mr-1"></i>Download
                    </button>
                  </div>
                  <textarea
                    readonly
                    class="w-full h-48 p-3 font-mono text-sm border border-gray-300 rounded-md bg-gray-50"
                    placeholder="Critical CSS will appear here..."
                  >${result.css}</textarea>
                </div>
              `
                  : `
                <div class="p-4 bg-red-50 border border-red-200 rounded-md">
                  <p class="text-red-800 text-sm">
                    <strong>Error:</strong> ${result.error || "Unknown error occurred"}
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

      <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h4 class="font-medium text-blue-900 mb-2">How to use:</h4>
        <ol class="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Copy the generated CSS for each device type</li>
          <li>Inline the appropriate CSS in your HTML &lt;head&gt; based on device detection</li>
          <li>Load your full CSS asynchronously or defer it</li>
          <li>Test your page load performance improvements across devices</li>
        </ol>
      </div>
    </div>
  `
}

function render() {
  const app = document.getElementById("app")
  app.innerHTML = `
    <div class="max-w-6xl mx-auto p-4 space-y-6">
      <div class="text-center space-y-2">
        <div class="flex items-center justify-center gap-2">
          <i class="fas fa-bolt text-2xl text-blue-600"></i>
          <h1 class="text-3xl font-bold text-gray-900">Critical CSS Generator</h1>
        </div>
        <p class="text-gray-600">
          Extract critical above-the-fold CSS for multiple devices to improve page load performance
        </p>
      </div>

      ${renderConfigurationCard()}
      ${renderResults()}
    </div>
  `
  attachEventListeners()
}

function attachEventListeners() {
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = btn.dataset.index;
      const result = state.results[index];
      handleCopy(result.css, result.config.name);
    });
  });

  document.querySelectorAll(".download-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = btn.dataset.index;
      const result = state.results[index];
      handleDownload(result.css, result.config.name);
    });
  });
}

// Initialize the app
render()

// Make functions globally available
window.handleConfigToggle = handleConfigToggle
window.selectAllDesktop = selectAllDesktop
window.selectAllMobile = selectAllMobile
window.handleGenerate = handleGenerate
window.handleCopy = handleCopy
window.handleDownload = handleDownload
window.handleDownloadAll = handleDownloadAll
window.state = state
window.render = render
