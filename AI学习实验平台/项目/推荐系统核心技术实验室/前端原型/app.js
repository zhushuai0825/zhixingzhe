const {
  $, $$, users, items, byId, likedItemIds, tagRecommendations, itemSimilarity,
  userSimilarity, similarUsers, usercfRecommendations, userFactor, svdRecommendations,
  renderDataWorkbench,
} = RecoLabKit;

const state = {
  userId: "u1",
  algorithm: "tag",
  topN: 5,
  nodes: [],
};

function itemSetForUser(userId) {
  return new Set(likedItemIds(userId));
}

function candidatesFor(userId) {
  const liked = itemSetForUser(userId);
  return items.filter((item) => !liked.has(item.id));
}

function itemcfRecommendations(userId) {
  const liked = likedItemIds(userId);
  return candidatesFor(userId).map((item) => {
    const contributions = liked.map((sourceId) => ({
      source: byId(items, sourceId),
      score: itemSimilarity(sourceId, item.id),
    })).filter((entry) => entry.score > 0);
    const score = contributions.reduce((sum, entry) => sum + entry.score, 0);
    return {
      item,
      score,
      reason: contributions.length ? `由 ${contributions.map((entry) => entry.source.title).join("、")} 贡献` : "没有相似历史物品",
      contributions,
    };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
}

function recommendations(type = state.algorithm, userId = state.userId) {
  if (type === "itemcf") return itemcfRecommendations(userId);
  if (type === "usercf") return usercfRecommendations(userId);
  if (type === "svd") return svdRecommendations(userId);
  return tagRecommendations(userId);
}

function cardList(entries, limit = 5) {
  const max = Math.max(0.001, ...entries.map((entry) => entry.score));
  if (!entries.length) return `<div class="plain-card"><strong>暂无推荐</strong><p>当前数据下没有正分候选。可以切换用户或换一种算法观察。</p></div>`;
  return `<div class="result-list">${entries.slice(0, limit).map((entry, index) => `
    <article class="result-card">
      <strong>Top ${index + 1} · ${entry.item.title}</strong>
      <p>${entry.reason}</p>
      <div class="score-bar"><i style="width:${Math.max(4, entry.score / max * 100)}%"></i></div>
      <div class="tag-list">${entry.item.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <p>推荐分：${entry.score.toFixed(4)}</p>
    </article>
  `).join("")}</div>`;
}

function renderUserSelects() {
  const options = users.map((user) => `<option value="${user.id}">${user.name} · ${user.role}</option>`).join("");
  $("#globalUserSelect").innerHTML = options;
  $("#globalUserSelect").value = state.userId;
}

function renderTagDemo() {
  const entries = tagRecommendations(state.userId);
  const user = byId(users, state.userId);
  $("#tagDemo").innerHTML = `
    <div class="demo-grid">
      <div class="plain-card">
        <strong>${user.name} 已喜欢</strong>
        <div class="tag-list">${likedItemIds(user.id).map((id) => `<span>${byId(items, id).title}</span>`).join("")}</div>
        <p>系统把这些物品的标签累加成用户画像，再去找标签重合的候选物品。</p>
      </div>
      ${cardList(entries, 5)}
    </div>
  `;
}

function renderItemcfDemo() {
  const entries = itemcfRecommendations(state.userId);
  $("#itemcfDemo").innerHTML = `
    <div class="demo-grid">
      <div class="plain-card">
        <strong>物品相似度来自共现</strong>
        <p>如果两个物品经常被同一批用户喜欢，它们的相似度就高。ItemCF 不需要理解标题内容。</p>
        <div class="formula">sim(i, j) = co_count(i, j) / sqrt(count(i) * count(j))</div>
      </div>
      ${cardList(entries, 5)}
    </div>
  `;
}

function renderUsercfDemo() {
  const entries = usercfRecommendations(state.userId);
  const sims = users.filter((user) => user.id !== state.userId).map((user) => ({
    user,
    score: userSimilarity(state.userId, user.id),
  })).sort((a, b) => b.score - a.score);
  $("#usercfDemo").innerHTML = `
    <div class="demo-grid">
      <div class="plain-card">
        <strong>相似用户</strong>
        ${sims.map((entry) => `<p>${entry.user.name}：相似度 ${entry.score.toFixed(4)}</p>`).join("")}
      </div>
      ${cardList(entries, 5)}
    </div>
  `;
}

function renderSvdDemo() {
  const entries = svdRecommendations(state.userId);
  const factor = userFactor(state.userId);
  $("#svdDemo").innerHTML = `
    <div class="demo-grid">
      <div class="plain-card">
        <strong>当前用户隐向量</strong>
        <p>[${factor.map((n) => n.toFixed(3)).join(", ")}]</p>
        <p>第一维可以粗略理解成 AI 工程兴趣，第二维可以粗略理解成推荐算法兴趣。真实 SVD 的维度通常没有这么直观。</p>
      </div>
      ${cardList(entries, 5)}
    </div>
  `;
}

function renderProfile() {
  const user = byId(users, state.userId);
  const liked = likedItemIds(user.id).map((id) => byId(items, id));
  $("#userProfile").innerHTML = `
    <div class="plain-card">
      <strong>${user.name} · ${user.role}</strong>
      <p>已喜欢 ${liked.length} 个物品。</p>
      <div class="tag-list">${liked.map((item) => `<span>${item.title}</span>`).join("")}</div>
    </div>
  `;
}

function renderRecommendations() {
  const entries = recommendations().slice(0, state.topN);
  $("#recommendationList").innerHTML = cardList(entries, state.topN);
  const descriptions = {
    tag: "标签推荐看内容：用户喜欢过什么标签，就推荐标签相近的候选。",
    itemcf: "ItemCF 看物品共现：用户喜欢过的物品，会把相似物品推上来。",
    usercf: "UserCF 看相似用户：和当前用户兴趣相似的人喜欢过什么。",
    svd: "SVD 看隐向量：用低维兴趣空间预测用户和候选物品的匹配程度。",
  };
  $("#algorithmExplain").innerHTML = `<strong>当前算法解释</strong><p>${descriptions[state.algorithm]}</p>`;
  drawCanvas(entries);
}

function renderModules() {
  if (!byId(users, state.userId)) state.userId = users[0]?.id || "";
  renderUserSelects();
  renderDataWorkbench("#dataWorkbench", state.userId, (event) => {
    if (event.user) state.userId = event.user.id;
    renderModules();
  });
  renderTagDemo();
  renderItemcfDemo();
  renderUsercfDemo();
  renderSvdDemo();
  renderProfile();
  renderRecommendations();
}

function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function drawNode(ctx, x, y, r, color, text) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + 4);
  ctx.textAlign = "left";
}

function drawCanvas(entries) {
  const canvas = $("#recCanvas");
  if (!canvas) return;
  const { ctx, w, h } = canvasContext(canvas);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fbfdfb";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#173820";
  ctx.font = "900 13px sans-serif";
  ctx.fillText("推荐链路：左侧是当前用户历史，右侧是候选推荐，线越粗贡献越强", 18, 28);

  const liked = likedItemIds(state.userId).map((id) => byId(items, id));
  const leftX = 88;
  const rightX = w - 92;
  const startY = 76;
  const gap = Math.max(48, Math.min(74, (h - 140) / Math.max(liked.length, entries.length, 1)));
  state.nodes = [];

  liked.forEach((item, index) => {
    const y = startY + index * gap;
    drawNode(ctx, leftX, y, 18, "#2f6f48", String(index + 1));
    state.nodes.push({ x: leftX - 18, y: y - 18, width: 36, height: 36, label: item.title, meta: `已喜欢 · ${item.tags.join(" / ")}` });
  });

  entries.forEach((entry, index) => {
    const y = startY + index * gap;
    const lineWidth = Math.max(1.5, Math.min(8, entry.score * 4));
    liked.forEach((source, sourceIndex) => {
      const sourceY = startY + sourceIndex * gap;
      let active = false;
      if (state.algorithm === "tag") active = source.tags.some((tag) => entry.item.tags.includes(tag));
      if (state.algorithm === "itemcf") active = itemSimilarity(source.id, entry.item.id) > 0;
      if (state.algorithm === "usercf") active = entry.reason.includes("相似用户");
      if (state.algorithm === "svd") active = true;
      if (!active) return;
      ctx.strokeStyle = index === 0 ? "rgba(180,95,42,0.65)" : "rgba(31,111,132,0.24)";
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(leftX + 24, sourceY);
      ctx.bezierCurveTo(w * 0.38, sourceY, w * 0.62, y, rightX - 24, y);
      ctx.stroke();
    });
    drawNode(ctx, rightX, y, index === 0 ? 21 : 17, index === 0 ? "#b45f2a" : "#1f6f84", String(index + 1));
    state.nodes.push({ x: rightX - 22, y: y - 22, width: 44, height: 44, label: entry.item.title, meta: `${entry.reason} · 分数 ${entry.score.toFixed(4)}` });
  });

  ctx.fillStyle = "#68716a";
  ctx.font = "800 12px sans-serif";
  ctx.fillText("当前用户已喜欢", 34, h - 24);
  ctx.fillText("Top N 推荐", w - 150, h - 24);
}

function bindCanvasTooltip() {
  const canvas = $("#recCanvas");
  const tip = $("#canvasTip");
  if (!canvas || !tip) return;
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const node = state.nodes.find((entry) => x >= entry.x && x <= entry.x + entry.width && y >= entry.y && y <= entry.y + entry.height);
    if (!node) {
      tip.classList.remove("is-visible");
      return;
    }
    tip.innerHTML = `<strong>${node.label}</strong><span>${node.meta}</span>`;
    tip.style.left = `${Math.min(rect.width - 290, Math.max(10, x + 14))}px`;
    tip.style.top = `${Math.min(rect.height - 110, Math.max(10, y + 14))}px`;
    tip.classList.add("is-visible");
  });
  canvas.addEventListener("mouseleave", () => tip.classList.remove("is-visible"));
}

function renderInterview() {
  const questions = [
    ["标签推荐和协同过滤有什么区别？", "标签推荐看物品内容，协同过滤看用户行为。标签推荐适合冷启动，协同过滤更能捕捉群体偏好。"],
    ["ItemCF 和 UserCF 怎么选？", "物品稳定、用户多、解释要清晰时常用 ItemCF；社区关系强、用户兴趣群明显时 UserCF 更直观。"],
    ["SVD 解决了什么问题？", "SVD 把稀疏的用户-物品行为矩阵压缩成低维隐向量，能发现表面标签看不到的潜在兴趣。"],
    ["推荐系统为什么要过滤已喜欢物品？", "因为推荐目标是发现新物品。已喜欢物品可以用于建模，但通常不应该再次出现在推荐结果里。"],
    ["冷启动是什么？", "新用户没有行为，新物品没有行为，协同过滤难以计算相似度。可以用热门推荐、标签推荐、内容 embedding 或人工精选兜底。"],
    ["推荐效果怎么评估？", "离线看 Precision@K、Recall@K、HitRate、Coverage、Diversity；线上看点击率、转化率、停留时长和 A/B 测试。"],
    ["推荐为什么不能只看准确率？", "如果永远推荐热门内容，准确率可能不低，但覆盖率、新颖性和多样性会很差，用户容易疲劳。"],
    ["推荐系统和 RAG 有什么关系？", "两者都要做召回、排序和 Top N。RAG 推荐的是证据片段，推荐系统推荐的是物品、内容或商品。"],
  ];
  $("#interviewList").innerHTML = questions.map(([q, a]) => `
    <article class="question">
      <strong>${q}</strong>
      <p>${a}</p>
      <p><b>举例：</b>如果新上线一门“SVD 入门课”，还没人点过，ItemCF 暂时帮不上忙，但标签推荐可以根据“推荐、矩阵分解、算法”标签把它推荐给相关用户。</p>
    </article>
  `).join("");
}

function switchView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewId));
  const active = $(`.nav-item[data-view="${viewId}"] b`);
  $("#pageTitle").textContent = active?.textContent || "推荐系统核心技术";
  if (viewId === "playground") renderRecommendations();
}

function bindProjectSwitcher() {
  const trigger = $("#projectTrigger");
  const menu = $("#projectMenu");
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
    closeMenu();
    if (button.dataset.project === "recsys") return;
    window.parent?.postMessage({ type: "learning-platform:switch-project", project: button.dataset.project }, "*");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-switcher")) closeMenu();
  });
}

function bindEvents() {
  bindProjectSwitcher();
  bindCanvasTooltip();
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-link]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewLink)));
  $("#globalUserSelect").addEventListener("change", (event) => {
    state.userId = event.target.value;
    renderModules();
  });
  $("#algorithmSelect").addEventListener("change", (event) => {
    state.algorithm = event.target.value;
    renderRecommendations();
  });
  $("#topNSelect").addEventListener("change", (event) => {
    state.topN = Number(event.target.value);
    renderRecommendations();
  });
  window.addEventListener("resize", () => renderRecommendations());
}

function init() {
  renderInterview();
  bindEvents();
  renderModules();
}

init();
