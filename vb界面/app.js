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
  ragEvaluation: null,
  ragLabResult: null,
  ragLabRuns: [],
  agentLabResult: null,
  agentLabRuns: [],
  ragEvalCases: [],
  ragEvalBatch: null,
  modelConfigs: [],
  generatedTasks: [],
  chatWarning: null,
  analytics: null,
  charts: {},
  githubTrendFilter: "github_python",
  hfTrendFilter: "hf_papers",
  trendExplainUrl: null,
  trendExplainSource: "",
  pendingDeleteKbId: null,
  activeRagModule: "advanced",
  vectorPreviewMode: "top",
};

const ragLearningModules = [
  {
    id: "naive",
    name: "Naive RAG",
    title: "基础 / 标准 RAG",
    level: "第一阶段：必须跑通",
    summary: "分块 -> 向量化 -> 向量检索 -> 拼接上下文 -> 生成回答。",
    suitable: "FAQ、简单文档问答、学习 RAG 主链路。",
    weakness: "检索不准时容易答偏；没有查询改写、重排序、压缩和评测时，幻觉风险更高。",
    system: "知行者的上传文档、切片、Embedding、FAISS 检索、AI 问答就是 Naive RAG 的主链路。",
    practice: "用默认参数跑 RAG 实验室，先确认能命中文档片段，再看引用是否真的回答问题。",
    includes: ["文档解析", "文本切片", "Embedding", "向量数据库", "向量检索", "Prompt 拼接", "引用来源"],
    preset: {
      question: "RAG 的核心流程是什么？",
      chunkSize: 600,
      overlap: 120,
      topK: 5,
      hybrid: false,
      rerank: false,
      note: "观察纯向量检索能不能命中核心流程。重点看引用片段是否完整覆盖“解析、切片、向量化、检索、生成”。",
    },
  },
  {
    id: "advanced",
    name: "Advanced RAG",
    title: "进阶 / 企业级 RAG",
    level: "第二阶段：当前重点",
    summary: "在 Naive RAG 上优化检索前、检索中、检索后三个环节。",
    suitable: "企业知识库、产品助手、测试知识库、智能客服等需要较高准确率的场景。",
    weakness: "链路更长，参数更多，需要评测集来防止越改越差。",
    system: "知行者已经有 Hybrid 检索、BM25、Rerank、无依据拒答、RAG 实验室和自动评测集，正在向 Advanced RAG 演进。",
    practice: "同一个问题只改一个参数：先对比 Hybrid 开关，再对比 Rerank 开关，最后用自动评测集验证通过率。",
    includes: ["查询重写", "意图识别", "Hybrid 检索", "多路召回", "Rerank", "上下文压缩", "去冗余", "自动评测"],
    preset: {
      question: "Embedding 在 RAG 里起什么作用？",
      chunkSize: 600,
      overlap: 120,
      topK: 5,
      hybrid: true,
      rerank: true,
      note: "观察 Hybrid 和 Rerank 打开后，向量分、BM25 分、融合分、重排序分是否让证据更靠前。",
    },
  },
  {
    id: "agentic",
    name: "Agentic RAG",
    title: "智能体 RAG",
    level: "第三阶段：做成系统能力",
    summary: "让大模型像智能体一样动态决定是否检索、检索几次、调用什么工具、是否反思修正。",
    suitable: "复杂多跳问题、长任务、自动分析报告、测试风险分析、需要工具调用的工作流。",
    weakness: "更难测试，容易出现循环、工具误用、成本失控，需要清晰的步骤日志和停止条件。",
    system: "知行者未来可以让 AI 自动拆解问题、检索知识库、生成任务、复盘结果，形成行动助手。",
    practice: "先设计流程：问题 -> 判断是否需要检索 -> 检索 -> 反思证据是否够 -> 不够再检索 -> 生成任务。",
    includes: ["工具调用", "动态检索", "反思修正", "多轮计划", "步骤日志", "停止条件", "成本控制"],
    preset: {
      question: "如果我要把知行者升级成行动助手，下一步应该先做什么？",
      chunkSize: 900,
      overlap: 160,
      topK: 8,
      hybrid: true,
      rerank: true,
      note: "这类问题更像任务规划。先观察一次检索是否够用，再思考 Agent 是否需要二次检索、生成任务或追问用户。",
    },
  },
  {
    id: "graph",
    name: "Graph RAG",
    title: "图谱 RAG",
    level: "第四阶段：后期专项",
    summary: "把文档抽取成实体和关系，形成知识图谱，再支持多跳关联推理。",
    suitable: "法律条文推理、金融风控、医疗知识关联、组织关系、复杂依赖分析。",
    weakness: "需要实体抽取、关系抽取、图数据库和图查询，学习成本高，不适合作为第一主线。",
    system: "知行者后期可以把文档里的概念、项目、模型、论文、人物、公司抽成图谱，再回答多跳问题。",
    practice: "先不用实现。现在只要能画出实体-关系图，例如：论文 -> 提出方法 -> 解决问题 -> 适用场景。",
    includes: ["实体抽取", "关系抽取", "知识图谱", "图数据库", "多跳推理", "路径解释"],
    preset: {
      question: "RAG、Embedding、BM25 和 Rerank 之间是什么关系？",
      chunkSize: 1000,
      overlap: 180,
      topK: 8,
      hybrid: true,
      rerank: true,
      note: "Graph RAG 关注实体和关系。先从命中片段里手动画出：RAG 包含什么，Embedding/BM25/Rerank 分别负责什么。",
    },
  },
];

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
    await loadRagLabRuns();
    await loadAgentLabRuns();
    await loadRagEvalCases();
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

async function loadRagLabRuns() {
  const params = new URLSearchParams();
  const kbId = $("#ragLabKbSelect")?.value || state.activeKnowledgeBaseId;
  if (kbId) params.set("knowledge_base_id", kbId);
  params.set("limit", "10");
  try {
    state.ragLabRuns = await api(`/api/rag/lab/runs?${params.toString()}`);
  } catch {
    state.ragLabRuns = [];
  }
}

async function loadAgentLabRuns() {
  const params = new URLSearchParams();
  const kbId = $("#agentLabKbSelect")?.value || state.activeKnowledgeBaseId;
  if (kbId) params.set("knowledge_base_id", kbId);
  params.set("limit", "10");
  try {
    state.agentLabRuns = await api(`/api/agent/lab/runs?${params.toString()}`);
  } catch {
    state.agentLabRuns = [];
  }
}

async function loadRagEvalCases() {
  const params = new URLSearchParams();
  const kbId = $("#ragLabKbSelect")?.value || state.activeKnowledgeBaseId;
  if (kbId) params.set("knowledge_base_id", kbId);
  try {
    state.ragEvalCases = await api(`/api/rag/eval-cases?${params.toString()}`);
  } catch {
    state.ragEvalCases = [];
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
                <button class="mini-icon-btn danger" data-delete-kb="${kb.id}" title="删除知识库">🗑</button>
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
  $$("[data-delete-kb]").forEach((button) => {
    button.addEventListener("click", () => openKnowledgeBaseDeleteModal(button.dataset.deleteKb));
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
            <div class="document-item-actions">
              <span class="badge ${doc.status === "ready" ? "ok" : "warn"}">${doc.file_type}</span>
              <button class="mini-inline-danger" type="button" data-delete-document-inline="${doc.id}" title="删除文档">🗑 删除</button>
            </div>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">暂无文档。</p>`;

  $$("[data-document-id]").forEach((item) => {
    item.addEventListener("click", () => openDocumentDetail(item.dataset.documentId));
  });
  $$("[data-delete-document-inline]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      state.activeDocumentId = button.dataset.deleteDocumentInline;
      await deleteDocument();
    });
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
  $("#ragLabKbSelect").innerHTML = kbOptions || `<option value="">请先创建知识库</option>`;
  $("#agentLabKbSelect").innerHTML = kbOptions || `<option value="">请先创建知识库</option>`;
  if (state.activeKnowledgeBaseId) {
    $("#chatKbSelect").value = state.activeKnowledgeBaseId;
    $("#uploadKbSelect").value = state.activeKnowledgeBaseId;
    $("#ragLabKbSelect").value = state.activeKnowledgeBaseId;
    $("#agentLabKbSelect").value = state.activeKnowledgeBaseId;
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
              <button class="mini-icon-btn" data-rename-session="${session.id}" title="重命名">✎</button>
              <button class="mini-icon-btn danger" data-delete-session="${session.id}" title="删除">🗑</button>
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

function renderRagLab() {
  renderRagLearningModules();
  renderRagVisualization();
  const result = state.ragLabResult;
  $("#saveRagLabRunBtn").disabled = !result;
  if (!result) {
    $("#ragLabSummary").textContent = "运行后会展示切片数量、相似度和命中片段";
    $("#ragLabResult").innerHTML = `<p class="empty-text">先选择知识库并输入问题，然后运行一次实验。</p>`;
    $("#ragLabNotes").innerHTML = `<p class="empty-text">建议先用默认参数跑一遍，再只改一个参数做对比。</p>`;
    renderRagLabHistory();
    renderRagEvalCases();
    renderRagEvalResult();
    return;
  }
  const evaluation = result.evaluation || {};
  $("#ragLabSummary").textContent = `临时切片 ${result.chunk_count} 个 · 命中 ${result.retrieved_chunks.length} 条 · 最高相关度 ${Number(evaluation.top_score || 0).toFixed(2)}`;
  $("#ragLabResult").innerHTML =
    `
      <article class="rag-lab-eval">
        <strong>${escapeHtml(ragVerdictText(evaluation.verdict))}</strong>
        <span>${escapeHtml(evaluation.suggestion || "")}</span>
        <span>问题覆盖率 ${Number(evaluation.coverage_ratio || 0).toFixed(2)} · 阈值 ${Number(evaluation.min_coverage || 0).toFixed(2)}</span>
        <small>参数：chunk_size=${result.params.chunk_size}，overlap=${result.params.overlap}，top_k=${result.params.top_k}，hybrid=${result.params.hybrid === false ? "关" : "开"}，rerank=${result.params.rerank ? "开" : "关"}</small>
      </article>
    ` +
    (result.retrieved_chunks || [])
      .map(
        (chunk) => `
          <article class="rag-lab-hit">
            <div>
              <strong>${escapeHtml(chunk.document_name)}</strong>
              <span>片段 ${Number(chunk.chunk_index || 0) + 1} · 相关度 ${Number(chunk.score || 0).toFixed(4)}${renderRerankScores(chunk)}</span>
            </div>
            <p>${escapeHtml(chunk.content || chunk.snippet || "")}</p>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">这组参数没有检索到片段。</p>`;
  $("#ragLabNotes").innerHTML = (result.learning_notes || [])
    .map((note) => `<article class="learning-note">${escapeHtml(note)}</article>`)
    .join("");
  renderRagLabHistory();
  renderRagEvalCases();
  renderRagEvalResult();
}

function renderAgentLab() {
  const result = state.agentLabResult;
  if (!result) {
    $("#agentLabSummary").textContent = "运行后会展示每一步思考、工具输入和工具输出";
    $("#agentLabTrace").innerHTML = `<p class="empty-text">先选择知识库并输入一个目标。</p>`;
    $("#agentLabTasks").innerHTML = `<p class="empty-text">运行后会出现候选任务。</p>`;
    renderAgentLabRuns();
    return;
  }
  $("#agentLabSummary").textContent = result.summary || "Agent 运行完成";
  $("#agentLabTrace").innerHTML = (result.steps || []).map(renderAgentStep).join("");
  $("#agentLabTasks").innerHTML =
    (result.suggested_tasks || [])
      .map(
        (task, index) => `
          <article class="agent-task-card">
            <span>${index + 1}</span>
            <div>
              <strong>${escapeHtml(task.title)}</strong>
              <p>${escapeHtml(task.description || task.ai_reason || "")}</p>
              <small>${escapeHtml(task.ai_reason || "")}</small>
            </div>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">这次没有生成候选任务。</p>`;
  if (result.created_task_ids?.length) {
    $("#agentLabTasks").innerHTML += `<div class="notice">已保存 ${result.created_task_ids.length} 个任务到任务中心。</div>`;
  }
  renderAgentLabRuns();
}

function renderAgentStep(step) {
  return `
    <article class="agent-step-card">
      <div class="agent-step-index">${Number(step.step_index || 0)}</div>
      <div class="agent-step-main">
        <div class="agent-step-head">
          <strong>${escapeHtml(agentPhaseText(step.phase))}</strong>
          ${step.tool_name ? `<span class="agent-tool-chip">${escapeHtml(step.tool_name)}</span>` : ""}
        </div>
        <p>${escapeHtml(step.thought || "")}</p>
        <div class="agent-io-grid">
          <div>
            <span>工具输入</span>
            <pre>${escapeHtml(JSON.stringify(step.tool_input || {}, null, 2))}</pre>
          </div>
          <div>
            <span>工具输出</span>
            <pre>${escapeHtml(JSON.stringify(step.tool_output || {}, null, 2))}</pre>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderAgentLabRuns() {
  $("#agentLabRuns").innerHTML =
    state.agentLabRuns
      .map(
        (run) => `
          <article class="agent-run-item">
            <strong>${escapeHtml(run.goal)}</strong>
            <span>${formatDate(run.created_at)} · ${escapeHtml(agentModeText(run.mode))} · ${run.steps?.length || 0} 步</span>
            <small>${escapeHtml(run.summary || "")}</small>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">还没有 Agent 运行记录。</p>`;
}

function renderRagLearningModules() {
  const cards = $("#ragModuleCards");
  const detail = $("#ragModuleDetail");
  if (!cards || !detail) return;
  const active = ragLearningModules.find((item) => item.id === state.activeRagModule) || ragLearningModules[0];
  cards.innerHTML = ragLearningModules
    .map(
      (item) => `
        <button class="rag-module-card ${item.id === active.id ? "is-active" : ""}" type="button" data-rag-module="${item.id}">
          <span>${escapeHtml(item.level)}</span>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.title)}</small>
        </button>
      `,
    )
    .join("");
  detail.innerHTML = `
    <article class="rag-module-detail-card">
      <div>
        <span class="eyebrow">${escapeHtml(active.level)}</span>
        <h3>${escapeHtml(active.name)} · ${escapeHtml(active.title)}</h3>
        <p>${escapeHtml(active.summary)}</p>
      </div>
      <div class="rag-module-points">
        <div><strong>适用场景</strong><span>${escapeHtml(active.suitable)}</span></div>
        <div><strong>主要缺点</strong><span>${escapeHtml(active.weakness)}</span></div>
        <div><strong>知行者对应</strong><span>${escapeHtml(active.system)}</span></div>
        <div><strong>你现在怎么练</strong><span>${escapeHtml(active.practice)}</span></div>
      </div>
      <div class="rag-module-tags">
        ${active.includes.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
      <div class="rag-module-preset">
        <strong>推荐实验</strong>
        <span>${escapeHtml(active.preset.question)}</span>
        <small>chunk_size=${active.preset.chunkSize}，overlap=${active.preset.overlap}，top_k=${active.preset.topK}，hybrid=${active.preset.hybrid ? "开" : "关"}，rerank=${active.preset.rerank ? "开" : "关"}</small>
        <button class="secondary-btn" type="button" id="applyRagModulePreset">套用到实验参数</button>
      </div>
    </article>
  `;
  $("#applyRagModulePreset")?.addEventListener("click", () => applyRagModulePreset(active));
  $$("[data-rag-module]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeRagModule = button.dataset.ragModule;
      renderRagLearningModules();
      renderRagVisualization();
    });
  });
}

function applyRagModulePreset(module) {
  const preset = module.preset;
  if (!preset) return;
  $("#ragLabQuestion").value = preset.question;
  $("#ragLabChunkSize").value = preset.chunkSize;
  $("#ragLabOverlap").value = preset.overlap;
  $("#ragLabTopK").value = preset.topK;
  $("#ragLabHybrid").checked = preset.hybrid;
  $("#ragLabRerank").checked = preset.rerank;
  syncRagLabRangeLabels();
  state.ragLabResult = null;
  $("#ragLabSummary").textContent = `${module.name} 推荐实验已套用，点击“运行实验”查看检索结果`;
  $("#ragLabResult").innerHTML = `<p class="empty-text">${escapeHtml(preset.note)}</p>`;
  $("#ragLabNotes").innerHTML = `
    <article class="learning-note">${escapeHtml(preset.note)}</article>
    <article class="learning-note">运行后重点检查：命中片段是否能支撑问题、分数是否合理、是否需要调整参数。</article>
  `;
  $("#saveRagLabRunBtn").disabled = true;
  showToast(`${module.name} 推荐实验已套用`);
}

function renderRagVisualization() {
  const container = $("#ragVisual");
  const summary = $("#ragVisualSummary");
  if (!container) return;
  const module = ragLearningModules.find((item) => item.id === state.activeRagModule) || ragLearningModules[0];
  const result = state.ragLabResult;
  const chunks = result ? (result.retrieved_chunks || []).slice(0, 4) : demoRagChunks(module.id);
  if (summary) {
    summary.textContent = `${module.name}：${visualSummary(module.id)}`;
  }
  container.innerHTML = `
    <div class="rag-visual-flow">
      ${visualFlowSteps(module.id).map((step, index) => `
        <article class="rag-visual-step ${result ? "is-live" : ""}">
          <b>${index + 1}</b>
          <strong>${escapeHtml(step.title)}</strong>
          <span>${escapeHtml(step.text)}</span>
        </article>
      `).join("")}
    </div>
    ${renderVectorTraceVisual(result?.vector_trace)}
    ${renderRagVisualDashboard(result, chunks, module)}
    <div class="rag-visual-grid">
      <article class="rag-visual-box">
        <h3>${module.id === "graph" ? "实体关系图" : module.id === "agentic" ? "智能体决策轨迹" : "文档切片与匹配"}</h3>
        ${module.id === "graph" ? renderGraphVisual() : module.id === "agentic" ? renderAgenticVisual() : renderChunkMatchVisual(chunks)}
      </article>
      <article class="rag-visual-box">
        <h3>数据怎么存</h3>
        ${renderStorageVisual(module.id)}
      </article>
    </div>
  `;
}

function renderVectorTraceVisual(trace) {
  if (!trace) {
    return `
      <article class="vector-trace-panel">
        <div class="rag-visual-card-head">
          <strong>数据库向量透视</strong>
          <span>运行实验后显示真实表记录</span>
        </div>
        <div class="vector-trace-empty">
          <span>等待一次检索</span>
          <p>这里会显示：query 向量、命中 chunk 在 documents / document_chunks / chunk_vectors 里的位置，以及向量检索、BM25、融合分、Rerank 的排序过程。</p>
        </div>
      </article>
    `;
  }
  const query = trace.query || {};
  const chunks = trace.chunks || [];
  return `
    <article class="vector-trace-panel">
      <div class="rag-visual-card-head">
        <strong>数据库向量透视</strong>
        <span>${escapeHtml(query.provider || "embedding")} · ${escapeHtml(query.model_name || "")}</span>
      </div>
      ${renderVectorModeTabs()}
      <div class="vector-query-card">
        <div>
          <span class="vector-label">检索词 query</span>
          <strong>${escapeHtml(query.text || "")}</strong>
          <small>${escapeHtml(query.storage || "实时计算")}</small>
        </div>
        ${renderVectorPreview(query.vector)}
      </div>
      <div class="vector-flow-map">
        ${(trace.tables || []).map((item, index) => `
          <div>
            <b>${index + 1}</b>
            <span>${escapeHtml(item)}</span>
          </div>
        `).join("")}
      </div>
      <div class="vector-chunk-grid">
        ${chunks.map(renderStoredChunkTrace).join("") || `<p class="empty-text">数据库检索没有命中已入库 chunk。</p>`}
      </div>
    </article>
  `;
}

function renderStoredChunkTrace(chunk) {
  const storage = chunk.storage || {};
  const isTemporary = typeof storage === "string";
  return `
    <section class="stored-chunk-card">
      <div class="stored-chunk-head">
        <b>#${chunk.rank}</b>
        <div>
          <strong>${escapeHtml(chunk.document_name || chunk.chunk_id || "未命名片段")}</strong>
          <span>${isTemporary ? escapeHtml(storage) : `chunk_index=${chunk.chunk_index} · token_count=${chunk.token_count || 0}`}</span>
        </div>
      </div>
      ${isTemporary ? "" : renderStoragePath(storage)}
      ${renderVectorPreview(chunk.vector)}
      ${renderSharedDimensions(chunk.shared_dimensions || [])}
      ${renderTraceScores(chunk.scores || {})}
      ${chunk.content_preview ? `<p>${escapeHtml(chunk.content_preview)}</p>` : ""}
    </section>
  `;
}

function renderStoragePath(storage) {
  const documents = storage.documents || {};
  const chunks = storage.document_chunks || {};
  const vectors = storage.chunk_vectors || {};
  return `
    <div class="storage-path">
      <div>
        <span>documents</span>
        <strong>${escapeHtml(documents.id || "-")}</strong>
        <small>${escapeHtml(documents.file_name || "")}</small>
      </div>
      <i></i>
      <div>
        <span>document_chunks</span>
        <strong>${escapeHtml(chunks.id || "-")}</strong>
        <small>document_id=${escapeHtml(chunks.document_id || "-")}</small>
      </div>
      <i></i>
      <div>
        <span>chunk_vectors</span>
        <strong>${escapeHtml(vectors.chunk_id || "-")}</strong>
        <small>${escapeHtml(vectors.dimensions || "-")} 维 · ${escapeHtml(vectors.provider || "")}</small>
      </div>
    </div>
  `;
}

function renderVectorModeTabs() {
  const modes = [
    ["top", "Top 维度"],
    ["nonZero", "非零维"],
    ["first", "前 12 维"],
  ];
  return `
    <div class="vector-mode-tabs">
      ${modes.map(([mode, label]) => `
        <button type="button" class="${state.vectorPreviewMode === mode ? "is-active" : ""}" data-vector-mode="${mode}">${escapeHtml(label)}</button>
      `).join("")}
    </div>
  `;
}

function renderVectorPreview(vector = {}) {
  const entries = vectorEntriesForMode(vector);
  return `
    <div class="vector-preview">
      <div class="vector-preview-head">
        <span>${escapeHtml(vectorModeLabel())}</span>
        <b>${Number(vector.dimensions || 0)} 维</b>
        <small>非零 ${Number(vector.non_zero || 0)}</small>
      </div>
      <div class="vector-bars">
        ${entries.map((entry) => {
          const numeric = Number(entry.value);
          const height = Math.max(6, Math.round(Math.min(1, Math.abs(numeric)) * 44));
          return `<span class="${numeric < 0 ? "is-negative" : ""}" style="height:${height}px" title="dim ${entry.index}: ${numeric.toFixed(4)}"><small>${entry.index}</small></span>`;
        }).join("") || `<em>暂无向量</em>`}
      </div>
      <code>${entries.map((entry) => `${entry.index}:${Number(entry.value).toFixed(4)}`).join("  ")}</code>
    </div>
  `;
}

function vectorEntriesForMode(vector = {}) {
  if (state.vectorPreviewMode === "first") {
    return vector.first_dimensions || (vector.first_values || []).map((value, index) => ({ index, value }));
  }
  if (state.vectorPreviewMode === "nonZero") {
    return vector.non_zero_values || [];
  }
  return vector.top_values || vector.first_dimensions || (vector.first_values || []).map((value, index) => ({ index, value }));
}

function vectorModeLabel() {
  return {
    first: "前 12 维",
    nonZero: "非零维预览",
    top: "绝对值最大维",
  }[state.vectorPreviewMode] || "向量预览";
}

function renderSharedDimensions(dimensions) {
  return `
    <div class="shared-dimensions">
      <strong>共同贡献维度</strong>
      <div>
        ${dimensions.map((item) => `
          <span title="query ${Number(item.query || 0).toFixed(4)} × chunk ${Number(item.chunk || 0).toFixed(4)}">
            dim ${item.index}<b>${Number(item.contribution || 0).toFixed(4)}</b>
          </span>
        `).join("") || `<small>没有明显共同贡献维度。</small>`}
      </div>
    </div>
  `;
}

function renderTraceScores(scores) {
  const rows = [
    ["向量", scores.vector, "query 向量和 chunk 向量的内积相似度"],
    ["BM25", scores.bm25, "关键词命中后的归一化分数"],
    ["融合", scores.hybrid, "vector * 0.65 + BM25 * 0.35"],
    ["Rerank", scores.rerank, "base * 0.65 + 覆盖 * 0.25 + 完整度 * 0.10"],
  ];
  return `
    <div class="trace-score-grid">
      ${rows.map(([label, value, title]) => {
        const hasValue = value != null && Number.isFinite(Number(value));
        const percent = hasValue ? ragScorePercent(value) : 0;
        return `
          <div title="${escapeAttr(title)}">
            <span>${escapeHtml(label)} <b>${hasValue ? formatRagScore(value) : "-"}</b></span>
            <i><em style="width:${Math.max(hasValue ? 4 : 0, percent)}%"></em></i>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderRagVisualDashboard(result, chunks, module) {
  const hitCount = result ? (result.retrieved_chunks || []).length : chunks.length;
  return `
    <div class="rag-visual-dashboard">
      ${renderRagPipelineVisual(result, chunks, module, hitCount)}
      ${renderRagEvidenceGauge(result?.evaluation, chunks, Boolean(result), hitCount)}
      ${renderRagScoreBoardVisual(chunks)}
      ${renderRagChunkTimeline(chunks)}
    </div>
  `;
}

function renderRagPipelineVisual(result, chunks, module, hitCount) {
  const params = result?.params || {
    top_k: module.preset?.topK,
    hybrid: module.preset?.hybrid,
    rerank: module.preset?.rerank,
  };
  const evaluation = result?.evaluation || {};
  const hasResult = Boolean(result);
  const steps = [
    {
      title: "切片",
      metric: hasResult ? `${result.chunk_count || 0} 个 chunk` : `${module.name} 预览`,
      status: hasResult ? "pass" : "idle",
    },
    {
      title: "召回",
      metric: hasResult ? `命中 ${hitCount} / Top ${params.top_k || hitCount}` : "示例片段排序",
      status: hitCount ? "pass" : hasResult ? "fail" : "idle",
    },
    {
      title: "Hybrid",
      metric: params.hybrid === false ? "仅向量检索" : "BM25 + 向量",
      status: params.hybrid === false ? "idle" : "pass",
    },
    {
      title: "Rerank",
      metric: params.rerank ? "已重排序" : "未启用",
      status: params.rerank ? "pass" : "idle",
    },
    {
      title: "质量",
      metric: hasResult ? ragVerdictText(evaluation.verdict) : "等待实验",
      status: hasResult ? ragVerdictTone(evaluation.verdict) : "idle",
    },
  ];
  return `
    <article class="rag-pipeline-card">
      <div class="rag-visual-card-head">
        <strong>实验链路</strong>
        <span>${hasResult ? "实时结果" : "学习预览"}</span>
      </div>
      <div class="rag-pipeline">
        ${steps.map((step, index) => `
          <div class="rag-pipeline-step is-${step.status}">
            <b>${index + 1}</b>
            <strong>${escapeHtml(step.title)}</strong>
            <span>${escapeHtml(step.metric)}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderRagEvidenceGauge(evaluation = {}, chunks = [], hasResult = false, hitCount = chunks.length) {
  const topScore = Number(evaluation.top_score ?? chunks[0]?.score ?? 0);
  const coverage = Number(evaluation.coverage_ratio ?? chunks[0]?.token_coverage ?? 0);
  const gaugeValue = ragScorePercent(hasResult ? Math.max(topScore, coverage) : topScore);
  const tone = hasResult ? ragVerdictTone(evaluation.verdict) : "idle";
  return `
    <article class="rag-evidence-card">
      <div class="rag-visual-card-head">
        <strong>证据强度</strong>
        <span>${hasResult ? ragVerdictText(evaluation.verdict) : "示例分布"}</span>
      </div>
      <div class="rag-evidence-body">
        <div class="rag-evidence-gauge is-${tone}" style="--value:${gaugeValue}%">
          <div>
            <strong>${gaugeValue}%</strong>
            <span>综合</span>
          </div>
        </div>
        <div class="rag-evidence-stats">
          <span>最高相关度 <b>${formatRagScore(topScore)}</b></span>
          <span>问题覆盖率 <b>${formatRagScore(coverage)}</b></span>
          <span>命中片段 <b>${hitCount}</b></span>
        </div>
      </div>
    </article>
  `;
}

function renderRagScoreBoardVisual(chunks) {
  const visibleChunks = chunks.slice(0, 3);
  return `
    <article class="rag-score-card">
      <div class="rag-visual-card-head">
        <strong>分数对比</strong>
        <span>向量 / BM25 / 融合 / Rerank</span>
      </div>
      <div class="rag-score-board">
        ${visibleChunks.map((chunk, index) => `
          <div class="rag-score-row">
            <div class="rag-score-title">
              <strong>片段 ${Number(chunk.chunk_index ?? index) + 1}</strong>
              <span>${escapeHtml(chunk.document_name || "示例文档")}</span>
            </div>
            ${renderRagScoreMeter("向量", chunk.vector_score ?? chunk.score)}
            ${renderRagScoreMeter("BM25", chunk.bm25_score)}
            ${renderRagScoreMeter("融合", chunk.hybrid_score)}
            ${renderRagScoreMeter("Rerank", chunk.rerank_score)}
          </div>
        `).join("") || `<p class="empty-text">暂无命中片段。</p>`}
      </div>
    </article>
  `;
}

function renderRagScoreMeter(label, value) {
  const hasValue = value != null && Number.isFinite(Number(value));
  const percent = hasValue ? ragScorePercent(value) : 0;
  return `
    <div class="rag-score-meter ${hasValue ? "" : "is-empty"}">
      <span>${escapeHtml(label)} <b>${hasValue ? formatRagScore(value) : "未启用"}</b></span>
      <div><i style="width:${Math.max(hasValue ? 4 : 0, percent)}%"></i></div>
    </div>
  `;
}

function renderRagChunkTimeline(chunks) {
  return `
    <article class="rag-timeline-card">
      <div class="rag-visual-card-head">
        <strong>命中热度</strong>
        <span>Top K 片段排序</span>
      </div>
      <div class="rag-chunk-timeline">
        ${chunks.map((chunk, index) => {
          const score = Number(chunk.rerank_score ?? chunk.hybrid_score ?? chunk.score ?? 0);
          const coverage = chunk.token_coverage == null ? null : Number(chunk.token_coverage);
          return `
            <div class="rag-timeline-item">
              <span>${index + 1}</span>
              <div>
                <strong>${escapeHtml(chunk.document_name || "示例文档")}</strong>
                <div class="rag-timeline-track"><i style="width:${Math.max(6, ragScorePercent(score))}%"></i></div>
              </div>
              <small>${formatRagScore(score)}${coverage == null ? "" : ` · 覆盖 ${formatRagScore(coverage)}`}</small>
            </div>
          `;
        }).join("") || `<p class="empty-text">暂无命中片段。</p>`}
      </div>
    </article>
  `;
}

function visualSummary(moduleId) {
  return {
    naive: "看清楚文档如何切片、问题如何匹配片段、片段如何进入上下文。",
    advanced: "看清楚向量分、关键词分、融合分、重排序如何共同影响证据顺序。",
    agentic: "看清楚 Agent 如何判断是否检索、是否继续检索、是否生成任务。",
    graph: "看清楚文档如何被抽成实体和关系，再通过关系路径找答案。",
  }[moduleId] || "查看 RAG 内部链路。";
}

function visualFlowSteps(moduleId) {
  const common = {
    naive: [
      ["切片", "长文档被拆成多个 chunk。"],
      ["向量化", "每个 chunk 变成向量。"],
      ["匹配", "问题向量和 chunk 向量做相似度计算。"],
      ["生成", "命中片段拼进 Prompt 后回答。"],
    ],
    advanced: [
      ["理解问题", "识别问题意图，必要时改写查询。"],
      ["混合召回", "向量检索找语义，BM25 找关键词。"],
      ["重排序", "Rerank 让更完整、更覆盖问题的片段靠前。"],
      ["评测", "用引用、覆盖率和无依据规则判断质量。"],
    ],
    agentic: [
      ["计划", "判断问题需要哪些资料和工具。"],
      ["检索", "选择知识库并发起一次或多次检索。"],
      ["反思", "检查证据是否足够，不足则继续检索或追问。"],
      ["行动", "生成回答、任务或复盘动作。"],
    ],
    graph: [
      ["抽实体", "从文档里识别 RAG、Embedding、BM25 等实体。"],
      ["抽关系", "识别包含、用于、优化、依赖等关系。"],
      ["走路径", "沿实体关系做多跳查找。"],
      ["解释", "用关系路径解释答案来源。"],
    ],
  }[moduleId] || [];
  return common.map(([title, text]) => ({ title, text }));
}

function demoRagChunks(moduleId) {
  const base = [
    { document_name: "rag_demo.md", chunk_index: 0, score: 0.82, vector_score: 0.82, bm25_score: 0.63, hybrid_score: 0.75, rerank_score: 0.79, content: "RAG 包含文档解析、文本切片、向量化、检索和生成回答。引用来源可以帮助用户判断回答是否可信。" },
    { document_name: "rag_demo.md", chunk_index: 1, score: 0.64, vector_score: 0.64, bm25_score: 0.72, hybrid_score: 0.67, rerank_score: 0.70, content: "Embedding 模型把文本片段转换成向量，向量数据库根据用户问题找到最相关的文档片段。" },
    { document_name: "AI前沿资料包.md", chunk_index: 2, score: 0.46, vector_score: 0.46, bm25_score: 0.38, hybrid_score: 0.43, rerank_score: 0.44, content: "企业 RAG 系统需要混合检索、重排序、无依据拒答和自动评测，才能稳定进入真实业务。" },
  ];
  if (moduleId === "graph") return base.slice(0, 2);
  if (moduleId === "agentic") return base.slice(0, 3);
  return base;
}

function renderChunkMatchVisual(chunks) {
  return `
    <div class="chunk-match-list">
      ${chunks.map((chunk, index) => {
        const score = Number(chunk.rerank_score ?? chunk.hybrid_score ?? chunk.score ?? 0);
        const width = Math.max(6, Math.min(100, Math.round(score * 100)));
        return `
          <div class="chunk-match-item">
            <div>
              <strong>片段 ${Number(chunk.chunk_index ?? index) + 1}</strong>
              <span>${escapeHtml(chunk.document_name || "示例文档")} · 匹配度 ${score.toFixed(2)}</span>
            </div>
            <div class="match-bar"><span style="width:${width}%"></span></div>
            <p>${escapeHtml(chunk.content || chunk.snippet || "")}</p>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderAgenticVisual() {
  const steps = [
    ["理解问题", "用户想升级知行者，需要先判断这是问答、规划还是任务生成。", "done"],
    ["选择工具", "先检索知识库，再决定是否需要生成任务。", "done"],
    ["检查证据", "如果检索片段不足，要继续检索或让用户补文档。", "active"],
    ["输出行动", "证据足够后，生成下一步计划和任务清单。", "next"],
  ];
  return `
    <div class="agent-trace">
      ${steps.map(([title, text, status], index) => `
        <article class="agent-step is-${status}">
          <b>${index + 1}</b>
          <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderGraphVisual() {
  const nodes = ["RAG", "Embedding", "BM25", "Rerank", "检索", "回答"];
  const edges = [
    ["RAG", "包含", "Embedding"],
    ["RAG", "包含", "检索"],
    ["BM25", "增强", "检索"],
    ["Rerank", "优化", "检索"],
    ["检索", "提供依据", "回答"],
  ];
  return `
    <div class="graph-board">
      <div class="graph-nodes">
        ${nodes.map((node) => `<span>${escapeHtml(node)}</span>`).join("")}
      </div>
      <div class="graph-edges">
        ${edges.map(([from, relation, to]) => `
          <div><strong>${escapeHtml(from)}</strong><span>${escapeHtml(relation)}</span><strong>${escapeHtml(to)}</strong></div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderStorageVisual(moduleId) {
  const rows = [
    ["documents", "原始文档记录", "文件名、类型、状态、所属知识库"],
    ["document_chunks", "切片文本", "chunk_index、content、token_count"],
    ["chunk_vectors", "向量数据", "vector_json、model_name、dimensions"],
  ];
  if (moduleId === "advanced") {
    rows.push(["rag_eval_cases", "评测用例", "问题、预期 verdict、关键词"]);
    rows.push(["rag_eval_results", "评测结果", "实际 verdict、是否通过、失败原因"]);
  }
  if (moduleId === "agentic") {
    rows.push(["chat_messages", "步骤上下文", "用户问题、回答、引用"]);
    rows.push(["tasks", "行动结果", "AI 生成任务、状态、优先级"]);
  }
  if (moduleId === "graph") {
    rows.push(["graph_nodes", "未来扩展", "实体：RAG、Embedding、论文、项目"]);
    rows.push(["graph_edges", "未来扩展", "关系：包含、用于、提出、依赖"]);
  }
  return `
    <div class="storage-table">
      ${rows.map(([table, purpose, fields]) => `
        <div>
          <strong>${escapeHtml(table)}</strong>
          <span>${escapeHtml(purpose)}</span>
          <small>${escapeHtml(fields)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRagLabHistory() {
  $("#ragLabHistory").innerHTML =
    state.ragLabRuns
      .map((run) => {
        const evaluation = run.evaluation || {};
        const params = run.params || {};
        return `
          <article class="rag-lab-history-item">
            <strong>${escapeHtml(run.question)}</strong>
            <span>${formatDate(run.created_at)} · ${escapeHtml(ragVerdictText(evaluation.verdict))} · 最高相关度 ${Number(evaluation.top_score || 0).toFixed(2)}</span>
            <small>chunk_size=${params.chunk_size}，overlap=${params.overlap}，top_k=${params.top_k}，hybrid=${params.hybrid === false ? "关" : "开"}，rerank=${params.rerank ? "开" : "关"} · 命中 ${run.retrieved_chunks?.length || 0} 条</small>
          </article>
        `;
      })
      .join("") || `<p class="empty-text">还没有保存过实验。</p>`;
}

function renderRagEvalCases() {
  $("#ragEvalCaseList").innerHTML =
    state.ragEvalCases
      .map(
        (item) => `
          <article class="rag-lab-history-item">
            <strong>${escapeHtml(item.question)}</strong>
            <span>预期：${escapeHtml(ragVerdictText(item.expected_verdict))}${item.expected_terms?.length ? ` · 关键词 ${escapeHtml(item.expected_terms.join("、"))}` : ""}</span>
            <small>${escapeHtml(item.note || "无备注")}</small>
            <button class="mini-btn" data-delete-rag-eval-case="${escapeHtml(item.id)}">删除</button>
          </article>
        `,
      )
      .join("") || `<p class="empty-text">还没有评测用例。</p>`;
  $$("[data-delete-rag-eval-case]").forEach((button) => {
    button.addEventListener("click", () => deleteRagEvalCase(button.dataset.deleteRagEvalCase));
  });
}

function renderRagEvalResult() {
  const batch = state.ragEvalBatch;
  if (!batch) {
    $("#ragEvalSummary").textContent = "运行后展示通过率和失败原因";
    $("#ragEvalResult").innerHTML = `<p class="empty-text">添加用例后，用当前实验参数运行评测。</p>`;
    return;
  }
  $("#ragEvalSummary").textContent = `通过 ${batch.passed_count}/${batch.total_count} · 通过率 ${(Number(batch.pass_rate || 0) * 100).toFixed(0)}%`;
  $("#ragEvalResult").innerHTML =
    renderRagEvalOverview(batch) +
    batch.results
      .map(
        (item) => `
          <article class="rag-eval-case ${item.passed ? "is-pass" : "is-fail"}">
            <div>
              <strong>${item.passed ? "通过" : "失败"} · ${escapeHtml(item.question)}</strong>
              <span>预期 ${escapeHtml(ragVerdictText(item.expected_verdict))} · 实际 ${escapeHtml(ragVerdictText(item.actual_verdict))}</span>
            </div>
            <p>${escapeHtml(item.reason)}</p>
          </article>
        `,
      )
      .join("");
}

function renderRagEvalOverview(batch) {
  const results = batch.results || [];
  const failed = results.filter((item) => !item.passed);
  const passRate = Math.round(Number(batch.pass_rate || 0) * 100);
  const verdictCounts = results.reduce((acc, item) => {
    const key = item.actual_verdict || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const verdictRows = ["grounded", "weak_evidence", "no_evidence"].map((key) => [ragVerdictText(key), verdictCounts[key] || 0]);
  return `
    <div class="rag-eval-overview">
      <article class="rag-eval-pass-card">
        <div class="rag-eval-ring ${passRate >= 90 ? "is-pass" : passRate >= 70 ? "is-warn" : "is-fail"}" style="--value:${passRate}%">
          <strong>${passRate}%</strong>
          <span>通过率</span>
        </div>
        <div>
          <strong>${batch.passed_count}/${batch.total_count} 通过</strong>
          <span>失败 ${batch.failed_count || failed.length} 个 · 参数 Top K ${batch.params?.top_k || "-"} · ${batch.params?.hybrid === false ? "Hybrid 关" : "Hybrid 开"} · ${batch.params?.rerank ? "Rerank 开" : "Rerank 关"}</span>
        </div>
      </article>
      <article class="rag-eval-matrix-card">
        <strong>用例矩阵</strong>
        <div class="rag-eval-matrix">
          ${results.map((item, index) => `
            <span class="${item.passed ? "is-pass" : "is-fail"}" title="${escapeAttr(item.question)}">${index + 1}</span>
          `).join("")}
        </div>
      </article>
      <article class="rag-eval-verdict-card">
        <strong>实际判断分布</strong>
        ${verdictRows.map(([label, count]) => `
          <div class="rag-verdict-row">
            <span>${escapeHtml(label)}</span>
            <div><i style="width:${Math.max(count ? 6 : 0, Math.round((count / Math.max(results.length, 1)) * 100))}%"></i></div>
            <b>${count}</b>
          </div>
        `).join("")}
      </article>
      <article class="rag-eval-fail-card">
        <strong>失败洞察</strong>
        ${failed.length ? failed.slice(0, 3).map((item) => `
          <span>${escapeHtml(item.question)}</span>
          <small>${escapeHtml(item.reason)}</small>
        `).join("") : `<span>当前评测集全部通过。</span>`}
      </article>
    </div>
  `;
}

function renderRerankScores(chunk) {
  if (chunk.rerank_score == null && chunk.vector_score == null && chunk.bm25_score == null && chunk.hybrid_score == null) return "";
  const vector = chunk.vector_score == null ? "" : ` · 向量 ${Number(chunk.vector_score).toFixed(4)}`;
  const bm25 = chunk.bm25_score == null ? "" : ` · BM25 ${Number(chunk.bm25_score).toFixed(4)}`;
  const hybrid = chunk.hybrid_score == null ? "" : ` · 融合 ${Number(chunk.hybrid_score).toFixed(4)}`;
  const rerank = chunk.rerank_score == null ? "" : ` · rerank ${Number(chunk.rerank_score).toFixed(4)}`;
  const coverage = chunk.token_coverage == null ? "" : ` · 覆盖 ${Number(chunk.token_coverage).toFixed(2)}`;
  return `${vector}${bm25}${hybrid}${rerank}${coverage}`;
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
  const citationsHtml = state.citations
    .map(
      (item) => `
        <article class="citation-item">
          <strong>${escapeHtml(item.document_name)}</strong>
          <span>片段 ${Number(item.chunk_index || 0) + 1} · 相关度 ${Number(item.score || 0).toFixed(2)}</span>
          <span>${escapeHtml(item.snippet)}</span>
        </article>
      `,
    )
    .join("");
  $("#citationList").innerHTML =
    `${state.ragEvaluation ? renderRagEvaluation(state.ragEvaluation) : ""}${citationsHtml}` ||
    `<p class="empty-text">暂无引用。</p>`;
}

function renderRagEvaluation(evaluation) {
  const labels = {
    grounded: "依据充分",
    weak_evidence: "依据偏弱",
    no_evidence: "没有依据",
  };
  const label = labels[evaluation.verdict] || evaluation.verdict || "未评估";
  return `
    <article class="citation-item rag-eval-card">
      <strong>RAG 质量检查 · ${escapeHtml(label)}</strong>
      <span>引用 ${evaluation.retrieved_count || 0} 条 · 最高相关度 ${Number(evaluation.top_score || 0).toFixed(2)}</span>
      <span>问题覆盖率 ${Number(evaluation.coverage_ratio || 0).toFixed(2)} · 阈值 ${Number(evaluation.min_coverage || 0).toFixed(2)}</span>
      <span>${escapeHtml(evaluation.suggestion || "")}</span>
    </article>
  `;
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
      state.ragEvaluation = null;
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
      ? `<button class="mini-btn" data-edit-task="${task.id}">✎ 编辑</button>
         <button class="mini-inline-danger" data-delete-task="${task.id}">🗑 删除</button>`
      : `<button class="mini-btn" data-start-task="${task.id}">▶ 开始</button>
         <button class="mini-btn" data-complete-task="${task.id}">✓ 完成</button>
         <button class="mini-btn" data-edit-task="${task.id}">✎ 编辑</button>
         <button class="mini-inline-danger" data-delete-task="${task.id}">🗑 删除</button>`;
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
  $("#cockpitHomeBtn").addEventListener("click", () => switchView("dashboard"));
  $("#addTaskBtn").addEventListener("click", () => openModal("taskModal"));
  $("#confirmKbDeleteBtn").addEventListener("click", confirmDeleteKnowledgeBase);

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
    state.ragEvaluation = null;
    renderChat();
  });
  $("#ragLabKbSelect").addEventListener("change", (event) => {
    state.activeKnowledgeBaseId = event.target.value;
    state.ragLabResult = null;
    state.ragEvalBatch = null;
    Promise.all([loadRagLabRuns(), loadRagEvalCases()]).then(() => {
      renderChat();
      renderRagLab();
    });
  });
  $("#agentLabKbSelect").addEventListener("change", async (event) => {
    state.activeKnowledgeBaseId = event.target.value;
    state.agentLabResult = null;
    await loadAgentLabRuns();
    renderChat();
    renderAgentLab();
  });
  $("#ragVisual").addEventListener("click", (event) => {
    const button = event.target.closest("[data-vector-mode]");
    if (!button) return;
    state.vectorPreviewMode = button.dataset.vectorMode;
    renderRagVisualization();
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
  $("#ragLabForm").addEventListener("submit", runRagLab);
  $("#agentLabForm").addEventListener("submit", runAgentLab);
  $("#saveRagLabRunBtn").addEventListener("click", saveRagLabRun);
  $("#ragEvalCaseForm").addEventListener("submit", createRagEvalCase);
  $("#runRagEvalBtn").addEventListener("click", runRagEvalBatch);
  $("#newSessionBtn").addEventListener("click", () => {
    state.activeSessionId = null;
    state.messages = [];
    state.citations = [];
    state.ragEvaluation = null;
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
  initRagLabRanges();

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

function openKnowledgeBaseDeleteModal(kbId) {
  state.pendingDeleteKbId = kbId;
  const kb = state.knowledgeBases.find((item) => item.id === kbId);
  const docCount = kb ? kb.document_count : 0;
  $("#kbDeleteText").textContent = `将删除知识库“${kb?.name || ""}”，当前关联 ${docCount} 个文档。`;
  const defaultChoice = document.querySelector('input[name="kbDeleteMode"][value="detach"]');
  if (defaultChoice) defaultChoice.checked = true;
  openModal("kbDeleteModal");
}

async function confirmDeleteKnowledgeBase() {
  if (!state.pendingDeleteKbId) return;
  const mode = document.querySelector('input[name="kbDeleteMode"]:checked')?.value || "detach";
  try {
    await api(`/api/knowledge-bases/${state.pendingDeleteKbId}`, {
      method: "DELETE",
      body: JSON.stringify({
        delete_documents: mode === "cascade",
      }),
    });
    if (state.activeKnowledgeBaseId === state.pendingDeleteKbId) {
      state.activeKnowledgeBaseId = null;
      state.activeSessionId = null;
      state.messages = [];
      state.citations = [];
      state.ragEvaluation = null;
      state.activeAnswer = "";
    }
    state.pendingDeleteKbId = null;
    closeModal("kbDeleteModal");
    await loadAll();
    showToast(mode === "cascade" ? "知识库和关联文档已删除" : "知识库已删除，文档已转移到未分组文档");
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
    state.ragEvaluation = response.rag_evaluation || null;
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

async function runRagLab(event) {
  event.preventDefault();
  const question = $("#ragLabQuestion").value.trim();
  const knowledgeBaseId = $("#ragLabKbSelect").value || state.activeKnowledgeBaseId;
  const chunkSize = Number($("#ragLabChunkSize").value);
  const overlap = Number($("#ragLabOverlap").value);
  const topK = Number($("#ragLabTopK").value);
  const rerank = $("#ragLabRerank").checked;
  const hybrid = $("#ragLabHybrid").checked;
  if (!question || !knowledgeBaseId) {
    showToast("请先选择知识库并输入问题");
    return;
  }
  if (overlap >= chunkSize) {
    showToast("重叠长度必须小于切片长度");
    return;
  }
  const button = event.submitter || $("#ragLabForm button[type='submit']");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "实验中...";
  $("#ragLabResult").innerHTML = `<p class="empty-text">正在按当前参数重新切片、生成向量并检索...</p>`;
  try {
    state.ragLabResult = await api("/api/rag/lab", {
      method: "POST",
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        question,
        chunk_size: chunkSize,
        overlap,
        top_k: topK,
        rerank,
        hybrid,
      }),
    });
    await loadRagLabRuns();
    renderRagLab();
    showToast("RAG 实验完成");
  } catch (error) {
    $("#ragLabResult").innerHTML = `<p class="empty-text">实验失败：${escapeHtml(error.message)}</p>`;
    showToast(`实验失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function saveRagLabRun() {
  if (!state.ragLabResult) {
    showToast("请先运行一次实验");
    return;
  }
  const knowledgeBaseId = $("#ragLabKbSelect").value || state.activeKnowledgeBaseId;
  if (!knowledgeBaseId) {
    showToast("请先选择知识库");
    return;
  }
  const button = $("#saveRagLabRunBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "保存中...";
  try {
    await api("/api/rag/lab/runs", {
      method: "POST",
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        ...state.ragLabResult,
      }),
    });
    await loadRagLabRuns();
    renderRagLab();
    showToast("实验记录已保存");
  } catch (error) {
    showToast(`保存实验失败：${error.message}`);
  } finally {
    button.disabled = !state.ragLabResult;
    button.textContent = original;
  }
}

async function runAgentLab(event) {
  event.preventDefault();
  const knowledgeBaseId = $("#agentLabKbSelect").value || state.activeKnowledgeBaseId;
  const goal = $("#agentLabGoal").value.trim();
  const mode = $("#agentLabMode").value;
  const maxSteps = Number($("#agentLabMaxSteps").value);
  const createTasks = $("#agentLabCreateTasks").checked;
  if (!knowledgeBaseId || !goal) {
    showToast("请先选择知识库并输入目标");
    return;
  }
  const button = event.submitter || $("#agentLabForm button[type='submit']");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "运行中...";
  $("#agentLabTrace").innerHTML = `<p class="empty-text">Agent 正在规划、检索和生成行动...</p>`;
  try {
    state.agentLabResult = await api("/api/agent/lab/run", {
      method: "POST",
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        goal,
        mode,
        max_steps: maxSteps,
        create_tasks: createTasks,
      }),
    });
    await loadAgentLabRuns();
    if (createTasks) {
      state.tasks = await api("/api/tasks");
      await loadAnalytics();
    }
    renderAgentLab();
    renderTasks();
    renderDashboard();
    showToast(createTasks ? "Agent 已运行并保存任务" : "Agent 运行完成");
  } catch (error) {
    $("#agentLabTrace").innerHTML = `<p class="empty-text">Agent 运行失败：${escapeHtml(error.message)}</p>`;
    showToast(`Agent 运行失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function createRagEvalCase(event) {
  event.preventDefault();
  const knowledgeBaseId = $("#ragLabKbSelect").value || state.activeKnowledgeBaseId;
  const question = $("#ragEvalQuestion").value.trim();
  const expectedVerdict = $("#ragEvalExpectedVerdict").value;
  const expectedTerms = $("#ragEvalExpectedTerms").value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const note = $("#ragEvalNote").value.trim();
  if (!knowledgeBaseId || !question) {
    showToast("请先选择知识库并填写评测问题");
    return;
  }
  try {
    await api("/api/rag/eval-cases", {
      method: "POST",
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        question,
        expected_verdict: expectedVerdict,
        expected_terms: expectedTerms,
        note,
      }),
    });
    $("#ragEvalQuestion").value = "";
    $("#ragEvalExpectedTerms").value = "";
    $("#ragEvalNote").value = "";
    await loadRagEvalCases();
    renderRagEvalCases();
    showToast("评测用例已添加");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteRagEvalCase(caseId) {
  try {
    await api(`/api/rag/eval-cases/${caseId}`, { method: "DELETE" });
    await loadRagEvalCases();
    renderRagEvalCases();
    showToast("评测用例已删除");
  } catch (error) {
    showToast(error.message);
  }
}

async function runRagEvalBatch() {
  const knowledgeBaseId = $("#ragLabKbSelect").value || state.activeKnowledgeBaseId;
  const chunkSize = Number($("#ragLabChunkSize").value);
  const overlap = Number($("#ragLabOverlap").value);
  const topK = Number($("#ragLabTopK").value);
  const rerank = $("#ragLabRerank").checked;
  const hybrid = $("#ragLabHybrid").checked;
  if (!knowledgeBaseId) {
    showToast("请先选择知识库");
    return;
  }
  if (!state.ragEvalCases.length) {
    showToast("请先添加评测用例");
    return;
  }
  const button = $("#runRagEvalBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "评测中...";
  $("#ragEvalResult").innerHTML = `<p class="empty-text">正在用当前参数运行全部评测用例...</p>`;
  try {
    state.ragEvalBatch = await api("/api/rag/eval-batches/run", {
      method: "POST",
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        chunk_size: chunkSize,
        overlap,
        top_k: topK,
        rerank,
        hybrid,
      }),
    });
    renderRagEvalResult();
    showToast("评测完成");
  } catch (error) {
    $("#ragEvalResult").innerHTML = `<p class="empty-text">评测失败：${escapeHtml(error.message)}</p>`;
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
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
      state.ragEvaluation = null;
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

function ragVerdictText(verdict) {
  return { grounded: "依据充分", weak_evidence: "依据偏弱", no_evidence: "没有依据" }[verdict] || verdict || "未评估";
}

function ragVerdictTone(verdict) {
  return { grounded: "pass", weak_evidence: "warn", no_evidence: "fail" }[verdict] || "idle";
}

function agentModeText(mode) {
  return { rag_agent: "RAG 助手", test_agent: "测试分析助手", learning_agent: "学习规划助手" }[mode] || mode || "Agent";
}

function agentPhaseText(phase) {
  return { plan: "计划", retrieve: "检索", evaluate: "评估", act: "行动" }[phase] || phase || "步骤";
}

function ragScorePercent(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function formatRagScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "0.00";
  return score.toFixed(2);
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

function initRagLabRanges() {
  ragLabRangePairs().forEach(([inputId]) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("input", syncRagLabRangeLabels);
    input.addEventListener("change", syncRagLabRangeLabels);
  });
  syncRagLabRangeLabels();
}

function initAgentLabRanges() {
  const input = document.getElementById("agentLabMaxSteps");
  const label = document.getElementById("agentLabMaxStepsVal");
  if (!input || !label) return;
  const sync = () => {
    label.textContent = `${input.value} 步`;
  };
  input.addEventListener("input", sync);
  input.addEventListener("change", sync);
  sync();
}

function ragLabRangePairs() {
  return [
    ["ragLabChunkSize", "ragLabChunkSizeVal", (v) => `${v} 字符`],
    ["ragLabOverlap", "ragLabOverlapVal", (v) => `${v} 字符`],
    ["ragLabTopK", "ragLabTopKVal", (v) => `${v} 条`],
  ];
}

function syncRagLabRangeLabels() {
  ragLabRangePairs().forEach(([inputId, labelId, format]) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;
    label.textContent = format(input.value);
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
  renderRagLab();
  renderAgentLab();
  renderTasks();
  renderGoals();
  renderSettings();
}

bindGlobalEvents();
initAgentLabRanges();
loadAll();
window.setInterval(updateScreenClock, 1000);
window.addEventListener("resize", resizeScreen);
