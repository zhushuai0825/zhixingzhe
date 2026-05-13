const projects = {
  zhixingzhe: {
    url: "../项目/知行者AI实验室/前端原型/index.html?v=20260511-pg-itemcf",
  },
  itemcf: {
    url: "../项目/基于物品的协同过滤ItemCF/前端原型/index.html?v=20260512-quality-v1",
  },
  tagrec: {
    url: "../项目/标签推荐实验室/前端原型/index.html?v=20260512-data-v1",
  },
  usercf: {
    url: "../项目/UserCF实验室/前端原型/index.html?v=20260512-data-v1",
  },
  svd: {
    url: "../项目/SVD矩阵分解实验室/前端原型/index.html?v=20260512-data-v1",
  },
  recsys: {
    url: "../项目/推荐系统核心技术实验室/前端原型/index.html?v=20260512-data-v1",
  },
  embedding: {
    url: "../项目/Embedding与相似度实验室/前端原型/index.html?v=20260512-quality-v1",
  },
  chunking: {
    url: "../项目/文本切分实验室/前端原型/index.html?v=20260512-quality-v1",
  },
  vectordb: {
    url: "../项目/向量库实验室/前端原型/index.html?v=20260511-vectordb-v1",
  },
  rerank: {
    url: "../项目/Rerank重排序实验室/前端原型/index.html?v=20260512-rerank-v2",
  },
  rageval: {
    url: "../项目/RAG评测实验室/前端原型/index.html?v=20260512-rageval-v2",
  },
  graphrag: {
    url: "../项目/GraphRAG图谱实验室/前端原型/index.html?v=20260512-graphrag-v1",
  },
  agent: {
    url: "../项目/Agent工程实验室/前端原型/index.html?v=20260512-agent-v1",
  },
  modelprompt: {
    url: "../项目/模型调用与Prompt工程实验室/前端原型/index.html?v=20260512-modelprompt-v1",
  },
};

const frame = document.querySelector("#projectFrame");

function setProject(projectId) {
  const project = projects[projectId] || projects.zhixingzhe;
  frame.src = project.url;
  localStorage.setItem("learning-platform-project", projectId);
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "learning-platform:switch-project") {
    setProject(event.data.project);
  }
});

setProject(localStorage.getItem("learning-platform-project") || "zhixingzhe");
