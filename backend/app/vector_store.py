from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3
from typing import Dict, List, Optional

import faiss
import numpy as np
import requests

from .services import api_key_plain_for_bearer, tokenize
from .storage import connect, now_iso


LOCAL_EMBEDDING_DIMS = 384
DEFAULT_LOCAL_MODEL = "BAAI/bge-small-zh-v1.5"
_LOCAL_MODEL = None
_LOCAL_MODEL_NAME = None


def embedding_config() -> Dict[str, str]:
    configured_provider = os.getenv("ZHIXINGZHE_EMBEDDING_PROVIDER", "").strip().lower()
    base_url = os.getenv("ZHIXINGZHE_EMBEDDING_BASE_URL", "").strip()
    api_key = os.getenv("ZHIXINGZHE_EMBEDDING_API_KEY", "").strip()
    model = os.getenv("ZHIXINGZHE_EMBEDDING_MODEL", "").strip()
    local_model = os.getenv("ZHIXINGZHE_LOCAL_EMBEDDING_MODEL", DEFAULT_LOCAL_MODEL).strip()

    if base_url and api_key and not model:
        model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    if configured_provider in {"local-model", "local_model", "sentence-transformers", "sentence_transformers"}:
        provider = "local-model"
        model = local_model
    elif base_url and api_key and model:
        provider = "api"
    elif os.getenv("ZHIXINGZHE_ENABLE_LOCAL_EMBEDDING", "").strip().lower() in {"1", "true", "yes"}:
        provider = "local-model"
        model = local_model
    else:
        provider = "local"
    return {"provider": provider, "base_url": base_url, "api_key": api_key, "model": model, "local_model": local_model}


def openai_compatible_embeddings_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise ValueError("base_url 为空")
    if base.lower().endswith("/v1"):
        return f"{base}/embeddings"
    return f"{base}/v1/embeddings"


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector)
    if norm == 0:
        return vector.astype("float32")
    return (vector / norm).astype("float32")


def local_hash_embedding(text: str, dims: int = LOCAL_EMBEDDING_DIMS) -> List[float]:
    vector = np.zeros(dims, dtype="float32")
    for token in tokenize(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dims
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    return normalize_vector(vector).tolist()


def local_model_embedding(text: str, model_name: str) -> List[float]:
    global _LOCAL_MODEL, _LOCAL_MODEL_NAME
    if _LOCAL_MODEL is None or _LOCAL_MODEL_NAME != model_name:
        from sentence_transformers import SentenceTransformer

        _LOCAL_MODEL = SentenceTransformer(model_name)
        _LOCAL_MODEL_NAME = model_name
    vector = _LOCAL_MODEL.encode(text, normalize_embeddings=True)
    return np.array(vector, dtype="float32").tolist()


def fetch_embedding_from_api(text: str, config: Dict[str, str]) -> List[float]:
    url = openai_compatible_embeddings_url(config["base_url"])
    payload = {"model": config["model"], "input": text}
    headers = {
        "Authorization": f"Bearer {api_key_plain_for_bearer(config['api_key'])}",
        "Content-Type": "application/json",
    }
    response = requests.post(url, headers=headers, json=payload, timeout=45)
    response.raise_for_status()
    data = response.json()
    vector = data["data"][0]["embedding"]
    return normalize_vector(np.array(vector, dtype="float32")).tolist()


def embed_text(text: str) -> tuple[List[float], str, str]:
    config = embedding_config()
    if config["provider"] == "api":
        try:
            return fetch_embedding_from_api(text, config), config["model"], "api"
        except Exception as exc:
            print(f"[embedding_fallback] model={config['model']} error={exc}")
    if config["provider"] == "local-model":
        try:
            return local_model_embedding(text, config["model"]), config["model"], "local-model"
        except Exception as exc:
            print(f"[local_embedding_fallback] model={config['model']} error={exc}")
    return local_hash_embedding(text), f"local-hash-{LOCAL_EMBEDDING_DIMS}", "local"


def upsert_chunk_vector(chunk_id: str, content: str, conn: Optional[sqlite3.Connection] = None) -> None:
    vector, model_name, provider = embed_text(content)
    params = (chunk_id, json.dumps(vector), model_name, provider, len(vector), now_iso())
    sql = """
        INSERT INTO chunk_vectors (chunk_id, vector_json, model_name, provider, dimensions, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(chunk_id) DO UPDATE SET
            vector_json = excluded.vector_json,
            model_name = excluded.model_name,
            provider = excluded.provider,
            dimensions = excluded.dimensions,
            updated_at = excluded.updated_at
    """
    if conn is not None:
        conn.execute(sql, params)
        return
    with connect() as inner_conn:
        inner_conn.execute(sql, params)


def _load_vectors(knowledge_base_id: str) -> tuple[List[sqlite3.Row], np.ndarray]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id AS chunk_id,
                c.document_id,
                c.chunk_index,
                c.content,
                d.file_name AS document_name,
                v.vector_json,
                v.dimensions
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            JOIN chunk_vectors v ON v.chunk_id = c.id
            WHERE c.knowledge_base_id = ?
            ORDER BY c.created_at ASC, c.chunk_index ASC
            """,
            (knowledge_base_id,),
        ).fetchall()

    vectors = []
    kept_rows = []
    expected_dims = None
    for row in rows:
        try:
            vector = np.array(json.loads(row["vector_json"]), dtype="float32")
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if expected_dims is None:
            expected_dims = len(vector)
        if len(vector) != expected_dims:
            continue
        vectors.append(normalize_vector(vector))
        kept_rows.append(row)
    if not vectors:
        return [], np.zeros((0, 0), dtype="float32")
    return kept_rows, np.vstack(vectors).astype("float32")


def search_similar_chunks(knowledge_base_id: str, question: str, top_k: int = 5, hybrid: bool = True) -> List[Dict]:
    query_vector, _, _ = embed_text(question)
    rows, matrix = _load_vectors(knowledge_base_id)
    if matrix.size == 0 or not query_vector:
        return []

    query = np.array(query_vector, dtype="float32")
    if len(query) != matrix.shape[1]:
        return []
    query = normalize_vector(query).reshape(1, -1)

    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)
    candidate_k = min(max(top_k * 4, top_k), len(rows)) if hybrid else min(top_k, len(rows))
    scores, positions = index.search(query, candidate_k)

    results: List[Dict] = []
    for score, position in zip(scores[0], positions[0]):
        if position < 0 or score <= 0:
            continue
        row = rows[int(position)]
        results.append(
            {
                "chunk_id": row["chunk_id"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "chunk_index": row["chunk_index"],
                "content": row["content"],
                "score": round(float(score), 4),
                "vector_score": round(float(score), 4),
            }
        )
    if hybrid:
        return hybrid_rank(question, results, [dict(row) for row in rows])[:top_k]
    return results[:top_k]


def search_similar_texts(question: str, chunks: List[Dict], top_k: int = 5) -> List[Dict]:
    return search_similar_texts_with_rerank(question, chunks, top_k, rerank=False)


def search_similar_texts_with_rerank(
    question: str,
    chunks: List[Dict],
    top_k: int = 5,
    rerank: bool = True,
    hybrid: bool = True,
) -> List[Dict]:
    if not chunks:
        return []
    vectors = []
    kept_chunks = []
    expected_dims = None
    for chunk in chunks:
        vector, _, _ = embed_text(chunk["content"])
        if expected_dims is None:
            expected_dims = len(vector)
        if len(vector) != expected_dims:
            continue
        vectors.append(normalize_vector(np.array(vector, dtype="float32")))
        kept_chunks.append(chunk)
    if not vectors:
        return []

    query_vector, _, _ = embed_text(question)
    query = np.array(query_vector, dtype="float32")
    matrix = np.vstack(vectors).astype("float32")
    if len(query) != matrix.shape[1]:
        return []

    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)
    candidate_k = min(max(top_k * 4, top_k), len(kept_chunks)) if (rerank or hybrid) else min(top_k, len(kept_chunks))
    scores, positions = index.search(normalize_vector(query).reshape(1, -1), candidate_k)

    results: List[Dict] = []
    for score, position in zip(scores[0], positions[0]):
        if position < 0 or score <= 0:
            continue
        chunk = kept_chunks[int(position)]
        results.append({**chunk, "score": round(float(score), 4), "vector_score": round(float(score), 4)})
    if results and hybrid:
        results = hybrid_rank(question, results, kept_chunks)
    if results and rerank:
        return rerank_chunks(question, results)[:top_k]
    if results:
        return results[:top_k]
    if hybrid:
        return hybrid_rank(question, [], chunks)[:top_k]
    return search_texts_by_keyword_overlap(question, chunks, top_k)


def hybrid_rank(question: str, vector_results: List[Dict], all_chunks: List[Dict]) -> List[Dict]:
    bm25_scores = bm25_rank(question, all_chunks)
    max_bm25 = max(bm25_scores.values(), default=0.0) or 1.0
    merged: Dict[str, Dict] = {}
    for chunk in all_chunks:
        chunk_id = str(chunk.get("chunk_id") or chunk.get("id") or "")
        if chunk_id:
            merged[chunk_id] = dict(chunk)
    for chunk in vector_results:
        chunk_id = str(chunk.get("chunk_id") or chunk.get("id") or "")
        if chunk_id:
            merged[chunk_id] = {**merged.get(chunk_id, {}), **chunk}

    ranked = []
    for chunk_id, chunk in merged.items():
        vector_score = float(chunk.get("vector_score", chunk.get("score", 0)) or 0)
        bm25_score = bm25_scores.get(chunk_id, 0.0) / max_bm25
        hybrid_score = vector_score * 0.65 + bm25_score * 0.35
        if hybrid_score <= 0:
            continue
        ranked.append(
            {
                **chunk,
                "score": round(hybrid_score, 4),
                "vector_score": round(vector_score, 4),
                "bm25_score": round(bm25_score, 4),
                "hybrid_score": round(hybrid_score, 4),
            }
        )
    ranked.sort(key=lambda item: item["hybrid_score"], reverse=True)
    return ranked


def bm25_rank(question: str, chunks: List[Dict]) -> Dict[str, float]:
    query_terms = tokenize(question)
    if not query_terms or not chunks:
        return {}

    tokenized = []
    doc_freq: Dict[str, int] = {}
    total_len = 0
    for chunk in chunks:
        terms = tokenize(chunk.get("content", ""))
        tokenized.append(terms)
        total_len += len(terms)
        for term in terms:
            doc_freq[term] = doc_freq.get(term, 0) + 1

    doc_count = len(chunks)
    avg_len = total_len / max(doc_count, 1)
    k1 = 1.5
    b = 0.75
    scores: Dict[str, float] = {}
    for chunk, terms in zip(chunks, tokenized):
        chunk_id = str(chunk.get("chunk_id") or chunk.get("id") or "")
        if not chunk_id or not terms:
            continue
        score = 0.0
        doc_len = len(terms)
        for term in query_terms:
            if term not in terms:
                continue
            df = doc_freq.get(term, 0)
            idf = math.log(1 + (doc_count - df + 0.5) / (df + 0.5))
            tf = 1.0
            denominator = tf + k1 * (1 - b + b * doc_len / max(avg_len, 1))
            score += idf * (tf * (k1 + 1) / denominator)
        if score > 0:
            scores[chunk_id] = score
    return scores


def rerank_chunks(question: str, chunks: List[Dict]) -> List[Dict]:
    question_tokens = tokenize(question)
    ranked = []
    for chunk in chunks:
        content = chunk["content"]
        content_tokens = tokenize(content)
        overlap = question_tokens & content_tokens
        coverage = len(overlap) / max(len(question_tokens), 1)
        completeness = chunk_completeness_score(content)
        base_score = float(chunk.get("hybrid_score", chunk.get("vector_score", chunk.get("score", 0))) or 0)
        rerank_score = base_score * 0.65 + coverage * 0.25 + completeness * 0.10
        ranked.append(
            {
                **chunk,
                "score": round(rerank_score, 4),
                "rerank_score": round(rerank_score, 4),
                "token_coverage": round(coverage, 4),
                "completeness_score": round(completeness, 4),
            }
        )
    ranked.sort(key=lambda item: item["rerank_score"], reverse=True)
    return ranked


def chunk_completeness_score(content: str) -> float:
    stripped = content.strip()
    if not stripped:
        return 0.0
    score = 0.45
    if stripped.startswith(("#", "1.", "一、", "（一）")):
        score += 0.2
    if any(mark in stripped for mark in ("。", ".", "！", "？", ":", "：")):
        score += 0.15
    if len(stripped) >= 180:
        score += 0.1
    if len(stripped) >= 360:
        score += 0.1
    return min(score, 1.0)


def search_texts_by_keyword_overlap(question: str, chunks: List[Dict], top_k: int = 5) -> List[Dict]:
    question_tokens = tokenize(question)
    if not question_tokens:
        return []
    scored = []
    for chunk in chunks:
        content_tokens = tokenize(chunk["content"])
        if not content_tokens:
            continue
        overlap = question_tokens & content_tokens
        if not overlap:
            continue
        score = len(overlap) / max(len(question_tokens), 1)
        scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [{**chunk, "score": round(float(score), 4), "vector_score": 0.0, "rerank_score": round(float(score), 4)} for score, chunk in scored[:top_k]]


def rebuild_all_vectors() -> int:
    with connect() as conn:
        rows = conn.execute("SELECT id, content FROM document_chunks").fetchall()
        for row in rows:
            upsert_chunk_vector(row["id"], row["content"], conn)
    return len(rows)
