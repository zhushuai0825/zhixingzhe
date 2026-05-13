from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


TOKEN_RE = re.compile(r"[a-zA-Z0-9_]+|[\u4e00-\u9fff]")

DIMENSIONS = [
    {"id": 0, "label": "RAG 检索", "keywords": ["rag", "检", "索", "召", "回", "查", "询", "知", "识", "库"]},
    {"id": 1, "label": "Embedding 向量化", "keywords": ["embedding", "向", "量", "向量化", "嵌", "入"]},
    {"id": 2, "label": "向量数据库", "keywords": ["数", "据", "库", "存", "储", "collection", "index", "top", "k"]},
    {"id": 3, "label": "相似度计算", "keywords": ["相", "似", "度", "匹", "配", "余", "弦", "点", "积", "距", "离"]},
    {"id": 4, "label": "文档切分", "keywords": ["文", "档", "切", "分", "chunk", "片", "段"]},
    {"id": 5, "label": "Rerank 重排", "keywords": ["rerank", "重", "排", "序", "初", "步"]},
    {"id": 6, "label": "Agent 工具", "keywords": ["agent", "工", "具", "调", "用", "目", "标"]},
    {"id": 7, "label": "推荐算法", "keywords": ["itemcf", "推", "荐", "协", "同", "过", "滤", "用户", "行为"]},
    {"id": 8, "label": "生成回答", "keywords": ["生", "成", "回", "答", "大", "模", "型", "llm"]},
    {"id": 9, "label": "部署工程", "keywords": ["docker", "fastapi", "api", "服", "务", "部", "署"]},
    {"id": 10, "label": "评测质量", "keywords": ["评", "测", "准", "确", "质", "量", "幻", "觉"]},
    {"id": 11, "label": "学习概念", "keywords": ["学", "习", "概", "念", "入", "门", "理", "解"]},
]

SEED_DOCUMENTS = [
    {
        "id": "chunk-1",
        "text": "RAG 使用 embedding 把用户问题和文档 chunk 变成向量，再用相似度检索相关证据。",
        "metadata": {"source": "rag_intro.md", "section": "RAG 检索", "page": "1"},
    },
    {
        "id": "chunk-2",
        "text": "向量数据库负责存储 chunk embedding，并支持 Top K 相似向量查询和 metadata 过滤。",
        "metadata": {"source": "vector_db.md", "section": "向量库", "page": "2"},
    },
    {
        "id": "chunk-3",
        "text": "文本切分会把长文档拆成多个 chunk，chunk size 和 overlap 会影响召回质量。",
        "metadata": {"source": "chunking.md", "section": "文本切分", "page": "1"},
    },
    {
        "id": "chunk-4",
        "text": "Rerank 会对向量库初步召回的结果重新排序，让最相关的证据片段排在前面。",
        "metadata": {"source": "rerank.md", "section": "重排序", "page": "3"},
    },
    {
        "id": "chunk-5",
        "text": "Agent 可以根据任务目标决定是否调用检索工具、计算器、搜索工具或生成任务计划。",
        "metadata": {"source": "agent.md", "section": "工具调用", "page": "5"},
    },
]

VECTOR_DIM = len(DIMENSIONS)
COLLECTION_NAME = "rag_learning_chunks"
store: dict[str, dict[str, Any]] = {}


class UpsertPayload(BaseModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    metadata: dict[str, str] = Field(default_factory=dict)


class QueryPayload(BaseModel):
    query: str = Field(min_length=1)
    topK: int = Field(default=3, ge=1, le=20)
    source: str = ""


app = FastAPI(title="向量库实验室 API", version="0.1.0")

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


def normalize(vector: list[float]) -> list[float]:
    length = math.sqrt(sum(value * value for value in vector))
    if length == 0:
        return vector
    return [value / length for value in vector]


def embed(text: str) -> dict[str, Any]:
    tokens = tokenize(text)
    vector = [0.0] * VECTOR_DIM
    counts = Counter(tokens)
    for token, count in counts.items():
        for index in token_dimensions(token):
            vector[index] += 1 + math.log(count)
    normalized = normalize(vector)
    return {
        "tokens": tokens,
        "vector": [round(value, 4) for value in normalized],
        "dimensionLabels": DIMENSIONS,
    }


def dot(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def shared_dimensions(left: list[float], right: list[float]) -> list[dict[str, Any]]:
    values = []
    for index, (left_value, right_value) in enumerate(zip(left, right)):
        if left_value <= 0 or right_value <= 0:
            continue
        values.append(
            {
                "dimension": index,
                "label": DIMENSIONS[index]["label"],
                "strength": round(left_value * right_value, 4),
            }
        )
    values.sort(key=lambda item: item["strength"], reverse=True)
    return values


def make_record(payload: UpsertPayload) -> dict[str, Any]:
    embedding = embed(payload.text)
    return {
        "id": payload.id,
        "text": payload.text,
        "metadata": payload.metadata,
        "embedding": embedding,
    }


def reset_store() -> None:
    store.clear()
    for document in SEED_DOCUMENTS:
        payload = UpsertPayload(**document)
        store[payload.id] = make_record(payload)


def state_payload() -> dict[str, Any]:
    return {
        "collection": COLLECTION_NAME,
        "count": len(store),
        "dimensionLabels": DIMENSIONS,
        "documents": list(store.values()),
    }


@app.on_event("startup")
def startup() -> None:
    reset_store()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "collection": COLLECTION_NAME, "count": len(store), "dim": VECTOR_DIM}


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    return state_payload()


@app.post("/api/reset")
def reset_api() -> dict[str, Any]:
    reset_store()
    return state_payload()


@app.post("/api/upsert")
def upsert_api(payload: UpsertPayload) -> dict[str, Any]:
    store[payload.id] = make_record(payload)
    return state_payload()


@app.delete("/api/documents/{document_id}")
def delete_api(document_id: str) -> dict[str, Any]:
    if document_id not in store:
        raise HTTPException(status_code=404, detail="document not found")
    del store[document_id]
    return state_payload()


@app.post("/api/query")
def query_api(payload: QueryPayload) -> dict[str, Any]:
    query_embedding = embed(payload.query)
    rows = []
    for record in store.values():
        if payload.source and record["metadata"].get("source") != payload.source:
            continue
        score = dot(query_embedding["vector"], record["embedding"]["vector"])
        rows.append(
            {
                **record,
                "score": round(score, 4),
                "sharedDimensions": shared_dimensions(query_embedding["vector"], record["embedding"]["vector"]),
            }
        )
    rows.sort(key=lambda item: item["score"], reverse=True)
    return {
        "query": payload.query,
        "queryEmbedding": query_embedding,
        "topK": payload.topK,
        "filter": {"source": payload.source},
        "results": rows[: payload.topK],
        "allResults": rows,
        "collection": COLLECTION_NAME,
    }
