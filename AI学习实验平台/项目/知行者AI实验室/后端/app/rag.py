import hashlib
import json
import math
import re
import uuid
from typing import Any
from urllib import request

from fastapi import HTTPException

from .config import settings


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 80) -> list[str]:
    normalized = re.sub(r"\n{3,}", "\n\n", text.strip())
    if not normalized:
        return []

    chunk_size = max(100, min(chunk_size, 3000))
    overlap = max(0, min(overlap, chunk_size // 2))

    chunks: list[str] = []
    current = ""
    blocks: list[str] = []
    for paragraph in re.split(r"\n\s*\n", normalized):
        blocks.extend(_split_long_block(paragraph.strip(), chunk_size))

    for block in blocks:
        if not block:
            continue
        candidate = f"{current}\n\n{block}".strip() if current else block
        if len(candidate) <= chunk_size:
            current = candidate
            continue
        if current:
            chunks.append(current)
        prefix = current[-overlap:].strip() if overlap and current else ""
        current = f"{prefix}\n\n{block}".strip() if prefix and len(block) + len(prefix) + 2 <= chunk_size else block
    if current:
        chunks.append(current)
    return chunks


def _split_long_block(text: str, chunk_size: int) -> list[str]:
    if len(text) <= chunk_size:
        return [text]

    sentences = [item.strip() for item in re.split(r"(?<=[。！？!?；;])\s*", text) if item.strip()]
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        if len(sentence) > chunk_size:
            if current:
                pieces.append(current)
                current = ""
            pieces.extend(sentence[index : index + chunk_size] for index in range(0, len(sentence), chunk_size))
            continue
        candidate = f"{current}{sentence}" if current else sentence
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            pieces.append(current)
            current = sentence
    if current:
        pieces.append(current)
    return pieces


def _tokens(text: str) -> list[str]:
    lower = text.lower()
    words = re.findall(r"[a-z0-9_]+|[\u4e00-\u9fff]", lower)
    bigrams = [lower[i : i + 2] for i in range(max(0, len(lower) - 1)) if lower[i : i + 2].strip()]
    return words + bigrams


def bm25_scores(query: str, documents: list[str]) -> list[float]:
    """Learning-version BM25 scorer for Hybrid RAG.

    It is intentionally small and local: enough to show why keyword recall can
    complement vector recall, without introducing another search service yet.
    """
    query_terms = _tokens(query)
    tokenized_docs = [_tokens(document) for document in documents]
    if not query_terms or not tokenized_docs:
        return [0.0] * len(documents)

    doc_count = len(tokenized_docs)
    avg_len = sum(len(tokens) for tokens in tokenized_docs) / doc_count or 1
    doc_freq: dict[str, int] = {}
    for tokens in tokenized_docs:
        for term in set(tokens):
            doc_freq[term] = doc_freq.get(term, 0) + 1

    raw_scores: list[float] = []
    k1 = 1.5
    b = 0.75
    for tokens in tokenized_docs:
        term_counts: dict[str, int] = {}
        for term in tokens:
            term_counts[term] = term_counts.get(term, 0) + 1

        doc_len = len(tokens) or 1
        score = 0.0
        for term in query_terms:
            freq = term_counts.get(term, 0)
            if freq == 0:
                continue
            idf = math.log(1 + (doc_count - doc_freq.get(term, 0) + 0.5) / (doc_freq.get(term, 0) + 0.5))
            numerator = freq * (k1 + 1)
            denominator = freq + k1 * (1 - b + b * doc_len / avg_len)
            score += idf * numerator / denominator
        raw_scores.append(score)

    max_score = max(raw_scores) if raw_scores else 0.0
    if max_score <= 0:
        return [0.0] * len(raw_scores)
    return [round(score / max_score, 4) for score in raw_scores]


def embed_text(text: str, dimensions: int | None = None) -> list[float]:
    """Small deterministic local embedding for learning the RAG data flow.

    It is not a replacement for a real embedding model. It lets us store vectors,
    query Chroma, and visualize retrieval before connecting paid or local models.
    """
    dims = dimensions or settings.embedding_dimensions
    vector = [0.0] * dims
    for token in _tokens(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dims
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def _chroma_base_url() -> str:
    return (
        f"http://{settings.chroma_host}:{settings.chroma_port}"
        "/api/v2/tenants/default_tenant/databases/default_database"
    )


def _chroma_request(method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{_chroma_base_url()}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            raw = response.read().decode("utf-8")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chroma 请求失败：{exc}") from exc

    if not raw:
        return None
    return json.loads(raw)


def chroma_collection_id() -> str:
    data = _chroma_request(
        "POST",
        "/collections",
        {
            "name": settings.chroma_collection,
            "metadata": {"hnsw:space": "cosine"},
            "get_or_create": True,
        },
    )
    return data["id"]


def chroma_count() -> int:
    collection_id = chroma_collection_id()
    return int(_chroma_request("GET", f"/collections/{collection_id}/count"))


def chroma_upsert(
    ids: list[str],
    embeddings: list[list[float]],
    documents: list[str],
    metadatas: list[dict[str, Any]],
) -> None:
    collection_id = chroma_collection_id()
    _chroma_request(
        "POST",
        f"/collections/{collection_id}/upsert",
        {
            "ids": ids,
            "embeddings": embeddings,
            "documents": documents,
            "metadatas": metadatas,
        },
    )


def chroma_delete(ids: list[str]) -> None:
    if not ids:
        return
    collection_id = chroma_collection_id()
    _chroma_request(
        "POST",
        f"/collections/{collection_id}/delete",
        {"ids": ids},
    )


def chroma_query(
    query_embedding: list[float],
    top_k: int,
    where: dict[str, Any],
) -> dict[str, Any]:
    collection_id = chroma_collection_id()
    return _chroma_request(
        "POST",
        f"/collections/{collection_id}/query",
        {
            "query_embeddings": [query_embedding],
            "n_results": top_k,
            "where": where,
            "include": ["documents", "metadatas", "distances"],
        },
    )


def cosine_distance_to_score(distance: float | None) -> float:
    if distance is None:
        return 0.0
    return max(0.0, min(1.0, 1.0 - float(distance)))


def build_learning_answer(question: str, hits: list[dict[str, Any]], min_score: float = 0.0) -> str:
    if not hits:
        return "当前知识库没有检索到足够依据，建议先补充文档或换一种问法。"

    top_score = float(hits[0].get("score", 0))
    if top_score < min_score:
        return (
            "当前知识库检索到了片段，但最高相关度低于阈值，不能可靠回答。\n\n"
            f"你的问题：{question}\n"
            f"最高相关度：{top_score:.4f}\n"
            f"最低阈值：{min_score:.4f}\n\n"
            "正确的 RAG 行为是拒答、提示补充资料，或让用户换一种问法。"
        )

    quoted = "\n".join(f"{index + 1}. {hit['content'][:180]}" for index, hit in enumerate(hits[:3]))
    return (
        "这是一个学习版 RAG 回答：系统先把问题向量化，再从 Chroma 找到最相近的切片，"
        "最后只基于命中的切片组织回答。\n\n"
        f"你的问题：{question}\n\n"
        f"命中依据：\n{quoted}"
    )


def build_grounded_answer(question: str, hits: list[dict[str, Any]], min_score: float = 0.0) -> tuple[str, dict[str, Any]]:
    top_score = float(hits[0].get("score", 0)) if hits else 0.0
    if not hits or top_score < min_score:
        return build_learning_answer(question, hits, min_score), {
            "provider": "local_refusal",
            "model": "",
            "used_model": False,
            "reason": "insufficient_evidence",
        }

    if not settings.senseaudio_api_key or not settings.senseaudio_base_url:
        return build_learning_answer(question, hits, min_score), {
            "provider": "local_fallback",
            "model": "",
            "used_model": False,
            "reason": "senseaudio_not_configured",
        }

    context = "\n\n".join(
        f"[{hit['rank']}] 来源：{hit['file_name']} / chunk {hit['chunk_index']}\n{hit['content']}"
        for hit in hits[:5]
    )
    messages = [
        {
            "role": "system",
            "content": (
                "你是知行者 RAG 问答助手。只能基于用户提供的【知识库片段】回答。"
                "如果片段不足以回答，必须明确说依据不足。回答要清楚、简洁，并在关键结论后标注引用编号，例如 [1]。"
            ),
        },
        {
            "role": "user",
            "content": f"问题：{question}\n\n知识库片段：\n{context}",
        },
    ]
    payload = {
        "model": settings.senseaudio_chat_model,
        "messages": messages,
        "stream": False,
        "temperature": 0.2,
    }
    data = llm_chat_completion(payload)
    answer = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if not answer:
        raise HTTPException(status_code=502, detail="大模型没有返回有效回答")
    return answer, {
        "provider": "senseaudio_compatible",
        "model": data.get("model", settings.senseaudio_chat_model),
        "used_model": True,
        "usage": data.get("usage", {}),
    }


def llm_chat_completion(payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        f"{settings.senseaudio_base_url.rstrip('/')}/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.senseaudio_api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"大模型请求失败：{exc}") from exc
    return json.loads(raw)
