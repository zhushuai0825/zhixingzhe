const API_BASE = "http://127.0.0.1:8000";

const state = {
  currentView: "dashboard",
  taskFilter: "all",
  priorityFilter: "all",
  activeSessionId: null,
  activeAnswer: "",
  activeKnowledgeBaseId: null,
  knowledgeBases: [],
  documentsByKb: {},
  documents: [],
  documentFilterKbId: "",
  documentSearch: "",
  activeDocumentId: null,
  activeDocument: null,
  tasks: [],
  sessions: [],
  messages: [],
  citations: [],
  modelConfigs: [],
  generatedTasks: [],
  chatWarning: null,
  analytics: null,
  charts: {},
  githubTrendFilter: "github_python",
  hfTrendFilter: "hf_papers",
  trendExplainUrl: null,
  trendExplainSource: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === "string" ? detail : detail?.message || response.statusText;
    throw new Error(message);
  }
  return data;
}

function switchView(viewId) {
  state.currentView = viewId;
  document.body.classList.toggle("screen-mode", viewId === "visualization");
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewId === "visualization") {
    loadAnalytics().then(() => {
      renderVisualization();
      window.setTimeout(resizeScreen, 80);
    }).catch(() => {});
  }
  if (viewId === "trendExplain") {
    loadTrendExplanationDetail();
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

async function loadAll() {
  try {
    const [knowledgeBases, tasks, sessions, modelConfigs] = await Promise.all([
      api("/api/knowledge-bases"),
      api("/api/tasks"),
      api("/api/chat/sessions"),
      api("/api/model-configs"),
    ]);
    state.knowledgeBases = knowledgeBases;
    state.tasks = tasks;
    state.sessions = sessions;
    state.modelConfigs = modelConfigs;
    if (!state.activeKnowledgeBaseId && knowledgeBases[0]) {
      state.activeKnowledgeBaseId = knowledgeBases[0].id;
    }
    await loadDocumentsForVisibleKbs();
    await loadDocuments();
    await loadAnalytics();
    renderAll();
  } catch (error) {
    renderBackendOffline(error.message);
  }
}

async function loadDocuments() {
  const params = new URLSearchParams();
  if (state.documentFilterKbId) params.set("knowledge_base_id", state.documentFilterKbId);
  if (state.documentSearch) params.set("q", state.documentSearch);
  const path = `/api/documents${params.toString() ? `?${params.toString()}` : ""}`;
  state.documents = await api(path);
  if (state.activeDocumentId) {
    const exists = state.documents.some((doc) => doc.id === state.activeDocumentId);
    if (!exists) {
      state.activeDocumentId = null;
      state.activeDocument = null;
    }
  }
}

async function loadAnalytics() {
  try {
    state.analytics = await api("/api/analytics/overview");
  } catch {
    state.analytics = null;
  }
}

async function refreshLiveTrends() {
  const liveTrends = await api("/api/live-trends?force=true");
  if (!state.analytics) {
    await loadAnalytics();
  }
  state.analytics = {
    ...(state.analytics || {}),
    live_trends: liveTrends,
  };
}

async function importLiveTrends() {
  const button = $("#saveLiveTrendsBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "入库中";
  try {
    const result = await api("/api/live-trends/import", { method: "POST" });
    const [knowledgeBases, documents, analytics] = await Promise.all([
      api("/api/knowledge-bases"),
      api("/api/documents"),
      api("/api/analytics/overview?live=true"),
    ]);
    state.knowledgeBases = knowledgeBases;
    state.documents = documents;
    state.analytics = analytics;
    await loadDocumentsForVisibleKbs();
    switchView("visualization");
    renderDashboard();
    renderKnowledgeBases();
    renderDocuments();
    renderVisualization();
    showToast(
      `已入库 ${result.imported.length} 份实时趋势文档；MiniMax 在后台为每条趋势生成解释，可随时点「解释」查看。`,
    );
  } catch (error) {
    showToast(`入库失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function loadDocumentsForVisibleKbs() {
  const entries = await Promise.all(
    state.knowledgeBases.map(async (kb) => {
      try {
        return [kb.id, await api(`/api/knowledge-bases/${kb.id}/documents`)];
      } catch {
        return [kb.id, []];
      }
    }),
  );
  state.documentsByKb = Object.fromEntries(entries);
}

function renderBackendOffline(message) {
  $("#metricKb").textContent = "0";
  $("#metricDocs").textContent = "0";
  $("#metricChats").textContent = "0";
  $("#metricTasks").textContent = "0";
  renderTaskProgress();
  $("#dashboardKbList").innerHTML = `<p class="empty-text">后端没有连上：${escapeHtml(message)}。请先启动 backend 服务。</p>`;
  $("#dashboardTasks").innerHTML = "";
  $("#kbGrid").innerHTML = "";
  $("#chatMessages").innerHTML = `<article class="message assistant">后端未连接。请启动 http://127.0.0.1:8000 后刷新页面。</article>`;
  $("#taskBoard").innerHTML = "";
  $("#answerWordCloud").innerHTML = `<p class="empty-text">后端未连接，暂无大屏数据。</p>`;
}

function renderDashboard() {
  $("#metricKb").textContent = state.knowledgeBases.length;
  $("#metricDocs").textContent = state.knowledgeBases.reduce((sum, item) => sum + item.document_count, 0);
  $("#metricChats").textContent = state.sessions.length;
  $("#metricTasks").textContent = state.tasks.filter((task) => task.status !== "done" && task.status !== "canceled").length;
  $("#metricKbHint").textContent = state.knowledgeBases.length ? `最近更新 ${formatDate(state.knowledgeBases[0].updated_at)}` : "暂无真实数据";
  $("#metricDocsHint").textContent = "已保存到 SQLite";
  $("#metricChatsHint").textContent = state.sessions.length ? "会话已保存" : "暂无真实数据";
  $("#metricTasksHint").textContent = state.tasks.length ? `${state.tasks.filter((task) => task.status === "done").length} 个已完成` : "暂无真实数据";
  renderTaskProgress();

  $("#dashboardKbList").innerHTML =
    state.knowledgeBases
      .slice(0, 10)
      .map(
        (kb) => `
          <article class="kb-row" data-kb-documents="${kb.id}">
            <div>
              <strong>${escapeHtml(kb.name)}</strong>
              <span>${kb.document_count} 个文档 · ${formatDate(kb.updated_at)}</span>
            </div>
            <span class="badge">知识库</span>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">还没有知识库，先点右上角新建一个。</p>`;

  $$("[data-kb-documents]").forEach((item) => {
    item.addEventListener("click", () => openDocumentsForKb(item.dataset.kbDocuments));
  });

  $("#dashboardTasks").innerHTML =
    state.tasks
      .filter((task) => task.status !== "done")
      .slice(0, 4)
      .map(
        (task) => `
          <article class="task-line">
            <div>
              <strong>${escapeHtml(task.title)}</strong>
              <span>${sourceText(task.source_type)}</span>
            </div>
            <span class="badge ${task.priority === "high" ? "warn" : ""}">${priorityText(task.priority)}</span>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">暂无待办任务。</p>`;
}

function renderKnowledgeBases() {
  const sort = $("#kbSort").value;
  let list = [...state.knowledgeBases];
  if (sort === "docs") list.sort((a, b) => b.document_count - a.document_count);
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  $("#kbGrid").innerHTML =
    list
      .map((kb) => {
        const docs = state.documentsByKb[kb.id] || [];
        return `
          <article class="kb-card">
            <span class="badge">${docs.length ? "有文档" : "空知识库"}</span>
            <div>
              <h3>${escapeHtml(kb.name)}</h3>
              <p>${escapeHtml(kb.description || "暂无描述")}</p>
            </div>
            <div class="doc-pills">${
              docs.slice(0, 3).map((doc) => `<span>${escapeHtml(doc.file_name)}</span>`).join("") ||
              `<span>等待上传</span>`
            }</div>
            <div class="kb-card-footer">
              <span>${kb.document_count} 个文档 · ${formatDate(kb.updated_at)}</span>
              <div class="card-actions">
                <button class="mini-btn" data-open-kb-docs="${kb.id}">数据</button>
                <button class="mini-btn" data-ask-kb="${kb.id}">问答</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty-text">还没有知识库。</p>`;

  $$("[data-ask-kb]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeKnowledgeBaseId = button.dataset.askKb;
      renderChat();
      switchView("chat");
    });
  });
  $$("[data-open-kb-docs]").forEach((button) => {
    button.addEventListener("click", () => openDocumentsForKb(button.dataset.openKbDocs));
  });
}

function renderVisualization() {
  const data = state.analytics;
  if (!data) {
    setText("#screenTotal", "0");
    setText("#screenQuestions", "0");
    setText("#screenAnswers", "0");
    setText("#screenTasks", "0");
    $("#answerWordCloud").innerHTML = `<p class="empty-text">暂无可视化数据。</p>`;
    $("#taskStatusChart").innerHTML = "";
    $("#kbDocumentChart").innerHTML = "";
    $("#recentQuestionList").innerHTML = "";
    $("#screenDocumentList").innerHTML = "";
    $("#topCitedDocuments").innerHTML = "";
    $("#answerWordCloud").innerHTML = `<p class="empty-text">后端未连接，暂无大屏数据。</p>`;
    return;
  }

  const counts = data.counts || {};
  const live = data.live_trends || { sources: [], items: [] };
  const githubSourceTitle = state.githubTrendFilter === "github_python" ? "GitHub Python" : "GitHub 全部";
  const hfSourceTitle = state.hfTrendFilter === "hf_spaces" ? "Hugging Face Spaces" : "Hugging Face 论文";
  const githubItems = getTrendSourceItems(live, githubSourceTitle);
  const paperItems = getTrendSourceItems(live, hfSourceTitle);
  setText("#screenTotal", formatNumber(counts.documents || 0));
  setText("#screenQuestions", formatNumber(counts.questions || 0));
  setText("#screenAnswers", formatNumber(counts.answers || 0));
  setText("#screenTasks", formatNumber(counts.tasks || 0));
  updateScreenClock();

  const maxWord = Math.max(...(data.word_cloud || []).map((item) => item.count), 1);
  $("#answerWordCloud").innerHTML =
    (data.word_cloud || [])
      .slice(0, 8)
      .map((item) => {
        const size = 12 + Math.round((item.count / maxWord) * 4);
        const weight = item.count === maxWord ? 800 : 650;
        const glow = Math.min(0.72, 0.22 + item.count / maxWord / 2);
        return `<span style="font-size:${size}px;font-weight:${weight};--glow:${glow}">${escapeHtml(item.text)}</span>`;
      })
      .join("") || `<p class="empty-text">还没有足够的回答生成词云。</p>`;

  renderScreenCharts(data);

  $("#recentQuestionList").innerHTML =
    githubItems
      .slice(0, 4)
      .map(
        (item) => `
          <article class="cockpit-list-row cockpit-trend-row">
            <div class="cockpit-trend-main" data-live-open="${escapeAttr(item.url)}">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.language || "GitHub")} · ${escapeHtml(item.stars || "0")} stars · 今日 ${escapeHtml(item.today || "0")}</span>
              </div>
            </div>
            <button type="button" class="cockpit-explain-btn" data-explain-url="${escapeAttr(item.url)}" data-explain-source="${escapeAttr(githubSourceTitle)}">解释</button>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">暂时没有抓到 GitHub 实时趋势。</p>`;

  $("#screenDocumentList").innerHTML =
    (live.sources || [])
      .slice(0, 4)
      .map(
        (source) => `<span>${escapeHtml(source.title)}：${source.status === "ok" ? `${source.items.length} 条` : "失败"}</span>`,
      )
      .join("　") || `实时数据将写入 github / hugging-face 两个知识库`;

  $("#topCitedDocuments").innerHTML =
    paperItems
      .slice(0, 10)
      .map(
        (item) => `
          <article class="cockpit-rank-row cockpit-trend-row">
            <div class="cockpit-trend-main" data-live-open="${escapeAttr(item.url)}">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.stars ? `${item.stars} likes` : item.name)}</span>
            </div>
            <button type="button" class="cockpit-explain-btn" data-explain-url="${escapeAttr(item.url)}" data-explain-source="${escapeAttr(hfSourceTitle)}">解释</button>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">暂时没有抓到 Hugging Face 论文。</p>`;
  $$("[data-live-open]").forEach((node) => {
    node.addEventListener("click", () => window.open(node.dataset.liveOpen, "_blank"));
  });
  $$(".cockpit-explain-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openTrendExplanation(btn.dataset.explainUrl, btn.dataset.explainSource || "");
    });
  });
  window.setTimeout(resizeScreen, 40);
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function getTrendSourceItems(live, title) {
  return (live.sources || []).find((source) => source.title === title)?.items || [];
}

function findTrendItemByUrl(live, url) {
  if (!live?.sources || !url) return null;
  for (const source of live.sources) {
    for (const item of source.items || []) {
      if (item.url === url) return item;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function openTrendExplanation(url, sourceTitle) {
  if (!url) return;
  state.trendExplainUrl = url;
  state.trendExplainSource = sourceTitle || "";
  switchView("trendExplain");
}

function renderTrendExplanationResult(row) {
  const body = $("#trendExplainBody");
  const retry = $("#trendExplainRetryBtn");
  retry.hidden = true;
  if (!row) {
    body.innerHTML = `<p class="empty-text">没有返回解读数据。</p>`;
    retry.hidden = false;
    return;
  }
  if (row.status === "failed") {
    body.innerHTML = `<p class="empty-text">${escapeHtml(row.error_message || "生成失败")}</p>`;
    retry.hidden = false;
    return;
  }
  if (row.status === "pending") {
    body.innerHTML = `<p class="empty-text">状态仍为「生成中」，请稍后点击「重新生成」或返回大屏重试。</p>`;
    retry.hidden = false;
    return;
  }
  body.textContent = row.explanation || "（空内容）";
}

function renderTrendExplainMeta(url, sourceTitle, row, loadedViaGet) {
  const base = `
    <div><strong>来源</strong>：${escapeHtml(sourceTitle || "实时趋势")}</div>
    <div><strong>链接</strong>：<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></div>
  `;
  const cache =
    row &&
    row.status === "ready" &&
    (loadedViaGet || row.skipped_llm)
      ? `<p class="trend-cache-note">本条解读来自<strong>本地数据库</strong>，本次<strong>未调用大模型</strong>（节省费用与耗时）。</p>`
      : "";
  $("#trendExplainMeta").innerHTML = base + cache;
}

async function loadTrendExplanationDetail() {
  const url = state.trendExplainUrl;
  const sourceTitle = state.trendExplainSource || "";
  const retry = $("#trendExplainRetryBtn");
  retry.hidden = true;
  if (!url) {
    $("#trendExplainTitle").textContent = "趋势条目解读";
    $("#trendExplainMeta").innerHTML = "";
    $("#trendExplainBody").innerHTML = `<p class="empty-text">未选择条目。</p>`;
    return;
  }
  const live = state.analytics?.live_trends;
  const item = findTrendItemByUrl(live, url) || { url, title: url };
  $("#trendExplainTitle").textContent = item.title || "趋势解读";
  $("#trendExplainMeta").innerHTML = `
    <div><strong>来源</strong>：${escapeHtml(sourceTitle || "实时趋势")}</div>
    <div><strong>链接</strong>：<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></div>
  `;
  $("#trendExplainBody").innerHTML = `<p class="empty-text">正在从数据库查询是否已有解读…</p>`;

  let row = null;
  let loadedViaGet = false;
  try {
    row = await api(`/api/live-trend-explanations/by-url?url=${encodeURIComponent(url)}`);
    loadedViaGet = true;
  } catch (err) {
    if (!String(err.message || "").includes("尚未生成")) {
      $("#trendExplainBody").innerHTML = `<p class="empty-text">读取失败：${escapeHtml(err.message || "未知错误")}</p>`;
      retry.hidden = false;
      return;
    }
  }

  if (row && row.status === "ready") {
    renderTrendExplainMeta(url, sourceTitle, row, loadedViaGet);
    renderTrendExplanationResult(row);
    return;
  }

  if (!row) {
    $("#trendExplainBody").innerHTML = `<p class="empty-text">数据库暂无记录，正在调用 MiniMax 生成并保存…</p>`;
    try {
      row = await api("/api/live-trend-explanations/generate", {
        method: "POST",
        body: JSON.stringify({ url, source_title: sourceTitle, item, force: false }),
      });
    } catch (err) {
      $("#trendExplainBody").innerHTML = `<p class="empty-text">生成失败：${escapeHtml(err.message || "未知错误")}</p>`;
      retry.hidden = false;
      return;
    }
  }

  if (row.status === "pending") {
    $("#trendExplainBody").innerHTML = `<p class="empty-text">MiniMax 正在生成解读，请稍候…</p>`;
    for (let i = 0; i < 24; i += 1) {
      await sleep(1500);
      try {
        row = await api(`/api/live-trend-explanations/by-url?url=${encodeURIComponent(url)}`);
        loadedViaGet = true;
        if (row.status !== "pending") break;
      } catch {
        break;
      }
    }
  }

  renderTrendExplainMeta(url, sourceTitle, row, loadedViaGet);
  renderTrendExplanationResult(row);
}

async function regenerateTrendExplanation() {
  const url = state.trendExplainUrl;
  const sourceTitle = state.trendExplainSource || "";
  if (!url) return;
  const live = state.analytics?.live_trends;
  const item = findTrendItemByUrl(live, url) || { url, title: url };
  $("#trendExplainRetryBtn").hidden = true;
  $("#trendExplainBody").innerHTML = `<p class="empty-text">正在重新调用 MiniMax…</p>`;
  try {
    const row = await api("/api/live-trend-explanations/generate", {
      method: "POST",
      body: JSON.stringify({ url, source_title: sourceTitle, item, force: true }),
    });
    renderTrendExplainMeta(url, sourceTitle, row, false);
    renderTrendExplanationResult(row);
  } catch (err) {
    $("#trendExplainBody").innerHTML = `<p class="empty-text">生成失败：${escapeHtml(err.message || "未知错误")}</p>`;
    $("#trendExplainRetryBtn").hidden = false;
  }
}

function renderScreenCharts(data) {
  if (!window.echarts) {
    renderChartFallbacks(data);
    return;
  }
  const chartTheme = {
    text: "#d8f7ff",
    cyan: "#00fff6",
    blue: "#2aa8ff",
    yellow: "#ffd35a",
    green: "#54f4a8",
    purple: "#8ea0ff",
  };
  const live = data.live_trends || { sources: [] };
  const githubSourceTitle = state.githubTrendFilter === "github_python" ? "GitHub Python" : "GitHub 全部";
  const kbItems = getTrendSourceItems(live, githubSourceTitle).slice(0, 8);
  const sourceItems = live.sources || [];
  const kbChart = getChart("kbDocumentChart");
  kbChart.setOption({
    grid: { left: 42, right: 18, top: 18, bottom: 28 },
    tooltip: { trigger: "axis", backgroundColor: "rgba(4,16,33,.92)", borderColor: "#00fff6", textStyle: { color: chartTheme.text } },
    xAxis: {
      type: "category",
      data: kbItems.map((item) => item.name.split("/").pop()),
      axisLabel: { color: "#9dccdf", interval: 0, fontSize: 11 },
      axisLine: { lineStyle: { color: "rgba(0,238,255,.34)" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "rgba(0,238,255,.12)" } },
      axisLabel: { color: "#9dccdf" },
    },
    series: [
      {
        type: "bar",
        data: kbItems.map((item) => Number(String(item.today || "0").replaceAll(",", "")) || 0),
        barWidth: 28,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: chartTheme.cyan },
            { offset: 1, color: "rgba(42,168,255,.38)" },
          ]),
        },
      },
    ],
  });

  const sourceChart = getChart("taskStatusChart");
  sourceChart.setOption({
    tooltip: { trigger: "item", backgroundColor: "rgba(4,16,33,.92)", borderColor: "#00fff6", textStyle: { color: chartTheme.text } },
    legend: { bottom: 0, textStyle: { color: "#9dccdf", fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        name: "实时来源",
        type: "pie",
        radius: ["46%", "72%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        label: { color: chartTheme.text, formatter: "{b} {c}" },
        labelLine: { lineStyle: { color: "rgba(0,238,255,.48)" } },
        data: sourceItems.length
          ? sourceItems.map((item) => ({ name: item.title.replace("GitHub ", ""), value: item.items?.length || 0 }))
          : [{ name: "暂无实时数据", value: 1 }],
        color: [chartTheme.cyan, chartTheme.yellow, chartTheme.green, chartTheme.purple],
      },
    ],
  });
}

function renderChartFallbacks(data) {
  const maxDocs = Math.max(...(data.documents_by_knowledge_base || []).map((item) => item.document_count), 1);
  $("#kbDocumentChart").innerHTML =
    (data.documents_by_knowledge_base || [])
      .map((item) => {
        const width = Math.max(4, Math.round((item.document_count / maxDocs) * 100));
        return `<article class="cockpit-bar-row"><div><strong>${escapeHtml(item.name)}</strong><span>${formatNumber(item.document_count)} 个文档</span></div><div class="cockpit-bar-track"><span style="width:${width}%"></span></div></article>`;
      })
      .join("") || `<p class="empty-text">暂无知识库文档数据。</p>`;
  const sourceItems = data.live_trends?.sources || [];
  const totalTasks = sourceItems.reduce((sum, item) => sum + (item.items?.length || 0), 0) || 1;
  $("#taskStatusChart").innerHTML =
    sourceItems
      .map((item) => {
        const count = item.items?.length || 0;
        const width = Math.round((count / totalTasks) * 100);
        return `<article class="cockpit-bar-row"><div><strong>${escapeHtml(item.title)}</strong><span>${formatNumber(count)} 条</span></div><div class="cockpit-bar-track"><span style="width:${width}%"></span></div></article>`;
      })
      .join("") || `<p class="empty-text">暂无实时数据。</p>`;
}

function getChart(id) {
  const element = document.getElementById(id);
  if (!state.charts[id]) {
    state.charts[id] = echarts.init(element);
  }
  return state.charts[id];
}

function resizeCharts() {
  Object.values(state.charts).forEach((chart) => chart.resize());
}

function resizeScreen() {
  const canvas = $("#cockpitCanvas");
  if (!canvas) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
  resizeCharts();
}

function renderDocuments() {
  const options = `<option value="">全部知识库</option>` + state.knowledgeBases
    .map((kb) => `<option value="${kb.id}">${escapeHtml(kb.name)}</option>`)
    .join("");
  $("#documentKbFilter").innerHTML = options;
  $("#documentKbFilter").value = state.documentFilterKbId;
  $("#documentSearchInput").value = state.documentSearch;

  const kb = state.knowledgeBases.find((item) => item.id === state.documentFilterKbId);
  $("#documentListTitle").textContent = kb ? `${kb.name} 的文档` : "全部文档";
  $("#documentListHint").textContent = state.documentSearch
    ? `${state.documents.length} 个匹配文档`
    : `${state.documents.length} 个文档`;

  $("#documentList").innerHTML =
    state.documents
      .map(
        (doc) => `
          <article class="document-item ${doc.id === state.activeDocumentId ? "is-active" : ""}" data-document-id="${doc.id}">
            <div>
              <strong>${escapeHtml(doc.file_name)}</strong>
              <span>${escapeHtml(doc.knowledge_base_name || kbName(doc.knowledge_base_id))} · ${statusText(doc.status)} · ${formatDate(doc.updated_at)}</span>
            </div>
            <span class="badge ${doc.status === "ready" ? "ok" : "warn"}">${doc.file_type}</span>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">暂无文档。</p>`;

  $$("[data-document-id]").forEach((item) => {
    item.addEventListener("click", () => openDocumentDetail(item.dataset.documentId));
  });

  renderDocumentDetail();
}

function renderDocumentDetail() {
  if (!state.activeDocument) {
    $("#documentDetail").innerHTML = `<p class="empty-text">从左侧选择一个文档查看详情。</p>`;
    return;
  }
  const doc = state.activeDocument;
  $("#documentDetail").innerHTML = `
    <form class="stack-form" id="documentEditForm">
      <label>
        文件名
        <input id="documentNameInput" value="${escapeAttr(doc.file_name)}" />
      </label>
      <label>
        摘要
        <div class="summary-box">${escapeHtml(doc.summary || "暂无摘要，可以点击右侧按钮重新生成。")}</div>
      </label>
      <label>
        正文内容
        <textarea class="document-content-input" id="documentContentInput">${escapeHtml(doc.content || "")}</textarea>
      </label>
      <div class="detail-meta">
        <span>知识库：${escapeHtml(kbName(doc.knowledge_base_id))}</span>
        <span>类型：${escapeHtml(doc.file_type)}</span>
        <span>大小：${formatSize(doc.file_size)}</span>
        <span>切片：${doc.chunks?.length || 0} 个，保存正文后自动重建</span>
      </div>
      <div class="task-actions">
        <button class="primary-btn" type="submit">保存修改</button>
        <button class="secondary-btn" type="button" id="summarizeDocumentBtn">智能生成摘要</button>
        <button class="secondary-btn danger-text" type="button" id="deleteDocumentBtn">删除文档</button>
      </div>
    </form>
    <div class="chunk-list">
      <div class="chunk-head"><strong>切片数据</strong><span>系统检索用，只能查看；要改切片请修改上方正文</span></div>
      ${(doc.chunks || [])
        .slice(0, 20)
        .map((chunk) => `<article class="chunk-item"><strong>切片 ${chunk.chunk_index + 1}</strong><p>${escapeHtml(chunk.content)}</p></article>`)
        .join("") || `<p class="empty-text">暂无切片数据。</p>`}
    </div>
  `;
  $("#documentEditForm").addEventListener("submit", updateDocument);
  $("#summarizeDocumentBtn").addEventListener("click", summarizeDocument);
  $("#deleteDocumentBtn").addEventListener("click", deleteDocument);
}

function renderChat() {
  const kbOptions = state.knowledgeBases
    .map((kb) => `<option value="${kb.id}">${escapeHtml(kb.name)}</option>`)
    .join("");
  $("#chatKbSelect").innerHTML = kbOptions || `<option value="">请先创建知识库</option>`;
  $("#uploadKbSelect").innerHTML = kbOptions || `<option value="">请先创建知识库</option>`;
  if (state.activeKnowledgeBaseId) {
    $("#chatKbSelect").value = state.activeKnowledgeBaseId;
    $("#uploadKbSelect").value = state.activeKnowledgeBaseId;
  }

  $("#modelSelect").innerHTML =
    `<option value="">默认启用模型</option>` +
    state.modelConfigs
      .map((config) => `<option value="${escapeHtml(config.provider)}">${escapeHtml(config.provider)} · ${escapeHtml(config.default_model)}</option>`)
      .join("");
  const enabled = state.modelConfigs.find((config) => config.enabled);
  if (enabled) $("#modelSelect").value = enabled.provider;

  $("#sessionList").innerHTML =
    state.sessions
      .map(
        (session) => `
          <article class="session-item ${session.id === state.activeSessionId ? "is-active" : ""}">
            <button class="session-main" data-session="${session.id}">
              <strong>${escapeHtml(session.title)}</strong>
              <span>${formatDate(session.updated_at)}</span>
            </button>
            <div class="session-actions">
              <button class="mini-icon-btn" data-rename-session="${session.id}" title="重命名">改</button>
              <button class="mini-icon-btn danger" data-delete-session="${session.id}" title="删除">删</button>
            </div>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">暂无会话。</p>`;

  if (state.messages.length) {
    $("#chatMessages").innerHTML =
      (state.chatWarning ? `<div class="notice">${escapeHtml(state.chatWarning)}</div>` : "") +
      state.messages.map(renderMessage).join("");
  } else {
    $("#chatMessages").innerHTML = `<article class="message assistant">选择一个知识库，然后直接提问。回答和引用会保存到后端数据库。</article>`;
  }
  renderCitations();
  bindMessageActions();
  bindSessionActions();
}

function renderMessage(message) {
  const content = escapeHtml(message.content).replaceAll("\n", "<br />");
  if (message.role === "user") return `<article class="message user">${content}</article>`;
  return `
    <article class="message assistant">
      ${content}
      <div class="message-actions">
        <button class="mini-btn" data-generate-task>生成任务</button>
        <button class="mini-btn" data-copy-answer>复制</button>
      </div>
    </article>
  `;
}

function renderCitations() {
  $("#citationList").innerHTML =
    state.citations
      .map(
        (item) => `
          <article class="citation-item">
            <strong>${escapeHtml(item.document_name)}</strong>
            <span>${escapeHtml(item.snippet)}</span>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">暂无引用。</p>`;
}

function bindMessageActions() {
  $$("[data-generate-task]").forEach((button) => {
    button.addEventListener("click", generateTasksFromAnswer);
  });
  $$("[data-copy-answer]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(state.activeAnswer || "");
      showToast("回答已复制");
    });
  });
}

function bindSessionActions() {
  $$("[data-session]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeSessionId = button.dataset.session;
      state.messages = await api(`/api/chat/sessions/${state.activeSessionId}/messages`);
      const lastAssistant = [...state.messages].reverse().find((item) => item.role === "assistant");
      state.activeAnswer = lastAssistant?.content || "";
      state.citations = lastAssistant?.citations ? JSON.parse(lastAssistant.citations) : [];
      renderChat();
    });
  });
  $$("[data-rename-session]").forEach((button) => {
    button.addEventListener("click", renameSession);
  });
  $$("[data-delete-session]").forEach((button) => {
    button.addEventListener("click", deleteSession);
  });
}

function renderTasks() {
  const columns = [
    { id: "todo", title: "待办" },
    { id: "doing", title: "进行中" },
    { id: "done", title: "已完成" },
  ];
  const filteredTasks = state.tasks.filter((task) => {
    const statusMatch = state.taskFilter === "all" || task.status === state.taskFilter;
    const priorityMatch = state.priorityFilter === "all" || task.priority === state.priorityFilter;
    return statusMatch && priorityMatch;
  });

  $("#taskBoard").innerHTML = columns
    .map((column) => {
      const tasks = filteredTasks.filter((task) => task.status === column.id);
      return `
        <section class="task-column">
          <h2>${column.title} · ${tasks.length}</h2>
          ${tasks.map(renderTaskCard).join("") || `<p class="empty-text">暂无任务</p>`}
        </section>
      `;
    })
    .join("");

  $$("[data-complete-task]").forEach((button) => {
    button.addEventListener("click", () => updateTaskStatus(button.dataset.completeTask, "done"));
  });
  $$("[data-start-task]").forEach((button) => {
    button.addEventListener("click", () => updateTaskStatus(button.dataset.startTask, "doing"));
  });
  $$("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", editTask);
  });
  $$("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", deleteTask);
  });
}

function renderTaskCard(task) {
  const action =
    task.status === "done"
      ? `<button class="mini-btn" data-edit-task="${task.id}">编辑</button>
         <button class="mini-btn" data-delete-task="${task.id}">删除</button>`
      : `<button class="mini-btn" data-start-task="${task.id}">开始</button>
         <button class="mini-btn" data-complete-task="${task.id}">完成</button>
         <button class="mini-btn" data-edit-task="${task.id}">编辑</button>
         <button class="mini-btn" data-delete-task="${task.id}">删除</button>`;
  return `
    <article class="task-card">
      <h3>${escapeHtml(task.title)}</h3>
      <p>${escapeHtml(task.description || "暂无描述")}</p>
      <div class="task-meta">
        <span class="badge ${task.priority === "high" ? "warn" : ""}">${priorityText(task.priority)}</span>
        <span class="badge ${task.status === "done" ? "ok" : ""}">${statusText(task.status)}</span>
        <span class="badge">${sourceText(task.source_type)}</span>
      </div>
      <div class="task-actions">${action}</div>
    </article>
  `;
}

function renderGoals() {
  $("#weekList").innerHTML = "";
}

function renderTaskProgress() {
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => task.status === "done").length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  $("#taskProgressValue").textContent = `${percent}%`;
  $("#taskProgressRing").style.setProperty("--progress", `${percent}%`);
  $("#taskProgressRing").setAttribute("aria-label", `任务完成率 ${percent}%`);
  $("#taskProgressText").textContent = total ? `${done}/${total} 个任务已完成。` : "暂无真实任务数据。";
}

function renderSettings() {
  const enabled = state.modelConfigs.find((config) => config.enabled);
  if (enabled && !$("#apiKeyInput").value) {
    $("#providerInput").value = enabled.provider;
    $("#baseUrlInput").value = enabled.base_url;
    $("#modelNameInput").value = enabled.default_model;
  }
  $("#modelConfigList").innerHTML =
    state.modelConfigs
      .map(
        (config) => `
          <article class="upload-item">
            <div>
              <strong>${escapeHtml(config.provider)} ${config.enabled ? "· 当前启用" : ""}</strong>
              <span>${escapeHtml(config.base_url)} · ${escapeHtml(config.default_model)} · ${escapeHtml(config.api_key_masked)}</span>
            </div>
            <span class="badge ${config.enabled ? "ok" : ""}">${config.enabled ? "启用" : "停用"}</span>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">还没有模型配置。</p>`;
}

function bindGlobalEvents() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $$("[data-metric-link]").forEach((item) =>
    item.addEventListener("click", () => {
      state.documentFilterKbId = "";
      switchView(item.dataset.metricLink);
      if (item.dataset.metricLink === "documents") refreshDocuments();
    }),
  );
  $$("[data-open-modal]").forEach((item) => item.addEventListener("click", () => openModal(item.dataset.openModal)));
  $$("[data-close-modal]").forEach((item) => item.addEventListener("click", () => closeModal(item.dataset.closeModal)));
  $$(".modal-backdrop").forEach((backdrop) =>
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal(backdrop.id);
    }),
  );

  $("#createKbBtn").addEventListener("click", () => openModal("kbModal"));
  $("#createKbBtn2").addEventListener("click", () => openModal("kbModal"));
  $("#quickUpload").addEventListener("click", () => openModal("uploadModal"));
  $("#quickAsk").addEventListener("click", () => switchView("chat"));
  $("#addTaskBtn").addEventListener("click", () => openModal("taskModal"));

  $("#kbSort").addEventListener("change", renderKnowledgeBases);
  $("#documentKbFilter").addEventListener("change", async (event) => {
    state.documentFilterKbId = event.target.value;
    state.activeDocumentId = null;
    state.activeDocument = null;
    await refreshDocuments();
  });
  $("#documentSearchInput").addEventListener("input", debounce(async (event) => {
    state.documentSearch = event.target.value.trim();
    state.activeDocumentId = null;
    state.activeDocument = null;
    await refreshDocuments();
  }, 260));
  $("#clearDocumentFilter").addEventListener("click", async () => {
    state.documentFilterKbId = "";
    state.documentSearch = "";
    state.activeDocumentId = null;
    state.activeDocument = null;
    await refreshDocuments();
  });
  $("#priorityFilter").addEventListener("change", (event) => {
    state.priorityFilter = event.target.value;
    renderTasks();
  });
  $("#chatKbSelect").addEventListener("change", (event) => {
    state.activeKnowledgeBaseId = event.target.value;
    state.activeSessionId = null;
    state.messages = [];
    state.citations = [];
    renderChat();
  });

  $("#taskFilter").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state.taskFilter = button.dataset.filter;
    $$("#taskFilter button").forEach((item) => item.classList.toggle("is-active", item === button));
    renderTasks();
  });

  $("#kbForm").addEventListener("submit", createKnowledgeBase);
  $("#taskForm").addEventListener("submit", createManualTask);
  $("#fileInput").addEventListener("change", (event) => handleFiles(event.target.files));
  $("#chatForm").addEventListener("submit", submitQuestion);
  $("#newSessionBtn").addEventListener("click", () => {
    state.activeSessionId = null;
    state.messages = [];
    state.citations = [];
    state.activeAnswer = "";
    state.chatWarning = null;
    renderChat();
    showToast("已准备新会话");
  });
  $("#saveGeneratedTasksBtn").addEventListener("click", saveGeneratedTasks);
  $("#modelForm").addEventListener("submit", saveAndTestModelConfig);
  $("#refreshAnalyticsBtn").addEventListener("click", async () => {
    await refreshLiveTrends();
    renderVisualization();
    showToast("实时趋势已重新抓取");
  });
  $("#saveLiveTrendsBtn").addEventListener("click", importLiveTrends);
  $("#githubTrendTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state.githubTrendFilter = button.dataset.trendFilter;
    $$("#githubTrendTabs button").forEach((item) => item.classList.toggle("is-active", item === button));
    renderVisualization();
  });
  $("#hfTrendTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state.hfTrendFilter = button.dataset.trendFilter;
    $$("#hfTrendTabs button").forEach((item) => item.classList.toggle("is-active", item === button));
    renderVisualization();
  });

  $("#trendExplainBackBtn").addEventListener("click", () => {
    switchView("visualization");
  });
  $("#trendExplainRetryBtn").addEventListener("click", () => regenerateTrendExplanation());

  initKbParamRanges();

  $("#planForm").addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("目标模块后端还未实现，未保存任何数据。");
  });
  $("#generatePlanBtn").addEventListener("click", () => showToast("目标模块后端还未实现。"));
  $("#reviewForm").addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("复盘模块后端还未实现，未保存任何数据。");
  });
  initResizers();
}

function initResizers() {
  initAppShellResize();
  initChatResize();
}

function initAppShellResize() {
  const shell = $(".app-shell");
  const sidebar = $(".sidebar");
  if (!shell || !sidebar || document.querySelector(".app-resizer")) return;
  const handle = document.createElement("div");
  handle.className = "app-resizer";
  document.body.appendChild(handle);
  let dragging = false;
  handle.addEventListener("mousedown", () => {
    dragging = true;
    document.body.classList.add("is-resizing");
  });
  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const width = Math.min(420, Math.max(210, event.clientX));
    shell.style.gridTemplateColumns = `${width}px minmax(0, 1fr)`;
    handle.style.left = `${width}px`;
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.classList.remove("is-resizing");
  });
  handle.style.left = `${sidebar.getBoundingClientRect().width}px`;
}

function initChatResize() {
  const layout = $(".chat-layout");
  if (!layout || layout.dataset.resizable) return;
  layout.dataset.resizable = "true";
  const leftHandle = document.createElement("div");
  const rightHandle = document.createElement("div");
  leftHandle.className = "chat-resizer left";
  rightHandle.className = "chat-resizer right";
  layout.append(leftHandle, rightHandle);
  let side = null;
  const setColumns = (left, right) => {
    const safeLeft = Math.min(420, Math.max(180, left));
    const safeRight = Math.min(520, Math.max(220, right));
    layout.style.gridTemplateColumns = `${safeLeft}px 4px minmax(360px, 1fr) 4px ${safeRight}px`;
  };
  setColumns(220, 280);
  leftHandle.addEventListener("mousedown", () => {
    side = "left";
    document.body.classList.add("is-resizing");
  });
  rightHandle.addEventListener("mousedown", () => {
    side = "right";
    document.body.classList.add("is-resizing");
  });
  window.addEventListener("mousemove", (event) => {
    if (!side) return;
    const rect = layout.getBoundingClientRect();
    const columns = getComputedStyle(layout).gridTemplateColumns.split(" ").map(parseFloat);
    if (side === "left") {
      setColumns(event.clientX - rect.left, columns[4] || 300);
    } else {
      setColumns(columns[0] || 220, rect.right - event.clientX);
    }
  });
  window.addEventListener("mouseup", () => {
    side = null;
    document.body.classList.remove("is-resizing");
  });
}

async function createKnowledgeBase(event) {
  event.preventDefault();
  const name = $("#kbNameInput").value.trim();
  const description = $("#kbDescInput").value.trim();
  if (!name) return;
  try {
    const kb = await api("/api/knowledge-bases", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
    state.activeKnowledgeBaseId = kb.id;
    event.target.reset();
    closeModal("kbModal");
    await loadAll();
    switchView("knowledge");
    showToast("知识库已写入数据库");
  } catch (error) {
    showToast(`创建失败：${error.message}`);
  }
}

async function createManualTask(event) {
  event.preventDefault();
  try {
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: $("#taskTitleInput").value.trim(),
        description: $("#taskDescInput").value.trim(),
        priority: $("#taskPriorityInput").value,
        status: "todo",
        source_type: "manual",
      }),
    });
    event.target.reset();
    closeModal("taskModal");
    await loadAll();
    showToast("任务已写入数据库");
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  }
}

async function editTask(event) {
  const taskId = event.currentTarget.dataset.editTask;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const title = window.prompt("任务标题", task.title);
  if (!title || !title.trim()) return;
  const description = window.prompt("任务描述", task.description || "") ?? task.description;
  const priority = window.prompt("优先级：high / medium / low", task.priority) || task.priority;
  const status = window.prompt("状态：todo / doing / done / canceled", task.status) || task.status;
  try {
    await api(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: title.trim(),
        description,
        priority,
        status,
      }),
    });
    await loadAll();
    showToast("任务已更新");
  } catch (error) {
    showToast(`任务更新失败：${error.message}`);
  }
}

async function deleteTask(event) {
  const taskId = event.currentTarget.dataset.deleteTask;
  if (!window.confirm("确定删除这个任务吗？")) return;
  try {
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    await loadAll();
    showToast("任务已删除");
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  }
}

async function handleFiles(files) {
  if (!files.length) return;
  const kbId = $("#uploadKbSelect").value || state.activeKnowledgeBaseId;
  if (!kbId) {
    showToast("请先创建知识库");
    return;
  }
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("files", file));
  $("#uploadList").innerHTML = Array.from(files)
    .map(
      (file) => `
        <article class="upload-item">
          <div>
            <strong>${escapeHtml(file.name)}</strong>
            <span>上传中 · ${(file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
          <span class="badge warn">处理中</span>
        </article>
      `,
    )
    .join("");
  try {
    const result = await api(`/api/knowledge-bases/${kbId}/documents`, {
      method: "POST",
      body: formData,
    });
    $("#uploadList").innerHTML = result.documents.map(renderUploadResult).join("");
    await loadAll();
    showToast("文档已上传并写入数据库");
  } catch (error) {
    showToast(`上传失败：${error.message}`);
  } finally {
    $("#fileInput").value = "";
  }
}

async function refreshDocuments() {
  await loadDocuments();
  renderDocuments();
}

async function openDocumentsForKb(kbId) {
  state.documentFilterKbId = kbId || "";
  state.activeDocumentId = null;
  state.activeDocument = null;
  await refreshDocuments();
  switchView("documents");
}

async function openDocumentDetail(documentId) {
  state.activeDocumentId = documentId;
  try {
    state.activeDocument = await api(`/api/documents/${documentId}`);
    renderDocuments();
  } catch (error) {
    showToast(`读取文档失败：${error.message}`);
  }
}

async function openDocumentDetailFromScreen(documentId) {
  state.documentFilterKbId = "";
  state.documentSearch = "";
  await openDocumentDetail(documentId);
  await refreshDocuments();
  switchView("documents");
}

async function updateDocument(event) {
  event.preventDefault();
  if (!state.activeDocumentId) return;
  try {
    await api(`/api/documents/${state.activeDocumentId}`, {
      method: "PUT",
      body: JSON.stringify({
        file_name: $("#documentNameInput").value.trim(),
        content: $("#documentContentInput").value.trim(),
      }),
    });
    state.activeDocument = await api(`/api/documents/${state.activeDocumentId}`);
    await loadAll();
    showToast("文档已更新");
    switchView("documents");
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  }
}

async function summarizeDocument() {
  if (!state.activeDocumentId) return;
  const button = $("#summarizeDocumentBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "生成中...";
  try {
    await api(`/api/documents/${state.activeDocumentId}/summarize`, { method: "POST" });
    state.activeDocument = await api(`/api/documents/${state.activeDocumentId}`);
    await loadDocuments();
    await loadAnalytics();
    renderDocuments();
    renderVisualization();
    showToast("摘要已根据切片重新生成");
  } catch (error) {
    showToast(`摘要生成失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function deleteDocument() {
  if (!state.activeDocumentId || !window.confirm("确定删除这个文档吗？")) return;
  try {
    await api(`/api/documents/${state.activeDocumentId}`, { method: "DELETE" });
    state.activeDocumentId = null;
    state.activeDocument = null;
    await loadAll();
    showToast("文档已删除");
    switchView("documents");
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  }
}

function renderUploadResult(doc) {
  return `
    <article class="upload-item">
      <div>
        <strong>${escapeHtml(doc.file_name)}</strong>
        <span>${escapeHtml(doc.summary || doc.error_message || "已处理")}</span>
      </div>
      <span class="badge ${doc.status === "ready" ? "ok" : "warn"}">${doc.status === "ready" ? "可用" : "失败"}</span>
    </article>
  `;
}

async function submitQuestion(event) {
  event.preventDefault();
  const question = $("#chatQuestion").value.trim();
  const knowledgeBaseId = $("#chatKbSelect").value;
  if (!question || !knowledgeBaseId) return;
  const modelProvider = $("#modelSelect").value || null;
  state.messages.push({ role: "user", content: question });
  state.messages.push({ role: "assistant", content: "正在检索知识库并生成回答..." });
  renderChat();
  $("#chatQuestion").value = "";
  try {
    const response = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        session_id: state.activeSessionId,
        question,
        model_provider: modelProvider,
      }),
    });
    state.activeSessionId = response.session_id;
    state.activeAnswer = response.answer;
    state.citations = response.citations;
    state.chatWarning = response.warning || null;
    state.messages = await api(`/api/chat/sessions/${response.session_id}/messages`);
    state.sessions = await api("/api/chat/sessions");
    await loadAnalytics();
    renderChat();
    renderVisualization();
  } catch (error) {
    state.messages.pop();
    state.messages.push({ role: "assistant", content: `问答失败：${error.message}` });
    renderChat();
  }
}

async function renameSession(event) {
  event.stopPropagation();
  const sessionId = event.currentTarget.dataset.renameSession;
  const session = state.sessions.find((item) => item.id === sessionId);
  const title = window.prompt("输入新的会话名称", session?.title || "");
  if (!title || !title.trim()) return;
  try {
    await api(`/api/chat/sessions/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify({ title: title.trim() }),
    });
    state.sessions = await api("/api/chat/sessions");
    renderChat();
    showToast("会话已重命名");
  } catch (error) {
    showToast(`重命名失败：${error.message}`);
  }
}

async function deleteSession(event) {
  event.stopPropagation();
  const sessionId = event.currentTarget.dataset.deleteSession;
  if (!window.confirm("确定删除这个会话吗？")) return;
  try {
    await api(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
    if (state.activeSessionId === sessionId) {
      state.activeSessionId = null;
      state.messages = [];
      state.citations = [];
      state.activeAnswer = "";
      state.chatWarning = null;
    }
    state.sessions = await api("/api/chat/sessions");
    await loadAnalytics();
    renderChat();
    renderVisualization();
    showToast("会话已删除");
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  }
}

async function generateTasksFromAnswer() {
  const content = state.activeAnswer || state.messages.findLast?.((item) => item.role === "assistant")?.content || "";
  if (!content) {
    showToast("还没有可生成任务的回答");
    return;
  }
  try {
    const result = await api("/api/tasks/generate", {
      method: "POST",
      body: JSON.stringify({
        content,
        knowledge_base_id: $("#chatKbSelect").value || state.activeKnowledgeBaseId,
      }),
    });
    state.generatedTasks = result.tasks;
    renderGeneratedTasks();
    openModal("generatedTaskModal");
  } catch (error) {
    showToast(`生成失败：${error.message}`);
  }
}

function renderGeneratedTasks() {
  $("#generatedTaskList").innerHTML =
    state.generatedTasks
      .map(
        (task, index) => `
          <article class="upload-item">
            <div>
              <strong>${escapeHtml(task.title)}</strong>
              <span>${escapeHtml(task.description || task.ai_reason || "")}</span>
            </div>
            <button class="mini-btn" data-remove-generated="${index}">删除</button>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">没有可保存的候选任务。</p>`;
  $$("[data-remove-generated]").forEach((button) => {
    button.addEventListener("click", () => {
      state.generatedTasks.splice(Number(button.dataset.removeGenerated), 1);
      renderGeneratedTasks();
    });
  });
}

async function saveGeneratedTasks() {
  if (!state.generatedTasks.length) {
    showToast("没有可保存的任务");
    return;
  }
  try {
    await Promise.all(
      state.generatedTasks.map((task) =>
        api("/api/tasks", {
          method: "POST",
          body: JSON.stringify(task),
        }),
      ),
    );
    closeModal("generatedTaskModal");
    state.generatedTasks = [];
    await loadAll();
    switchView("tasks");
    showToast("AI 生成任务已保存到数据库");
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  }
}

async function updateTaskStatus(taskId, status) {
  try {
    await api(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    await loadAll();
    showToast("任务状态已更新");
  } catch (error) {
    showToast(`更新失败：${error.message}`);
  }
}

async function saveAndTestModelConfig(event) {
  event.preventDefault();
  const payload = {
    provider: $("#providerInput").value.trim(),
    base_url: $("#baseUrlInput").value.trim(),
    api_key: $("#apiKeyInput").value.trim(),
    default_model: $("#modelNameInput").value.trim(),
    enabled: true,
  };
  if (!payload.api_key) {
    showToast("请输入 API Key，前端不会保存明文。");
    return;
  }
  try {
    const test = await api("/api/model-configs/test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!test.ok) {
      showToast(test.message);
      return;
    }
    await api("/api/model-configs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    $("#apiKeyInput").value = "";
    await loadAll();
    showToast("模型连接成功，配置已加密保存");
  } catch (error) {
    showToast(`模型配置失败：${error.message}`);
  }
}

function formatDate(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function updateScreenClock() {
  const target = $("#screenClock");
  if (!target) return;
  const now = new Date();
  const date = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const time = now.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  target.textContent = `${date} ${time}`;
}

function formatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "未知";
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function kbName(id) {
  return state.knowledgeBases.find((kb) => kb.id === id)?.name || "未知知识库";
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function priorityText(priority) {
  return { high: "高", medium: "中", low: "低" }[priority] || priority;
}

function statusText(status) {
  return { todo: "待办", doing: "进行中", done: "已完成", canceled: "已取消" }[status] || status;
}

function sourceText(source) {
  return { manual: "手动", ai_answer: "AI 生成", learning_plan: "学习计划", review: "复盘" }[source] || source || "未知";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initKbParamRanges() {
  const pairs = [
    ["kbChunkRange", "kbChunkRangeVal", (v) => `${v} tokens`],
    ["kbOverlapRange", "kbOverlapRangeVal", (v) => `${v} tokens`],
    ["kbTopKRange", "kbTopKRangeVal", (v) => `${v} 条`],
  ];
  pairs.forEach(([inputId, labelId, format]) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;
    const sync = () => {
      label.textContent = format(input.value);
    };
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    sync();
  });
}

function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function renderAll() {
  renderDashboard();
  renderVisualization();
  renderKnowledgeBases();
  renderDocuments();
  renderChat();
  renderTasks();
  renderGoals();
  renderSettings();
}

bindGlobalEvents();
loadAll();
window.setInterval(updateScreenClock, 1000);
window.addEventListener("resize", resizeScreen);
