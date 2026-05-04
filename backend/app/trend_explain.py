from __future__ import annotations

import json
import re
import threading
from typing import Any, Dict, List, Optional

import requests

from .services import api_key_plain_for_bearer, openai_compatible_chat_completions_url, raise_for_openai_compatible_response
from .storage import connect, new_id, now_iso


def infer_item_kind(source_title: str, item: Dict[str, Any]) -> str:
    if "GitHub" in (source_title or ""):
        return "github_repo"
    if "论文" in (source_title or "") or item.get("language") == "paper":
        return "hf_paper"
    return "hf_space"


def normalize_trend_item_url(url: str) -> str:
    u = (url or "").strip()
    while len(u) > 1 and u.endswith("/"):
        u = u[:-1]
    return u


def url_lookup_candidates(url: str) -> List[str]:
    raw = (url or "").strip()
    norm = normalize_trend_item_url(raw)
    return list(dict.fromkeys([norm, raw]))


def get_minimax_model_config() -> Optional[Dict[str, Any]]:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM model_configs
            WHERE enabled = 1
              AND (
                lower(provider) LIKE '%minimax%'
                OR instr(lower(base_url), 'minimax') > 0
              )
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
    return dict(row) if row else None


def strip_model_artifacts(text: str) -> str:
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    return text.strip()


def build_explain_messages(source_title: str, item: Dict[str, Any], item_kind: str) -> List[Dict[str, str]]:
    payload = json.dumps(item, ensure_ascii=False, indent=2)
    system = (
        "你是资深技术编辑与研究员，擅长把开源项目与论文趋势解读成可落地的中文说明。"
        "只输出 Markdown 正文，不要输出前置寒暄。"
    )
    user = f"""以下是一条「{source_title}」中的实时条目，类型标记为 `{item_kind}`。原始 JSON：

{payload}

请用 **Markdown** 写一篇面向中文读者的深度解读，必须包含以下二级标题（##）并按顺序撰写：

## 一、条目概览
（名称、链接、语言/形态、热度指标等）

## 二、背景与核心价值
（解决什么问题、与当前技术栈的关系）

## 三、典型使用场景与适用人群
（谁会用、在什么业务或研究阶段用）

## 四、使用与上手方法
若为 GitHub 仓库：环境要求、安装/克隆、运行入口、如何集成到自己的项目。
若为 Hugging Face 论文：问题设定、方法要点、实验结论、如何阅读或复现。
若为 Space：体验方式、输入输出、可能的扩展。
信息不足时写「公开信息不足，建议打开官方页面核对」，不要编造具体命令或实验数字。

## 五、风险、局限与注意事项
（许可、维护状态、依赖风险、伦理与合规等）

## 六、延伸阅读与行动建议
（下一步可查什么文档、可拆成哪些学习任务）

全文要具体、可执行，避免空泛套话。"""
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def call_minimax_chat(config: Dict[str, Any], messages: List[Dict[str, str]], timeout: int = 120) -> str:
    url = openai_compatible_chat_completions_url(config["base_url"])
    payload: Dict[str, Any] = {
        "model": config["default_model"],
        "messages": messages,
        "temperature": 0.35,
        "max_tokens": 4096,
    }
    headers = {
        "Authorization": f"Bearer {api_key_plain_for_bearer(config['api_key'])}",
        "Content-Type": "application/json",
    }
    response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    raise_for_openai_compatible_response(response)
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    return strip_model_artifacts(str(content))


def upsert_explanation_row(
    conn,
    item_url: str,
    item_kind: str,
    source_title: str,
    title: str,
    raw_json: str,
    status: str,
    explanation: str,
    error_message: Optional[str],
    model_name: Optional[str],
) -> str:
    now = now_iso()
    row = conn.execute("SELECT id FROM live_trend_explanations WHERE item_url = ?", (item_url,)).fetchone()
    if row:
        eid = row["id"]
        conn.execute(
            """
            UPDATE live_trend_explanations
            SET item_kind = ?, source_title = ?, title = ?, raw_json = ?, explanation = ?,
                status = ?, error_message = ?, model_name = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                item_kind,
                source_title,
                title,
                raw_json,
                explanation,
                status,
                error_message,
                model_name,
                now,
                eid,
            ),
        )
        return eid
    eid = new_id("texp")
    conn.execute(
        """
        INSERT INTO live_trend_explanations (
            id, item_url, item_kind, source_title, title, raw_json,
            explanation, status, error_message, model_name, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            eid,
            item_url,
            item_kind,
            source_title,
            title,
            raw_json,
            explanation,
            status,
            error_message,
            model_name,
            now,
            now,
        ),
    )
    return eid


def generate_and_store_explanation(
    item_url: str, source_title: str, item: Dict[str, Any], force: bool = False
) -> Dict[str, Any]:
    item_url = normalize_trend_item_url(item_url)
    if not item_url:
        raise ValueError("缺少 item_url")

    existing = fetch_explanation_by_url(item_url)
    if existing and existing.get("status") == "ready" and not force:
        out = dict(existing)
        out["skipped_llm"] = True
        out["from_database"] = True
        return out

    item_kind = infer_item_kind(source_title, item)
    title = str(item.get("title") or item.get("name") or item_url)
    raw_json = json.dumps(item, ensure_ascii=False)
    config = get_minimax_model_config()
    now = now_iso()

    with connect() as conn:
        if not config:
            msg = "未找到已启用的 MiniMax 配置。请在「设置」中将服务商设为 MiniMax、填写 api.minimax.io 的 Key 并保存。"
            eid = upsert_explanation_row(
                conn,
                item_url,
                item_kind,
                source_title,
                title,
                raw_json,
                "failed",
                "",
                msg,
                None,
            )
            conn.commit()
            return _fetch_explanation(conn, eid)

        upsert_explanation_row(
            conn,
            item_url,
            item_kind,
            source_title,
            title,
            raw_json,
            "pending",
            "",
            None,
            config.get("default_model"),
        )
        conn.commit()

    try:
        messages = build_explain_messages(source_title, item, item_kind)
        explanation = call_minimax_chat(config, messages)
    except Exception as exc:
        err = str(exc)
        with connect() as conn:
            conn.execute(
                """
                UPDATE live_trend_explanations
                SET status = 'failed', error_message = ?, explanation = '', updated_at = ?
                WHERE item_url = ?
                """,
                (err, now_iso(), item_url),
            )
            conn.commit()
        raise

    with connect() as conn:
        conn.execute(
            """
            UPDATE live_trend_explanations
            SET status = 'ready', explanation = ?, error_message = NULL, model_name = ?, updated_at = ?
            WHERE item_url = ?
            """,
            (explanation, config.get("default_model"), now_iso(), item_url),
        )
        row = conn.execute("SELECT * FROM live_trend_explanations WHERE item_url = ?", (item_url,)).fetchone()
    return dict(row) if row else {}


def _fetch_explanation(conn, eid: str) -> Dict[str, Any]:
    row = conn.execute("SELECT * FROM live_trend_explanations WHERE id = ?", (eid,)).fetchone()
    return dict(row) if row else {}


def fetch_explanation_by_url(item_url: str) -> Optional[Dict[str, Any]]:
    with connect() as conn:
        for candidate in url_lookup_candidates(item_url):
            row = conn.execute("SELECT * FROM live_trend_explanations WHERE item_url = ?", (candidate,)).fetchone()
            if row:
                return dict(row)
    return None


def fetch_explanation_by_id(eid: str) -> Optional[Dict[str, Any]]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM live_trend_explanations WHERE id = ?", (eid,)).fetchone()
    return dict(row) if row else None


def batch_status_for_urls(urls: List[str]) -> Dict[str, Dict[str, Any]]:
    if not urls:
        return {}
    unique = list(
        dict.fromkeys(normalize_trend_item_url(u) for u in urls if u and str(u).strip())
    )
    if not unique:
        return {}
    placeholders = ",".join("?" for _ in unique)
    with connect() as conn:
        rows = conn.execute(
            f"SELECT item_url, id, status FROM live_trend_explanations WHERE item_url IN ({placeholders})",
            unique,
        ).fetchall()
    return {row["item_url"]: {"id": row["id"], "status": row["status"]} for row in rows}


def explain_all_trend_items(live_data: Dict[str, Any]) -> None:
    for source in live_data.get("sources") or []:
        if source.get("status") != "ok":
            continue
        source_title = source.get("title") or ""
        for item in source.get("items") or []:
            url = normalize_trend_item_url(item.get("url") or "")
            if not url:
                continue
            existing = fetch_explanation_by_url(url)
            if existing and existing.get("status") == "ready":
                continue
            try:
                generate_and_store_explanation(url, source_title, item)
            except Exception as exc:
                print(f"[trend_explain] skip {url}: {exc}")


def schedule_explanations_for_live_data(live_data: Dict[str, Any]) -> None:
    thread = threading.Thread(target=explain_all_trend_items, args=(live_data,), daemon=True)
    thread.start()
