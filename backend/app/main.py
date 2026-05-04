from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    ChatRequest,
    ChatResponse,
    ChatSessionUpdate,
    DocumentUpdate,
    KnowledgeBaseCreate,
    KnowledgeBaseOut,
    KnowledgeBaseUpdate,
    LiveTrendExplanationBatch,
    LiveTrendExplanationGenerate,
    ModelConfigCreate,
    ModelConfigOut,
    ModelConfigTestRequest,
    ModelConfigTestResponse,
    ModelConfigUpdate,
    TaskCreate,
    TaskGenerateRequest,
    TaskGenerateResponse,
    TaskOut,
    TaskUpdate,
)
from .services import (
    AppError,
    answer_question,
    clean_text,
    ensure_supported_file,
    generate_tasks_from_content,
    mask_api_key,
    read_text_file,
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
from .vector_store import rebuild_all_vectors, upsert_chunk_vector


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
def delete_knowledge_base(knowledge_base_id: str):
    with connect() as conn:
        conn.execute("DELETE FROM knowledge_bases WHERE id = ?", (knowledge_base_id,))
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
    }


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
