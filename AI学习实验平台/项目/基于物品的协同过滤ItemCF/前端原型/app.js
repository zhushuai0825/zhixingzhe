let users = [
  { id: "u1", name: "小林", note: "喜欢科幻、纪录片，也开始学习机器学习。" },
  { id: "u2", name: "小周", note: "当前手算案例用户，喜欢科幻电影和太空纪录片。" },
  { id: "u3", name: "小许", note: "偏好纪录片、机器学习和编程实战。" },
  { id: "u4", name: "小陈", note: "喜欢机器学习和 Python 工程内容。" },
  { id: "u5", name: "小何", note: "喜欢 Python 实战和产品经理方法。" },
  { id: "u6", name: "小孟", note: "喜欢产品、增长和数据分析。" },
];

let items = [
  { id: "i1", title: "科幻电影", category: "影视" },
  { id: "i2", title: "太空纪录片", category: "影视" },
  { id: "i3", title: "机器学习入门", category: "AI" },
  { id: "i4", title: "Python 实战", category: "编程" },
  { id: "i5", title: "产品经理方法", category: "产品" },
  { id: "i6", title: "增长分析案例", category: "数据" },
  { id: "i7", title: "推荐系统导论", category: "AI" },
];

const initialInteractions = [
  ["u1", "i1"],
  ["u1", "i2"],
  ["u1", "i3"],
  ["u2", "i1"],
  ["u2", "i2"],
  ["u3", "i2"],
  ["u3", "i3"],
  ["u3", "i4"],
  ["u4", "i3"],
  ["u4", "i4"],
  ["u4", "i7"],
  ["u5", "i4"],
  ["u5", "i5"],
  ["u5", "i6"],
  ["u6", "i5"],
  ["u6", "i6"],
  ["u6", "i7"],
].map(([userId, itemId]) => ({ userId, itemId }));

let interactions = initialInteractions.map((interaction) => ({ ...interaction }));

const state = {
  view: "overview",
  selectedUserId: "u2",
  selectedRecommendationId: "",
  source: "loading",
  backendState: null,
  changeLog: [],
  matchNodes: [],
  space: {
    rotationX: -0.45,
    rotationY: 0.65,
    zoom: 160,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
};

const roadmap = [
  ["01", "看懂协同过滤", "先理解推荐来自用户行为，而不是物品内容本身。"],
  ["02", "手算 ItemCF", "用小数据集算共现、相似度和推荐分。"],
  ["03", "观察前端实验台", "切换用户，观察推荐解释如何变化。"],
  ["04", "抽离算法测试", "把核心函数独立出来，用样例验证计算正确。"],
  ["05", "扩展真实数据", "当前已接 PostgreSQL，下一步可导入 MovieLens 并学习 Precision@K 和 Recall@K。"],
  ["06", "对比其他算法", "再看 UserCF、热门推荐、内容推荐和矩阵分解。"],
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function apiBase() {
  return ($("#apiBaseInput")?.value || "http://127.0.0.1:8020").replace(/\/$/, "");
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

function activeInteractions() {
  return state.source === "backend" && state.backendState
    ? state.backendState.interactions
    : interactions;
}

function setBackendStatus(message, type = "") {
  const node = $("#backendStatus");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-ok", type === "ok");
  node.classList.toggle("is-error", type === "error");
}

function itemById(id) {
  return items.find((item) => item.id === id);
}

function userById(id) {
  return users.find((user) => user.id === id);
}

function likedItemIds(userId) {
  return activeInteractions()
    .filter((interaction) => interaction.userId === userId)
    .map((interaction) => interaction.itemId);
}

function buildUserItemMatrix() {
  if (state.source === "backend" && state.backendState?.behaviorMatrix) {
    return state.backendState.behaviorMatrix;
  }

  const likedSet = new Set(activeInteractions().map((interaction) => `${interaction.userId}:${interaction.itemId}`));
  return users.map((user) => ({
    user,
    values: items.map((item) => (likedSet.has(`${user.id}:${item.id}`) ? 1 : 0)),
  }));
}

function buildItemSimilarity() {
  if (state.source === "backend" && state.backendState) {
    return {
      similarity: state.backendState.similarity,
      coCounts: state.backendState.coCounts,
      itemUserSets: new Map(items.map((item) => [item.id, new Set()])),
      itemCounts: state.backendState.itemCounts,
    };
  }

  const itemUserSets = new Map(items.map((item) => [item.id, new Set()]));

  activeInteractions().forEach(({ userId, itemId }) => {
    itemUserSets.get(itemId).add(userId);
  });

  const similarity = {};
  const coCounts = {};

  items.forEach((left) => {
    similarity[left.id] = {};
    coCounts[left.id] = {};

    items.forEach((right) => {
      const leftUsers = itemUserSets.get(left.id);
      const rightUsers = itemUserSets.get(right.id);
      const coCount = [...leftUsers].filter((userId) => rightUsers.has(userId)).length;
      const denominator = Math.sqrt(leftUsers.size * rightUsers.size);

      coCounts[left.id][right.id] = coCount;
      similarity[left.id][right.id] = denominator === 0 ? 0 : coCount / denominator;
    });
  });

  const itemCounts = Object.fromEntries(
    items.map((item) => [item.id, itemUserSets.get(item.id).size]),
  );

  return { similarity, coCounts, itemUserSets, itemCounts };
}

function recommendForUser(userId) {
  if (state.source === "backend" && state.backendState?.selectedUserId === userId) {
    return state.backendState.recommendations;
  }

  return scoreCandidatesForUser(userId)
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

function scoreCandidatesForUser(userId) {
  if (state.source === "backend" && state.backendState?.selectedUserId === userId) {
    return state.backendState.candidates;
  }

  const liked = likedItemIds(userId);
  const likedSet = new Set(liked);
  const { similarity, coCounts, itemCounts } = buildItemSimilarity();

  return items
    .filter((item) => !likedSet.has(item.id))
    .map((candidate) => {
      const contributions = liked.map((likedId) => ({
        from: itemById(likedId),
        coCount: coCounts[candidate.id][likedId],
        candidateCount: itemCounts[candidate.id],
        sourceCount: itemCounts[likedId],
        value: similarity[candidate.id][likedId],
      }));
      const score = contributions.reduce((total, item) => total + item.value, 0);

      return {
        item: candidate,
        score,
        contributions: contributions.sort((a, b) => b.value - a.value),
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function loadBackendState(userId = state.selectedUserId) {
  const data = await apiRequest(`/api/state?user_id=${encodeURIComponent(userId)}`);
  state.backendState = data;
  state.source = "backend";
  users = data.users;
  items = data.items;
  state.selectedUserId = data.selectedUserId;
  state.selectedRecommendationId = "";
  setBackendStatus(`PostgreSQL · ${data.interactions.length} 条真实行为`, "ok");
  renderAll();
}

function ensureSelectedRecommendation() {
  const recommendations = recommendForUser(state.selectedUserId);
  const exists = recommendations.some((entry) => entry.item.id === state.selectedRecommendationId);

  if (!exists) {
    state.selectedRecommendationId = recommendations[0]?.item.id || "";
  }

  return recommendations;
}

function formatScore(value) {
  return value.toFixed(3);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function switchView(viewId) {
  state.view = viewId;
  const titles = {
    overview: "项目总览",
    visual: "推荐可视化台",
    lab: "算法实验台",
    matrix: "矩阵可视化",
    roadmap: "学习路线",
  };

  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewId));
  $("#pageTitle").textContent = titles[viewId] || "ItemCF 学习实验室";
  requestAnimationFrame(() => {
    renderMatchCanvas();
    renderItemSpace();
  });
}

function renderUserSelect() {
  const select = $("#userSelect");
  const visualSelect = $("#visualUserSelect");
  if (!users.length) {
    select.innerHTML = `<option>等待数据库数据</option>`;
    if (visualSelect) visualSelect.innerHTML = `<option>等待数据库数据</option>`;
    return;
  }
  const options = users
    .map((user) => `<option value="${user.id}">${user.name}</option>`)
    .join("");
  select.innerHTML = options;
  select.value = state.selectedUserId;
  if (visualSelect) {
    visualSelect.innerHTML = options;
    visualSelect.value = state.selectedUserId;
  }
}

function renderUserPanel() {
  const user = userById(state.selectedUserId);
  const liked = likedItemIds(user.id).map(itemById);

  $("#userProfile").innerHTML = `
    <strong>${user.name}</strong>
    <p>${user.note}</p>
  `;

  $("#likedItems").innerHTML = liked
    .map((item) => `<span class="tag">${item.title}</span>`)
    .join("");
}

function renderSandbox() {
  const liked = new Set(likedItemIds(state.selectedUserId));
  const options = items.filter((item) => !liked.has(item.id));
  const select = $("#addItemSelect");
  const visualSelect = $("#visualAddItemSelect");
  const optionsHtml = options.length
    ? options.map((item) => `<option value="${item.id}">${item.title}</option>`).join("")
    : `<option value="">没有可新增物品</option>`;

  select.innerHTML = optionsHtml;
  select.disabled = options.length === 0;
  $("#addLikeBtn").disabled = options.length === 0;
  if (visualSelect) {
    visualSelect.innerHTML = optionsHtml;
    visualSelect.disabled = options.length === 0;
  }
  const visualButton = $("#visualAddLikeBtn");
  if (visualButton) visualButton.disabled = options.length === 0;

  $("#changeLog").innerHTML = state.changeLog.length
    ? state.changeLog.map((line) => `<p>${line}</p>`).join("")
    : `<p>还没有临时改动。可以先给小周添加“机器学习入门”，看看推荐榜单如何变化。</p>`;
}

function renderRecommendations() {
  const recommendations = ensureSelectedRecommendation();
  const container = $("#recommendations");
  const likedCount = likedItemIds(state.selectedUserId).length;

  if (recommendations.length === 0) {
    const message = likedCount >= items.length
      ? "当前用户已经喜欢了全部物品。ItemCF 会过滤已喜欢物品，所以没有剩余候选可以推荐。删除一个喜欢或点击重置数据后，推荐会重新出现。"
      : "当前用户还有候选物品，但这些候选和他的历史喜欢没有共现相似度，所以暂时没有可推荐结果。";
    container.innerHTML = `<div class="plain-card"><strong>暂无可推荐物品</strong><p>${message}</p></div>`;
    return;
  }

  container.innerHTML = recommendations
    .map((entry, index) => `
      <button class="rec-card ${entry.item.id === state.selectedRecommendationId ? "is-selected" : ""}" data-rec-id="${entry.item.id}">
        <span class="rank">${index + 1}</span>
        <div class="rec-title">
          <strong>${entry.item.title}</strong>
          <small>${entry.item.category} · 来自 ${entry.contributions.filter((item) => item.value > 0).length} 个历史物品贡献</small>
        </div>
        <span class="score">${formatScore(entry.score)}</span>
      </button>
    `)
    .join("");

  $$(".rec-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedRecommendationId = card.dataset.recId;
      renderRecommendations();
      renderCalculationFlow();
      renderExplainList();
      renderCandidateScores();
      renderVisualLab();
      renderItemSpace();
    });
  });
}

function renderCalculationFlow() {
  const user = userById(state.selectedUserId);
  const liked = likedItemIds(user.id).map(itemById);
  const recommendations = ensureSelectedRecommendation();
  const selected = recommendations.find((entry) => entry.item.id === state.selectedRecommendationId);
  const candidateNames = items
    .filter((item) => !liked.some((likedItem) => likedItem.id === item.id))
    .map((item) => item.title);

  if (!selected) {
    $("#calculationFlow").innerHTML = `<div class="plain-card"><strong>暂无计算链路</strong><p>当前用户没有可解释的推荐结果。</p></div>`;
    return;
  }

  const activeContributions = selected.contributions.filter((item) => item.value > 0);
  const formula = activeContributions
    .map((item) => `sim(${selected.item.title}, ${item.from.title})`)
    .join(" + ");
  const values = activeContributions.map((item) => formatScore(item.value)).join(" + ");

  $("#calculationFlow").innerHTML = `
    <article>
      <span>01</span>
      <strong>${user.name} 已喜欢</strong>
      <p>${liked.map((item) => item.title).join("、")}</p>
    </article>
    <article>
      <span>02</span>
      <strong>候选物品</strong>
      <p>${candidateNames.join("、")}</p>
    </article>
    <article>
      <span>03</span>
      <strong>当前查看</strong>
      <p>${selected.item.title}</p>
    </article>
    <article>
      <span>04</span>
      <strong>推荐分公式</strong>
      <p>${formula} = ${values} = ${formatScore(selected.score)}</p>
    </article>
  `;
}

function renderExplainList() {
  const recommendations = ensureSelectedRecommendation();
  if (recommendations.length === 0) {
    $("#explainList").innerHTML = `<div class="plain-card"><strong>没有可解释推荐</strong><p>当前用户没有正分候选。可以新增一条喜欢行为，或切换到其他用户观察。</p></div>`;
    return;
  }

  const maxContribution = Math.max(
    0.01,
    ...recommendations.flatMap((entry) => entry.contributions.map((item) => item.value)),
  );

  $("#explainList").innerHTML = recommendations
    .map((entry) => `
      <article class="explain-card ${entry.item.id === state.selectedRecommendationId ? "is-selected" : ""}">
        <strong>${entry.item.title}：推荐分 ${formatScore(entry.score)}</strong>
        <p>score = ${entry.contributions
          .map((item) => `sim(${entry.item.title}, ${item.from.title}) ${formatScore(item.value)}`)
          .join(" + ")}</p>
        ${entry.contributions
          .map((item) => `
            <div class="contrib-row">
              <div>
                <b>${item.from.title}</b>
                <small>共现 ${item.coCount} / sqrt(${item.candidateCount} * ${item.sourceCount}) = ${formatScore(item.value)}</small>
                <div class="bar"><span style="width: ${(item.value / maxContribution) * 100}%"></span></div>
              </div>
              <b>${formatScore(item.value)}</b>
            </div>
          `)
          .join("")}
      </article>
    `)
    .join("");
}

function renderCandidateScores() {
  const candidates = scoreCandidatesForUser(state.selectedUserId);
  const selectedId = state.selectedRecommendationId;

  if (candidates.length === 0) {
    $("#candidateScores").innerHTML = `<div class="plain-card"><strong>没有候选物品</strong><p>当前用户已经喜欢了全部物品。</p></div>`;
    return;
  }

  $("#candidateScores").innerHTML = candidates
    .map((entry) => `
      <article class="candidate-row ${entry.item.id === selectedId ? "is-selected" : ""}">
        <div>
          <strong>${entry.item.title}</strong>
          <p>${entry.score > 0 ? "可推荐：存在相似来源" : "暂不推荐：和历史物品没有共现"}</p>
        </div>
        <b>${formatScore(entry.score)}</b>
      </article>
    `)
    .join("");
}

function renderSimilarSources() {
  const liked = likedItemIds(state.selectedUserId);
  const likedSet = new Set(liked);
  const { similarity } = buildItemSimilarity();
  const candidateCount = items.filter((item) => !likedSet.has(item.id)).length;

  if (candidateCount === 0) {
    $("#similarSources").innerHTML = `<div class="plain-card"><strong>没有可比较候选</strong><p>当前用户已经喜欢了全部物品。</p></div>`;
    return;
  }

  $("#similarSources").innerHTML = liked
    .map((likedId) => {
      const source = itemById(likedId);
      const neighbors = items
        .filter((item) => item.id !== likedId && !likedSet.has(item.id))
        .map((item) => ({ item, value: similarity[likedId][item.id] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

      return `
        <article class="source-card">
          <strong>${source.title}</strong>
          ${neighbors
            .map((neighbor) => `
              <div class="source-row">
                <span>${neighbor.item.title}</span>
                <b>${neighbor.value > 0 ? formatScore(neighbor.value) : "无共现"}</b>
              </div>
            `)
            .join("")}
        </article>
      `;
    })
    .join("");
}

function renderBehaviorMatrix() {
  const matrix = buildUserItemMatrix();
  const head = items.map((item) => `<th>${item.title}</th>`).join("");
  const rows = matrix
    .map(({ user, values }) => `
      <tr class="${user.id === state.selectedUserId ? "is-active" : ""}">
        <td>${user.name}</td>
        ${values.map((value) => `<td class="${value ? "hit" : ""}">${value}</td>`).join("")}
      </tr>
    `)
    .join("");

  $("#behaviorMatrix").innerHTML = `
    <table>
      <thead><tr><th>用户</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function similarityClass(value) {
  if (value >= 0.65) return "sim-high";
  if (value >= 0.3) return "sim-mid";
  return "sim-low";
}

function renderSimilarityMatrix() {
  const { similarity } = buildItemSimilarity();
  renderSimilarityTopList(similarity);
  const head = items.map((item) => `<th>${item.title}</th>`).join("");
  const rows = items
    .map((left) => `
      <tr>
        <td>${left.title}</td>
        ${items
          .map((right) => {
            const value = similarity[left.id][right.id];
            return `<td class="${similarityClass(value)}">${formatScore(value)}</td>`;
          })
          .join("")}
      </tr>
    `)
    .join("");

  $("#similarityMatrix").innerHTML = `
    <table>
      <thead><tr><th>物品</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderSimilarityTopList(similarity) {
  const container = $("#similarityTopList");
  if (!container) return;

  const pairs = [];
  items.forEach((left, leftIndex) => {
    items.slice(leftIndex + 1).forEach((right) => {
      const value = similarity[left.id][right.id];
      if (value > 0) pairs.push({ left, right, value });
    });
  });

  container.innerHTML = pairs
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((pair) => `
      <article class="similar-pair">
        <strong>${pair.left.title}</strong>
        <span>${formatScore(pair.value)}</span>
        <strong>${pair.right.title}</strong>
      </article>
    `)
    .join("");
}

function renderCoOccurrenceMatrix() {
  const { coCounts } = buildItemSimilarity();
  const head = items.map((item) => `<th>${item.title}</th>`).join("");
  const rows = items
    .map((left) => `
      <tr>
        <td>${left.title}</td>
        ${items
          .map((right) => {
            const value = coCounts[left.id][right.id];
            return `<td class="${value > 1 ? "sim-high" : value === 1 ? "sim-mid" : "sim-low"}">${value}</td>`;
          })
          .join("")}
      </tr>
    `)
    .join("");

  $("#coOccurrenceMatrix").innerHTML = `
    <table>
      <thead><tr><th>物品</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRoadmap() {
  $("#roadmapList").innerHTML = roadmap
    .map(([step, title, desc]) => `
      <article class="timeline-item">
        <strong>${step} · ${title}</strong>
        <p>${desc}</p>
      </article>
    `)
    .join("");
}

function renderVisualLab() {
  const status = $("#visualStatus");
  if (status) {
    status.textContent = state.source === "backend"
      ? `${activeInteractions().length} 条 PostgreSQL 行为`
      : "离线兜底数据";
    status.classList.toggle("is-ok", state.source === "backend");
  }

  const user = userById(state.selectedUserId);
  if (!user) return;

  const liked = likedItemIds(user.id).map(itemById).filter(Boolean);
  const recommendations = ensureSelectedRecommendation();
  const selected = recommendations.find((entry) => entry.item.id === state.selectedRecommendationId);

  $("#visualUserSummary").innerHTML = `
    <strong>${user.name}</strong>
    <p>${user.note}</p>
  `;

  $("#visualLikedFlow").innerHTML = liked.length
    ? liked.map((item) => `
        <article class="flow-item is-liked">
          <div>
            <span>已喜欢</span>
            <strong>${item.title}</strong>
            <p>${item.category}</p>
          </div>
          <button class="mini-danger-btn" data-delete-like="${item.id}">删除</button>
        </article>
      `).join("")
    : `<div class="plain-card"><strong>暂无行为</strong><p>这个用户还没有喜欢过物品。</p></div>`;

  $$("[data-delete-like]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeLikeForCurrentUser(button.dataset.deleteLike);
    });
  });

  $("#visualRecommendationList").innerHTML = recommendations.length
    ? recommendations.map((entry, index) => `
        <button class="visual-rec ${entry.item.id === state.selectedRecommendationId ? "is-selected" : ""}" data-rec-id="${entry.item.id}">
          <span>${index + 1}</span>
          <div>
            <strong>${entry.item.title}</strong>
            <small>${entry.item.category} · 推荐分 ${formatScore(entry.score)}</small>
          </div>
        </button>
      `).join("")
    : `<div class="plain-card"><strong>暂无推荐</strong><p>${liked.length >= items.length ? "当前用户已经喜欢了全部物品，过滤后没有候选。删除一个已喜欢物品或重置数据后再观察推荐结果。" : "当前候选物品没有相似来源，可以尝试新增其他用户行为或切换用户。"}</p></div>`;

  $$("#visualRecommendationList .visual-rec").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRecommendationId = button.dataset.recId;
      renderRecommendations();
      renderVisualLab();
      renderCalculationFlow();
      renderExplainList();
      renderCandidateScores();
      renderItemSpace();
    });
  });

  const positiveContributions = (selected?.contributions || []).filter((entry) => entry.value > 0);
  const maxScore = Math.max(0.01, ...recommendations.map((entry) => entry.score));
  $("#visualProcess").innerHTML = [
    ["01", "读取行为", `${user.name} 已喜欢 ${liked.length} 个物品。`],
    ["02", "寻找相似", `用共现公式比较 ${liked.length} 个历史物品和候选物品。`],
    ["03", "累加得分", `当前推荐由 ${positiveContributions.length} 个历史物品贡献。`],
    ["04", "过滤排序", "过滤已喜欢物品，只保留候选推荐。"],
  ].map(([step, title, desc]) => `
    <article>
      <span>${step}</span>
      <strong>${title}</strong>
      <p>${desc}</p>
    </article>
  `).join("");

  if (!selected) {
    $("#visualDetail").innerHTML = `<div class="plain-card"><strong>没有选中推荐</strong><p>${liked.length >= items.length ? "当前用户已喜欢全部物品，推荐解释为空是正常的。先删除一个喜欢，系统就会重新产生候选和解释。" : "当前没有可以解释的推荐结果。"}</p></div>`;
  } else {
    $("#visualDetail").innerHTML = `
      <div class="detail-hero">
        <span>当前推荐</span>
        <strong>${selected.item.title}</strong>
        <p>推荐分 ${formatScore(selected.score)}，相当于推荐榜最高分的 ${Math.round((selected.score / maxScore) * 100)}%。</p>
      </div>
      ${selected.contributions.map((entry) => `
        <div class="contrib-row">
          <div>
            <b>${entry.from.title}</b>
            <small>共现 ${entry.coCount} / sqrt(${entry.candidateCount} * ${entry.sourceCount}) = ${formatScore(entry.value)}</small>
            <div class="bar"><span style="width: ${Math.max(3, (entry.value / maxScore) * 100)}%"></span></div>
          </div>
          <b>${formatScore(entry.value)}</b>
        </div>
      `).join("")}
    `;
  }

  renderMatchCanvas();
}

function renderMatchCanvas() {
  const canvas = $("#matchCanvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const user = userById(state.selectedUserId);
  if (!user) return;

  const liked = likedItemIds(user.id).map(itemById).filter(Boolean);
  const recommendations = ensureSelectedRecommendation();
  const selected = recommendations.find((entry) => entry.item.id === state.selectedRecommendationId);
  const positiveSources = (selected?.contributions || []).filter((entry) => entry.value > 0);
  const selectedSources = new Set(positiveSources.map((entry) => entry.from.id));
  const shownLiked = [
    ...positiveSources.map((entry) => entry.from),
    ...liked.filter((item) => !selectedSources.has(item.id)),
  ].slice(0, 5);
  const shownRecommendations = [
    ...(selected ? [selected] : []),
    ...recommendations.filter((entry) => entry.item.id !== selected?.item.id),
  ].slice(0, 5);

  drawCanvasFrame(ctx, rect.width, rect.height);

  const userWidth = Math.min(150, Math.max(112, rect.width * 0.18));
  const cardWidth = Math.min(180, Math.max(126, rect.width * 0.22));
  const userX = rect.width * 0.1;
  const likedX = rect.width * 0.43;
  const recX = rect.width * 0.76;

  drawLaneLabel(ctx, "当前用户", userX, 30);
  drawLaneLabel(ctx, "已喜欢物品", likedX, 30);
  drawLaneLabel(ctx, "候选推荐", recX, 30);

  const userNode = {
    x: userX - userWidth / 2,
    y: Math.max(92, rect.height / 2 - 42),
    width: userWidth,
    height: 84,
    label: user.name,
    title: "当前用户",
    meta: user.note,
    type: "user",
  };
  const likedNodes = layoutNodeColumn(shownLiked, likedX, 76, cardWidth, 58, rect.height).map((node) => ({
    id: node.item.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    title: selectedSources.has(node.item.id) ? "贡献来源" : "已喜欢",
    label: node.item.title,
    meta: `${node.item.category} · 当前用户已喜欢`,
    type: "liked",
  }));
  const recNodes = layoutNodeColumn(shownRecommendations, recX, 76, cardWidth, 62, rect.height).map((node) => ({
    id: node.item.item.id,
    score: node.item.score,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    title: node.item.item.id === state.selectedRecommendationId ? "当前推荐" : "候选",
    label: node.item.item.title,
    meta: `${node.item.item.category} · 推荐分 ${formatScore(node.item.score)}`,
    type: "candidate",
    selected: node.item.item.id === state.selectedRecommendationId,
  }));

  ctx.lineCap = "round";
  likedNodes.forEach((node) => drawPipelineLink(ctx, userNode, node, "#236f53", 0.18, 2));
  recNodes.forEach((targetNode) => {
    const recommendation = recommendations.find((entry) => entry.item.id === targetNode.id);
    likedNodes.forEach((sourceNode) => {
      const contribution = recommendation?.contributions.find((entry) => entry.from.id === sourceNode.id);
      if (!contribution || contribution.value <= 0) return;
      if (targetNode.selected && selectedSources.has(sourceNode.id)) return;
      drawPipelineLink(ctx, sourceNode, targetNode, "#236f53", 0.08 + contribution.value * 0.15, 1.2);
    });
  });
  if (selected) {
    likedNodes.forEach((sourceNode) => {
      const contribution = selected.contributions.find((entry) => entry.from.id === sourceNode.id);
      const targetNode = recNodes.find((node) => node.id === selected.item.id);
      if (!contribution || contribution.value <= 0 || !targetNode) return;
      drawPipelineLink(ctx, sourceNode, targetNode, "#b65f2a", 0.52 + Math.min(0.36, contribution.value), 2.5 + contribution.value * 5);
    });
  }

  drawNodeCard(ctx, userNode, true);
  likedNodes.forEach((node) => drawNodeCard(ctx, node, selectedSources.has(node.id)));
  recNodes.forEach((node) => drawNodeCard(ctx, node, node.selected));
  state.matchNodes = [userNode, ...likedNodes, ...recNodes];

  if (!likedNodes.length || !recNodes.length) {
    drawCanvasEmptyText(ctx, rect.width, rect.height, !likedNodes.length ? "当前用户还没有喜欢行为" : "当前没有可推荐候选");
  }
}

function layoutNodeColumn(itemsToLayout, x, startY, width, height, canvasHeight) {
  const bottom = 44;
  const count = Math.max(1, itemsToLayout.length);
  const available = Math.max(height, canvasHeight - startY - bottom);
  const step = available / count;

  return itemsToLayout.map((item, index) => ({
    item,
    x,
    y: startY + step * index + Math.max(0, step - height) / 2,
    width,
    height,
  }));
}

function drawCanvasFrame(ctx, width, height) {
  ctx.fillStyle = "#fbfdfb";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#174a38";
  ctx.font = "900 13px sans-serif";
  ctx.fillText("3D ItemCF 匹配空间：用户 -> 已喜欢物品 -> 候选推荐", 22, 30);
  ctx.fillStyle = "#6b756f";
  ctx.font = "800 12px sans-serif";
  ctx.fillText("线越粗表示贡献越大，靠前的候选表示推荐分更高", 22, 52);
  ctx.strokeStyle = "rgba(35, 111, 83, 0.12)";
  for (let x = 40; x < width; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 74);
    ctx.lineTo(x + 46, height - 36);
    ctx.stroke();
  }
  for (let y = 96; y < height; y += 58) {
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(width - 34, y - 30);
    ctx.stroke();
  }
}

function drawLaneLabel(ctx, label, x, y) {
  ctx.fillStyle = "#174a38";
  ctx.font = "900 13px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
}

function drawCanvasEmptyText(ctx, width, height, text) {
  ctx.fillStyle = "rgba(31, 39, 35, 0.72)";
  ctx.font = "900 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
}

function drawPipelineLink(ctx, from, to, color, alpha, width) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const middle = Math.max(46, (endX - startX) * 0.5);

  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(startX + middle, startY - 92, endX - middle, endY - 92, endX, endY);
  ctx.stroke();

  ctx.fillStyle = colorWithAlpha(color, Math.min(0.95, alpha + 0.2));
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - 7, endY - 4);
  ctx.lineTo(endX - 7, endY + 4);
  ctx.closePath();
  ctx.fill();
}

function drawNodeCard(ctx, node, highlight = false) {
  const isUser = node.type === "user";
  const depth = node.type === "candidate" ? 0.92 : node.type === "liked" ? 1 : 1.08;
  const lift = node.type === "candidate" ? 22 : node.type === "liked" ? 12 : 0;
  const x = node.x;
  const y = node.y - lift;
  const w = node.width * depth;
  const h = node.height * depth;
  ctx.fillStyle = "rgba(31,39,35,0.14)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 8, w * 0.45, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(31,39,35,0.16)";
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + 14, y - 10);
  ctx.lineTo(x + w + 14, y + h - 10);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = isUser ? "#174a38" : highlight ? "#fff0e6" : "#ffffff";
  ctx.strokeStyle = isUser ? "#174a38" : highlight ? "#b65f2a" : "rgba(35, 111, 83, 0.22)";
  ctx.lineWidth = highlight ? 2 : 1;
  drawRoundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isUser ? "#d8efe4" : highlight ? "#b65f2a" : "#236f53";
  ctx.font = "900 11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(node.title, x + 12, y + 10);

  ctx.fillStyle = isUser ? "#ffffff" : "#1f2723";
  ctx.font = "900 14px sans-serif";
  ctx.fillText(truncateCanvasText(node.label, node.type === "candidate" ? 11 : 12), x + 12, y + 29);

  ctx.fillStyle = isUser ? "#c4ddd2" : "#6b756f";
  ctx.font = "800 11px sans-serif";
  ctx.fillText(truncateCanvasText(node.meta || "", 16), x + 12, y + h - 18);
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  if (width <= 0 || height <= 0) return;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function truncateCanvasText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function renderAll() {
  renderUserSelect();
  renderUserPanel();
  renderSandbox();
  renderRecommendations();
  renderCalculationFlow();
  renderCandidateScores();
  renderSimilarSources();
  renderExplainList();
  renderBehaviorMatrix();
  renderSimilarityMatrix();
  renderCoOccurrenceMatrix();
  renderItemSpace();
  renderVisualLab();
  renderRoadmap();
}

function itemSpacePoints() {
  if (state.source === "backend" && state.backendState?.itemSimilarityPoints) {
    return state.backendState.itemSimilarityPoints;
  }
  const { similarity } = buildItemSimilarity();
  const total = Math.max(1, items.length);
  return items.map((item, index) => {
    const values = items.filter((other) => other.id !== item.id).map((other) => similarity[item.id][other.id]);
    const avgSimilarity = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      ...item,
      x: Math.cos((index / total) * Math.PI * 2) * (1.2 + avgSimilarity),
      y: avgSimilarity * 2 - 0.5,
      z: Math.sin((index / total) * Math.PI * 2) * (1.2 + avgSimilarity),
      avgSimilarity,
    };
  });
}

function rotatePoint(point) {
  const { rotationX, rotationY, zoom } = state.space;
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;
  const depth = 1 / (1 + (z2 + 3.6) * 0.12);
  return { x: x1 * zoom * depth, y: y1 * zoom * depth, depth };
}

function renderItemSpace() {
  const canvas = $("#itemSpaceCanvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const points = itemSpacePoints();
  const pointById = Object.fromEntries(points.map((point) => [point.id, point]));
  const { similarity } = buildItemSimilarity();
  const selected = recommendForUser(state.selectedUserId).find((entry) => entry.item.id === state.selectedRecommendationId);
  const highlighted = new Set([...(selected?.contributions || []).filter((item) => item.value > 0).map((item) => item.from.id), selected?.item.id].filter(Boolean));
  const projected = points.map((point) => ({
    ...point,
    screen: rotatePoint(point),
  }));

  ctx.save();
  ctx.translate(rect.width / 2, rect.height / 2);
  ctx.lineWidth = 1.5;
  points.forEach((left, leftIndex) => {
    points.slice(leftIndex + 1).forEach((right) => {
      const value = similarity[left.id]?.[right.id] || 0;
      if (value <= 0) return;
      const start = projected.find((point) => point.id === left.id).screen;
      const end = projected.find((point) => point.id === right.id).screen;
      const isHot = highlighted.has(left.id) && highlighted.has(right.id);
      ctx.strokeStyle = isHot ? `rgba(182, 95, 42, ${0.35 + value * 0.55})` : `rgba(35, 111, 83, ${0.14 + value * 0.25})`;
      ctx.lineWidth = isHot ? 3 : 1 + value * 1.2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });
  });

  projected
    .sort((a, b) => a.screen.depth - b.screen.depth)
    .forEach((point) => {
      const isHot = highlighted.has(point.id);
      const radius = isHot ? 13 : 10;
      ctx.fillStyle = isHot ? "#b65f2a" : "#236f53";
      ctx.beginPath();
      ctx.arc(point.screen.x, point.screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(point.id.replace("i", ""), point.screen.x, point.screen.y);
      ctx.fillStyle = "#1f2723";
      ctx.font = "800 13px sans-serif";
      ctx.fillText(point.title, point.screen.x, point.screen.y + radius + 14);
    });

  ctx.restore();
}

function bindItemSpaceEvents() {
  const canvas = $("#itemSpaceCanvas");
  if (!canvas) return;
  canvas.addEventListener("pointerdown", (event) => {
    state.space.dragging = true;
    state.space.lastX = event.clientX;
    state.space.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.space.dragging) return;
    state.space.rotationY += (event.clientX - state.space.lastX) * 0.008;
    state.space.rotationX += (event.clientY - state.space.lastY) * 0.008;
    state.space.lastX = event.clientX;
    state.space.lastY = event.clientY;
    renderItemSpace();
  });
  canvas.addEventListener("pointerup", () => {
    state.space.dragging = false;
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.space.zoom = Math.max(80, Math.min(280, state.space.zoom - event.deltaY * 0.12));
    renderItemSpace();
  }, { passive: false });
  $("#resetSpaceBtn")?.addEventListener("click", () => {
    state.space.rotationX = -0.45;
    state.space.rotationY = 0.65;
    state.space.zoom = 160;
    renderItemSpace();
  });
}

function bindMatchCanvasEvents() {
  const canvas = $("#matchCanvas");
  const tooltip = $("#matchTooltip");
  if (!canvas || !tooltip) return;

  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.matchNodes.find((item) => (
      x >= item.x
      && x <= item.x + item.width
      && y >= item.y
      && y <= item.y + item.height
    ));

    if (!node) {
      tooltip.classList.remove("is-visible");
      return;
    }

    tooltip.innerHTML = `<strong>${node.label}</strong><span>${node.meta || ""}</span>`;
    tooltip.style.left = `${Math.min(rect.width - 220, Math.max(10, x + 14))}px`;
    tooltip.style.top = `${Math.min(rect.height - 86, Math.max(10, y + 14))}px`;
    tooltip.classList.add("is-visible");
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.classList.remove("is-visible");
  });
}

function resetLocalData() {
  interactions = initialInteractions.map((interaction) => ({ ...interaction }));
  state.backendState = null;
  state.source = "local";
  state.selectedRecommendationId = "";
  state.changeLog = [];
  setBackendStatus("离线兜底模式");
}

function bindEvents() {
  bindProjectSwitcher();
  bindItemSpaceEvents();
  bindMatchCanvasEvents();
  window.addEventListener("resize", () => {
    renderItemSpace();
    renderMatchCanvas();
  });
  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });

  $$("[data-view-link]").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.viewLink));
  });

  $("#userSelect").addEventListener("change", async (event) => {
    await changeSelectedUser(event.target.value);
  });

  $("#visualUserSelect")?.addEventListener("change", async (event) => {
    await changeSelectedUser(event.target.value);
  });

  $("#resetBtn").addEventListener("click", async () => {
    state.selectedUserId = "u2";
    if (state.source === "backend") {
      try {
        state.backendState = await apiRequest(`/api/reset?user_id=${encodeURIComponent(state.selectedUserId)}`, {
          method: "POST",
        });
        state.selectedRecommendationId = "";
        state.changeLog = [];
        setBackendStatus(`PostgreSQL · ${state.backendState.interactions.length} 条真实行为`, "ok");
        renderAll();
      } catch (error) {
        setBackendStatus("后端重置失败", "error");
        showToast("后端重置失败");
        return;
      }
    } else {
      resetLocalData();
      renderAll();
    }
    switchView("overview");
    showToast("已重置为手算案例用户");
  });

  $("#addLikeBtn").addEventListener("click", async () => {
    await addLikeForCurrentUser($("#addItemSelect").value);
  });

  $("#visualAddLikeBtn")?.addEventListener("click", async () => {
    await addLikeForCurrentUser($("#visualAddItemSelect").value);
  });

  $("#createCustomItemBtn")?.addEventListener("click", async () => {
    await createCustomItemForCurrentUser();
  });

  $("#resetDataBtn").addEventListener("click", async () => {
    if (state.source === "backend") {
      try {
        state.backendState = await apiRequest(`/api/reset?user_id=${encodeURIComponent(state.selectedUserId)}`, {
          method: "POST",
        });
        setBackendStatus(`PostgreSQL · ${state.backendState.interactions.length} 条真实行为`, "ok");
      } catch (error) {
        setBackendStatus("后端重置失败", "error");
        showToast("后端重置失败");
        return;
      }
    } else {
      interactions = initialInteractions.map((interaction) => ({ ...interaction }));
    }
    state.selectedRecommendationId = "";
    state.changeLog = [];
    renderAll();
    showToast("已恢复原始行为数据");
  });

  $("#useLocalBtn").addEventListener("click", () => {
    state.source = "local";
    state.backendState = null;
    state.selectedRecommendationId = "";
    setBackendStatus("离线兜底模式");
    renderAll();
    showToast("已切换到离线演示数据");
  });

  $("#useBackendBtn").addEventListener("click", async () => {
    try {
      await loadBackendState(state.selectedUserId);
      showToast("已连接后端 API");
    } catch (error) {
      setBackendStatus("后端连接失败", "error");
      showToast("请先启动后端服务");
    }
  });

  $("#refreshBackendBtn").addEventListener("click", async () => {
    if (state.source !== "backend") {
      showToast("当前是离线兜底模式，先连接 PostgreSQL");
      return;
    }
    try {
      await loadBackendState(state.selectedUserId);
      showToast("已刷新后端数据");
    } catch (error) {
      setBackendStatus("后端连接失败", "error");
      showToast("刷新失败，请检查后端服务");
    }
  });
}

async function addLikeForCurrentUser(itemId) {
  if (!itemId) return;

  const user = userById(state.selectedUserId);
  const item = itemById(itemId);

  if (state.source === "backend") {
    try {
      state.backendState = await apiRequest("/api/interactions", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, itemId: item.id }),
      });
      setBackendStatus(`PostgreSQL · ${state.backendState.interactions.length} 条真实行为`, "ok");
    } catch (error) {
      setBackendStatus("后端写入失败", "error");
      showToast("后端写入失败，可能已经存在这条行为");
      return;
    }
  } else {
    interactions.push({ userId: user.id, itemId: item.id });
  }

  state.selectedRecommendationId = "";
  state.changeLog = [`${user.name} 新增喜欢：${item.title}`, ...state.changeLog].slice(0, 4);
  renderAll();
  showToast(state.source === "backend" ? "PostgreSQL 已新增喜欢行为" : "已加入一条临时喜欢行为");
}

async function createCustomItemForCurrentUser() {
  const titleInput = $("#customItemTitle");
  const categoryInput = $("#customItemCategory");
  const title = titleInput.value.trim();
  const category = categoryInput.value.trim() || "自定义";
  const user = userById(state.selectedUserId);

  if (!title) {
    showToast("先输入自定义物品名称");
    return;
  }

  if (state.source === "backend") {
    try {
      state.backendState = await apiRequest("/api/items", {
        method: "POST",
        body: JSON.stringify({ title, category, userId: user.id }),
      });
      users = state.backendState.users;
      items = state.backendState.items;
      setBackendStatus(`PostgreSQL · ${state.backendState.interactions.length} 条真实行为`, "ok");
    } catch (error) {
      setBackendStatus("自定义物品写入失败", "error");
      showToast("自定义物品写入失败");
      return;
    }
  } else {
    const nextId = `i${items.length + 1}`;
    items.push({ id: nextId, title, category });
    interactions.push({ userId: user.id, itemId: nextId });
  }

  titleInput.value = "";
  categoryInput.value = "自定义";
  state.selectedRecommendationId = "";
  state.changeLog = [`${user.name} 创建并喜欢：${title}`, ...state.changeLog].slice(0, 4);
  renderAll();
  showToast("已创建自定义物品，并加入当前用户喜欢");
}

async function removeLikeForCurrentUser(itemId) {
  const user = userById(state.selectedUserId);
  const item = itemById(itemId);
  if (!user || !item) return;

  if (state.source === "backend") {
    try {
      state.backendState = await apiRequest("/api/interactions", {
        method: "DELETE",
        body: JSON.stringify({ userId: user.id, itemId: item.id }),
      });
      setBackendStatus(`PostgreSQL · ${state.backendState.interactions.length} 条真实行为`, "ok");
    } catch (error) {
      setBackendStatus("后端删除失败", "error");
      showToast("后端删除失败，可能这条行为已不存在");
      return;
    }
  } else {
    interactions = interactions.filter((entry) => !(entry.userId === user.id && entry.itemId === item.id));
  }

  state.selectedRecommendationId = "";
  state.changeLog = [`${user.name} 删除喜欢：${item.title}`, ...state.changeLog].slice(0, 4);
  renderAll();
  showToast(state.source === "backend" ? "PostgreSQL 已删除喜欢行为" : "已删除临时喜欢行为");
}

async function changeSelectedUser(userId) {
  state.selectedUserId = userId;
  state.selectedRecommendationId = "";
  if (state.source === "backend") {
    try {
      await loadBackendState(state.selectedUserId);
      showToast("已从 PostgreSQL 刷新推荐结果");
    } catch (error) {
      setBackendStatus("后端连接失败", "error");
      showToast("后端连接失败，已保留当前数据");
    }
  } else {
    renderAll();
    showToast("已重新计算推荐结果");
  }
}

function bindProjectSwitcher() {
  const trigger = $("#projectTrigger");
  const menu = $("#projectMenu");
  if (!trigger || !menu) return;

  const closeMenu = () => {
    trigger.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
  };

  trigger.addEventListener("click", () => {
    const nextOpen = !menu.classList.contains("is-open");
    trigger.classList.toggle("is-open", nextOpen);
    trigger.setAttribute("aria-expanded", String(nextOpen));
    menu.classList.toggle("is-open", nextOpen);
  });

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    if (button.dataset.project === "itemcf") {
      closeMenu();
      return;
    }
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

bindEvents();
renderAll();
loadBackendState(state.selectedUserId).catch(() => {
  resetLocalData();
  renderAll();
  showToast("PostgreSQL 未连接，已使用离线演示数据");
});
