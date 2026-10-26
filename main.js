// Configuration presets — standardized on first-fold desktop + mobile only,
// so critical CSS output stays consistent and predictably sized across
// projects (more combined viewports means a larger unioned critical CSS).
const presetConfigs = {
  "desktop-1920": {
    width: 1920,
    height: 1080,
    device: "desktop",
    name: "Desktop 1920x1080",
  },
  "mobile-393": {
    width: 393,
    height: 852,
    device: "mobile",
    name: "iPhone 16 (393x852)",
  },
};

// Elementos HTML / Seletores excluídos por padrão na geração do CSS crítico
// Seletores internos de modais e banners excluídos na análise do CSS crítico
const defaultExcludedSelectors = [
  ".modal",
  "#onetrust-banner-sdk",
  ".dropdown-content",
];

// State management
const state = {
  urls: [""],
  results: [],
  optimizedCSS: null,
  isLoading: false,
  error: "",
  combineDimensions: false,
  aggressivePruning: true,
  isolateFirstFold: true,
  batchProgress: null,
  currentJobId: null,
  lastJobId: null,
  captures: [],
  excludedSelectors: [...defaultExcludedSelectors],
  showBatchPaste: false,
};

// Minimalist OpenAI Toast Notification
function showToast(message, type = "success") {
  const existing = document.getElementById("openai-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "openai-toast";
  toast.className = `fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium border shadow-sm transition-all duration-200 transform translate-y-0 ${
    type === "error"
      ? "bg-paper text-obsidian border-rose-300 shadow-rose-100"
      : type === "info"
        ? "bg-paper text-obsidian border-hairline"
        : "bg-obsidian text-paper border-obsidian"
  }`;

  const dot =
    type === "error"
      ? '<span class="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>'
      : type === "info"
        ? '<span class="w-2 h-2 rounded-full bg-graphite shrink-0"></span>'
        : '<span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>';

  toast.innerHTML = `${dot}<span class="max-w-md truncate">${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "0KB";
  return (bytes / 1024).toFixed(1) + "KB";
}

// Editorial Budget Badge with restrained indicator dots
function renderBudgetBadge(budget) {
  if (!budget) return "";
  const gzipKb = (budget.gzipBytes / 1024).toFixed(1);
  if (budget.status === "optimal") {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-ash border border-hairline text-obsidian" title="${budget.message}">
      <span class="w-1.5 h-1.5 rounded-full bg-black"></span>
      <span>${gzipKb}KB gzip</span>
      <span class="text-graphite">· 1º RTT Ideal (&le;10KB)</span>
    </span>`;
  }
  if (budget.status === "warning") {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-ash border border-hairline text-obsidian" title="${budget.message}">
      <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
      <span>${gzipKb}KB gzip</span>
      <span class="text-graphite">· No Limite (10-14.6KB)</span>
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-ash border border-hairline text-obsidian" title="${budget.message}">
    <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
    <span>${gzipKb}KB gzip</span>
    <span class="text-graphite">· Excedido (&gt;14.6KB)</span>
  </span>`;
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
  setTimeout(() => {
    const inputs = document.querySelectorAll(".url-input");
    if (inputs.length > 0) {
      inputs[inputs.length - 1].focus();
    }
  }, 50);
}

function removeUrl(index) {
  if (state.urls.length > 1) {
    state.urls.splice(index, 1);
    render();
  }
}

function updateUrl(index, value) {
  state.urls[index] = value;
  const validCount = state.urls.map((u) => u.trim()).filter((u) => u !== "").length;
  const countEl = document.getElementById("valid-urls-count");
  if (countEl) {
    countEl.textContent = `${validCount} URL${validCount === 1 ? "" : "s"} válida${validCount === 1 ? "" : "s"} para processamento`;
  }
}

function clearUrls() {
  state.urls = [""];
  state.results = [];
  render();
  showToast("Lista limpa", "info");
}

function toggleBatchPaste() {
  state.showBatchPaste = !state.showBatchPaste;
  render();
  if (state.showBatchPaste) {
    setTimeout(() => {
      const textarea = document.getElementById("batch-paste-textarea");
      if (textarea) textarea.focus();
    }, 50);
  }
}

function applyBatchUrls(text) {
  const lines = text
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (lines.length > 0) {
    state.urls = lines;
    state.showBatchPaste = false;
    render();
    showToast(`${lines.length} URL${lines.length === 1 ? "" : "s"} carregada${lines.length === 1 ? "" : "s"} na lista.`);
  } else {
    showToast("Nenhuma URL identificada no texto.", "error");
  }
}

function handlePasteUrls(e, index) {
  const pasteData = (e.clipboardData || window.clipboardData)?.getData("text");
  if (pasteData && (pasteData.includes("\n") || pasteData.includes("\r"))) {
    e.preventDefault();
    const lines = pasteData
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (lines.length > 0) {
      const before = state.urls.slice(0, index);
      const after = state.urls.slice(index + 1);
      state.urls = [...before, ...lines, ...after];
      render();
      showToast(`${lines.length} URLs adicionadas com sucesso.`);
    }
  }
}

// Batch processing
async function handleBatchGenerate() {
  const validUrls = state.urls.map((u) => u.trim()).filter((u) => u !== "");

  if (validUrls.length === 0) {
    state.error = "Por favor, insira pelo menos uma URL válida.";
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
    const configs = Object.values(presetConfigs);
    const jobId = `batch_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    state.currentJobId = jobId;

    showToast(
      `Iniciando extração de CSS para ${validUrls.length} URLs...`,
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
        excludedSelectors: state.excludedSelectors,
        aggressivePruning: state.aggressivePruning,
        isolateFirstFold: state.isolateFirstFold,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Falha ao gerar o CSS crítico");
    }

    state.results = data.results;
    state.optimizedCSS = data.optimizedCSS || [];
    state.batchProgress = null;
    state.lastJobId = data.jobId;

    const { summary } = data;
    showToast(
      `Concluído! ${summary.successfulUrls}/${summary.totalUrls} URLs processadas com sucesso.`,
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
function buildHtmlMediaBlock(urlResult) {
  if (!urlResult || !urlResult.configs) return "";

  const mobileConfig = urlResult.configs.find(
    (c) =>
      c.success &&
      (c.config?.device === "mobile" ||
        (c.config?.width && c.config.width < 768)),
  );
  const desktopConfig = urlResult.configs.find(
    (c) =>
      c.success &&
      (c.config?.device === "desktop" ||
        (c.config?.width && c.config.width >= 768)),
  );

  if (mobileConfig && desktopConfig) {
    return `<!-- ======================================================== -->\n<!-- 1. CSS Crítico Mobile (≤991.98px) • ${formatFileSize(
      mobileConfig.gzipSize,
    )} gzip -->\n<!-- ======================================================== -->\n<style media="(max-width: 991.98px)">\n${
      mobileConfig.css
    }\n</style>\n\n<!-- ======================================================== -->\n<!-- 2. CSS Crítico Desktop (≥992px) • ${formatFileSize(
      desktopConfig.gzipSize,
    )} gzip -->\n<!-- ======================================================== -->\n<style media="(min-width: 992px)">\n${
      desktopConfig.css
    }\n</style>`;
  }

  const single = urlResult.configs.find((c) => c.success);
  if (single) {
    return `<style>\n${single.css}\n</style>`;
  }
  return "";
}

async function handleCopyHtmlBlock(urlResult, btn) {
  const block = buildHtmlMediaBlock(urlResult);
  if (!block) return;
  try {
    await navigator.clipboard.writeText(block);
    showToast("Bloco Drupal copiado para a área de transferência.");
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML =
        '<i class="fas fa-check text-xs"></i> <span>Copiado!</span>';
      setTimeout(() => {
        btn.innerHTML = origHtml;
      }, 2000);
    }
  } catch (err) {
    showToast("Falha ao copiar bloco HTML", "error");
  }
}

function handleDownloadHtmlBlock(urlResult) {
  const block = buildHtmlMediaBlock(urlResult);
  if (!block) return;
  const parsedUrl = new URL(urlResult.url);
  const hostname = parsedUrl.hostname.replace(/\./g, "-");
  const pathname = parsedUrl.pathname
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = pathname ? `-${pathname}` : "";
  const filename = `critical-block-${hostname}${suffix}.html`;

  const blob = new Blob([block], { type: "text/html" });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
  showToast(`Bloco HTML baixado: ${filename}`);
}

function handleDownloadAll() {
  let downloadCount = 0;
  state.results.forEach((urlResult) => {
    if (urlResult.success) {
      handleDownloadHtmlBlock(urlResult);
      downloadCount++;
    }
  });

  if (downloadCount > 0) {
    showToast(`Baixados ${downloadCount} arquivos de bloco Drupal (.html)`);
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

  showToast("Resultados exportados em JSON");
}

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
      throw new Error(data.error || "Falha ao reprocessar");
    }

    const retriedByUrl = new Map(data.results.map((r) => [r.url, r]));
    state.results = state.results.map((r) => retriedByUrl.get(r.url) || r);
    state.lastJobId = data.jobId;

    showToast(
      `Reprocessamento: ${data.summary.successfulUrls}/${data.summary.totalUrls} executadas.`,
    );
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    state.isLoading = false;
    render();
  }
}

// Manual capture bookmarklet
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
    showToast("Captura manual removida");
  } catch (err) {
    showToast("Falha ao remover captura", "error");
  }
}

// -------------------------------------------------------------
// Component Renderers (OpenAI Style Guide)
// -------------------------------------------------------------

function renderTopNav() {
  return `
    <header class="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b border-hairline">
      <div class="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium tracking-tight text-obsidian">Critical CSS</span>
          <span class="text-[11px] font-medium tracking-normal text-graphite px-2 py-0.5 rounded-full border border-hairline bg-ash/50">
            Drupal 1st Fold
          </span>
        </div>

        <nav class="flex items-center gap-2 sm:gap-4">
          <a href="#config-section" class="btn-ghost text-xs hidden md:inline-flex text-graphite hover:text-obsidian">Configurações</a>
          <a href="#capture-section" class="btn-ghost text-xs hidden md:inline-flex text-graphite hover:text-obsidian">Captura Manual</a>
          
          <button
            onclick="handleBatchGenerate()"
            ${state.isLoading ? "disabled" : ""}
            class="btn-filled text-xs !py-1.5 !px-4"
          >
            ${state.isLoading ? '<i class="fas fa-spinner fa-spin text-xs"></i> Gerando...' : "Gerar CSS"}
          </button>
        </nav>
      </div>
    </header>
  `;
}

function renderHero() {
  const hasUrls = state.urls.some((u) => u.trim() !== "");

  return `
    <section class="pt-12 pb-8 sm:pt-16 sm:pb-12 text-left space-y-5">
      <div class="space-y-3">
        <div class="text-xs uppercase tracking-wider font-medium text-graphite">Research &amp; Performance Lab</div>
        <h1 class="text-[34px] sm:text-[44px] md:text-[48px] font-medium text-obsidian tracking-[-1.44px] leading-[1.12]">
          Critical CSS Generator
        </h1>
        <p class="text-graphite text-[17px] leading-[1.65] tracking-[-0.18px] max-w-2xl font-normal">
          Extração padronizada de CSS da primeira dobra para blocos Drupal. Segregação limpa entre Mobile (&le;991.98px) e Desktop (&ge;992px), com isolamento estrito para respeitar o orçamento TCP de 14.6KB gzip.
        </p>
      </div>

      <!-- Quick action chip row (Bases prontas) -->
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button
          onclick="addUrl()"
          class="btn-outline text-xs !py-1.5 !px-3.5"
        >
          + Adicionar URL
        </button>
        <button
          onclick="toggleBatchPaste()"
          class="btn-outline text-xs !py-1.5 !px-3.5"
        >
          <i class="fas fa-list-ul text-xs text-graphite mr-1"></i>
          <span>${state.showBatchPaste ? "Fechar Colar em Lote" : "Colar em Lote"}</span>
        </button>
        ${
          hasUrls || state.urls.length > 1
            ? `
          <button
            onclick="clearUrls()"
            class="btn-ghost text-xs text-graphite hover:text-obsidian !py-1.5 !px-3"
          >
            Limpar lista
          </button>
        `
            : ""
        }
      </div>
    </section>
  `;
}

function renderUrlsSection() {
  const validCount = state.urls.filter((u) => u.trim() !== "").length;

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-1 flex-wrap gap-2">
        <div>
          <label class="text-sm font-medium text-obsidian">URLs de Destino</label>
          <p class="text-xs text-graphite mt-0.5">Páginas que terão o CSS crítico extraído para primeira dobra</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            onclick="toggleBatchPaste()"
            class="btn-outline text-xs !py-1.5 !px-3"
          >
            <i class="fas fa-list-ul text-xs text-graphite mr-1"></i>
            <span>${state.showBatchPaste ? "Modo Individual" : "Colar em Lote"}</span>
          </button>
          <button
            onclick="addUrl()"
            class="btn-outline text-xs !py-1.5 !px-3"
          >
            + Adicionar URL
          </button>
        </div>
      </div>

      ${
        state.showBatchPaste
          ? `
        <div class="p-4 border border-hairline rounded-[6px] bg-ash/30 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-obsidian">Cole uma lista de URLs (uma por linha):</span>
            <span class="text-[11px] text-graphite">Linhas vazias serão ignoradas</span>
          </div>
          <textarea
            id="batch-paste-textarea"
            rows="6"
            class="w-full font-mono text-xs p-3 bg-paper text-obsidian rounded-[6px] border border-hairline focus:outline-none focus:border-obsidian selection:bg-ash resize-y"
            placeholder="https://example.com/pagina-1&#10;https://example.com/pagina-2&#10;https://example.com/pagina-3"
          ></textarea>
          <div class="flex items-center justify-end gap-2">
            <button
              onclick="toggleBatchPaste()"
              class="btn-ghost text-xs !py-1.5 !px-3"
            >
              Cancelar
            </button>
            <button
              onclick="applyBatchUrls(document.getElementById('batch-paste-textarea').value)"
              class="btn-filled text-xs !py-1.5 !px-4"
            >
              Aplicar URLs
            </button>
          </div>
        </div>
      `
          : `
        <div class="space-y-2.5">
          ${state.urls
            .map(
              (url, index) => `
            <div class="relative flex items-center group">
              <span class="absolute left-4 font-mono text-xs text-smoke select-none pointer-events-none">
                ${(index + 1).toString().padStart(2, "0")}
              </span>
              <input
                type="url"
                placeholder="https://example.com/pagina"
                value="${url}"
                oninput="updateUrl(${index}, this.value)"
                onkeydown="if(event.key === 'Enter'){ event.preventDefault(); addUrl(); }"
                onpaste="handlePasteUrls(event, ${index})"
                class="url-input input-prompt w-full pl-12 pr-12 text-sm text-obsidian placeholder:text-smoke bg-paper hover:border-black/30 transition-colors"
              />
              ${
                state.urls.length > 1
                  ? `
                <button
                  onclick="removeUrl(${index})"
                  class="absolute right-3 p-1.5 text-smoke hover:text-obsidian rounded-full hover:bg-ash transition-colors"
                  title="Remover URL"
                >
                  <i class="fas fa-times text-xs"></i>
                </button>
              `
                  : ""
              }
            </div>
          `,
            )
            .join("")}
        </div>
      `
      }

      <div class="flex items-center justify-between pt-1 text-xs text-graphite">
        <span id="valid-urls-count">${validCount} URL${validCount === 1 ? "" : "s"} válida${validCount === 1 ? "" : "s"} para processamento</span>
        ${
          !state.showBatchPaste
            ? `
          <button
            onclick="addUrl()"
            class="text-obsidian font-medium hover:underline cursor-pointer"
          >
            + Adicionar mais uma URL
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function renderConfigurationCard() {
  const validUrls = state.urls.filter((url) => url.trim() !== "");

  return `
    <div id="config-section" class="card-editorial p-6 sm:p-8 space-y-8">
      <div>
        <h2 class="text-[22px] font-medium text-obsidian tracking-[-0.22px]">Configuração do Motor</h2>
        <p class="text-graphite text-sm mt-1">Defina as regras de extração e otimização para o bloco Drupal</p>
      </div>

      ${renderUrlsSection()}

      <!-- CSS Separation Mode -->
      <div class="space-y-3 pt-4 border-t border-hairline">
        <label class="text-sm font-medium text-obsidian">Modo de Separação de CSS</label>
        
        <div class="inline-flex p-1 bg-ash rounded-full border border-hairline">
          <button
            type="button"
            onclick="state.combineDimensions = false; render();"
            class="px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              !state.combineDimensions
                ? "bg-paper text-obsidian shadow-sm border border-hairline"
                : "text-graphite hover:text-obsidian"
            }"
          >
            Separar Mobile e Desktop (Recomendado Drupal)
          </button>
          <button
            type="button"
            onclick="state.combineDimensions = true; render();"
            class="px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              state.combineDimensions
                ? "bg-paper text-obsidian shadow-sm border border-hairline"
                : "text-graphite hover:text-obsidian"
            }"
          >
            Combinar em arquivo único
          </button>
        </div>
      </div>

      <!-- Viewports preset chips -->
      <div class="space-y-3 pt-4 border-t border-hairline">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-obsidian">Viewports de Primeira Dobra</label>
          <span class="text-xs text-graphite">Padronizado · 2 resoluções</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${Object.values(presetConfigs)
            .map(
              (config) => `
            <div class="p-3.5 border border-hairline rounded-[6px] bg-paper flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i class="fas ${
                  config.device === "mobile"
                    ? "fa-mobile-screen text-obsidian"
                    : "fa-desktop text-obsidian"
                } text-sm"></i>
                <div>
                  <div class="text-sm font-medium text-obsidian">${config.name}</div>
                  <div class="text-xs text-graphite">${config.width} &times; ${config.height}px</div>
                </div>
              </div>
              <span class="text-[11px] font-mono text-graphite px-2 py-0.5 rounded-full bg-ash border border-hairline">
                ${config.device === "mobile" ? "&le;991.98px" : "&ge;992px"}
              </span>
            </div>
          `,
            )
            .join("")}
        </div>
        <p class="text-xs text-graphite">
          Configuração fixa para manter o CSS cirúrgico e evitar inchaço do pacote com viewports intermediários.
        </p>
      </div>

      <!-- Performance & TCP Budget Controls -->
      <div class="space-y-4 pt-4 border-t border-hairline">
        <label class="text-sm font-medium text-obsidian flex items-center gap-2">
          <span>Otimizações Avançadas de Performance</span>
        </label>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="flex items-start p-4 border border-hairline rounded-[6px] bg-paper hover:bg-ash/40 cursor-pointer transition">
            <input
              type="checkbox"
              ${state.aggressivePruning ? "checked" : ""}
              onchange="state.aggressivePruning = this.checked; render();"
              class="mt-0.5 mr-3 h-4 w-4 rounded accent-black cursor-pointer"
            />
            <div class="space-y-1">
              <div class="text-sm font-medium text-obsidian">Poda Agressiva de Regras</div>
              <div class="text-xs text-graphite leading-relaxed">
                Remove pseudo-classes (:hover, :active), regras @media print e variáveis CSS :root não referenciadas na primeira dobra. Reduz em até 60% o peso final.
              </div>
            </div>
          </label>

          <label class="flex items-start p-4 border border-hairline rounded-[6px] bg-paper hover:bg-ash/40 cursor-pointer transition">
            <input
              type="checkbox"
              ${state.isolateFirstFold ? "checked" : ""}
              onchange="state.isolateFirstFold = this.checked; render();"
              class="mt-0.5 mr-3 h-4 w-4 rounded accent-black cursor-pointer"
            />
            <div class="space-y-1">
              <div class="text-sm font-medium text-obsidian">Isolar Estritamente a 1ª Dobra</div>
              <div class="text-xs text-graphite leading-relaxed">
                Desativa o scroll prévio pelo navegador sem cabeça, impedindo que carrosséis inferiores, modais e scripts lazy injetem regras no CSS crítico.
              </div>
            </div>
          </label>
        </div>

        <!-- TCP 14.6KB Guidance note -->
        <div class="p-4 bg-ash/60 border border-hairline rounded-[6px] text-xs text-graphite flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="w-2 h-2 rounded-full bg-obsidian shrink-0"></span>
            <span>
              <strong class="text-obsidian font-medium">Janela Inicial TCP (initcwnd):</strong> 
              Teto estrito de 14.6KB gzip por viewport. Meta ideal &le; 10KB para ser entregue com o HTML inicial no primeiro RTT.
            </span>
          </div>
          <span class="font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-paper border border-hairline text-obsidian font-medium">
            Teto: 14.6KB Gzip
          </span>
        </div>
      </div>

      <!-- Processing indicator / progress bar -->
      ${
        state.batchProgress
          ? `
        <div class="space-y-2 pt-2">
          <div class="flex items-center justify-between text-xs text-graphite">
            <span class="font-medium text-obsidian">Processando URLs com navegador automatizado...</span>
            <span class="font-mono">${state.batchProgress.completed} / ${state.batchProgress.total}</span>
          </div>
          <div class="w-full bg-ash rounded-full h-1.5 overflow-hidden">
            <div 
              class="bg-obsidian h-full transition-all duration-300 rounded-full" 
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

      <!-- Primary Action CTA: Sole filled button in the page -->
      <div class="pt-2">
        <button
          onclick="handleBatchGenerate()"
          ${state.isLoading || validUrls.length === 0 ? "disabled" : ""}
          class="btn-filled w-full !py-3.5 text-sm"
        >
          ${
            state.isLoading
              ? `
            <i class="fas fa-spinner fa-spin text-xs"></i>
            <span>Processando ${validUrls.length} URL${validUrls.length === 1 ? "" : "s"}...</span>
          `
              : `
            <span>Gerar CSS Crítico para ${validUrls.length} URL${validUrls.length === 1 ? "" : "s"}</span>
            <i class="fas fa-arrow-right text-xs"></i>
          `
          }
        </button>
      </div>

      ${
        state.error
          ? `
        <div class="p-4 border border-rose-200 bg-rose-50/50 rounded-[6px] text-xs text-rose-800 flex items-start gap-2">
          <i class="fas fa-circle-exclamation mt-0.5"></i>
          <span>${state.error}</span>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function renderResults() {
  if (state.results.length === 0) return "";

  const successfulUrls = state.results.filter((r) => r.success).length;

  return `
    <div id="results-section" class="card-editorial p-6 sm:p-8 space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-4 pb-2 border-b border-hairline">
        <div>
          <h2 class="text-[24px] font-semibold text-obsidian tracking-[0.31px]">CSS Crítico para Bloco Drupal</h2>
          <p class="text-graphite text-xs mt-1">
            ${successfulUrls} de ${state.results.length} URLs processadas com sucesso · Pronto para produção
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          ${
            state.results.some((r) => !r.success) && state.lastJobId
              ? `
            <button
              onclick="handleRetryFailed()"
              ${state.isLoading ? "disabled" : ""}
              class="btn-outline text-xs !py-1.5 !px-3"
            >
              <i class="fas fa-redo text-xs"></i> Reprocessar falhas
            </button>
          `
              : ""
          }
          <button
            onclick="exportBatchResults()"
            class="btn-outline text-xs !py-1.5 !px-3"
          >
            Exportar JSON
          </button>
          <button
            onclick="handleDownloadAll()"
            ${successfulUrls === 0 ? "disabled" : ""}
            class="btn-outline text-xs !py-1.5 !px-3 font-medium !bg-ash/70 hover:!bg-ash"
          >
            <i class="fas fa-download text-xs"></i> Baixar Todos (.html)
          </button>
        </div>
      </div>

      <!-- Results list -->
      <div class="space-y-5">
        ${state.results
          .map((urlResult, urlIndex) => {
            const mobileConfig = urlResult.configs?.find(
              (c) =>
                c.success &&
                (c.config?.device === "mobile" ||
                  (c.config?.width && c.config.width < 768)),
            );
            const desktopConfig = urlResult.configs?.find(
              (c) =>
                c.success &&
                (c.config?.device === "desktop" ||
                  (c.config?.width && c.config.width >= 768)),
            );

            return `
          <div class="border border-hairline rounded-[6px] overflow-hidden bg-paper">
            <!-- URL Header -->
            <div class="p-4 bg-ash/30 border-b border-hairline flex items-center justify-between flex-wrap gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full shrink-0 ${
                  urlResult.success
                    ? "bg-emerald-500"
                    : urlResult.blocked
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }"></span>
                <div class="min-w-0">
                  <div class="font-medium text-sm text-obsidian truncate">
                    ${new URL(urlResult.url).hostname}
                  </div>
                  <div class="text-xs text-graphite truncate font-mono mt-0.5" title="${urlResult.url}">
                    ${urlResult.url} ${
                      urlResult.processingTime
                        ? `· ${formatTime(urlResult.processingTime)}`
                        : ""
                    }
                  </div>
                </div>
              </div>

              <!-- Viewport budget badges -->
              <div class="flex items-center gap-2 flex-wrap">
                ${
                  mobileConfig
                    ? `
                  <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper border border-hairline text-xs">
                    <i class="fas fa-mobile-screen text-xs text-graphite"></i>
                    <span class="text-graphite">Mobile:</span>
                    <strong class="text-obsidian font-medium font-mono">${formatFileSize(
                      mobileConfig.gzipSize,
                    )}</strong>
                    ${
                      mobileConfig.budget
                        ? renderBudgetBadge(mobileConfig.budget)
                        : ""
                    }
                  </div>
                `
                    : ""
                }
                ${
                  desktopConfig
                    ? `
                  <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper border border-hairline text-xs">
                    <i class="fas fa-desktop text-xs text-graphite"></i>
                    <span class="text-graphite">Desktop:</span>
                    <strong class="text-obsidian font-medium font-mono">${formatFileSize(
                      desktopConfig.gzipSize,
                    )}</strong>
                    ${
                      desktopConfig.budget
                        ? renderBudgetBadge(desktopConfig.budget)
                        : ""
                    }
                  </div>
                `
                    : ""
                }
                <span class="px-2.5 py-1 text-xs font-medium rounded-full border border-hairline ${
                  urlResult.success
                    ? "bg-paper text-obsidian"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }">
                  ${
                    urlResult.success
                      ? "Sucesso"
                      : urlResult.blocked
                        ? "Bloqueado"
                        : "Falhou"
                  }
                </span>
              </div>
            </div>

            ${
              urlResult.error
                ? `
              <div class="p-4 bg-rose-50/50 border-t border-rose-200 text-xs text-rose-800">
                <strong>Erro:</strong> ${urlResult.error}
              </div>
            `
                : ""
            }

            ${
              urlResult.success
                ? `
              <div class="p-4 space-y-3">
                <!-- Drupal Block HTML Snippet Container -->
                <div class="border border-hairline rounded-[6px] overflow-hidden bg-[#0d0d0f] text-[#f4f4f5]">
                  <div class="px-4 py-2.5 bg-[#17171a] border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span class="font-medium text-xs text-white">Código HTML para Bloco Drupal (&lt;style media&gt;)</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        class="copy-html-block-btn px-3 py-1 text-xs rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                        data-url-index="${urlIndex}"
                        title="Copiar snippet completo para o Drupal"
                      >
                        <i class="fas fa-copy text-xs"></i>
                        <span>Copiar Bloco</span>
                      </button>
                      <button
                        class="download-html-block-btn px-3 py-1 text-xs rounded-full bg-transparent hover:bg-white/10 text-white/80 border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                        data-url-index="${urlIndex}"
                        title="Baixar arquivo .html com o bloco"
                      >
                        <i class="fas fa-download text-xs"></i>
                        <span>Baixar .html</span>
                      </button>
                    </div>
                  </div>
                  <div class="p-3">
                    <textarea
                      readonly
                      rows="10"
                      class="w-full font-mono text-xs p-3 bg-transparent text-[#e4e4e7] border-0 focus:outline-none selection:bg-white/20 resize-y leading-relaxed"
                      spellcheck="false"
                    >${buildHtmlMediaBlock(urlResult)}</textarea>
                  </div>
                  <div class="px-4 py-2 bg-[#121214] border-t border-white/5 flex items-center justify-between text-[11px] text-[#a1a1aa] flex-wrap gap-2">
                    <span>Separação Mobile (&le;991.98px) e Desktop (&ge;992px) via <code>&lt;style media&gt;</code>. Render instantâneo sem FOUC.</span>
                    <span class="font-mono text-white/70">Target: &le; 14.6KB gzip</span>
                  </div>
                </div>
              </div>
            `
                : ""
            }
          </div>
        `;
          })
          .join("")}
      </div>

      <!-- Drupal Deployment Guide Card -->
      <div class="p-5 border border-hairline rounded-[6px] bg-ash/40 space-y-2">
        <div class="text-xs font-semibold text-obsidian uppercase tracking-wider">Como aplicar no Drupal</div>
        <ol class="list-decimal list-inside space-y-1 text-xs text-graphite leading-relaxed">
          <li>Crie ou edite um bloco personalizado no Drupal (ex: <em>Bloco de CSS Crítico</em>).</li>
          <li>Configure o Formato de Texto como <strong class="text-obsidian font-medium">Full HTML</strong> (para habilitar tags <code>&lt;style&gt;</code>).</li>
          <li>Cole o código copiado acima no corpo do bloco e posicione na região de Topo (Header).</li>
          <li>Ao carregar a folha completa de estilos assincronamente com <code>rel="preload"</code> e <code>onload</code>, este bloco evita Layout Shifts (CLS) e elimina bloqueio de renderização (FCP).</li>
        </ol>
      </div>
    </div>
  `;
}

function renderManualCaptureSection() {
  const bookmarkletHref = buildBookmarklet();

  return `
    <div id="capture-section" class="card-editorial p-6 sm:p-8 space-y-5">
      <div>
        <h2 class="text-[22px] font-medium text-obsidian tracking-[-0.22px]">Captura Manual (Domínios com WAF / Anti-bot)</h2>
        <p class="text-graphite text-sm mt-1 leading-relaxed">
          Para páginas protegidas por Cloudflare Turnstile, Akamai ou Datadome que barram navegadores automatizados, arraste o botão abaixo para a sua barra de favoritos. Abra a URL desejada no seu navegador comum e clique nele: o HTML real e CSS compilado serão enviados diretamente para este painel.
        </p>
      </div>

      <div>
        <a
          href="${bookmarkletHref}"
          onclick="return false;"
          class="btn-outline text-xs !py-2 !px-4 cursor-move inline-flex items-center gap-2"
          title="Arraste para a barra de favoritos do navegador"
        >
          <i class="fas fa-bookmark text-xs text-graphite"></i>
          <span>Capturar Página Crítica (arraste para os Favoritos)</span>
        </a>
      </div>

      ${
        state.captures.length > 0
          ? `
        <div class="space-y-3 pt-3 border-t border-hairline">
          <div class="text-xs font-medium text-obsidian uppercase tracking-wider">
            Páginas Capturadas Manualmente (${state.captures.length})
          </div>
          <div class="space-y-2">
            ${state.captures
              .map(
                (capture) => `
              <div class="flex items-center justify-between p-3 border border-hairline rounded-[6px] bg-paper text-xs">
                <span class="truncate flex-1 mr-3 font-mono text-obsidian" title="${capture.url}">${capture.url}</span>
                <span class="text-graphite font-mono mr-3 whitespace-nowrap">${formatFileSize(capture.size)}</span>
                <button
                  class="delete-capture-btn p-1.5 text-smoke hover:text-rose-600 rounded hover:bg-ash transition-colors"
                  data-url="${capture.url}"
                  title="Excluir captura"
                >
                  <i class="fas fa-trash text-xs"></i>
                </button>
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
  `;
}

function renderFooter() {
  return `
    <footer class="mt-16 border-t border-hairline py-12 text-center text-xs text-graphite">
      <div class="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span>Critical CSS Generator</span>
          <span class="mx-2">·</span>
          <span>OpenAI Design System Reference</span>
        </div>
        <div class="text-smoke">
          Foco em Performance Web &amp; Core Web Vitals (LCP, CLS, FCP)
        </div>
      </div>
    </footer>
  `;
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    ${renderTopNav()}
    <main class="max-w-[1200px] w-full mx-auto px-6 py-6 space-y-10 flex-1">
      ${renderHero()}
      ${renderConfigurationCard()}
      ${renderResults()}
      ${renderManualCaptureSection()}
    </main>
    ${renderFooter()}
  `;

  attachEventListeners();
}

function attachEventListeners() {
  document.querySelectorAll(".copy-html-block-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const urlResult = state.results[btn.dataset.urlIndex];
      handleCopyHtmlBlock(urlResult, btn);
    });
  });

  document.querySelectorAll(".download-html-block-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const urlResult = state.results[btn.dataset.urlIndex];
      handleDownloadHtmlBlock(urlResult);
    });
  });

  document.querySelectorAll(".delete-capture-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleDeleteCapture(btn.dataset.url);
    });
  });
}

// Initialization
render();
loadCaptures();

// Global assignments for inline event handlers
window.addUrl = addUrl;
window.removeUrl = removeUrl;
window.clearUrls = clearUrls;
window.updateUrl = updateUrl;
window.toggleBatchPaste = toggleBatchPaste;
window.applyBatchUrls = applyBatchUrls;
window.handlePasteUrls = handlePasteUrls;
window.handleBatchGenerate = handleBatchGenerate;
window.handleCopyHtmlBlock = handleCopyHtmlBlock;
window.handleDownloadHtmlBlock = handleDownloadHtmlBlock;
window.handleDownloadAll = handleDownloadAll;
window.exportBatchResults = exportBatchResults;
window.handleRetryFailed = handleRetryFailed;
window.state = state;
window.render = render;
