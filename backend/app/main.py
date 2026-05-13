from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    AgentLabRequest,
    AgentLabRunOut,
    ChatRequest,
    ChatResponse,
    ChatSessionUpdate,
    DocumentUpdate,
    KnowledgeBaseCreate,
    KnowledgeBaseDeleteRequest,
    KnowledgeBaseOut,
    KnowledgeBaseUpdate,
    LiveTrendExplanationBatch,
    LiveTrendExplanationGenerate,
    ModelConfigCreate,
    ModelConfigOut,
    ModelConfigTestRequest,
    ModelConfigTestResponse,
    ModelConfigUpdate,
    RagEvaluateRequest,
    RagEvaluateResponse,
    RagEvalBatchOut,
    RagEvalCaseCreate,
    RagEvalCaseOut,
    RagEvalRunRequest,
    RagLabRequest,
    RagLabResponse,
    RagLabRunCreate,
    RagLabRunOut,
    TaskCreate,
    TaskGenerateRequest,
    TaskGenerateResponse,
    TaskOut,
    TaskUpdate,
)
from .services import (
    AppError,
    answer_question,
    build_rag_learning_notes,
    clean_text,
    evaluate_rag_answer,
    ensure_supported_file,
    generate_tasks_from_content,
    mask_api_key,
    read_text_file,
    retrieve_chunks,
    save_chat,
    split_text,
    summarize_text,
    tokenize,
    test_chat_model,
)
from .security import encrypt_secret, migrate_plaintext_model_keys
from .storage import UPLOAD_DIR, connect, init_db, new_id, now_iso, row_to_dict, rows_to_dicts
from .trend_explain import (
    batch_status_for_urls,
    fetch_explanation_by_id,
    fetch_explanation_by_url,
    generate_and_store_explanation,
    schedule_explanations_for_live_data,
)
from .trend_scraper import fetch_live_trends, trends_to_markdown
from .vector_store import embed_text, rebuild_all_vectors, search_similar_chunks, search_similar_texts_with_rerank, upsert_chunk_vector


app = FastAPI(title="知行者 Backend MVP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    migrate_plaintext_model_keys(connect, now_iso)
    rebuild_all_vectors()


@app.exception_handler(AppError)
def handle_app_error(_, exc: AppError):
    raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message})


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


def vector_entries(vector: List[float], indexes: List[int]) -> List[Dict[str, float]]:
    return [{"index": index, "value": round(float(vector[index]), 4)} for index in indexes if 0 <= index < len(vector)]


def vector_preview(vector: List[float], limit: int = 12) -> Dict[str, object]:
    non_zero_indexes = [index for index, value in enumerate(vector) if abs(float(value)) > 1e-9]
    top_indexes = sorted(range(len(vector)), key=lambda index: abs(float(vector[index])), reverse=True)[:limit]
    return {
        "dimensions": len(vector),
        "first_values": [round(float(value), 4) for value in vector[:limit]],
        "first_dimensions": vector_entries(vector, list(range(min(limit, len(vector))))),
        "non_zero_values": vector_entries(vector, non_zero_indexes[:limit]),
        "top_values": vector_entries(vector, top_indexes),
        "min": round(min(vector), 4) if vector else 0,
        "max": round(max(vector), 4) if vector else 0,
        "non_zero": len(non_zero_indexes),
    }


def vector_shared_dimensions(query_vector: List[float], chunk_vector: List[float], limit: int = 8) -> List[Dict[str, float]]:
    length = min(len(query_vector), len(chunk_vector))
    contributions = []
    for index in range(length):
        query_value = float(query_vector[index])
        chunk_value = float(chunk_vector[index])
        contribution = query_value * chunk_value
        if abs(contribution) <= 1e-9:
            continue
        contributions.append(
            {
                "index": index,
                "query": round(query_value, 4),
                "chunk": round(chunk_value, 4),
                "contribution": round(contribution, 4),
            }
        )
    contributions.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    return contributions[:limit]


def build_rag_vector_trace(knowledge_base_id: str, question: str, retrieved_chunks: List[Dict]) -> Dict[str, object]:
    query_vector, model_name, provider = embed_text(question)
    chunk_ids = [chunk.get("chunk_id") for chunk in retrieved_chunks if chunk.get("chunk_id")]
    if not chunk_ids:
        return {
            "query": {
                "text": question,
                "storage": "实时计算，不写入数据库",
                "model_name": model_name,
                "provider": provider,
                "vector": vector_preview(query_vector),
            },
            "tables": [
                "documents.id -> document_chunks.document_id",
                "document_chunks.id -> chunk_vectors.chunk_id",
                "FAISS IndexFlatIP 使用归一化向量做内积相似度",
            ],
            "chunks": [],
        }

    placeholders = ",".join("?" for _ in chunk_ids)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                c.id AS chunk_id,
                c.document_id,
                c.knowledge_base_id,
                c.chunk_index,
                c.token_count,
                c.content,
                c.created_at AS chunk_created_at,
                d.file_name AS document_name,
                d.file_path,
                v.vector_json,
                v.model_name,
                v.provider,
                v.dimensions,
                v.updated_at AS vector_updated_at
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            LEFT JOIN chunk_vectors v ON v.chunk_id = c.id
            WHERE c.knowledge_base_id = ? AND c.id IN ({placeholders})
            """,
            [knowledge_base_id, *chunk_ids],
        ).fetchall()

    rows_by_id = {row["chunk_id"]: row for row in rows}
    chunks = []
    for rank, chunk in enumerate(retrieved_chunks, 1):
        chunk_id = chunk.get("chunk_id")
        row = rows_by_id.get(chunk_id)
        if not row:
            chunks.append(
                {
                    "rank": rank,
                    "chunk_id": chunk_id,
                    "document_name": chunk.get("document_name"),
                    "storage": "临时实验切片，未写入 document_chunks / chunk_vectors",
                    "scores": {
                        "vector": chunk.get("vector_score"),
                        "bm25": chunk.get("bm25_score"),
                        "hybrid": chunk.get("hybrid_score"),
                        "rerank": chunk.get("rerank_score"),
                    },
                }
            )
            continue
        try:
            vector = json.loads(row["vector_json"] or "[]")
        except json.JSONDecodeError:
            vector = []
        chunks.append(
            {
                "rank": rank,
                "chunk_id": row["chunk_id"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "chunk_index": row["chunk_index"],
                "token_count": row["token_count"],
                "content_preview": row["content"][:220],
                "storage": {
                    "documents": {
                        "id": row["document_id"],
                        "file_name": row["document_name"],
                        "file_path": row["file_path"],
                    },
                    "document_chunks": {
                        "id": row["chunk_id"],
                        "document_id": row["document_id"],
                        "knowledge_base_id": row["knowledge_base_id"],
                        "chunk_index": row["chunk_index"],
                    },
                    "chunk_vectors": {
                        "chunk_id": row["chunk_id"],
                        "model_name": row["model_name"],
                        "provider": row["provider"],
                        "dimensions": row["dimensions"],
                        "updated_at": row["vector_updated_at"],
                    },
                },
                "vector": vector_preview(vector),
                "shared_dimensions": vector_shared_dimensions(query_vector, vector),
                "scores": {
                    "vector": chunk.get("vector_score"),
                    "bm25": chunk.get("bm25_score"),
                    "hybrid": chunk.get("hybrid_score"),
                    "rerank": chunk.get("rerank_score"),
                    "token_coverage": chunk.get("token_coverage"),
                    "completeness": chunk.get("completeness_score"),
                },
            }
        )

    return {
        "query": {
            "text": question,
            "storage": "实时计算，不写入数据库",
            "model_name": model_name,
            "provider": provider,
            "vector": vector_preview(query_vector),
        },
        "tables": [
            "documents.id -> document_chunks.document_id",
            "document_chunks.id -> chunk_vectors.chunk_id",
            "FAISS IndexFlatIP 使用归一化向量做内积相似度",
            "hybrid_score = vector_score * 0.65 + bm25_score * 0.35",
            "临时实验链路再计算 rerank_score = base_score * 0.65 + token_coverage * 0.25 + completeness * 0.10",
        ],
        "chunks": chunks,
    }


@app.post("/api/knowledge-bases", response_model=KnowledgeBaseOut)
def create_knowledge_base(payload: KnowledgeBaseCreate):
    now = now_iso()
    item_id = new_id("kb")
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO knowledge_bases (id, name, description, document_count, created_at, updated_at)
            VALUES (?, ?, ?, 0, ?, ?)
            """,
            (item_id, payload.name, payload.description, now, now),
        )
        row = conn.execute("SELECT * FROM knowledge_bases WHERE id = ?", (item_id,)).fetchone()
    return row_to_dict(row)


@app.get("/api/knowledge-bases", response_model=List[KnowledgeBaseOut])
def list_knowledge_bases():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM knowledge_bases ORDER BY updated_at DESC").fetchall()
    return rows_to_dicts(rows)


@app.get("/api/knowledge-bases/{knowledge_base_id}", response_model=KnowledgeBaseOut)
def get_knowledge_base(knowledge_base_id: str):
    with connect() as conn:
        row = conn.execute("SELECT * FROM knowledge_bases WHERE id = ?", (knowledge_base_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return row_to_dict(row)


@app.put("/api/knowledge-bases/{knowledge_base_id}", response_model=KnowledgeBaseOut)
def update_knowledge_base(knowledge_base_id: str, payload: KnowledgeBaseUpdate):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return get_knowledge_base(knowledge_base_id)

    allowed = []
    values = []
    for key, value in updates.items():
        allowed.append(f"{key} = ?")
        values.append(value)
    allowed.append("updated_at = ?")
    values.append(now_iso())
    values.append(knowledge_base_id)

    with connect() as conn:
        conn.execute(f"UPDATE knowledge_bases SET {', '.join(allowed)} WHERE id = ?", values)
        row = conn.execute("SELECT * FROM knowledge_bases WHERE id = ?", (knowledge_base_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return row_to_dict(row)


@app.delete("/api/knowledge-bases/{knowledge_base_id}")
def delete_knowledge_base(knowledge_base_id: str, payload: Optional[KnowledgeBaseDeleteRequest] = None):
    payload = payload or KnowledgeBaseDeleteRequest()
    now = now_iso()
    with connect() as conn:
        row = conn.execute("SELECT * FROM knowledge_bases WHERE id = ?", (knowledge_base_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="知识库不存在")
        if payload.delete_documents:
            doc_rows = conn.execute(
                "SELECT file_path FROM documents WHERE knowledge_base_id = ?",
                (knowledge_base_id,),
            ).fetchall()
            conn.execute("DELETE FROM knowledge_bases WHERE id = ?", (knowledge_base_id,))
        else:
            fallback_name = "未分组文档"
            fallback = conn.execute(
                "SELECT id FROM knowledge_bases WHERE lower(name) = lower(?)",
                (fallback_name,),
            ).fetchone()
            fallback_id = fallback["id"] if fallback else new_id("kb")
            if not fallback:
                conn.execute(
                    """
                    INSERT INTO knowledge_bases (id, name, description, document_count, created_at, updated_at)
                    VALUES (?, ?, ?, 0, ?, ?)
                    """,
                    (fallback_id, fallback_name, "删除知识库后自动承接保留文档。", now, now),
                )
            conn.execute(
                """
                UPDATE documents
                SET knowledge_base_id = ?, updated_at = ?
                WHERE knowledge_base_id = ?
                """,
                (fallback_id, now, knowledge_base_id),
            )
            conn.execute(
                """
                UPDATE document_chunks
                SET knowledge_base_id = ?
                WHERE knowledge_base_id = ?
                """,
                (fallback_id, knowledge_base_id),
            )
            conn.execute(
                """
                UPDATE knowledge_bases
                SET document_count = (
                    SELECT COUNT(*) FROM documents WHERE knowledge_base_id = ?
                ), updated_at = ?
                WHERE id = ?
                """,
                (fallback_id, now, fallback_id),
            )
            conn.execute("DELETE FROM knowledge_bases WHERE id = ?", (knowledge_base_id,))
            doc_rows = []
        conn.execute(
            """
            UPDATE knowledge_bases
            SET document_count = (
                SELECT COUNT(*) FROM documents WHERE knowledge_base_id = knowledge_bases.id
            ), updated_at = ?
            """,
            (now,),
        )
    for doc_row in doc_rows:
        path = Path(doc_row["file_path"])
        if path.exists():
            path.unlink()
    return {"ok": True}


@app.post("/api/knowledge-bases/{knowledge_base_id}/documents")
async def upload_documents(knowledge_base_id: str, files: List[UploadFile] = File(...)):
    with connect() as conn:
        kb = conn.execute("SELECT id FROM knowledge_bases WHERE id = ?", (knowledge_base_id,)).fetchone()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    documents = []
    for file in files:
        file_type = ensure_supported_file(file.filename or "")
        content = await file.read()
        doc_id = new_id("doc")
        stored_name = f"{doc_id}_{Path(file.filename or 'document').name}"
        path = UPLOAD_DIR / stored_name
        path.write_bytes(content)

        now = now_iso()
        try:
            text = read_text_file(path)
            chunks = split_text(text)
            if not chunks:
                raise AppError("EMPTY_DOCUMENT", "文档内容为空。", 400)
            summary = summarize_text(text)
            status = "ready"
            error_message = None
        except AppError as exc:
            chunks = []
            summary = None
            status = "failed"
            error_message = exc.message

        with connect() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    id, knowledge_base_id, file_name, file_type, file_size, file_path,
                    status, summary, error_message, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    knowledge_base_id,
                    file.filename or stored_name,
                    file_type,
                    len(content),
                    str(path),
                    status,
                    summary,
                    error_message,
                    now,
                    now,
                ),
            )
            for index, chunk in enumerate(chunks):
                chunk_id = new_id("chunk")
                cleaned_chunk = clean_text(chunk)
                conn.execute(
                    """
                    INSERT INTO document_chunks (
                        id, document_id, knowledge_base_id, chunk_index, content, token_count, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (chunk_id, doc_id, knowledge_base_id, index, cleaned_chunk, len(chunk), now),
                )
                upsert_chunk_vector(chunk_id, cleaned_chunk, conn)
            conn.execute(
                """
                UPDATE knowledge_bases
                SET document_count = (
                    SELECT COUNT(*) FROM documents WHERE knowledge_base_id = ?
                ), updated_at = ?
                WHERE id = ?
                """,
                (knowledge_base_id, now, knowledge_base_id),
            )
            row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        documents.append(row_to_dict(row))

    return {"documents": documents}


@app.get("/api/knowledge-bases/{knowledge_base_id}/documents")
def list_documents(knowledge_base_id: str):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM documents WHERE knowledge_base_id = ? ORDER BY created_at DESC",
            (knowledge_base_id,),
        ).fetchall()
    return rows_to_dicts(rows)


@app.get("/api/documents")
def list_all_documents(knowledge_base_id: Optional[str] = None, q: Optional[str] = None):
    sql = """
        SELECT d.*, kb.name AS knowledge_base_name
        FROM documents d
        LEFT JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id
        WHERE 1 = 1
    """
    values = []
    if knowledge_base_id:
        sql += " AND d.knowledge_base_id = ?"
        values.append(knowledge_base_id)
    if q:
        like = f"%{q.strip()}%"
        sql += """
            AND (
                d.file_name LIKE ?
                OR COALESCE(d.summary, '') LIKE ?
                OR EXISTS (
                    SELECT 1 FROM document_chunks c
                    WHERE c.document_id = d.id AND c.content LIKE ?
                )
            )
        """
        values.extend([like, like, like])
    sql += " ORDER BY d.created_at DESC"
    with connect() as conn:
        rows = conn.execute(sql, values).fetchall()
    return rows_to_dicts(rows)


@app.get("/api/documents/{document_id}")
def get_document(document_id: str):
    with connect() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        chunks = conn.execute(
            "SELECT id, chunk_index, content, token_count FROM document_chunks WHERE document_id = ? ORDER BY chunk_index",
            (document_id,),
        ).fetchall()
    if not row:
        raise HTTPException(status_code=404, detail="文档不存在")
    data = row_to_dict(row)
    data["chunks"] = rows_to_dicts(chunks)
    try:
        data["content"] = Path(row["file_path"]).read_text(encoding="utf-8")
    except Exception:
        data["content"] = "\n\n".join(chunk["content"] for chunk in chunks)
    return data


@app.put("/api/documents/{document_id}")
def update_document(document_id: str, payload: DocumentUpdate):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return get_document(document_id)
    content = updates.pop("content", None)
    vectors_to_upsert = []
    now = now_iso()
    with connect() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="文档不存在")
        fields = []
        values = []
        for key, value in updates.items():
            fields.append(f"{key} = ?")
            values.append(value)
        if content is not None:
            text = clean_text(content)
            if not text:
                raise HTTPException(status_code=400, detail="文档内容不能为空")
            file_path = Path(row["file_path"])
            file_path.write_text(text, encoding="utf-8")
            chunks = split_text(text)
            summary = summarize_text(text)
            conn.execute("DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM document_chunks WHERE document_id = ?)", (document_id,))
            conn.execute("DELETE FROM document_chunks WHERE document_id = ?", (document_id,))
            for index, chunk in enumerate(chunks):
                chunk_id = new_id("chunk")
                cleaned_chunk = clean_text(chunk)
                conn.execute(
                    """
                    INSERT INTO document_chunks (
                        id, document_id, knowledge_base_id, chunk_index, content, token_count, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (chunk_id, document_id, row["knowledge_base_id"], index, cleaned_chunk, len(chunk), now),
                )
                vectors_to_upsert.append((chunk_id, cleaned_chunk))
            fields.extend(["file_size = ?", "summary = ?", "status = ?", "error_message = ?"])
            values.extend([len(text.encode("utf-8")), summary, "ready", None])
        if fields:
            fields.append("updated_at = ?")
            values.append(now)
            values.append(document_id)
            conn.execute(f"UPDATE documents SET {', '.join(fields)} WHERE id = ?", values)
        for chunk_id, cleaned_chunk in vectors_to_upsert:
            upsert_chunk_vector(chunk_id, cleaned_chunk, conn)
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    return row_to_dict(row)


@app.post("/api/documents/{document_id}/summarize")
def summarize_document(document_id: str):
    with connect() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="文档不存在")
        chunks = conn.execute(
            "SELECT content FROM document_chunks WHERE document_id = ? ORDER BY chunk_index",
            (document_id,),
        ).fetchall()
        text = "\n\n".join(chunk["content"] for chunk in chunks)
        summary = summarize_text(text)
        now = now_iso()
        conn.execute("UPDATE documents SET summary = ?, updated_at = ? WHERE id = ?", (summary, now, document_id))
        updated = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    return row_to_dict(updated)


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str):
    with connect() as conn:
        row = conn.execute("SELECT knowledge_base_id, file_path FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="文档不存在")
        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        conn.execute(
            """
            UPDATE knowledge_bases
            SET document_count = (
                SELECT COUNT(*) FROM documents WHERE knowledge_base_id = ?
            ), updated_at = ?
            WHERE id = ?
            """,
            (row["knowledge_base_id"], now_iso(), row["knowledge_base_id"]),
        )
    path = Path(row["file_path"])
    if path.exists():
        path.unlink()
    return {"ok": True}


@app.get("/api/analytics/overview")
def analytics_overview(live: bool = True):
    with connect() as conn:
        counts = {
            "knowledge_bases": conn.execute("SELECT COUNT(*) AS count FROM knowledge_bases").fetchone()["count"],
            "documents": conn.execute("SELECT COUNT(*) AS count FROM documents").fetchone()["count"],
            "chunks": conn.execute("SELECT COUNT(*) AS count FROM document_chunks").fetchone()["count"],
            "sessions": conn.execute("SELECT COUNT(*) AS count FROM chat_sessions").fetchone()["count"],
            "questions": conn.execute("SELECT COUNT(*) AS count FROM chat_messages WHERE role = 'user'").fetchone()["count"],
            "answers": conn.execute("SELECT COUNT(*) AS count FROM chat_messages WHERE role = 'assistant'").fetchone()["count"],
            "tasks": conn.execute("SELECT COUNT(*) AS count FROM tasks").fetchone()["count"],
        }
        docs_by_kb = conn.execute(
            """
            SELECT kb.id, kb.name, COUNT(d.id) AS document_count
            FROM knowledge_bases kb
            LEFT JOIN documents d ON d.knowledge_base_id = kb.id
            GROUP BY kb.id, kb.name
            ORDER BY document_count DESC, kb.updated_at DESC
            """
        ).fetchall()
        task_status = conn.execute(
            "SELECT status, COUNT(*) AS count FROM tasks GROUP BY status ORDER BY count DESC"
        ).fetchall()
        recent_documents = conn.execute(
            """
            SELECT d.id, d.file_name, d.summary, d.updated_at, kb.name AS knowledge_base_name
            FROM documents d
            LEFT JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id
            ORDER BY d.updated_at DESC
            LIMIT 8
            """
        ).fetchall()
        recent_questions = conn.execute(
            """
            SELECT m.id, m.content, m.created_at, s.title AS session_title, kb.name AS knowledge_base_name
            FROM chat_messages m
            JOIN chat_sessions s ON s.id = m.session_id
            LEFT JOIN knowledge_bases kb ON kb.id = s.knowledge_base_id
            WHERE m.role = 'user'
            ORDER BY m.created_at DESC
            LIMIT 10
            """
        ).fetchall()
        answer_rows = conn.execute(
            """
            SELECT content
            FROM chat_messages
            WHERE role = 'assistant'
            ORDER BY created_at DESC
            LIMIT 80
            """
        ).fetchall()
        citation_rows = conn.execute(
            """
            SELECT citations
            FROM chat_messages
            WHERE role = 'assistant' AND citations IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 80
            """
        ).fetchall()

    words = Counter()
    for row in answer_rows:
        words.update(tokenize(row["content"]))
    word_cloud = [
        {"text": word, "count": count}
        for word, count in words.most_common(42)
        if not re.fullmatch(r"\d+", word)
    ]

    cited_docs = Counter()
    for row in citation_rows:
        try:
            citations = json.loads(row["citations"] or "[]")
        except json.JSONDecodeError:
            citations = []
        for citation in citations:
            name = citation.get("document_name")
            if name:
                cited_docs[name] += 1

    live_trends = fetch_live_trends() if live else {"updated_at": None, "sources": [], "items": []}
    return {
        "counts": counts,
        "documents_by_knowledge_base": rows_to_dicts(docs_by_kb),
        "task_status": rows_to_dicts(task_status),
        "recent_documents": rows_to_dicts(recent_documents),
        "recent_questions": rows_to_dicts(recent_questions),
        "word_cloud": word_cloud,
        "top_cited_documents": [
            {"document_name": name, "count": count}
            for name, count in cited_docs.most_common(8)
        ],
        "live_trends": live_trends,
    }


@app.get("/api/live-trends")
def live_trends(force: bool = False):
    return fetch_live_trends(force=force)


@app.get("/api/live-trend-explanations/by-url")
def get_live_trend_explanation_by_url(url: str):
    if not url.strip():
        raise HTTPException(status_code=400, detail="缺少 url")
    row = fetch_explanation_by_url(url.strip())
    if not row:
        raise HTTPException(status_code=404, detail="尚未生成解释")
    data = dict(row)
    data["from_database"] = True
    return data


@app.get("/api/live-trend-explanations/{explanation_id}")
def get_live_trend_explanation(explanation_id: str):
    row = fetch_explanation_by_id(explanation_id)
    if not row:
        raise HTTPException(status_code=404, detail="解释记录不存在")
    return row


@app.post("/api/live-trend-explanations/batch-status")
def post_live_trend_explanation_batch_status(payload: LiveTrendExplanationBatch):
    urls = [u for u in (payload.urls or []) if isinstance(u, str) and u.strip()][:80]
    return {"by_url": batch_status_for_urls(urls)}


@app.post("/api/live-trend-explanations/generate")
def post_live_trend_explanation_generate(payload: LiveTrendExplanationGenerate):
    try:
        return generate_and_store_explanation(
            payload.url.strip(),
            payload.source_title.strip(),
            payload.item,
            force=payload.force,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"MiniMax 调用失败：{exc}") from exc


@app.post("/api/live-trends/import")
def import_live_trends():
    live_data = fetch_live_trends(force=True)
    now = now_iso()
    imported = []
    vectors_to_upsert = []
    with connect() as conn:
        github_kb = ensure_knowledge_base(conn, "github", "GitHub 实时趋势数据")
        hf_kb = ensure_knowledge_base(conn, "hugging-face", "Hugging Face 实时论文和项目数据")
        for source in live_data["sources"]:
            if source["status"] != "ok" or not source["items"]:
                continue
            kb_id = hf_kb if "Hugging Face" in source["title"] else github_kb
            markdown = trends_to_markdown(source)
            doc_id = new_id("doc")
            file_name = f"{source['title'].lower().replace(' ', '_')}_实时_{now[:10]}.md"
            path = UPLOAD_DIR / f"{doc_id}_{file_name}"
            path.write_text(markdown, encoding="utf-8")
            chunks = split_text(markdown)
            summary = summarize_text(markdown)
            conn.execute(
                """
                INSERT INTO documents (
                    id, knowledge_base_id, file_name, file_type, file_size, file_path,
                    status, summary, error_message, created_at, updated_at
                )
                VALUES (?, ?, ?, 'md', ?, ?, 'ready', ?, NULL, ?, ?)
                """,
                (doc_id, kb_id, file_name, len(markdown.encode("utf-8")), str(path), summary, now, now),
            )
            for index, chunk in enumerate(chunks):
                chunk_id = new_id("chunk")
                cleaned_chunk = clean_text(chunk)
                conn.execute(
                    """
                    INSERT INTO document_chunks (
                        id, document_id, knowledge_base_id, chunk_index, content, token_count, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (chunk_id, doc_id, kb_id, index, cleaned_chunk, len(chunk), now),
                )
                vectors_to_upsert.append((chunk_id, cleaned_chunk))
            update_kb_count(conn, kb_id, now)
            imported.append(
                {
                    "knowledge_base_id": kb_id,
                    "source": source["title"],
                    "document_id": doc_id,
                    "file_name": file_name,
                    "items": len(source["items"]),
                }
            )
        for chunk_id, cleaned_chunk in vectors_to_upsert:
            upsert_chunk_vector(chunk_id, cleaned_chunk, conn)
    schedule_explanations_for_live_data(live_data)
    return {"ok": True, "imported": imported, "live_trends": live_data}


def ensure_knowledge_base(conn, name: str, description: str) -> str:
    row = conn.execute("SELECT id FROM knowledge_bases WHERE lower(name) = lower(?)", (name,)).fetchone()
    if row:
        return row["id"]
    kb_id = new_id("kb")
    now = now_iso()
    conn.execute(
        """
        INSERT INTO knowledge_bases (id, name, description, document_count, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?)
        """,
        (kb_id, name, description, now, now),
    )
    return kb_id


def update_kb_count(conn, knowledge_base_id: str, now: str) -> None:
    conn.execute(
        """
        UPDATE knowledge_bases
        SET document_count = (
            SELECT COUNT(*) FROM documents WHERE knowledge_base_id = ?
        ), updated_at = ?
        WHERE id = ?
        """,
        (knowledge_base_id, now, knowledge_base_id),
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    answer, chunks, latency_ms, used_fallback, warning = answer_question(
        payload.knowledge_base_id,
        payload.question,
        payload.model_provider,
        payload.model_name,
    )
    citations = [
        {
            "document_id": chunk["document_id"],
            "document_name": chunk["document_name"],
            "chunk_id": chunk["chunk_id"],
            "chunk_index": chunk["chunk_index"],
            "snippet": chunk["content"][:180],
            "score": chunk["score"],
        }
        for chunk in chunks
    ]
    rag_evaluation = evaluate_rag_answer(payload.question, chunks, answer)
    session_id = save_chat(
        payload.knowledge_base_id,
        payload.question,
        answer,
        citations,
        latency_ms,
        payload.session_id,
        payload.model_provider,
        payload.model_name,
    )
    return {
        "session_id": session_id,
        "answer": answer,
        "citations": citations,
        "used_fallback": used_fallback,
        "warning": warning,
        "rag_evaluation": rag_evaluation,
    }


@app.post("/api/rag/evaluate", response_model=RagEvaluateResponse)
def evaluate_rag(payload: RagEvaluateRequest):
    chunks = retrieve_chunks(payload.knowledge_base_id, payload.question, payload.top_k)
    citations = [
        {
            "document_id": chunk["document_id"],
            "document_name": chunk["document_name"],
            "chunk_id": chunk["chunk_id"],
            "chunk_index": chunk["chunk_index"],
            "snippet": chunk["content"][:180],
            "score": chunk["score"],
        }
        for chunk in chunks
    ]
    return {
        "question": payload.question,
        "retrieved_chunks": citations,
        "evaluation": evaluate_rag_answer(payload.question, chunks, payload.answer or ""),
    }


@app.post("/api/rag/lab", response_model=RagLabResponse)
def rag_lab(payload: RagLabRequest):
    if payload.overlap >= payload.chunk_size:
        raise HTTPException(status_code=400, detail="overlap 必须小于 chunk_size")

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, file_name, file_path
            FROM documents
            WHERE knowledge_base_id = ? AND status = 'ready'
            ORDER BY updated_at DESC
            """,
            (payload.knowledge_base_id,),
        ).fetchall()

    experiment_chunks = []
    for row in rows:
        try:
            text = read_text_file(Path(row["file_path"]))
        except AppError:
            continue
        for index, content in enumerate(split_text(text, payload.chunk_size, payload.overlap)):
            experiment_chunks.append(
                {
                    "document_id": row["id"],
                    "document_name": row["file_name"],
                    "chunk_id": f"lab_{row['id']}_{index}",
                    "chunk_index": index,
                    "content": content,
                    "token_count": len(tokenize(content)),
                }
            )

    retrieved = search_similar_texts_with_rerank(
        payload.question,
        experiment_chunks,
        payload.top_k,
        payload.rerank,
        payload.hybrid,
    )
    citations = [
        {
            "document_id": chunk["document_id"],
            "document_name": chunk["document_name"],
            "chunk_id": chunk["chunk_id"],
            "chunk_index": chunk["chunk_index"],
            "snippet": chunk["content"][:180],
            "content": chunk["content"],
            "score": chunk["score"],
            "vector_score": chunk.get("vector_score"),
            "bm25_score": chunk.get("bm25_score"),
            "hybrid_score": chunk.get("hybrid_score"),
            "rerank_score": chunk.get("rerank_score"),
            "token_coverage": chunk.get("token_coverage"),
            "completeness_score": chunk.get("completeness_score"),
        }
        for chunk in retrieved
    ]
    params = {
        "chunk_size": payload.chunk_size,
        "overlap": payload.overlap,
        "top_k": payload.top_k,
        "rerank": payload.rerank,
        "hybrid": payload.hybrid,
        "embedding_mode": "temporary",
    }
    evaluation = evaluate_rag_answer(payload.question, retrieved, "")
    stored_retrieved = search_similar_chunks(payload.knowledge_base_id, payload.question, payload.top_k, payload.hybrid)
    return {
        "question": payload.question,
        "params": params,
        "chunk_count": len(experiment_chunks),
        "retrieved_chunks": citations,
        "evaluation": evaluation,
        "learning_notes": build_rag_learning_notes(params, retrieved, evaluation),
        "vector_trace": build_rag_vector_trace(payload.knowledge_base_id, payload.question, stored_retrieved),
    }


@app.post("/api/rag/lab/runs", response_model=RagLabRunOut)
def create_rag_lab_run(payload: RagLabRunCreate):
    now = now_iso()
    run_id = new_id("ragrun")
    with connect() as conn:
        kb = conn.execute("SELECT id FROM knowledge_bases WHERE id = ?", (payload.knowledge_base_id,)).fetchone()
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")
        conn.execute(
            """
            INSERT INTO rag_lab_runs (
                id, knowledge_base_id, question, params_json, chunk_count,
                retrieved_chunks_json, evaluation_json, learning_notes_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                payload.knowledge_base_id,
                payload.question,
                json.dumps(payload.params, ensure_ascii=False),
                payload.chunk_count,
                json.dumps([item.model_dump() for item in payload.retrieved_chunks], ensure_ascii=False),
                json.dumps(payload.evaluation, ensure_ascii=False),
                json.dumps(payload.learning_notes, ensure_ascii=False),
                now,
            ),
        )
    return {
        **payload.model_dump(),
        "id": run_id,
        "created_at": now,
    }


@app.get("/api/rag/lab/runs", response_model=List[RagLabRunOut])
def list_rag_lab_runs(knowledge_base_id: Optional[str] = None, limit: int = 20):
    limit = max(1, min(limit, 100))
    sql = "SELECT * FROM rag_lab_runs"
    values: List[str] = []
    if knowledge_base_id:
        sql += " WHERE knowledge_base_id = ?"
        values.append(knowledge_base_id)
    sql += " ORDER BY created_at DESC LIMIT ?"
    values.append(str(limit))
    with connect() as conn:
        rows = conn.execute(sql, values).fetchall()
    return [
        {
            "id": row["id"],
            "knowledge_base_id": row["knowledge_base_id"],
            "question": row["question"],
            "params": json.loads(row["params_json"]),
            "chunk_count": row["chunk_count"],
            "retrieved_chunks": json.loads(row["retrieved_chunks_json"]),
            "evaluation": json.loads(row["evaluation_json"]),
            "learning_notes": json.loads(row["learning_notes_json"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def agent_mode_text(mode: str) -> str:
    return {
        "rag_agent": "RAG 助手",
        "test_agent": "测试分析助手",
        "learning_agent": "学习规划助手",
    }.get(mode, "RAG 助手")


def compact_chunk(chunk: Dict) -> Dict:
    return {
        "document_name": chunk.get("document_name"),
        "chunk_index": chunk.get("chunk_index"),
        "score": chunk.get("score"),
        "vector_score": chunk.get("vector_score"),
        "bm25_score": chunk.get("bm25_score"),
        "hybrid_score": chunk.get("hybrid_score"),
        "snippet": (chunk.get("content") or "")[:220],
    }


def build_agent_lab_summary(mode: str, evaluation: Dict, chunks: List[Dict], suggested_tasks: List[Dict]) -> str:
    mode_name = agent_mode_text(mode)
    verdict = ragVerdictTextForBackend(evaluation.get("verdict"))
    if not chunks:
        return f"{mode_name} 未找到可用依据，正确动作是先补充文档或改写目标。"
    return (
        f"{mode_name} 已完成一次计划-检索-评估-行动流程："
        f"命中 {len(chunks)} 个片段，证据判断为{verdict}，"
        f"生成 {len(suggested_tasks)} 个候选行动。"
    )


def ragVerdictTextForBackend(verdict: Optional[str]) -> str:
    return {"grounded": "依据充分", "weak_evidence": "依据偏弱", "no_evidence": "没有依据"}.get(verdict or "", "未评估")


def build_agent_lab_steps(payload: AgentLabRequest):
    top_k = min(max(payload.max_steps, 2), 8)
    plan_by_mode = {
        "rag_agent": "先判断目标是否需要查知识库，再检索证据，最后给出可执行建议。",
        "test_agent": "先把目标当作测试分析任务处理，检索相关资料，再输出验证点和风险任务。",
        "learning_agent": "先把目标拆成学习问题，检索资料，再生成下一步学习任务。",
    }
    steps = [
        {
            "step_index": 1,
            "phase": "plan",
            "thought": plan_by_mode.get(payload.mode, plan_by_mode["rag_agent"]),
            "tool_name": "agent_planner",
            "tool_input": {"goal": payload.goal, "mode": payload.mode, "max_steps": payload.max_steps},
            "tool_output": {
                "strategy": "retrieve_evaluate_act",
                "tools": ["knowledge_search", "rag_evaluator", "task_generator"],
            },
            "status": "done",
        }
    ]

    chunks = search_similar_chunks(payload.knowledge_base_id, payload.goal, top_k, hybrid=True)
    steps.append(
        {
            "step_index": 2,
            "phase": "retrieve",
            "thought": "调用知识库检索工具，先找和目标最相关的证据片段。",
            "tool_name": "knowledge_search",
            "tool_input": {"knowledge_base_id": payload.knowledge_base_id, "query": payload.goal, "top_k": top_k, "hybrid": True},
            "tool_output": {"retrieved_count": len(chunks), "chunks": [compact_chunk(chunk) for chunk in chunks[:5]]},
            "status": "done",
        }
    )

    evaluation = evaluate_rag_answer(payload.goal, chunks, "")
    steps.append(
        {
            "step_index": 3,
            "phase": "evaluate",
            "thought": "检查检索证据是否足够支撑下一步行动，证据不足时不能硬编。",
            "tool_name": "rag_evaluator",
            "tool_input": {"goal": payload.goal, "retrieved_count": len(chunks)},
            "tool_output": evaluation,
            "status": "done",
        }
    )

    evidence_text = "\n".join((chunk.get("content") or "")[:500] for chunk in chunks[:3])
    task_seed = (
        f"目标：{payload.goal}\n"
        f"模式：{agent_mode_text(payload.mode)}\n"
        f"证据判断：{ragVerdictTextForBackend(evaluation.get('verdict'))}\n"
        f"建议先学习、整理、验证、实现和输出下一步行动。\n"
        f"{evidence_text}"
    )
    suggested_tasks = generate_tasks_from_content(task_seed, payload.knowledge_base_id)
    for task in suggested_tasks:
        task["source_type"] = "agent_lab"
        task["ai_reason"] = f"Agent 实验室根据目标和检索证据生成。证据判断：{ragVerdictTextForBackend(evaluation.get('verdict'))}。"
    steps.append(
        {
            "step_index": 4,
            "phase": "act",
            "thought": "把检索和评估结果转成候选任务，这就是 Agent 从知识走向行动的关键。",
            "tool_name": "task_generator",
            "tool_input": {"create_tasks": payload.create_tasks},
            "tool_output": {"suggested_tasks": suggested_tasks},
            "status": "done",
        }
    )
    return steps[: payload.max_steps], chunks, evaluation, suggested_tasks


@app.post("/api/agent/lab/run", response_model=AgentLabRunOut)
def run_agent_lab(payload: AgentLabRequest):
    now = now_iso()
    run_id = new_id("agentrun")
    with connect() as conn:
        kb = conn.execute("SELECT id FROM knowledge_bases WHERE id = ?", (payload.knowledge_base_id,)).fetchone()
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")

    steps, chunks, evaluation, suggested_tasks = build_agent_lab_steps(payload)
    summary = build_agent_lab_summary(payload.mode, evaluation, chunks, suggested_tasks)
    created_task_ids = []
    with connect() as conn:
        if payload.create_tasks:
            for task in suggested_tasks:
                task_id = new_id("task")
                conn.execute(
                    """
                    INSERT INTO tasks (
                        id, title, description, status, priority, source_type, source_id,
                        knowledge_base_id, ai_reason, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        task_id,
                        task["title"],
                        task.get("description", ""),
                        task.get("status", "todo"),
                        task.get("priority", "medium"),
                        task.get("source_type", "agent_lab"),
                        run_id,
                        payload.knowledge_base_id,
                        task.get("ai_reason"),
                        now,
                        now,
                    ),
                )
                created_task_ids.append(task_id)
        conn.execute(
            """
            INSERT INTO agent_lab_runs (
                id, knowledge_base_id, goal, mode, summary, steps_json,
                suggested_tasks_json, created_task_ids_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                payload.knowledge_base_id,
                payload.goal,
                payload.mode,
                summary,
                json.dumps(steps, ensure_ascii=False),
                json.dumps(suggested_tasks, ensure_ascii=False),
                json.dumps(created_task_ids, ensure_ascii=False),
                now,
            ),
        )
    return {
        "id": run_id,
        "knowledge_base_id": payload.knowledge_base_id,
        "goal": payload.goal,
        "mode": payload.mode,
        "summary": summary,
        "steps": steps,
        "suggested_tasks": suggested_tasks,
        "created_task_ids": created_task_ids,
        "created_at": now,
    }


@app.get("/api/agent/lab/runs", response_model=List[AgentLabRunOut])
def list_agent_lab_runs(knowledge_base_id: Optional[str] = None, limit: int = 20):
    limit = max(1, min(limit, 100))
    sql = "SELECT * FROM agent_lab_runs"
    values: List[str] = []
    if knowledge_base_id:
        sql += " WHERE knowledge_base_id = ?"
        values.append(knowledge_base_id)
    sql += " ORDER BY created_at DESC LIMIT ?"
    values.append(str(limit))
    with connect() as conn:
        rows = conn.execute(sql, values).fetchall()
    return [
        {
            "id": row["id"],
            "knowledge_base_id": row["knowledge_base_id"],
            "goal": row["goal"],
            "mode": row["mode"],
            "summary": row["summary"],
            "steps": json.loads(row["steps_json"] or "[]"),
            "suggested_tasks": json.loads(row["suggested_tasks_json"] or "[]"),
            "created_task_ids": json.loads(row["created_task_ids_json"] or "[]"),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


@app.post("/api/rag/eval-cases", response_model=RagEvalCaseOut)
def create_rag_eval_case(payload: RagEvalCaseCreate):
    now = now_iso()
    case_id = new_id("ragcase")
    with connect() as conn:
        kb = conn.execute("SELECT id FROM knowledge_bases WHERE id = ?", (payload.knowledge_base_id,)).fetchone()
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")
        conn.execute(
            """
            INSERT INTO rag_eval_cases (
                id, knowledge_base_id, question, expected_verdict,
                expected_terms, note, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                payload.knowledge_base_id,
                payload.question,
                payload.expected_verdict,
                json.dumps(payload.expected_terms, ensure_ascii=False),
                payload.note,
                now,
                now,
            ),
        )
    return {**payload.model_dump(), "id": case_id, "created_at": now, "updated_at": now}


@app.get("/api/rag/eval-cases", response_model=List[RagEvalCaseOut])
def list_rag_eval_cases(knowledge_base_id: Optional[str] = None):
    sql = "SELECT * FROM rag_eval_cases"
    values: List[str] = []
    if knowledge_base_id:
        sql += " WHERE knowledge_base_id = ?"
        values.append(knowledge_base_id)
    sql += " ORDER BY created_at DESC"
    with connect() as conn:
        rows = conn.execute(sql, values).fetchall()
    return [
        {
            "id": row["id"],
            "knowledge_base_id": row["knowledge_base_id"],
            "question": row["question"],
            "expected_verdict": row["expected_verdict"],
            "expected_terms": json.loads(row["expected_terms"] or "[]"),
            "note": row["note"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


@app.delete("/api/rag/eval-cases/{case_id}")
def delete_rag_eval_case(case_id: str):
    with connect() as conn:
        row = conn.execute("SELECT id FROM rag_eval_cases WHERE id = ?", (case_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="评测用例不存在")
        conn.execute("DELETE FROM rag_eval_cases WHERE id = ?", (case_id,))
    return {"ok": True}


@app.post("/api/rag/eval-batches/run", response_model=RagEvalBatchOut)
def run_rag_eval_batch(payload: RagEvalRunRequest):
    if payload.overlap >= payload.chunk_size:
        raise HTTPException(status_code=400, detail="overlap 必须小于 chunk_size")

    with connect() as conn:
        case_rows = conn.execute(
            "SELECT * FROM rag_eval_cases WHERE knowledge_base_id = ? ORDER BY created_at ASC",
            (payload.knowledge_base_id,),
        ).fetchall()
    if not case_rows:
        raise HTTPException(status_code=400, detail="请先添加至少一个评测用例")

    params = {
        "chunk_size": payload.chunk_size,
        "overlap": payload.overlap,
        "top_k": payload.top_k,
        "rerank": payload.rerank,
        "hybrid": payload.hybrid,
    }
    results = []
    for row in case_rows:
        lab_payload = RagLabRequest(
            knowledge_base_id=payload.knowledge_base_id,
            question=row["question"],
            chunk_size=payload.chunk_size,
            overlap=payload.overlap,
            top_k=payload.top_k,
            rerank=payload.rerank,
            hybrid=payload.hybrid,
        )
        lab_result = rag_lab(lab_payload)
        evaluation = lab_result["evaluation"]
        retrieved_chunks = lab_result["retrieved_chunks"]
        expected_terms = json.loads(row["expected_terms"] or "[]")
        passed, reason = judge_rag_eval_case(row["expected_verdict"], expected_terms, evaluation, retrieved_chunks)
        results.append(
            {
                "case_id": row["id"],
                "question": row["question"],
                "expected_verdict": row["expected_verdict"],
                "actual_verdict": evaluation.get("verdict") or "",
                "passed": passed,
                "reason": reason,
                "evaluation": evaluation,
                "retrieved_chunks": retrieved_chunks,
            }
        )

    now = now_iso()
    batch_id = new_id("ragbatch")
    passed_count = sum(1 for item in results if item["passed"])
    failed_count = len(results) - passed_count
    pass_rate = round(passed_count / max(len(results), 1), 4)
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO rag_eval_batches (
                id, knowledge_base_id, params_json, total_count,
                passed_count, failed_count, pass_rate, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                payload.knowledge_base_id,
                json.dumps(params, ensure_ascii=False),
                len(results),
                passed_count,
                failed_count,
                pass_rate,
                now,
            ),
        )
        for item in results:
            result_id = new_id("ragresult")
            conn.execute(
                """
                INSERT INTO rag_eval_results (
                    id, batch_id, case_id, question, expected_verdict,
                    actual_verdict, passed, reason, evaluation_json,
                    retrieved_chunks_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result_id,
                    batch_id,
                    item["case_id"],
                    item["question"],
                    item["expected_verdict"],
                    item["actual_verdict"],
                    1 if item["passed"] else 0,
                    item["reason"],
                    json.dumps(item["evaluation"], ensure_ascii=False),
                    json.dumps(item["retrieved_chunks"], ensure_ascii=False),
                    now,
                ),
            )
            item["id"] = result_id
            item["created_at"] = now

    return {
        "id": batch_id,
        "knowledge_base_id": payload.knowledge_base_id,
        "params": params,
        "total_count": len(results),
        "passed_count": passed_count,
        "failed_count": failed_count,
        "pass_rate": pass_rate,
        "results": results,
        "created_at": now,
    }


def judge_rag_eval_case(expected_verdict: str, expected_terms: List[str], evaluation: Dict, retrieved_chunks: List[Dict]):
    actual_verdict = evaluation.get("verdict") or ""
    failures = []
    if actual_verdict != expected_verdict:
        failures.append(f"预期 {expected_verdict}，实际 {actual_verdict}")
    merged = "\n".join((chunk.get("content") or chunk.get("snippet") or "") for chunk in retrieved_chunks)
    missing_terms = [term for term in expected_terms if term and term not in merged]
    if missing_terms:
        failures.append("缺少预期关键词：" + "、".join(missing_terms[:6]))
    if failures:
        return False, "；".join(failures)
    return True, "符合预期"


@app.get("/api/chat/sessions")
def list_chat_sessions(knowledge_base_id: Optional[str] = None):
    sql = "SELECT * FROM chat_sessions WHERE 1 = 1"
    values = []
    if knowledge_base_id:
        sql += " AND knowledge_base_id = ?"
        values.append(knowledge_base_id)
    sql += " ORDER BY updated_at DESC"
    with connect() as conn:
        rows = conn.execute(sql, values).fetchall()
    return rows_to_dicts(rows)


@app.get("/api/chat/sessions/{session_id}/messages")
def list_chat_messages(session_id: str):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
    return rows_to_dicts(rows)


@app.put("/api/chat/sessions/{session_id}")
def update_chat_session(session_id: str, payload: ChatSessionUpdate):
    with connect() as conn:
        conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
            (payload.title, now_iso(), session_id),
        )
        row = conn.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="会话不存在")
    return row_to_dict(row)


@app.delete("/api/chat/sessions/{session_id}")
def delete_chat_session(session_id: str):
    with connect() as conn:
        row = conn.execute("SELECT id FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="会话不存在")
        conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
    return {"ok": True}


@app.post("/api/tasks", response_model=TaskOut)
def create_task(payload: TaskCreate):
    now = now_iso()
    task_id = new_id("task")
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO tasks (
                id, title, description, status, priority, source_type, source_id,
                knowledge_base_id, ai_reason, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                payload.title,
                payload.description,
                payload.status,
                payload.priority,
                payload.source_type,
                payload.source_id,
                payload.knowledge_base_id,
                payload.ai_reason,
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return row_to_dict(row)


@app.get("/api/tasks", response_model=List[TaskOut])
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    knowledge_base_id: Optional[str] = None,
    source_type: Optional[str] = None,
):
    sql = "SELECT * FROM tasks WHERE 1 = 1"
    values = []
    if status:
        sql += " AND status = ?"
        values.append(status)
    if priority:
        sql += " AND priority = ?"
        values.append(priority)
    if knowledge_base_id:
        sql += " AND knowledge_base_id = ?"
        values.append(knowledge_base_id)
    if source_type:
        sql += " AND source_type = ?"
        values.append(source_type)
    sql += " ORDER BY updated_at DESC"
    with connect() as conn:
        rows = conn.execute(sql, values).fetchall()
    return rows_to_dicts(rows)


@app.put("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: str, payload: TaskUpdate):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        with connect() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="任务不存在")
        return row_to_dict(row)
    fields = []
    values = []
    for key, value in updates.items():
        fields.append(f"{key} = ?")
        values.append(value)
    fields.append("updated_at = ?")
    values.append(now_iso())
    values.append(task_id)
    with connect() as conn:
        conn.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", values)
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="任务不存在")
    return row_to_dict(row)


@app.post("/api/tasks/{task_id}/complete", response_model=TaskOut)
def complete_task(task_id: str):
    return update_task(task_id, TaskUpdate(status="done"))


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    with connect() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return {"ok": True}


@app.post("/api/tasks/generate", response_model=TaskGenerateResponse)
def generate_tasks(payload: TaskGenerateRequest):
    raw_tasks = generate_tasks_from_content(payload.content, payload.knowledge_base_id)
    return {"tasks": raw_tasks}


@app.get("/api/model-configs", response_model=List[ModelConfigOut])
def list_model_configs():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM model_configs ORDER BY updated_at DESC").fetchall()
    return [
        {
            **row_to_dict(row),
            "api_key_masked": mask_api_key(row["api_key"]),
        }
        for row in rows
    ]


@app.post("/api/model-configs", response_model=ModelConfigOut)
def create_model_config(payload: ModelConfigCreate):
    now = now_iso()
    config_id = new_id("model")
    api_key = encrypt_secret(payload.api_key)
    with connect() as conn:
        if payload.enabled:
            conn.execute("UPDATE model_configs SET enabled = 0, updated_at = ?", (now,))
        conn.execute(
            """
            INSERT INTO model_configs (id, provider, base_url, api_key, default_model, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                config_id,
                payload.provider,
                payload.base_url,
                api_key,
                payload.default_model,
                1 if payload.enabled else 0,
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM model_configs WHERE id = ?", (config_id,)).fetchone()
    data = row_to_dict(row)
    data["api_key_masked"] = mask_api_key(row["api_key"])
    return data


@app.put("/api/model-configs/{config_id}", response_model=ModelConfigOut)
def update_model_config(config_id: str, payload: ModelConfigUpdate):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        with connect() as conn:
            row = conn.execute("SELECT * FROM model_configs WHERE id = ?", (config_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="模型配置不存在")
        data = row_to_dict(row)
        data["api_key_masked"] = mask_api_key(row["api_key"])
        return data

    if "api_key" in updates and updates["api_key"]:
        updates["api_key"] = encrypt_secret(updates["api_key"])
    if "enabled" in updates:
        updates["enabled"] = 1 if updates["enabled"] else 0

    fields = []
    values = []
    now = now_iso()
    for key, value in updates.items():
        fields.append(f"{key} = ?")
        values.append(value)
    fields.append("updated_at = ?")
    values.append(now)
    values.append(config_id)

    with connect() as conn:
        if updates.get("enabled") == 1:
            conn.execute("UPDATE model_configs SET enabled = 0, updated_at = ? WHERE id != ?", (now, config_id))
        conn.execute(f"UPDATE model_configs SET {', '.join(fields)} WHERE id = ?", values)
        row = conn.execute("SELECT * FROM model_configs WHERE id = ?", (config_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="模型配置不存在")
    data = row_to_dict(row)
    data["api_key_masked"] = mask_api_key(row["api_key"])
    return data


@app.delete("/api/model-configs/{config_id}")
def delete_model_config(config_id: str):
    with connect() as conn:
        row = conn.execute("SELECT id FROM model_configs WHERE id = ?", (config_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="模型配置不存在")
        conn.execute("DELETE FROM model_configs WHERE id = ?", (config_id,))
    return {"ok": True}


@app.post("/api/model-configs/test", response_model=ModelConfigTestResponse)
def test_model_config(payload: ModelConfigTestRequest):
    try:
        answer = test_chat_model(payload.provider, payload.base_url, payload.api_key, payload.default_model)
    except Exception as exc:
        return {"ok": False, "message": f"连接失败：{exc}"}
    return {"ok": True, "message": f"{payload.provider} 连接成功。模型返回：{answer[:120]}"}
