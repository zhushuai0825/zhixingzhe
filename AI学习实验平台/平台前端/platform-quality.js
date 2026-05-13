(function () {
  const guides = {
    chunking: {
      match: /文本切分|Chunking/i,
      title: "0 基础读法：这一页只看“长文档怎么拆成小片段”。",
      body: "RAG 不能把一本很长的文档直接塞给模型，所以要先切成 chunk。你重点观察三件事：切片大小会不会丢上下文、overlap 是否把断开的句子接回来、切完的 chunk 是否还能表达一个完整意思。",
      steps: ["原文", "切片大小", "overlap", "chunk 列表", "为什么这样切"],
    },
    embedding: {
      match: /Embedding|相似度/i,
      title: "0 基础读法：这一页只看“文字怎么变成可比较的数字”。",
      body: "Embedding 可以理解成把一句话放进一个语义坐标系。查询文本和候选文本都变成向量以后，系统才能计算它们像不像。分数高不代表答案一定对，只代表语义上更接近。",
      steps: ["查询文本", "查询向量", "候选向量", "相似度", "Top K"],
    },
    vectordb: {
      match: /向量库/i,
      title: "0 基础读法：这一页只看“向量、原文和来源怎么存起来”。",
      body: "向量库不是只存一串数字。真实 RAG 至少要存 chunk 文本、embedding、metadata 和来源。搜索时先用问题向量找近邻，再把命中的原文拿出来交给模型回答。",
      steps: ["chunk", "embedding", "metadata", "索引", "近邻查询"],
    },
    rerank: {
      match: /Rerank|重排序/i,
      title: "0 基础读法：这一页只看“初筛结果为什么还要重新排队”。",
      body: "向量检索像先粗略找一批可能相关的片段，Rerank 像再认真读一遍 query 和每个 chunk，判断谁真的能回答问题。它常用来把主题相关但答不上来的片段往后放。",
      steps: ["向量召回", "候选列表", "成对打分", "重排", "证据门"],
    },
    rageval: {
      match: /RAG 评测|评测实验室/i,
      title: "0 基础读法：这一页只看“怎么判断 RAG 真的变好了”。",
      body: "不要只凭感觉说系统准确。评测要先准备标准问题、标准证据和标准答案，再分别看检索有没有找回来、引用是否正确、回答有没有编造、该拒答时有没有拒答。",
      steps: ["问题集", "标准证据", "检索指标", "回答指标", "拒答正确性"],
    },
    graphrag: {
      match: /Graph RAG|图谱/i,
      title: "0 基础读法：这一页只看“实体和关系怎么帮助多跳推理”。",
      body: "普通 RAG 多数是在 chunk 里找相似文本。Graph RAG 会先抽出实体和关系，比如人、公司、事件、条款，再沿关系路径找证据。适合一个答案需要跨多个事实串起来的问题。",
      steps: ["实体", "关系", "路径", "多跳检索", "回到原文"],
    },
    agent: {
      match: /Agent/i,
      title: "0 基础读法：这一页只看“目标怎么变成工具调用和最终结果”。",
      body: "Agent 不是让模型随便发挥，而是给它目标、工具、状态和停止条件。你看轨迹时从左到右读：先计划，再调用工具，再观察结果，再判断证据够不够，最后输出任务或答案。",
      steps: ["目标", "计划", "工具", "观察", "评估", "最终结果"],
    },
    modelprompt: {
      match: /Prompt|模型调用/i,
      title: "0 基础读法：这一页只看“一次大模型调用怎么变成可控接口”。",
      body: "真实系统不是把一句话扔给模型就结束。你要看 system、user、context 怎么拼，输出格式怎么约束，JSON 怎么校验，失败时怎么重试，成本和延迟怎么估算。",
      steps: ["消息", "上下文", "输出格式", "校验", "重试", "成本"],
    },
    itemcf: {
      match: /ItemCF|物品/i,
      title: "0 基础读法：这一页只看“喜欢过同一批用户的物品会互相推荐”。",
      body: "ItemCF 不需要理解物品内容，它看用户行为：如果很多人同时喜欢 A 和 B，那么 A、B 就相似。给用户推荐时，会从他喜欢过的物品出发，找相似但他还没喜欢过的物品。",
      steps: ["用户行为", "共现", "物品相似度", "过滤已喜欢", "Top N"],
    },
    tagrec: {
      match: /标签推荐/i,
      title: "0 基础读法：这一页只看“用户画像标签怎么匹配物品标签”。",
      body: "标签推荐最容易解释：用户喜欢过的内容会积累标签权重，候选物品如果命中这些标签，分数就会上升。它适合新物品冷启动，但标签质量会直接影响效果。",
      steps: ["用户标签", "物品标签", "权重", "匹配分", "冷启动"],
    },
    usercf: {
      match: /UserCF/i,
      title: "0 基础读法：这一页只看“相似用户喜欢什么，我可能也会喜欢”。",
      body: "UserCF 先找和当前用户兴趣相似的人，再把这些相似用户喜欢、当前用户没看过的物品推荐出来。它适合兴趣圈层明显的场景，但用户很多时计算会变重。",
      steps: ["当前用户", "相似用户", "邻居贡献", "候选物品", "Top N"],
    },
    svd: {
      match: /SVD|矩阵分解/i,
      title: "0 基础读法：这一页只看“用户和物品背后的隐含兴趣”。",
      body: "SVD 会把用户和物品都压缩成低维向量。两个向量点积越高，表示系统越认为用户可能喜欢这个物品。它更像学习潜在兴趣，但解释性比标签和协同过滤弱。",
      steps: ["行为矩阵", "稀疏", "隐向量", "点积预测", "推荐排序"],
    },
    recsys: {
      match: /推荐系统核心|推荐系统总览/i,
      title: "0 基础读法：这一页只看“四种推荐算法分别解决什么问题”。",
      body: "推荐系统不是一个算法。标签推荐适合冷启动，ItemCF 适合物品稳定，UserCF 适合人群相似，SVD 适合从稀疏行为里学习潜在兴趣。先学输入、公式、优缺点，再看评估。",
      steps: ["标签", "ItemCF", "UserCF", "SVD", "评估指标"],
    },
    zhixingzhe: {
      match: /知行者/i,
      title: "0 基础读法：这一页是完整系统，把前面实验室串起来看。",
      body: "知行者里 RAG 实验室负责上传文档和入库，可视化实验台负责看问题如何命中 chunk，Agent 实验室负责看目标如何调用知识库和工具。先不要急着看所有细节，按这三块顺序学。",
      steps: ["上传文档", "切片入库", "检索命中", "基于证据回答", "Agent 调工具"],
    },
  };

  function pageGuide() {
    const guideList = Object.values(guides);
    const titleText = [
      document.title,
      document.querySelector("#pageTitle")?.textContent || "",
      document.querySelector(".project-trigger strong")?.textContent || "",
    ].join(" ");
    const titleMatch = guideList.find((guide) => guide.match.test(titleText));
    if (titleMatch) return titleMatch;
    const bodyText = document.body?.innerText?.slice(0, 1200) || "";
    return guideList.find((guide) => guide.match.test(bodyText)) || guides.zhixingzhe;
  }

  function ensureGuide() {
    const activeView = document.querySelector(".view.is-active");
    if (!activeView || activeView.querySelector(".beginner-guide")) return;
    const guide = pageGuide();
    const card = document.createElement("section");
    card.className = "beginner-guide";
    card.innerHTML = `
      <strong>${guide.title}</strong>
      <p>${guide.body}</p>
      <div class="guide-steps">${guide.steps.map((step) => `<span>${step}</span>`).join("")}</div>
    `;
    activeView.prepend(card);
  }

  function bindGuideRefresh() {
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-view], [data-view-link]")) {
        window.setTimeout(ensureGuide, 0);
      }
    });
  }

  function init() {
    ensureGuide();
    bindGuideRefresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
