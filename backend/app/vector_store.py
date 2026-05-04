from __future__ import annotations

import json
import math
import sqlite3
from collections import Counter
from typing import Dict, List, Optional, Tuple

from .services import tokenize
from .storage import connect, now_iso


def vectorize_text(text: str) -> Dict[str, float]:
    counts = Counter(tokenize(text))
    length = math.sqrt(sum(value * value for value in counts.values())) or 1.0
    return {word: round(count / length, 6) for word, count in counts.items()}


def cosine_similarity(left: Dict[str, float], right: Dict[str, float]) -> float:
    if not left or not right:
        return 0.0
    small, large = (left, right) if len(left) < len(right) else (right, left)
    return sum(value * large.get(word, 0.0) for word, value in small.items())


def upsert_chunk_vector(chunk_id: str, content: str, conn: Optional[sqlite3.Connection] = None) -> None:
    vector = vectorize_text(content)
    params = (chunk_id, json.dumps(vector, ensure_ascii=False), now_iso())
    sql = """
        INSERT INTO chunk_vectors (chunk_id, vector_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chunk_id) DO UPDATE SET
            vector_json = excluded.vector_json,
            updated_at = excluded.updated_at
    """
    if conn is not None:
        conn.execute(sql, params)
        return
    with connect() as inner_conn:
        inner_conn.execute(sql, params)


def search_similar_chunks(knowledge_base_id: str, question: str, top_k: int = 5) -> List[Dict]:
    query_vector = vectorize_text(question)
    if not query_vector:
        return []

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id AS chunk_id,
                c.document_id,
                c.chunk_index,
                c.content,
                d.file_name AS document_name,
                v.vector_json
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            JOIN chunk_vectors v ON v.chunk_id = c.id
            WHERE c.knowledge_base_id = ?
            """,
            (knowledge_base_id,),
        ).fetchall()

    scored: List[Tuple[float, Dict]] = []
    for row in rows:
        try:
            chunk_vector = json.loads(row["vector_json"])
        except json.JSONDecodeError:
            continue
        score = cosine_similarity(query_vector, chunk_vector)
        if score <= 0:
            continue
        scored.append(
            (
                score,
                {
                    "chunk_id": row["chunk_id"],
                    "document_id": row["document_id"],
                    "document_name": row["document_name"],
                    "chunk_index": row["chunk_index"],
                    "content": row["content"],
                    "score": round(score, 4),
                },
            )
        )
    scored.sort(key=lambda item: item[0], reverse=True)
    return [item for _, item in scored[:top_k]]


def rebuild_all_vectors() -> int:
    with connect() as conn:
        rows = conn.execute("SELECT id, content FROM document_chunks").fetchall()
    for row in rows:
        upsert_chunk_vector(row["id"], row["content"])
    return len(rows)
