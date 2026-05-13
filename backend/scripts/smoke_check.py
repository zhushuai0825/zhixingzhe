from __future__ import annotations

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DB_PATH = ROOT_DIR / "data" / "zhixingzhe.db"
BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000").rstrip("/")


class SmokeFailure(Exception):
    pass


def request_json(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any] | list[Any]:
    url = f"{BASE_URL}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload else "GET")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise SmokeFailure(f"接口不可访问：{url}，请先启动后端服务。原始错误：{exc}") from exc


def connect() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise SmokeFailure(f"数据库不存在：{DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def pick_knowledge_base(conn: sqlite3.Connection) -> str:
    env_kb = os.getenv("KNOWLEDGE_BASE_ID", "").strip()
    if env_kb:
        row = conn.execute("SELECT id FROM knowledge_bases WHERE id = ?", (env_kb,)).fetchone()
        if not row:
            raise SmokeFailure(f"KNOWLEDGE_BASE_ID 不存在：{env_kb}")
        return env_kb

    row = conn.execute(
        """
        SELECT
            kb.id,
            COUNT(DISTINCT d.id) AS doc_count,
            COUNT(DISTINCT c.id) AS case_count
        FROM knowledge_bases kb
        LEFT JOIN documents d ON d.knowledge_base_id = kb.id
        LEFT JOIN rag_eval_cases c ON c.knowledge_base_id = kb.id
        GROUP BY kb.id
        ORDER BY case_count DESC, doc_count DESC, kb.updated_at DESC
        LIMIT 1
        """
    ).fetchone()
    if not row or row["doc_count"] == 0:
        raise SmokeFailure("没有找到可检查的知识库，请先上传文档。")
    return str(row["id"])


def check_database(conn: sqlite3.Connection, knowledge_base_id: str) -> None:
    totals = conn.execute(
        """
        SELECT
            (SELECT COUNT(*) FROM document_chunks) AS chunks,
            (SELECT COUNT(*) FROM chunk_vectors) AS vectors,
            (
                SELECT COUNT(*)
                FROM document_chunks c
                LEFT JOIN chunk_vectors v ON v.chunk_id = c.id
                WHERE v.chunk_id IS NULL
            ) AS missing_vectors
        """
    ).fetchone()
    if totals["chunks"] != totals["vectors"] or totals["missing_vectors"] != 0:
        raise SmokeFailure(
            f"切片与向量不一致：chunks={totals['chunks']} vectors={totals['vectors']} "
            f"missing_vectors={totals['missing_vectors']}"
        )

    bad_docs = conn.execute(
        """
        SELECT file_name, status, error_message
        FROM documents
        WHERE knowledge_base_id = ? AND status != 'ready'
        ORDER BY updated_at DESC
        """,
        (knowledge_base_id,),
    ).fetchall()
    if bad_docs:
        names = ", ".join(f"{row['file_name']}({row['status']})" for row in bad_docs[:5])
        raise SmokeFailure(f"知识库存在未就绪文档：{names}")


def check_rag_lab(knowledge_base_id: str) -> None:
    base_payload = {
        "knowledge_base_id": knowledge_base_id,
        "chunk_size": 600,
        "overlap": 120,
        "top_k": 5,
        "rerank": True,
        "hybrid": True,
    }
    grounded = request_json(
        "/api/rag/lab",
        {**base_payload, "question": "Embedding 在 RAG 里起什么作用？"},
    )
    grounded_verdict = grounded.get("evaluation", {}).get("verdict")
    if grounded_verdict == "no_evidence" or not grounded.get("retrieved_chunks"):
        raise SmokeFailure(f"RAG Lab 应该检索到依据，但结果是：{grounded_verdict}")

    strict = request_json(
        "/api/rag/lab",
        {**base_payload, "question": "这份资料里有没有给出 Kubernetes YAML？"},
    )
    strict_verdict = strict.get("evaluation", {}).get("verdict")
    if strict_verdict != "no_evidence":
        raise SmokeFailure(f"严格无依据问题应该拒答，但结果是：{strict_verdict}")


def check_eval_batch(conn: sqlite3.Connection, knowledge_base_id: str) -> None:
    case_count = conn.execute(
        "SELECT COUNT(*) AS count FROM rag_eval_cases WHERE knowledge_base_id = ?",
        (knowledge_base_id,),
    ).fetchone()["count"]
    if case_count == 0:
        print("SKIP 评测集：当前知识库没有评测用例")
        return

    result = request_json(
        "/api/rag/eval-batches/run",
        {
            "knowledge_base_id": knowledge_base_id,
            "chunk_size": 600,
            "overlap": 120,
            "top_k": 5,
            "rerank": True,
            "hybrid": True,
        },
    )
    if result.get("failed_count") != 0:
        failed = [item["question"] for item in result.get("results", []) if not item.get("passed")]
        raise SmokeFailure(
            f"评测集未全通过：{result.get('passed_count')}/{result.get('total_count')}，失败：{failed[:5]}"
        )
    print(f"PASS 评测集：{result.get('passed_count')}/{result.get('total_count')}")


def main() -> int:
    health = request_json("/api/health")
    if health.get("status") != "ok":
        raise SmokeFailure(f"健康检查失败：{health}")
    print("PASS 后端健康检查")

    with connect() as conn:
        knowledge_base_id = pick_knowledge_base(conn)
        print(f"INFO 检查知识库：{knowledge_base_id}")
        check_database(conn, knowledge_base_id)
        print("PASS 数据库切片与向量一致")
        check_rag_lab(knowledge_base_id)
        print("PASS RAG Lab 检索与严格拒答")
        check_eval_batch(conn, knowledge_base_id)

    print("PASS 知行者冒烟检查完成")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SmokeFailure as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        raise SystemExit(1)
