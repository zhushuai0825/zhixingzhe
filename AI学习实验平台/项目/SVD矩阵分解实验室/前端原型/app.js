const {
  $, users, items, itemFactors, byId, likedItemIds, userFactor, svdRecommendations,
  bindProjectSwitcher, bindViews, renderUserSelect, cardList, tagList, setup3DCanvas,
  renderDataWorkbench,
} = RecoLabKit;

const state = {
  userId: "u1",
  space: { rotationX: -0.5, rotationY: 0.75, zoom: 150, dragging: false, lastX: 0, lastY: 0 },
};

let drawVisual = () => {};

function renderFactor() {
  const user = byId(users, state.userId);
  const factor = userFactor(state.userId);
  const liked = likedItemIds(state.userId).map((id) => byId(items, id));
  $("#factorPanel").innerHTML = `
    <div class="plain-card">
      <strong>${user.name} · ${user.role}</strong>
      <p>教学版用用户已喜欢物品的隐向量平均值，模拟“训练后得到的用户隐向量”。</p>
      ${tagList(liked.map((item) => item.title))}
    </div>
    <div class="plain-card">
      <strong>用户隐向量</strong>
      <div class="formula">[${factor.map((n) => n.toFixed(4)).join(", ")}]</div>
      <p>第一维可以粗略理解成 AI/RAG 兴趣，第二维可以粗略理解成推荐算法兴趣。真实 SVD 的维度通常不能直接命名。</p>
    </div>
  `;
}

function renderResults() {
  $("#resultPanel").innerHTML = cardList(svdRecommendations(state.userId), 6);
}

function renderTrace() {
  const user = byId(users, state.userId);
  const factor = userFactor(state.userId);
  const liked = likedItemIds(state.userId).map((id) => byId(items, id));
  const entries = svdRecommendations(state.userId);
  const top = entries[0];
  const topDot = top ? `${factor.map((n, index) => `${n.toFixed(4)} * ${top.factor[index].toFixed(4)}`).join(" + ")} = ${top.score.toFixed(4)}` : "";
  $("#tracePanel").innerHTML = `
    <article class="lesson-card">
      <span>输入</span>
      <strong>${user.name} 的历史行为</strong>
      <p>教学版先读取已喜欢物品：${liked.map((item) => item.title).join("、")}。</p>
    </article>
    <article class="lesson-card">
      <span>用户向量</span>
      <strong>平均得到用户隐向量</strong>
      <p>[${factor.map((n) => n.toFixed(4)).join(", ")}]。真实训练会用优化算法学习，这里用平均值让你先看懂逻辑。</p>
    </article>
    <article class="lesson-card">
      <span>物品向量</span>
      <strong>每个物品也有隐向量</strong>
      <p>候选物品不是只靠标签，而是靠一组数字表达潜在属性。</p>
    </article>
    <article class="lesson-card">
      <span>Top 1</span>
      <strong>${top ? top.item.title : "暂无推荐"}</strong>
      <p>${top ? `点积计算：${topDot}。点积分越高，预测越可能喜欢。` : "当前没有候选物品。"}</p>
    </article>
    <article class="lesson-card">
      <span>为什么</span>
      <strong>为什么要矩阵分解</strong>
      <p>用户-物品矩阵很稀疏，矩阵分解尝试用低维向量补全未知位置，预测用户没看过的物品。</p>
    </article>
    <article class="lesson-card">
      <span>边界</span>
      <strong>隐向量不等于标签</strong>
      <p>真实隐向量维度通常不能直接解释成中文标签，所以 SVD 比标签推荐更强，但解释性也更弱。</p>
    </article>
  `;
}

function buildScene() {
  const factor = userFactor(state.userId);
  const recs = svdRecommendations(state.userId).slice(0, 8);
  const nodes = [{
    id: "user",
    label: `用户隐向量：${byId(users, state.userId).name}`,
    short: "U",
    x: factor[0] * 1.8 - 0.85,
    y: 0.15,
    z: factor[1] * 1.8 - 0.85,
    size: 25,
    color: "#2f6f48",
    meta: `用户隐向量 [${factor.map((n) => n.toFixed(4)).join(", ")}]，来自已喜欢物品向量的平均值`,
  }];
  const links = [];
  recs.forEach((entry, index) => {
    nodes.push({
      id: entry.item.id,
      label: entry.item.title,
      short: String(index + 1),
      x: entry.factor[0] * 1.8 - 0.85,
      y: -0.75 + (index % 4) * 0.28,
      z: entry.factor[1] * 1.8 - 0.85,
      size: index === 0 ? 23 : 18,
      color: index === 0 ? "#b45f2a" : "#1f6f84",
      meta: `物品隐向量 [${entry.factor.map((n) => n.toFixed(4)).join(", ")}]；点积推荐分 ${entry.score.toFixed(4)}；标签：${entry.item.tags.join(" / ")}`,
    });
    links.push({ from: "user", to: entry.item.id, width: Math.max(1.2, entry.score * 3.4), color: index === 0 ? "rgba(180,95,42,0.7)" : "rgba(31,111,132,0.28)" });
  });
  return { title: "SVD：用户向量和物品向量方向越一致，点积预测分越高", nodes, links };
}

function renderRoadmap() {
  const cards = [
    ["SVD 到底在学什么？", "它从用户-物品行为矩阵里学习用户隐向量和物品隐向量，然后用两个向量的点积预测用户会不会喜欢某个物品。", "用户向量偏 AI，物品向量也偏 AI，两者方向接近，点积分就会高。"],
    ["行为矩阵为什么稀疏？", "真实系统里用户只点击过极少数物品，矩阵大部分位置没有值。矩阵分解就是用少量已知行为去估计未知位置。", "一万个课程里，你可能只看过几十个，剩下的位置都是待预测。"],
    ["隐向量是什么？", "隐向量不是人工写的标签，而是算法从行为中学出的低维表达。它可能混合了主题、难度、风格、人群偏好等因素。", "某个维度可能不叫“AI”，但 AI 类课程在这个维度上普遍值更高。"],
    ["为什么用点积？", "点积可以衡量用户兴趣方向和物品属性方向是否一致。方向相近、数值都高时，点积就大。", "用户向量 [0.8, 0.2] 和物品 [0.9, 0.3] 点积比和 [0.2, 0.9] 更高。"],
    ["面试要注意什么？", "要能讲清矩阵、稀疏、隐向量、点积、训练目标、冷启动和解释性弱的问题。", "不要把 SVD 说成简单相似度，它是从历史行为里学习潜在表示。"],
  ];
  $("#roadmapPanel").innerHTML = cards.map(([q, a, example]) => `
    <article class="question"><strong>${q}</strong><p>${a}</p><p><b>示例：</b>${example}</p></article>
  `).join("");
}

function renderAll() {
  if (!byId(users, state.userId)) state.userId = users[0]?.id || "";
  renderUserSelect("#userSelect", state.userId, (userId) => {
    state.userId = userId;
    renderAll();
  });
  renderDataWorkbench("#dataWorkbench", state.userId, (event) => {
    if (event.user) state.userId = event.user.id;
    renderAll();
  });
  renderFactor();
  renderResults();
  renderTrace();
  drawVisual();
}

function init() {
  bindProjectSwitcher("svd");
  bindViews((viewId) => {
    if (viewId === "visual") drawVisual();
  });
  renderRoadmap();
  drawVisual = setup3DCanvas("#svdCanvas", "#canvasTip", state.space, buildScene);
  renderAll();
}

init();
