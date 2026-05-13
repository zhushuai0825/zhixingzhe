from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "zhixingzhe.db"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS knowledge_bases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                document_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                status TEXT NOT NULL,
                summary TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                knowledge_base_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                token_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chunk_vectors (
                chunk_id TEXT PRIMARY KEY,
                vector_json TEXT NOT NULL,
                model_name TEXT NOT NULL DEFAULT 'local-hash-384',
                provider TEXT NOT NULL DEFAULT 'local',
                dimensions INTEGER NOT NULL DEFAULT 384,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                title TEXT NOT NULL,
                model_provider TEXT,
                model_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                citations TEXT,
                token_usage TEXT,
                latency_ms INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id TEXT,
                knowledge_base_id TEXT,
                ai_reason TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS model_configs (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key TEXT NOT NULL,
                default_model TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS live_trend_explanations (
                id TEXT PRIMARY KEY,
                item_url TEXT NOT NULL UNIQUE,
                item_kind TEXT NOT NULL,
                source_title TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                raw_json TEXT NOT NULL DEFAULT '{}',
                explanation TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                error_message TEXT,
                model_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_live_trend_explanations_status
            ON live_trend_explanations(status);

            CREATE TABLE IF NOT EXISTS rag_lab_runs (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                question TEXT NOT NULL,
                params_json TEXT NOT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                retrieved_chunks_json TEXT NOT NULL DEFAULT '[]',
                evaluation_json TEXT NOT NULL DEFAULT '{}',
                learning_notes_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_rag_lab_runs_kb_created
            ON rag_lab_runs(knowledge_base_id, created_at);

            CREATE TABLE IF NOT EXISTS agent_lab_runs (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                goal TEXT NOT NULL,
                mode TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                steps_json TEXT NOT NULL DEFAULT '[]',
                suggested_tasks_json TEXT NOT NULL DEFAULT '[]',
                created_task_ids_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_agent_lab_runs_kb_created
            ON agent_lab_runs(knowledge_base_id, created_at);

            CREATE TABLE IF NOT EXISTS rag_eval_cases (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                question TEXT NOT NULL,
                expected_verdict TEXT NOT NULL,
                expected_terms TEXT NOT NULL DEFAULT '[]',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_rag_eval_cases_kb_created
            ON rag_eval_cases(knowledge_base_id, created_at);

            CREATE TABLE IF NOT EXISTS rag_eval_batches (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                params_json TEXT NOT NULL,
                total_count INTEGER NOT NULL DEFAULT 0,
                passed_count INTEGER NOT NULL DEFAULT 0,
                failed_count INTEGER NOT NULL DEFAULT 0,
                pass_rate REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_rag_eval_batches_kb_created
            ON rag_eval_batches(knowledge_base_id, created_at);

            CREATE TABLE IF NOT EXISTS rag_eval_results (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                question TEXT NOT NULL,
                expected_verdict TEXT NOT NULL,
                actual_verdict TEXT NOT NULL,
                passed INTEGER NOT NULL DEFAULT 0,
                reason TEXT NOT NULL DEFAULT '',
                evaluation_json TEXT NOT NULL DEFAULT '{}',
                retrieved_chunks_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (batch_id) REFERENCES rag_eval_batches(id) ON DELETE CASCADE,
                FOREIGN KEY (case_id) REFERENCES rag_eval_cases(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_rag_eval_results_batch
            ON rag_eval_results(batch_id);
            """
        )
        ensure_column(conn, "chunk_vectors", "model_name", "TEXT NOT NULL DEFAULT 'local-hash-384'")
        ensure_column(conn, "chunk_vectors", "provider", "TEXT NOT NULL DEFAULT 'local'")
        ensure_column(conn, "chunk_vectors", "dimensions", "INTEGER NOT NULL DEFAULT 384")


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    return [dict(row) for row in rows]
