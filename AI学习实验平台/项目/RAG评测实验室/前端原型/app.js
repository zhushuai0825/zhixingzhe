const documents = [
  { id: "d1", title: "RAG 核心流程", source: "rag_intro.md", text: "RAG 的核心流程是文档解析、文本切分、向量化、检索、基于证据生成回答。引用来源可以帮助用户判断回答是否可信。" },
  { id: "d2", title: "Embedding 作用", source: "embedding.md", text: "Embedding 会把 query 和 chunk 编码到同一个向量空间，方便用余弦相似度或点积进行语义检索。" },
  { id: "d3", title: "向量库职责", source: "vector_db.md", text: "向量数据库负责保存 chunk embedding、原文和 metadata，并支持 Top K 相似查询和 metadata 过滤。" },
  { id: "d4", title: "Rerank 提准", source: "rerank.md", text: "Rerank 位于向量召回之后，会重新排序候选证据，把更能回答问题的 chunk 放到前面，减少上下文噪声。" },
  { id: "d5", title: "证据不足拒答", source: "guardrail.md", text: "如果检索结果没有足够依据，RAG 系统应该拒答或提示知识库依据不足，而不是让模型编造答案。" },
  { id: "d6", title: "Agent 工具调用", source: "agent.md", text: "Agent 可以围绕目标做计划、调用工具、观察结果、评估证据并生成下一步任务。" },
];

const defaultCases = [
  {
    id: "q1",
    question: "RAG 的核心流程是什么？",
    goldDocs: ["d1"],
    goldAnswer: "RAG 的核心流程是文档解析、文本切分、向量化、检索、基于证据生成回答。",
    shouldAnswer: true,
  },
  {
    id: "q2",
    question: "Embedding 在 RAG 里起什么作用？",
    goldDocs: ["d2"],
    goldAnswer: "Embedding 把 query 和 chunk 编码到同一个向量空间，让系统可以做语义检索。",
    shouldAnswer: true,
  },
  {
    id: "q3",
    question: "Rerank 为什么能提升 RAG 准确率？",
    goldDocs: ["d4"],
    goldAnswer: "Rerank 会重新排序向量召回的候选证据，把更能回答问题的 chunk 放前面，减少噪声。",
    shouldAnswer: true,
  },
  {
    id: "q4",
    question: "当前知识库里有没有公司 2026 年薪酬制度？",
    goldDocs: [],
    goldAnswer: "知识库没有足够依据，应该拒答。",
    shouldAnswer: false,
  },
];

const roadmap = [
  ["01", "先准备评测集", "评测集至少要有问题、标准证据、标准答案，以及是否应该拒答。没有评测集，就只能凭感觉判断系统好坏。"],
  ["02", "先看检索指标", "Recall@K、Hit@K、MRR 主要判断标准证据有没有被找回来，以及排得靠不靠前。"],
  ["03", "再看回答指标", "答案要看引用准确率、忠实度、答案覆盖率和拒答正确性。检索对了，回答仍然可能不忠实。"],
  ["04", "根据短板优化", "检索差调切分、embedding、向量库和 rerank；忠实度差调 prompt、证据门和拒答策略。"],
  ["05", "持续回归", "每次改 chunk size、Top K、rerank 或 prompt，都应该跑同一套评测集，看指标是否真的提升。"],
];

const interviews = [
  ["RAG 系统怎么评测？", "要分层评测：检索层看 Recall@K、MRR、NDCG；回答层看忠实度、引用准确率、答案覆盖率；安全层看拒答正确性和幻觉率。"],
  ["Recall@K 是什么？", "标准证据是否出现在 Top K 检索结果里。比如标准证据是 d4，Top 3 里有 d4，则 Recall@3 命中。"],
  ["MRR 是什么？", "MRR 关注第一个正确证据排在第几名。正确证据第 1 名得 1，第 2 名得 1/2，第 3 名得 1/3。越靠前越好。"],
  ["引用准确率怎么评估？", "看回答引用的文档是否真的支撑答案。如果引用了不相关 chunk，即使答案看起来对，也不能算引用准确。"],
  ["忠实度是什么？", "忠实度表示回答是否严格基于检索证据。答案中出现证据没有支持的内容，就是忠实度问题，也常被称为幻觉。"],
  ["证据不足时应该怎么评测？", "要有不可回答问题。系统应该拒答或继续检索，而不是编造。可以用拒答正确率评估。"],
];

const state = {
  cases: JSON.parse(localStorage.getItem("rag-eval-cases-v1") || "null") || defaultCases,
  selectedCaseId: "q1",
  topK: 3,
  system: "rerank",
  result: null,
  metricNodes: [],
  metricAnimationStart: 0,
  metricAnimationProgress: 1,
  metricAnimationFrame: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function tokenize(text) {
  return (text.match(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]/g) || []).map((token) => token.toLowerCase());
}

function scoreText(query, text) {
  const queryTokens = new Set(tokenize(query));
  const textTokens = new Set(tokenize(text));
  const hits = [...queryTokens].filter((token) => textTokens.has(token));
  return {
    score: hits.length / Math.sqrt(Math.max(1, queryTokens.size) * Math.max(1, textTokens.size)),
    hits,
  };
}

function retrieve(evalCase, topK, system) {
  const rows = documents.map((doc) => {
    const lexical = scoreText(evalCase.question, `${doc.title} ${doc.text}`);
    const rerankBoost = system !== "naive" && evalCase.goldDocs.includes(doc.id) ? 0.18 : 0;
    const strictPenalty = system === "strict" && !evalCase.goldDocs.includes(doc.id) ? 0.05 : 0;
    return {
      ...doc,
      score: Math.max(0, lexical.score + rerankBoost - strictPenalty),
      hits: lexical.hits,
      isGold: evalCase.goldDocs.includes(doc.id),
    };
  }).sort((a, b) => b.score - a.score);
  return rows.slice(0, topK);
}

function generateAnswer(evalCase, retrieved, system) {
  const goldHits = retrieved.filter((doc) => doc.isGold);
  const enoughEvidence = goldHits.length > 0;
  const strictRefusal = system === "strict" && !enoughEvidence;
  if (!evalCase.shouldAnswer || strictRefusal) {
    return {
      answer: "当前知识库没有足够依据回答这个问题。",
      citedDocs: [],
      refused: true,
    };
  }
  if (enoughEvidence) {
    return {
      answer: evalCase.goldAnswer,
      citedDocs: goldHits.map((doc) => doc.id),
      refused: false,
    };
  }
  return {
    answer: "根据资料，可能与 RAG 相关，但当前证据不足，答案不可靠。",
    citedDocs: retrieved.slice(0, 1).map((doc) => doc.id),
    refused: false,
  };
}

function evaluateCase() {
  const evalCase = state.cases.find((item) => item.id === state.selectedCaseId) || state.cases[0];
  state.topK = Number($("#topKSelect").value);
  state.system = $("#systemSelect").value;
  const retrieved = retrieve(evalCase, state.topK, state.system);
  const generated = generateAnswer(evalCase, retrieved, state.system);
  const firstGoldIndex = retrieved.findIndex((doc) => doc.isGold);
  const recall = evalCase.goldDocs.length ? (retrieved.some((doc) => doc.isGold) ? 1 : 0) : 1;
  const mrr = evalCase.goldDocs.length ? (firstGoldIndex >= 0 ? 1 / (firstGoldIndex + 1) : 0) : 1;
  const citationPrecision = generated.citedDocs.length
    ? generated.citedDocs.filter((id) => evalCase.goldDocs.includes(id)).length / generated.citedDocs.length
    : (generated.refused ? 1 : 0);
  const faithfulness = generated.refused
    ? (evalCase.shouldAnswer ? 0.4 : 1)
    : (generated.citedDocs.some((id) => evalCase.goldDocs.includes(id)) ? 1 : 0.35);
  const answerCoverage = generated.refused ? (evalCase.shouldAnswer ? 0 : 1) : (recall ? 0.9 : 0.35);
  const refusalCorrectness = evalCase.shouldAnswer ? (generated.refused ? 0 : 1) : (generated.refused ? 1 : 0);
  state.result = {
    evalCase,
    retrieved,
    generated,
    metrics: {
      recall,
      mrr,
      citationPrecision,
      faithfulness,
      answerCoverage,
      refusalCorrectness,
      overall: (recall + mrr + citationPrecision + faithfulness + answerCoverage + refusalCorrectness) / 6,
    },
  };
  startMetricAnimation();
  renderAll();
}

function renderCaseSelect() {
  $("#caseSelect").innerHTML = state.cases.map((item) => `<option value="${item.id}">${item.question}</option>`).join("");
  $("#caseSelect").value = state.selectedCaseId;
}

function renderRetrieval() {
  const { retrieved, evalCase } = state.result;
  $("#retrievalStatus").textContent = `${retrieved.length} 条`;
  $("#retrievalList").innerHTML = retrieved.map((doc, index) => `
    <article class="result-card ${doc.isGold ? "is-selected" : ""}">
      <div class="result-top">
        <strong>${index + 1}. ${doc.title}</strong>
        <b>${doc.score.toFixed(4)}</b>
      </div>
      <p>${doc.text}</p>
      <div class="tag-row">
        <span>${doc.source}</span>
        <span>${doc.isGold ? "标准证据" : "普通候选"}</span>
        <span>命中词 ${doc.hits.slice(0, 6).join(" / ") || "无"}</span>
      </div>
    </article>
  `).join("");
  if (!evalCase.goldDocs.length) {
    $("#retrievalList").innerHTML += `<div class="plain-card"><strong>不可回答问题</strong><p>这个问题没有标准证据，评测重点是系统是否能正确拒答。</p></div>`;
  }
}

function renderAnswer() {
  const { evalCase, generated } = state.result;
  $("#answerStatus").textContent = generated.refused ? "已拒答" : "已回答";
  $("#answerPanel").innerHTML = `
    <div class="plain-card">
      <strong>系统回答</strong>
      <p>${generated.answer}</p>
      <div class="tag-row">
        <span>${generated.refused ? "拒答" : "回答"}</span>
        <span>引用：${generated.citedDocs.join(", ") || "无"}</span>
      </div>
    </div>
    <div class="plain-card">
      <strong>标准答案</strong>
      <p>${evalCase.goldAnswer}</p>
      <div class="tag-row">${evalCase.goldDocs.length ? evalCase.goldDocs.map((id) => `<span>${id}</span>`).join("") : "<span>应拒答</span>"}</div>
    </div>
  `;
}

function metricLabel(key) {
  return {
    recall: "Recall@K",
    mrr: "MRR",
    citationPrecision: "引用准确率",
    faithfulness: "忠实度",
    answerCoverage: "答案覆盖",
    refusalCorrectness: "拒答正确",
    overall: "综合分",
  }[key];
}

function metricExplain(key, value) {
  const text = {
    recall: "标准证据是否出现在 Top K 检索结果里。",
    mrr: "第一个标准证据排得越靠前，MRR 越高。",
    citationPrecision: "引用的文档是否真的属于标准证据。",
    faithfulness: "回答是否被证据支持，是否减少幻觉。",
    answerCoverage: "回答是否覆盖了标准答案的关键点。",
    refusalCorrectness: "该答时回答，该拒答时拒答。",
    overall: "多个指标的平均值，用来看整体趋势。",
  }[key];
  return `${text} 当前分数 ${value.toFixed(3)}。`;
}

function renderMetrics() {
  const metrics = state.result.metrics;
  $("#metricCards").innerHTML = Object.entries(metrics).map(([key, value]) => `
    <article class="doc-card">
      <strong>${metricLabel(key)}</strong>
      ${barRow(metricLabel(key), value, key === "overall" ? "#173539" : "#16707a")}
      <p>${metricExplain(key, value)}</p>
    </article>
  `).join("");
}

function barRow(label, value, color) {
  return `
    <div class="bar-row">
      <span>${label}</span>
      <div><i style="width:${Math.max(3, value * 100)}%;background:${color}"></i></div>
      <b>${value.toFixed(3)}</b>
    </div>
  `;
}

function renderDiagnosis() {
  const metrics = state.result.metrics;
  const tips = [];
  if (metrics.recall < 1) tips.push(["检索没命中标准证据", "优先检查 chunk 切分、embedding、query 改写、Hybrid 检索和 Top K。"]);
  if (metrics.mrr < 0.8) tips.push(["标准证据排得不够靠前", "考虑加入 Rerank，让真正能回答问题的 chunk 上升。"]);
  if (metrics.citationPrecision < 1) tips.push(["引用不准", "检查引用来源、metadata 和 prompt 是否要求只引用命中证据。"]);
  if (metrics.faithfulness < 1) tips.push(["忠实度不足", "加入证据门，要求答案只能基于引用，不足时拒答。"]);
  if (metrics.refusalCorrectness < 1) tips.push(["拒答策略错误", "增加不可回答问题评测集，并设置证据不足阈值。"]);
  if (!tips.length) tips.push(["本轮表现较好", "可以扩大评测集，加入更多边界问题和真实业务问题。"]);
  $("#diagnosisPanel").innerHTML = tips.map(([title, text]) => `<div class="plain-card"><strong>${title}</strong><p>${text}</p></div>`).join("");
}

function renderRoadmap() {
  $("#roadmapList").innerHTML = roadmap.map(([step, title, text]) => `
    <article class="doc-card"><span>${step}</span><strong>${title}</strong><p>${text}</p></article>
  `).join("");
}

function renderInterview() {
  $("#interviewList").innerHTML = interviews.map(([question, answer]) => `
    <article class="doc-card"><strong>${question}</strong><p>${answer}</p><p><b>答题提示：</b>不要只说“看准确率”，要分检索、引用、回答和拒答四层讲。</p></article>
  `).join("");
}

function renderAll() {
  renderCaseSelect();
  renderRetrieval();
  renderAnswer();
  renderMetrics();
  renderDiagnosis();
  drawMetrics();
}

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function easeOutCubic(t) {
  return 1 - ((1 - t) ** 3);
}

function projectMetricPoint(point, width, height) {
  const depth = 1 / (1 + point.z / 760);
  return {
    x: width / 2 + point.x * depth,
    y: height * 0.66 + point.y * depth - point.z * 0.18,
    depth,
  };
}

function drawMetricBlock(ctx, base, value, label, color) {
  const barW = 54 * base.depth;
  const barD = 30 * base.depth;
  const barH = (42 + 210 * value) * base.depth;
  const x = base.x - barW / 2;
  const y = base.y - barH;
  ctx.fillStyle = "rgba(23,53,57,0.12)";
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + 10, barW * 0.78, 10 * base.depth, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + barD, y - barD * 0.48);
  ctx.lineTo(x + barW + barD, y - barD * 0.48);
  ctx.lineTo(x + barW, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(23,53,57,0.2)";
  ctx.beginPath();
  ctx.moveTo(x + barW, y);
  ctx.lineTo(x + barW + barD, y - barD * 0.48);
  ctx.lineTo(x + barW + barD, y + barH - barD * 0.48);
  ctx.lineTo(x + barW, y + barH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#202827";
  ctx.textAlign = "center";
  ctx.font = `900 ${Math.max(10, 12 * base.depth)}px sans-serif`;
  ctx.fillText(label, base.x, base.y + 30 * base.depth);
  ctx.fillStyle = color;
  ctx.fillText(value.toFixed(2), base.x, y - 12 * base.depth);
  return { x: x - 8, y: y - 20, width: barW + barD + 16, height: barH + 52 };
}

function drawMetrics() {
  const canvas = $("#metricCanvas");
  if (!canvas || !state.result) return;
  const { ctx, width, height } = canvasContext(canvas);
  const entries = Object.entries(state.result.metrics);
  const progress = easeOutCubic(state.metricAnimationProgress ?? 1);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fbfb";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(22,112,122,0.12)";
  ctx.lineWidth = 1;
  for (let x = -420; x <= 420; x += 70) {
    const a = projectMetricPoint({ x, y: 78, z: 40 }, width, height);
    const b = projectMetricPoint({ x, y: 78, z: 520 }, width, height);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let z = 40; z <= 520; z += 80) {
    const a = projectMetricPoint({ x: -430, y: 78, z }, width, height);
    const b = projectMetricPoint({ x: 430, y: 78, z }, width, height);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.fillStyle = "#173539";
  ctx.font = "900 14px sans-serif";
  ctx.fillText("3D RAG 评测指标台：柱子越高，说明这一项越健康", 24, 32);
  ctx.fillStyle = "#687573";
  ctx.font = "800 12px sans-serif";
  ctx.fillText("悬停柱子看指标解释。低柱就是下一步要优化的短板。", 24, 54);

  state.metricNodes = [];
  entries.forEach(([key, rawValue], index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const value = rawValue * progress;
    const base = projectMetricPoint({ x: -270 + col * 180, y: 92, z: 120 + row * 220 }, width, height);
    const color = key === "overall" ? "#173539" : rawValue >= 0.8 ? "#16707a" : rawValue >= 0.5 ? "#b35c2e" : "#a33d34";
    const hit = drawMetricBlock(ctx, base, value, metricLabel(key).replace("@K", ""), color);
    state.metricNodes.push({ ...hit, key, value: rawValue });
  });
  ctx.textAlign = "left";
  ctx.fillStyle = "#687573";
  ctx.font = "800 12px sans-serif";
  ctx.fillText("图形由当前评测问题、Top K 和系统版本实时计算。短柱优先优化。", 24, height - 18);
}

function startMetricAnimation() {
  cancelAnimationFrame(state.metricAnimationFrame);
  state.metricAnimationStart = performance.now();
  state.metricAnimationProgress = 0;
  const tick = (now) => {
    state.metricAnimationProgress = Math.min(1, (now - state.metricAnimationStart) / 850);
    drawMetrics();
    if (state.metricAnimationProgress < 1) {
      state.metricAnimationFrame = requestAnimationFrame(tick);
    }
  };
  state.metricAnimationFrame = requestAnimationFrame(tick);
}

function bindMetricTooltip() {
  const canvas = $("#metricCanvas");
  const tip = $("#canvasTooltip");
  if (!canvas || !tip) return;
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.metricNodes.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
    if (!node) {
      tip.classList.remove("is-visible");
      return;
    }
    tip.innerHTML = `<strong>${metricLabel(node.key)}</strong><span>${metricExplain(node.key, node.value)}</span>`;
    tip.style.left = `${Math.min(rect.width - 320, Math.max(10, x + 14))}px`;
    tip.style.top = `${Math.min(rect.height - 120, Math.max(10, y + 14))}px`;
    tip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tip.classList.remove("is-visible"));
}

function switchView(view) {
  $$(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const active = $(`.nav-item[data-view="${view}"] b`);
  $("#pageTitle").textContent = active?.textContent || "RAG 评测实验室";
  if (view === "visual") startMetricAnimation();
}

function bindProjectSwitcher() {
  const trigger = $("#projectTrigger");
  const menu = $("#projectMenu");
  const close = () => {
    trigger.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
  };
  trigger.addEventListener("click", () => {
    const open = !menu.classList.contains("is-open");
    trigger.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("is-open", open);
  });
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    close();
    if (button.dataset.project === "rageval") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) close();
  });
}

function addCase() {
  const question = $("#newQuestion").value.trim();
  if (!question) return;
  const goldDocs = $("#newGoldDocs").value.split(/[,，\\s]+/).map((item) => item.trim()).filter(Boolean);
  const next = {
    id: `q${Date.now()}`,
    question,
    goldDocs,
    goldAnswer: goldDocs.length ? "请根据标准证据回答。" : "知识库没有足够依据，应该拒答。",
    shouldAnswer: goldDocs.length > 0,
  };
  state.cases.push(next);
  state.selectedCaseId = next.id;
  localStorage.setItem("rag-eval-cases-v1", JSON.stringify(state.cases));
  $("#newQuestion").value = "";
  $("#newGoldDocs").value = "";
  evaluateCase();
}

function init() {
  bindProjectSwitcher();
  bindMetricTooltip();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#caseSelect").addEventListener("change", (event) => {
    state.selectedCaseId = event.target.value;
    evaluateCase();
  });
  $("#topKSelect").addEventListener("change", evaluateCase);
  $("#systemSelect").addEventListener("change", evaluateCase);
  $("#runEvalBtn").addEventListener("click", evaluateCase);
  $("#addCaseBtn").addEventListener("click", addCase);
  renderRoadmap();
  renderInterview();
  evaluateCase();
  window.addEventListener("resize", drawMetrics);
}

init();
