from __future__ import annotations

import math
import re
from collections import Counter
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


VectorMetric = Literal["cosine", "dot", "euclidean"]

VECTOR_DIM = 16
TOKEN_RE = re.compile(r"[a-zA-Z0-9_]+|[\u4e00-\u9fff]")

DIMENSIONS = [
    {"id": 0, "label": "RAG 检索", "keywords": ["rag", "检", "索", "召", "回", "查", "询", "知", "识", "库"]},
    {"id": 1, "label": "Embedding 向量化", "keywords": ["embedding", "向", "量", "向量化", "嵌", "入"]},
    {"id": 2, "label": "向量数据库", "keywords": ["数", "据", "库", "存", "储", "collection", "index", "top", "k"]},
    {"id": 3, "label": "相似度计算", "keywords": ["相", "似", "度", "匹", "配", "余", "弦", "点", "积", "距", "离"]},
    {"id": 4, "label": "文档切分", "keywords": ["文", "档", "切", "分", "chunk", "片", "段"]},
    {"id": 5, "label": "Rerank 重排", "keywords": ["rerank", "重", "排", "排", "序", "初", "步"]},
    {"id": 6, "label": "Agent 工具", "keywords": ["agent", "工", "具", "调", "用", "目", "标"]},
    {"id": 7, "label": "推荐算法", "keywords": ["itemcf", "推", "荐", "协", "同", "过", "滤", "用户", "行为"]},
    {"id": 8, "label": "生成回答", "keywords": ["生", "成", "回", "答", "大", "模", "型", "llm"]},
    {"id": 9, "label": "部署工程", "keywords": ["docker", "fastapi", "api", "服", "务", "部", "署"]},
    {"id": 10, "label": "评测质量", "keywords": ["评", "测", "准", "确", "质", "量", "幻", "觉"]},
    {"id": 11, "label": "学习概念", "keywords": ["学", "习", "概", "念", "入", "门", "理", "解"]},
]

VECTOR_DIM = len(DIMENSIONS)

EXAMPLE_TEXTS = [
    "RAG 使用 embedding 把问题和文档片段变成向量，再计算相似度完成检索。",
    "向量数据库负责存储 embedding，并支持 Top K 相似向量查询。",
    "文本切分会把长文档拆成多个 chunk，方便后续向量化和召回。",
    "Rerank 会对初步召回的结果重新排序，让最相关的片段排在前面。",
    "Agent 会根据目标决定是否调用检索、搜索、计算器等工具。",
    "ItemCF 推荐算法根据用户行为共现计算物品相似度，不依赖文本 embedding。",
]


class CandidateText(BaseModel):
    id: str
    text: str


class CompareRequest(BaseModel):
    query: str = Field(min_length=1)
    candidates: list[CandidateText] = Field(min_length=1)
    metric: VectorMetric = "cosine"
    topK: int = Field(default=5, ge=1, le=20)


app = FastAPI(title="Embedding 与相似度实验室 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text)]


def token_dimensions(token: str) -> list[int]:
    return [
        dimension["id"]
        for dimension in DIMENSIONS
        if token in dimension["keywords"]
    ]


def raw_embedding(tokens: list[str], dim: int = VECTOR_DIM) -> list[float]:
    vector = [0.0] * dim
    counts = Counter(tokens)
    for token, count in counts.items():
        for index in token_dimensions(token):
            vector[index] += 1 + math.log(count)
    return vector


def normalize(vector: list[float]) -> list[float]:
    length = math.sqrt(sum(value * value for value in vector))
    if length == 0:
        return vector
    return [value / length for value in vector]


def embed(text: str) -> dict:
    tokens = tokenize(text)
    raw = raw_embedding(tokens)
    normalized = normalize(raw)
    token_map = [
        {
            "token": token,
            "dimensions": token_dimensions(token),
        }
        for token in tokens
    ]
    non_zero = [
        {
            "dimension": index,
            "value": round(value, 4),
        }
        for index, value in enumerate(normalized)
        if abs(value) > 0.0001
    ]
    return {
        "text": text,
        "tokens": tokens,
        "tokenMap": token_map,
        "vector": [round(value, 4) for value in normalized],
        "nonZero": non_zero,
        "dim": VECTOR_DIM,
        "dimensionLabels": DIMENSIONS,
    }


def dot(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def euclidean(left: list[float], right: list[float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))


def score(left: list[float], right: list[float], metric: VectorMetric) -> float:
    if metric == "euclidean":
        return euclidean(left, right)
    return dot(left, right)


def compare(query: str, candidates: list[CandidateText], metric: VectorMetric, top_k: int) -> dict:
    query_embedding = embed(query)
    rows = []
    for candidate in candidates:
        candidate_embedding = embed(candidate.text)
        value = score(query_embedding["vector"], candidate_embedding["vector"], metric)
        overlap = sorted(set(query_embedding["tokens"]) & set(candidate_embedding["tokens"]))
        shared_dimensions = shared_dimension_labels(query_embedding["vector"], candidate_embedding["vector"])
        rows.append(
            {
                "id": candidate.id,
                "text": candidate.text,
                "embedding": candidate_embedding,
                "score": round(value, 4),
                "sharedTokens": overlap,
                "sharedDimensions": shared_dimensions,
            }
        )

    reverse = metric != "euclidean"
    rows.sort(key=lambda item: item["score"], reverse=reverse)
    return {
        "metric": metric,
        "topK": top_k,
        "query": query_embedding,
        "results": rows[:top_k],
        "allResults": rows,
        "explanation": metric_explanation(metric),
    }


def metric_explanation(metric: VectorMetric) -> str:
    if metric == "cosine":
        return "当前向量已做 L2 归一化，所以余弦相似度等价于两个向量点积；分数越大越相似。"
    if metric == "dot":
        return "点积会把相同方向的维度累加；当前向量已归一化，因此结果和余弦相似度接近。"
    return "欧氏距离表示两个向量之间的直线距离；距离越小越相似。"


def shared_dimension_labels(left: list[float], right: list[float]) -> list[dict]:
    shared = []
    for index, (left_value, right_value) in enumerate(zip(left, right)):
        if left_value <= 0 or right_value <= 0:
            continue
        shared.append(
            {
                "dimension": index,
                "label": DIMENSIONS[index]["label"],
                "strength": round(left_value * right_value, 4),
            }
        )
    shared.sort(key=lambda item: item["strength"], reverse=True)
    return shared


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "dim": VECTOR_DIM, "examples": len(EXAMPLE_TEXTS)}


@app.get("/api/examples")
def examples() -> dict:
    return {
        "query": "RAG 里的 embedding 和向量数据库是什么关系？",
        "candidates": [
            {"id": f"d{index + 1}", "text": text}
            for index, text in enumerate(EXAMPLE_TEXTS)
        ],
    }


@app.post("/api/compare")
def compare_api(payload: CompareRequest) -> dict:
    return compare(payload.query, payload.candidates, payload.metric, payload.topK)
