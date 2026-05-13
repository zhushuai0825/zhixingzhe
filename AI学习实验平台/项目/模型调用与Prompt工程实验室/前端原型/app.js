const modelConfig = {
  fast: { name: "快速便宜模型", input: 0.002, output: 0.006, latency: 0.8, quality: 0.62 },
  balanced: { name: "平衡模型", input: 0.006, output: 0.018, latency: 1.4, quality: 0.78 },
  strong: { name: "强推理模型", input: 0.018, output: 0.06, latency: 2.6, quality: 0.92 },
};

const roadmap = [
  ["01", "先学消息结构", "一次模型调用通常包含 system、user、assistant、tool 等消息。system 负责规则，user 负责目标，上下文负责证据。"],
  ["02", "再学 Prompt 约束", "Prompt 要写清角色、任务、输入、输出格式、禁止事项和证据不足时的行为。"],
  ["03", "学习结构化输出", "真实系统不能只拿自然语言，需要 JSON Schema、字段校验、类型校验和错误重试。"],
  ["04", "学习失败处理", "超时、限流、JSON 解析失败、引用缺失、内容不合规，都要有兜底策略。"],
  ["05", "学习成本控制", "Token、模型等级、重试次数、上下文长度都会影响成本和延迟。"],
];

const interviews = [
  ["Prompt 工程在工程里解决什么问题？", "它不是写漂亮话，而是把模型行为约束成可预测的接口：明确角色、任务、上下文、输出格式、拒答规则和错误边界。"],
  ["为什么要结构化输出？", "后端系统需要稳定读取字段。自然语言难以解析，JSON Schema 可以让 answer、citations、next_steps 等字段变得可校验、可入库、可继续流转。"],
  ["模型输出 JSON 错了怎么办？", "不要直接崩溃。先解析失败原因，再用更低温度、更明确 Schema、携带错误信息重试。多次失败后返回可解释错误或降级结果。"],
  ["如何降低模型调用成本？", "压缩上下文、控制 max_tokens、选择合适模型、缓存相同请求、减少无效重试、把简单任务交给便宜模型。"],
  ["RAG 场景 Prompt 最重要的约束是什么？", "只能基于引用证据回答，证据不足必须拒答，输出要带引用来源。否则模型容易用常识补全，产生幻觉。"],
  ["线上模型调用要记录什么日志？", "请求 ID、模型、输入 token、输出 token、延迟、费用、重试次数、错误类型、引用来源、用户反馈。注意不要明文记录敏感数据。"],
];

const state = {
  steps: [],
  result: null,
  canvasNodes: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function estimateTokens(text) {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.match(/[a-zA-Z0-9_]+/g) || []).length;
  return Math.max(1, Math.ceil(chinese * 0.75 + words * 1.15));
}

function schemaFields() {
  return $("#schemaFields").value.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
}

function addStep(type, title, detail, ok = true) {
  state.steps.push({ type, title, detail, ok });
}

function simulateCall() {
  state.steps = [];
  const modelKey = $("#modelSelect").value;
  const model = modelConfig[modelKey];
  const temperature = Number($("#temperatureSelect").value);
  const maxOutput = Number($("#maxOutputSelect").value);
  const system = $("#systemPrompt").value.trim();
  const user = $("#userPrompt").value.trim();
  const context = $("#contextText").value.trim();
  const fields = schemaFields();
  const requireJson = $("#requireJson").checked;
  const requireCitation = $("#requireCitation").checked;
  const enableRetry = $("#enableRetry").checked;

  const inputTokens = estimateTokens(`${system}\n${user}\n${context}\n${fields.join(",")}`);
  const rawOutputTokens = Math.min(maxOutput, Math.max(120, Math.ceil(inputTokens * (0.32 + temperature * 0.18))));
  const quality = model.quality - Math.max(0, temperature - 0.4) * 0.2 + (requireJson ? 0.05 : 0);
  const hasContext = context.length > 20;
  const hasJsonRule = /json|schema|字段|格式/i.test(system) || requireJson;
  const hasCitationRule = /引用|证据|依据|来源/.test(system) || requireCitation;
  const firstPassOk = quality > 0.68 && (!requireJson || hasJsonRule) && (!requireCitation || (hasContext && hasCitationRule));

  addStep("Prepare", "拼接消息", `system、user、context 和 schema 被组装成请求。输入约 ${inputTokens} tokens。`);
  addStep("Request", "发送模型请求", `使用 ${model.name}，temperature=${temperature}，max_output=${maxOutput}。`);
  addStep("Generate", "模型生成", `教学模拟输出约 ${rawOutputTokens} tokens。质量估计 ${quality.toFixed(2)}。`, quality > 0.65);

  let retry = false;
  let validation = validateOutput({ requireJson, requireCitation, hasContext, hasJsonRule, hasCitationRule, firstPassOk, fields });
  addStep("Validate", "校验输出", validation.message, validation.ok);

  if (!validation.ok && enableRetry) {
    retry = true;
    addStep("Retry", "带错误原因重试", "降低温度，补充“只输出 JSON、必须包含引用字段、证据不足要拒答”等约束。");
    validation = { ok: true, message: "重试后通过 JSON 字段和引用校验。" };
    addStep("Validate", "二次校验", validation.message, true);
  }

  const output = buildOutput(user, context, fields, validation.ok, requireJson, requireCitation);
  const outputTokens = retry ? Math.ceil(rawOutputTokens * 1.55) : rawOutputTokens;
  const inputCost = (inputTokens / 1000) * model.input;
  const outputCost = (outputTokens / 1000) * model.output;
  const latency = model.latency + outputTokens / 900 + (retry ? model.latency : 0);
  const totalCost = inputCost + outputCost;
  state.result = {
    model,
    modelKey,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost,
    latency,
    retry,
    validation,
    output,
    diagnosis: diagnose({ system, user, context, requireJson, requireCitation, hasJsonRule, hasCitationRule, inputTokens, temperature }),
  };
  renderAll();
}

function validateOutput(options) {
  if (!options.requireJson && !options.requireCitation) return { ok: true, message: "未启用强校验，仅做基础可用性检查。" };
  if (options.requireJson && !options.hasJsonRule) return { ok: false, message: "失败：要求 JSON 输出，但 Prompt 没有明确 JSON/Schema 约束。" };
  if (options.requireCitation && !options.hasContext) return { ok: false, message: "失败：要求引用来源，但上下文为空或太短。" };
  if (options.requireCitation && !options.hasCitationRule) return { ok: false, message: "失败：要求引用，但 Prompt 没有明确“引用/证据/来源”规则。" };
  if (!options.firstPassOk) return { ok: false, message: "失败：模型输出字段不稳定，建议降低温度并强化 Schema。" };
  return { ok: true, message: `通过：包含字段 ${options.fields.join(", ")}，并满足引用约束。` };
}

function buildOutput(user, context, fields, ok, requireJson, requireCitation) {
  const answer = ok
    ? `Graph RAG 会把实体和关系组织成图谱，适合多跳关系问题；普通 RAG 更偏向通过向量相似度查找文本片段。学习上建议先掌握普通 RAG，再学习实体抽取、关系抽取和图谱检索。`
    : "当前输出未通过校验，不能直接交付给用户。";
  const payload = {
    answer,
    citations: requireCitation ? ["context#1"] : [],
    next_steps: ["复述普通 RAG 与 Graph RAG 的差异", "在 Graph RAG 实验室新增实体和关系", "对比有无图谱检索的结果"],
    risk: ok ? "低：回答基于上下文并包含引用。" : "高：格式或引用不满足要求。",
  };
  if (!requireJson) return answer;
  return Object.fromEntries(fields.map((field) => [field, payload[field] ?? "字段未在模拟器中定义"]));
}

function diagnose(input) {
  const tips = [];
  if (!input.hasJsonRule && input.requireJson) tips.push(["缺少 JSON 约束", "在 system prompt 里明确“只输出 JSON，字段必须包含 ...”。"]);
  if (!input.hasCitationRule && input.requireCitation) tips.push(["缺少引用规则", "在 prompt 里写清楚“必须引用上下文来源，证据不足要拒答”。"]);
  if (input.inputTokens > 1200) tips.push(["上下文偏长", "考虑压缩上下文、减少无关 chunk，或先做 Rerank。"]);
  if (input.temperature > 0.6) tips.push(["温度偏高", "结构化输出场景建议使用较低温度，减少格式漂移。"]);
  if (!input.context.trim()) tips.push(["上下文为空", "RAG/知识库问答必须提供证据，否则应该拒答。"]);
  if (!tips.length) tips.push(["Prompt 状态良好", "约束、上下文和输出格式比较清楚，可以继续观察成本和延迟。"]);
  return tips;
}

function renderSteps() {
  $("#callStatus").textContent = `${state.steps.length} 步`;
  $("#callSteps").innerHTML = state.steps.map((step) => `
    <article class="result-card ${step.ok ? "" : "is-selected"}">
      <div class="result-top"><strong>${step.type} · ${step.title}</strong><b>${step.ok ? "OK" : "检查"}</b></div>
      <p>${step.detail}</p>
    </article>
  `).join("");
}

function renderOutput() {
  const result = state.result;
  $("#outputStatus").textContent = result.validation.ok ? "可交付" : "需修复";
  const content = typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2);
  $("#outputPanel").innerHTML = `
    <div class="plain-card">
      <strong>最终输出</strong>
      <pre>${escapeHtml(content)}</pre>
    </div>
    <div class="plain-card">
      <strong>校验结果</strong>
      <p>${result.validation.message}</p>
    </div>
  `;
}

function renderCost() {
  const result = state.result;
  $("#costPanel").innerHTML = `
    <div class="stat-grid">
      <div><strong>${result.inputTokens}</strong><span>输入 tokens</span></div>
      <div><strong>${result.outputTokens}</strong><span>输出 tokens</span></div>
      <div><strong>${result.latency.toFixed(2)}s</strong><span>估算延迟</span></div>
    </div>
    ${barRow("输入成本", result.inputCost, 0.08)}
    ${barRow("输出成本", result.outputCost, 0.08)}
    ${barRow("总成本", result.totalCost, 0.12)}
    <div class="plain-card"><strong>教学估算</strong><p>这里用模拟单价计算，真实价格要按你实际使用的模型供应商为准。重点是理解成本随 token、模型等级和重试次数增长。</p></div>
  `;
}

function barRow(label, value, max) {
  const width = Math.max(4, Math.min(100, (value / max) * 100));
  return `
    <div class="bar-row">
      <span>${label}</span>
      <div><i style="width:${width}%"></i></div>
      <b>¥${value.toFixed(4)}</b>
    </div>
  `;
}

function renderDiagnosis() {
  $("#diagnosisPanel").innerHTML = state.result.diagnosis.map(([title, text]) => `
    <div class="plain-card"><strong>${title}</strong><p>${text}</p></div>
  `).join("");
}

function renderRoadmap() {
  $("#roadmapList").innerHTML = roadmap.map(([step, title, text]) => `
    <article class="doc-card"><span>${step}</span><strong>${title}</strong><p>${text}</p></article>
  `).join("");
}

function renderInterview() {
  $("#interviewList").innerHTML = interviews.map(([question, answer]) => `
    <article class="doc-card"><strong>${question}</strong><p>${answer}</p></article>
  `).join("");
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

function projectCallPoint(point, width, height) {
  const depth = 1 / (1 + point.z / 740);
  return {
    x: width / 2 + point.x * depth,
    y: height * 0.6 + point.y * depth - point.z * 0.17,
    depth,
  };
}

function drawCallBox(ctx, point, step) {
  const w = 112 * point.depth;
  const h = 72 * point.depth;
  const x = point.x - w / 2;
  const y = point.y - h;
  const color = step.ok ? (step.type === "Validate" ? "#227650" : "#16707a") : "#b35c2e";
  ctx.fillStyle = "rgba(23,53,57,0.14)";
  ctx.beginPath();
  ctx.ellipse(point.x, point.y + 8, w * 0.5, 10 * point.depth, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(23,53,57,0.16)";
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + 18 * point.depth, y - 14 * point.depth);
  ctx.lineTo(x + w + 18 * point.depth, y + h - 14 * point.depth);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9 * point.depth);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `900 ${Math.max(10, 12 * point.depth)}px sans-serif`;
  ctx.fillText(step.type, point.x, y + 25 * point.depth);
  ctx.font = `800 ${Math.max(9, 11 * point.depth)}px sans-serif`;
  ctx.fillText(step.title.slice(0, 9), point.x, y + 48 * point.depth);
  return { x, y, width: w + 18 * point.depth, height: h, step };
}

function drawCallFlow() {
  const canvas = $("#callCanvas");
  if (!canvas || !state.steps.length) return;
  const { ctx, width, height } = canvasContext(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fbfb";
  ctx.fillRect(0, 0, width, height);
  state.canvasNodes = [];
  ctx.fillStyle = "#173539";
  ctx.font = "900 14px sans-serif";
  ctx.fillText("3D 模型调用通道：消息进入模型，校验失败会走重试支路", 24, 32);
  ctx.fillStyle = "#687573";
  ctx.font = "800 12px sans-serif";
  ctx.fillText("绿色代表通过，橙色代表风险或失败。悬停看每一步细节。", 24, 54);
  ctx.strokeStyle = "rgba(22,112,122,0.12)";
  for (let x = -380; x <= 380; x += 76) {
    const a = projectCallPoint({ x, y: 112, z: 60 }, width, height);
    const b = projectCallPoint({ x, y: 112, z: 520 }, width, height);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let z = 60; z <= 520; z += 80) {
    const a = projectCallPoint({ x: -400, y: 112, z }, width, height);
    const b = projectCallPoint({ x: 400, y: 112, z }, width, height);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  const count = Math.max(1, state.steps.length - 1);
  const points = state.steps.map((step, index) => {
    const retryOffset = step.type === "Retry" ? -86 : 0;
    return {
      ...projectCallPoint({ x: -330 + (660 * index) / count, y: 68 + retryOffset, z: 90 + index * 62 }, width, height),
      step,
    };
  });
  points.forEach((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      ctx.strokeStyle = point.step.ok ? "rgba(22,112,122,0.38)" : "rgba(179,92,46,0.48)";
      ctx.lineWidth = 3 * point.depth;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y - 48 * previous.depth);
      ctx.bezierCurveTo(previous.x + 52, previous.y - 120, point.x - 52, point.y - 120, point.x, point.y - 48 * point.depth);
      ctx.stroke();
    }
  });
  points.sort((a, b) => b.depth - a.depth).forEach((point) => {
    state.canvasNodes.push(drawCallBox(ctx, point, point.step));
  });
  ctx.textAlign = "left";
}

function bindCanvasTooltip() {
  const canvas = $("#callCanvas");
  const tip = $("#canvasTooltip");
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.canvasNodes.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
    if (!node) {
      tip.classList.remove("is-visible");
      return;
    }
    tip.innerHTML = `<strong>${node.step.type} · ${node.step.title}</strong><span>${node.step.detail}</span>`;
    tip.style.left = `${Math.min(rect.width - 320, Math.max(10, x + 14))}px`;
    tip.style.top = `${Math.min(rect.height - 120, Math.max(10, y + 14))}px`;
    tip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tip.classList.remove("is-visible"));
}

function renderAll() {
  renderSteps();
  renderOutput();
  renderCost();
  renderDiagnosis();
  drawCallFlow();
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
}

function switchView(view) {
  $$(".view").forEach((item) => item.classList.toggle("is-active", item.id === view));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  const active = $(`.nav-item[data-view="${view}"] b`);
  $("#pageTitle").textContent = active?.textContent || "模型调用与 Prompt 工程";
  if (view === "visual") drawCallFlow();
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
    if (button.dataset.project === "modelprompt") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) close();
  });
}

function init() {
  bindProjectSwitcher();
  bindCanvasTooltip();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#runBtn").addEventListener("click", simulateCall);
  ["modelSelect", "temperatureSelect", "maxOutputSelect", "requireJson", "requireCitation", "enableRetry"].forEach((id) => {
    $(`#${id}`).addEventListener("change", simulateCall);
  });
  ["systemPrompt", "userPrompt", "contextText", "schemaFields"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(simulateCall, 350);
    });
  });
  window.addEventListener("resize", drawCallFlow);
  renderRoadmap();
  renderInterview();
  simulateCall();
}

init();
