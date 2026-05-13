import re
from io import BytesIO
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from psycopg.types.json import Jsonb
from pypdf import PdfReader
from pydantic import BaseModel, Field

from .db import get_conn
from .rag import (
    bm25_scores,
    build_learning_answer,
    build_grounded_answer,
    chroma_count,
    chroma_delete,
    chroma_query,
    chroma_upsert,
    chunk_text,
    cosine_distance_to_score,
    embed_text,
    new_id,
)

app = FastAPI(title="知行者 AI 实验室 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class TextDocumentIngest(BaseModel):
    file_name: str = Field(default="demo.md", min_length=1, max_length=200)
    content: str = Field(min_length=1)
    chunk_size: int = Field(default=500, ge=100, le=3000)
    overlap: int = Field(default=80, ge=0, le=1000)


class SearchRequest(BaseModel):
    question: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: float = Field(default=0.2, ge=0, le=1)
    mode: str = Field(default="hybrid", pattern="^(vector|keyword|hybrid)$")


class AgentRunRequest(BaseModel):
    knowledge_base_id: str = ""
    agent_type: str = Field(default="learning", pattern="^(learning|rag|test)$")
    goal: str = Field(min_length=1)
    enable_reflect: bool = True
    top_k: int = Field(default=5, ge=1, le=10)


class ChunkPreviewRequest(BaseModel):
    file_name: str = Field(default="preview.md", min_length=1, max_length=200)
    content: str = Field(min_length=1)
    chunk_size: int = Field(default=500, ge=100, le=3000)
    overlap: int = Field(default=80, ge=0, le=1000)


@app.get("/health")
def health() -> dict[str, Any]:
    with get_conn() as conn:
        db_ok = conn.execute("SELECT 1 AS ok").fetchone()["ok"] == 1
    return {"ok": True, "postgres": db_ok, "chroma_collection_count": chroma_count()}


@app.post("/api/knowledge-bases")
def create_knowledge_base(payload: KnowledgeBaseCreate) -> dict[str, Any]:
    kb_id = new_id("kb")
    with get_conn() as conn:
        row = conn.execute(
            """
            INSERT INTO knowledge_bases (id, name, description)
            VALUES (%s, %s, %s)
            RETURNING id, name, description, created_at, updated_at
            """,
            (kb_id, payload.name, payload.description),
        ).fetchone()
    return dict(row)


@app.get("/api/knowledge-bases")
def list_knowledge_bases() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, name, description, created_at, updated_at
            FROM knowledge_bases
            ORDER BY created_at DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def save_document_to_rag(
    knowledge_base_id: str,
    file_name: str,
    file_type: str,
    file_size: int,
    content: str,
    chunk_size: int,
    overlap: int,
) -> dict[str, Any]:
    chunks = chunk_text(content, chunk_size, overlap)
    if not chunks:
        raise HTTPException(status_code=400, detail="文档内容为空，无法切片")

    document_id = new_id("doc")
    chunk_rows: list[dict[str, Any]] = []

    with get_conn() as conn:
        kb = conn.execute(
            "SELECT id FROM knowledge_bases WHERE id = %s",
            (knowledge_base_id,),
        ).fetchone()
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")

        conn.execute(
            """
            INSERT INTO documents (id, knowledge_base_id, file_name, file_type, file_size, status, summary)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                document_id,
                knowledge_base_id,
                file_name,
                file_type,
                file_size,
                "ready",
                f"学习版导入，共 {len(chunks)} 个切片",
            ),
        )

        for index, content in enumerate(chunks):
            chunk_id = new_id("chunk")
            row = conn.execute(
                """
                INSERT INTO document_chunks
                    (id, document_id, knowledge_base_id, chunk_index, content, token_count)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, document_id, knowledge_base_id, chunk_index, content, token_count, created_at
                """,
                (
                    chunk_id,
                    document_id,
                    knowledge_base_id,
                    index,
                    content,
                    len(content),
                ),
            ).fetchone()
            chunk_rows.append(dict(row))

    embeddings = [embed_text(row["content"]) for row in chunk_rows]
    for row, embedding in zip(chunk_rows, embeddings, strict=True):
        row["embedding_preview"] = [round(value, 4) for value in embedding[:16]]

    chroma_upsert(
        ids=[row["id"] for row in chunk_rows],
        embeddings=embeddings,
        documents=[row["content"] for row in chunk_rows],
        metadatas=[
            {
                "knowledge_base_id": knowledge_base_id,
                "document_id": document_id,
                "chunk_index": row["chunk_index"],
                "file_name": file_name,
            }
            for row in chunk_rows
        ],
    )

    return {
        "document_id": document_id,
        "knowledge_base_id": knowledge_base_id,
        "file_name": file_name,
        "file_type": file_type,
        "file_size": file_size,
        "chunk_count": len(chunk_rows),
        "chunks": chunk_rows,
    }


@app.post("/api/knowledge-bases/{knowledge_base_id}/documents/text")
def ingest_text_document(knowledge_base_id: str, payload: TextDocumentIngest) -> dict[str, Any]:
    return save_document_to_rag(
        knowledge_base_id=knowledge_base_id,
        file_name=payload.file_name,
        file_type="text",
        file_size=len(payload.content.encode("utf-8")),
        content=payload.content,
        chunk_size=payload.chunk_size,
        overlap=payload.overlap,
    )


@app.post("/api/documents/preview-chunks")
def preview_chunks(payload: ChunkPreviewRequest) -> dict[str, Any]:
    chunks = chunk_text(payload.content, payload.chunk_size, payload.overlap)
    return {
        "file_name": payload.file_name,
        "content_length": len(payload.content),
        "chunk_size": payload.chunk_size,
        "overlap": min(payload.overlap, payload.chunk_size // 2),
        "chunk_count": len(chunks),
        "chunks": [
            {
                "id": f"preview_{index + 1}",
                "chunk_index": index,
                "content": content,
                "token_count": len(content),
            }
            for index, content in enumerate(chunks)
        ],
    }


@app.post("/api/knowledge-bases/{knowledge_base_id}/documents/upload")
async def upload_document(
    knowledge_base_id: str,
    file: UploadFile = File(...),
    chunk_size: int = Form(default=500),
    overlap: int = Form(default=80),
) -> dict[str, Any]:
    data = await file.read()
    name = file.filename or "uploaded.txt"
    suffix = name.rsplit(".", 1)[-1].lower() if "." in name else "txt"

    if suffix == "pdf":
        text = extract_pdf_text(data)
        file_type = "pdf"
    elif suffix in {"txt", "md", "markdown"}:
        text = data.decode("utf-8", errors="ignore")
        file_type = "markdown" if suffix in {"md", "markdown"} else "text"
    else:
        raise HTTPException(status_code=400, detail="当前只支持 txt、md、markdown、pdf 文件")

    return save_document_to_rag(
        knowledge_base_id=knowledge_base_id,
        file_name=name,
        file_type=file_type,
        file_size=len(data),
        content=text,
        chunk_size=chunk_size,
        overlap=overlap,
    )


def extract_pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"PDF 解析失败：{exc}") from exc
    return "\n\n".join(page.strip() for page in pages if page.strip())


@app.get("/api/knowledge-bases/{knowledge_base_id}/documents")
def list_documents(knowledge_base_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                d.id,
                d.file_name,
                d.file_type,
                d.file_size,
                d.status,
                d.summary,
                d.created_at,
                count(c.id) AS chunk_count
            FROM documents d
            LEFT JOIN document_chunks c ON c.document_id = d.id
            WHERE d.knowledge_base_id = %s
            GROUP BY d.id
            ORDER BY d.created_at DESC
            """,
            (knowledge_base_id,),
        ).fetchall()
    return [dict(row) for row in rows]


@app.delete("/api/knowledge-bases/{knowledge_base_id}")
def delete_knowledge_base(knowledge_base_id: str) -> dict[str, Any]:
    with get_conn() as conn:
        chunk_rows = conn.execute(
            "SELECT id FROM document_chunks WHERE knowledge_base_id = %s",
            (knowledge_base_id,),
        ).fetchall()
        deleted = conn.execute(
            "DELETE FROM knowledge_bases WHERE id = %s RETURNING id",
            (knowledge_base_id,),
        ).fetchone()
    if not deleted:
        raise HTTPException(status_code=404, detail="知识库不存在")
    chunk_ids = [row["id"] for row in chunk_rows]
    chroma_delete(chunk_ids)
    return {"deleted": True, "knowledge_base_id": knowledge_base_id, "deleted_vectors": len(chunk_ids)}


@app.delete("/api/knowledge-bases/{knowledge_base_id}/documents/{document_id}")
def delete_document(knowledge_base_id: str, document_id: str) -> dict[str, Any]:
    with get_conn() as conn:
        chunk_rows = conn.execute(
            """
            SELECT id
            FROM document_chunks
            WHERE knowledge_base_id = %s AND document_id = %s
            """,
            (knowledge_base_id, document_id),
        ).fetchall()
        deleted = conn.execute(
            """
            DELETE FROM documents
            WHERE id = %s AND knowledge_base_id = %s
            RETURNING id
            """,
            (document_id, knowledge_base_id),
        ).fetchone()
    if not deleted:
        raise HTTPException(status_code=404, detail="文档不存在")
    chunk_ids = [row["id"] for row in chunk_rows]
    chroma_delete(chunk_ids)
    return {"deleted": True, "document_id": document_id, "deleted_vectors": len(chunk_ids)}


@app.get("/api/knowledge-bases/{knowledge_base_id}/chunks")
def list_chunks(knowledge_base_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.document_id, d.file_name, c.chunk_index, c.content, c.token_count, c.created_at
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.knowledge_base_id = %s
            ORDER BY d.created_at DESC, c.chunk_index ASC
            """,
            (knowledge_base_id,),
        ).fetchall()
    items = [dict(row) for row in rows]
    for item in items:
        item["embedding_preview"] = [round(value, 4) for value in embed_text(item["content"])[:16]]
    return items


@app.post("/api/knowledge-bases/{knowledge_base_id}/search")
def search_knowledge_base(knowledge_base_id: str, payload: SearchRequest) -> dict[str, Any]:
    query_embedding = embed_text(payload.question)
    where_filter = {"knowledge_base_id": knowledge_base_id}
    recall_k = min(max(payload.top_k * 4, 12), 50)
    result = chroma_query(
        query_embedding=query_embedding,
        top_k=recall_k,
        where=where_filter,
    )

    ids = result.get("ids", [[]])[0]
    documents = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    candidates: dict[str, dict[str, Any]] = {}
    for index, chunk_id in enumerate(ids):
        metadata = metadatas[index] or {}
        candidates[chunk_id] = {
            "chunk_id": chunk_id,
            "document_id": metadata.get("document_id", ""),
            "file_name": metadata.get("file_name", ""),
            "chunk_index": metadata.get("chunk_index", 0),
            "vector_score": round(cosine_distance_to_score(distances[index]), 4),
            "keyword_score": 0.0,
            "distance": round(float(distances[index]), 4),
            "content": documents[index],
            "sources": ["vector"],
        }

    with get_conn() as conn:
        keyword_rows = conn.execute(
            """
            SELECT c.id, c.document_id, d.file_name, c.chunk_index, c.content
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.knowledge_base_id = %s
            ORDER BY d.created_at DESC, c.chunk_index ASC
            """,
            (knowledge_base_id,),
        ).fetchall()

    keyword_scores = bm25_scores(payload.question, [row["content"] for row in keyword_rows])
    for index, row in enumerate(keyword_rows):
        score = keyword_scores[index] if index < len(keyword_scores) else 0.0
        if score <= 0:
            continue
        chunk_id = row["id"]
        hit = candidates.setdefault(
            chunk_id,
            {
                "chunk_id": chunk_id,
                "document_id": row["document_id"],
                "file_name": row["file_name"],
                "chunk_index": row["chunk_index"],
                "vector_score": 0.0,
                "keyword_score": 0.0,
                "distance": None,
                "content": row["content"],
                "sources": [],
            },
        )
        hit["keyword_score"] = score
        if "keyword" not in hit["sources"]:
            hit["sources"].append("keyword")

    for hit in candidates.values():
        hit["hybrid_score"] = round(hit["vector_score"] * 0.7 + hit["keyword_score"] * 0.3, 4)
        hit["score"] = hit[f"{payload.mode}_score"] if payload.mode != "keyword" else hit["keyword_score"]

    hits = diversify_hits(sorted(candidates.values(), key=lambda item: item["score"], reverse=True), payload.top_k)
    for index, hit in enumerate(hits):
        hit["rank"] = index + 1

    answer, generation = build_grounded_answer(payload.question, hits, payload.min_score)
    retrieval_trace = build_retrieval_trace(
        question=payload.question,
        query_embedding=query_embedding,
        where_filter=where_filter,
        top_k=payload.top_k,
        min_score=payload.min_score,
        mode=payload.mode,
        keyword_candidate_count=len(keyword_rows),
        hits=hits,
        generation=generation,
    )
    run_id = new_id("rag")
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO rag_runs
                (id, knowledge_base_id, question, answer, citations_json, evaluation_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                run_id,
                knowledge_base_id,
                payload.question,
                answer,
                Jsonb([{"chunk_id": hit["chunk_id"], "score": hit["score"]} for hit in hits]),
                Jsonb(retrieval_trace),
            ),
        )

    return {
        "run_id": run_id,
        "knowledge_base_id": knowledge_base_id,
        "question": payload.question,
        "answer": answer,
        "hits": hits,
        "retrieval_trace": retrieval_trace,
    }


@app.post("/api/agent-runs")
def run_agent(payload: AgentRunRequest) -> dict[str, Any]:
    knowledge_base_id = resolve_agent_knowledge_base(payload.knowledge_base_id)

    search_payload = SearchRequest(
        question=payload.goal,
        top_k=payload.top_k,
        min_score=0.15,
        mode="hybrid",
    )
    search_result = search_knowledge_base(knowledge_base_id, search_payload)
    hits = search_result["hits"]
    has_evidence = bool(hits) and hits[0]["score"] >= search_payload.min_score
    final_answer = search_result["answer"]
    generation = search_result["retrieval_trace"].get("generation", {})
    tasks = build_agent_tasks(payload.agent_type, payload.goal, hits, has_evidence)
    steps = build_agent_steps(payload, knowledge_base_id, search_result, tasks, has_evidence)
    if not payload.enable_reflect:
        steps = [step for step in steps if step["id"] != "reflect"]
    summary = build_agent_summary(payload.goal, has_evidence, tasks, generation)
    run_id = new_id("agent")
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO agent_runs (id, knowledge_base_id, goal, mode, summary, steps_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                run_id,
                knowledge_base_id,
                payload.goal,
                payload.agent_type,
                summary,
                Jsonb(steps),
            ),
        )
    return {
        "run_id": run_id,
        "knowledge_base_id": knowledge_base_id,
        "goal": payload.goal,
        "agent_type": payload.agent_type,
        "summary": summary,
        "final_answer": final_answer,
        "generation": generation,
        "citations": [
            {
                "chunk_id": hit["chunk_id"],
                "file_name": hit["file_name"],
                "chunk_index": hit["chunk_index"],
                "score": hit["score"],
                "sources": hit.get("sources", []),
                "content": hit["content"],
            }
            for hit in hits
        ],
        "steps": steps,
        "tasks": tasks,
        "rag_run_id": search_result["run_id"],
    }


def resolve_agent_knowledge_base(knowledge_base_id: str) -> str:
    with get_conn() as conn:
        kb = None
        if knowledge_base_id:
            kb = conn.execute(
                "SELECT id FROM knowledge_bases WHERE id = %s",
                (knowledge_base_id,),
            ).fetchone()
        if not kb:
            kb = conn.execute(
                "SELECT id FROM knowledge_bases ORDER BY created_at DESC LIMIT 1",
            ).fetchone()
    if not kb:
        raise HTTPException(status_code=400, detail="还没有知识库，Agent 无法调用 RAG 工具")
    return kb["id"]


def build_agent_steps(
    payload: AgentRunRequest,
    knowledge_base_id: str,
    search_result: dict[str, Any],
    tasks: list[dict[str, str]],
    has_evidence: bool,
) -> list[dict[str, Any]]:
    hits = search_result["hits"]
    top_score = hits[0]["score"] if hits else 0
    steps = [
        {
            "id": "plan",
            "phase": "Plan",
            "tool": "agent_planner",
            "text": "分析目标，判断需要先从知识库检索资料，再基于证据生成行动项。",
            "input": {"goal": payload.goal, "agent_type": payload.agent_type},
            "output": {"strategy": "plan -> retrieve -> observe -> evaluate -> act", "knowledge_base_id": knowledge_base_id},
        },
        {
            "id": "retrieve",
            "phase": "Retrieve",
            "tool": "knowledge_search",
            "text": "调用 RAG 检索工具，用 Hybrid 模式召回相关切片。",
            "input": {"question": payload.goal, "top_k": payload.top_k, "mode": "hybrid"},
            "output": {
                "rag_run_id": search_result["run_id"],
                "hit_count": len(hits),
                "top_score": top_score,
                "hits": [
                    {
                        "rank": hit["rank"],
                        "chunk_id": hit["chunk_id"],
                        "file_name": hit["file_name"],
                        "score": hit["score"],
                    }
                    for hit in hits
                ],
            },
        },
        {
            "id": "observe",
            "phase": "Observe",
            "tool": "evidence_reader",
            "text": "读取命中的文档片段，提取可以支撑下一步行动的依据。",
            "input": {"chunks": [hit["chunk_id"] for hit in hits]},
            "output": {"evidence_preview": search_result["retrieval_trace"]["context"]["preview"][:700]},
        },
        {
            "id": "evaluate",
            "phase": "Evaluate",
            "tool": "evidence_gate",
            "text": "判断证据是否足够。证据不足时，Agent 不能假装知道。",
            "input": {"min_score": 0.15, "top_score": top_score},
            "output": {"verdict": "grounded" if has_evidence else "insufficient_evidence", "can_act": has_evidence},
        },
        {
            "id": "act",
            "phase": "Act",
            "tool": "answer_generator",
            "text": "把检索到的证据交给大模型，生成最终回答，再补充可执行任务。",
            "input": {"goal": payload.goal, "evidence_ready": has_evidence},
            "output": {
                "final_answer": search_result["answer"],
                "tasks": tasks,
                "model": search_result["retrieval_trace"].get("generation", {}).get("model", ""),
                "used_model": search_result["retrieval_trace"].get("generation", {}).get("used_model", False),
            },
        },
        {
            "id": "reflect",
            "phase": "Reflect",
            "tool": "reflection_check",
            "text": "检查任务是否太大，给出下一步最小行动。",
            "input": {"task_count": len(tasks)},
            "output": {"next_best_task": tasks[0]["title"] if tasks else "先补充知识库资料，再重新运行 Agent"},
        },
    ]
    return steps


def build_agent_tasks(agent_type: str, goal: str, hits: list[dict[str, Any]], has_evidence: bool) -> list[dict[str, str]]:
    if not has_evidence:
        return [
            {
                "title": "补充知识库资料",
                "description": f"当前知识库不足以支撑目标：{goal}",
                "priority": "high",
            }
        ]
    focus = infer_agent_focus(goal, hits)
    if agent_type == "test":
        return [
            {"title": f"梳理「{focus}」测试目标", "description": "从命中资料中提取测试范围、风险点和验收标准。", "priority": "high"},
            {"title": f"生成「{focus}」测试用例草稿", "description": "按正常、异常、边界、回归四类生成用例。", "priority": "high"},
            {"title": f"设计「{focus}」评测指标", "description": "检查准确率、引用完整性、拒答率和可复现性。", "priority": "medium"},
        ]
    if agent_type == "rag":
        return [
            {"title": f"基于引用回答「{focus}」", "description": "只使用命中 chunk 生成回答，并保留来源。", "priority": "high"},
            {"title": f"检查「{focus}」依据充分性", "description": "如果最高分偏低，提示补充资料或换问法。", "priority": "high"},
            {"title": f"记录「{focus}」RAG 运行", "description": "保存问题、命中结果、分数和最终回答。", "priority": "medium"},
        ]
    return [
        {"title": f"围绕「{focus}」整理学习问题", "description": build_learning_description(hits, "questions"), "priority": "high"},
        {"title": f"做一个「{focus}」最小实验", "description": build_learning_description(hits, "experiment"), "priority": "high"},
        {"title": f"沉淀「{focus}」运行记录", "description": "记录目标、检索词、命中片段、判断结果和下一步行动。", "priority": "medium"},
    ]


def infer_agent_focus(goal: str, hits: list[dict[str, Any]]) -> str:
    cleaned_goal = re.sub(r"\s+", " ", goal).strip(" ，。,.")
    for keyword in ["Graph RAG", "Advanced RAG", "Agentic RAG", "LangGraph", "Embedding", "向量数据库", "MCP", "Agent", "测试", "RAG"]:
        if keyword.lower() in cleaned_goal.lower():
            return keyword
    for hit in hits:
        title = extract_heading(hit["content"])
        if title:
            return title[:24]
    return cleaned_goal[:24] or "当前目标"


def extract_heading(content: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return ""


def build_learning_description(hits: list[dict[str, Any]], mode: str) -> str:
    questions: list[str] = []
    for hit in hits:
        questions.extend(re.findall(r"[-*]\s*([^\n?？]+[?？])", hit["content"]))
    if questions:
        selected = "；".join(questions[:2])
        return f"优先回答：{selected}"
    if mode == "experiment":
        return "把命中资料转成一个可运行 Demo，并检查输入、工具调用、输出是否完整。"
    return "根据命中资料提炼 3 个问题，再逐个查资料和验证。"


def build_agent_summary(goal: str, has_evidence: bool, tasks: list[dict[str, str]], generation: dict[str, Any]) -> str:
    if not has_evidence:
        return f"目标「{goal}」当前证据不足，Agent 已建议先补充知识库。"
    model_status = "已调用大模型" if generation.get("used_model") else "使用本地兜底回答"
    return f"目标「{goal}」已完成检索和评估，{model_status}，并生成 {len(tasks)} 个下一步任务。"


def diversify_hits(candidates: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    seen_signatures: list[set[str]] = []
    seen_questions: list[set[str]] = []
    for candidate in candidates:
        signature = content_signature(candidate["content"])
        question_signature = question_signature_from_content(candidate["content"])
        is_duplicate = any(jaccard(signature, seen) >= 0.58 for seen in seen_signatures)
        if question_signature:
            is_duplicate = is_duplicate or any(jaccard(question_signature, seen) >= 0.5 for seen in seen_questions)
        if is_duplicate:
            continue
        hits.append(candidate)
        seen_signatures.append(signature)
        if question_signature:
            seen_questions.append(question_signature)
        if len(hits) >= top_k:
            break
    return hits


def content_signature(content: str) -> set[str]:
    normalized = re.sub(r"\s+", "", content.lower())
    if len(normalized) < 3:
        return {normalized} if normalized else set()
    return {normalized[index : index + 3] for index in range(len(normalized) - 2)}


def question_signature_from_content(content: str) -> set[str]:
    return {
        re.sub(r"\s+", "", item).lower()
        for item in re.findall(r"[-*]\s*([^\n?？]+[?？])", content)
        if len(item.strip()) >= 8
    }


def jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def build_retrieval_trace(
    question: str,
    query_embedding: list[float],
    where_filter: dict[str, Any],
    top_k: int,
    min_score: float,
    mode: str,
    keyword_candidate_count: int,
    hits: list[dict[str, Any]],
    generation: dict[str, Any],
) -> dict[str, Any]:
    top_score = hits[0]["score"] if hits else 0
    has_evidence = bool(hits) and top_score >= min_score
    context = "\n\n".join(
        f"[{hit['rank']}] {hit['file_name']} / chunk {hit['chunk_index']}\n{hit['content']}"
        for hit in hits
    )
    return {
        "embedding": {
            "provider": "local_hash_demo",
            "dimensions": len(query_embedding),
            "preview": [round(value, 4) for value in query_embedding[:16]],
            "note": "学习版哈希向量，用于演示 RAG 数据流；后续会替换成真实 Embedding 模型。",
        },
        "chroma_query": {
            "collection": "document_vectors",
            "where": where_filter,
            "top_k": top_k,
            "min_score": min_score,
            "include": ["documents", "metadatas", "distances"],
        },
        "keyword_query": {
            "source": "PostgreSQL document_chunks",
            "scorer": "learning_bm25",
            "candidate_count": keyword_candidate_count,
        },
        "retrieval_mode": {
            "mode": mode,
            "vector_weight": 0.7,
            "keyword_weight": 0.3,
            "note": "Hybrid RAG 同时使用 Chroma 向量召回和 PostgreSQL 切片的 BM25 关键词召回，再把两路结果融合排序。",
        },
        "ranking": [
            {
                "rank": hit["rank"],
                "chunk_id": hit["chunk_id"],
                "score": hit["score"],
                "vector_score": hit["vector_score"],
                "keyword_score": hit["keyword_score"],
                "hybrid_score": hit["hybrid_score"],
                "distance": hit["distance"],
                "sources": hit["sources"],
                "file_name": hit["file_name"],
                "chunk_index": hit["chunk_index"],
            }
            for hit in hits
        ],
        "context": {
            "chunk_count": len(hits),
            "preview": context[:1200],
        },
        "generation": generation,
        "evaluation": {
            "has_evidence": has_evidence,
            "top_score": top_score,
            "min_score": min_score,
            "verdict": "依据充分" if has_evidence else "依据不足",
            "question": question,
        },
    }
