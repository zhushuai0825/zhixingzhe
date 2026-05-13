from __future__ import annotations

import json
import os
import re
import time
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from xml.etree import ElementTree

import requests

from .security import decrypt_secret, is_encrypted, mask_secret
from .storage import connect, new_id, now_iso


SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".pdf", ".docx"}
STOP_WORDS = {
    "的",
    "了",
    "和",
    "是",
    "在",
    "与",
    "及",
    "或",
    "一个",
    "需要",
    "可以",
    "the",
    "and",
    "of",
    "to",
    "in",
    "讲解",
    "分析",
    "总结",
    "目前",
    "当前",
    "文档",
    "文档里",
    "有没有",
    "没有",
    "什么",
    "是否",
    "知识",
    "说明",
    "如何",
    "模型",
    "大模型",
    "大模",
    "参数",
    "设计",
    "训练",
    "提到",
    "给出",
    "完整",
    "复现",
    "资料",
    "这份",
    "一下",
    "这些",
    "两个",
}
OVERVIEW_KEYWORDS = (
    "总结",
    "概括",
    "讲解",
    "分析",
    "梳理",
    "介绍",
    "主要介绍",
    "全称",
    "英文全称",
    "是什么",
    "这两个文档",
    "这些文档",
    "当前文档",
    "目前文档",
    "当前知识库",
    "这个知识库",
)


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def ensure_supported_file(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise AppError(
            "UNSUPPORTED_FILE_TYPE",
            "当前支持 txt、md、markdown、pdf、docx 文件。PDF 需为文本型，暂不支持扫描件 OCR。",
            400,
        )
    return ext.lstrip(".")


def read_text_file(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return read_pdf_file(path)
    if ext == ".docx":
        return read_docx_file(path)

    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise AppError("FILE_DECODE_FAILED", "文件编码无法识别，请先转为 UTF-8 文本。", 400)


def read_pdf_file(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise AppError("PDF_PARSER_MISSING", "缺少 pypdf 依赖，请先执行 pip install -r requirements.txt。", 500) from exc

    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            raise AppError("ENCRYPTED_PDF", "暂不支持加密 PDF，请先解除密码后再上传。", 400)
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append(f"[第 {index} 页]\n{text.strip()}")
    except AppError:
        raise
    except Exception as exc:
        raise AppError("PDF_PARSE_FAILED", f"PDF 解析失败：{exc}", 400) from exc

    extracted = "\n\n".join(pages).strip()
    if not extracted:
        raise AppError("EMPTY_DOCUMENT", "PDF 没有提取到文本。扫描件需要先做 OCR。", 400)
    return extracted


def read_docx_file(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            xml = archive.read("word/document.xml")
    except KeyError as exc:
        raise AppError("DOCX_PARSE_FAILED", "Word 文档缺少正文内容。", 400) from exc
    except zipfile.BadZipFile as exc:
        raise AppError("DOCX_PARSE_FAILED", "Word 文档格式损坏或不是有效 docx 文件。", 400) from exc

    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as exc:
        raise AppError("DOCX_PARSE_FAILED", "Word 文档正文 XML 解析失败。", 400) from exc

    paragraphs: List[str] = []
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for paragraph in root.iter(f"{namespace}p"):
        texts = [node.text or "" for node in paragraph.iter(f"{namespace}t")]
        line = "".join(texts).strip()
        if line:
            paragraphs.append(line)

    extracted = "\n\n".join(paragraphs).strip()
    if not extracted:
        raise AppError("EMPTY_DOCUMENT", "Word 文档没有提取到文本。", 400)
    return extracted


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def split_text(text: str, chunk_size: int = 900, overlap: int = 120) -> List[str]:
    text = clean_text(text)
    if not text:
        return []
    overlap = min(overlap, max(chunk_size - 1, 0))
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks


def summarize_text(text: str) -> str:
    text = clean_text(text)
    if not text:
        return "文档内容为空，暂时无法生成摘要。"
    rows = extract_markdown_rows(text)
    headings = [
        line.lstrip("#").strip()
        for line in text.splitlines()
        if line.strip().startswith("#") and line.lstrip("#").strip()
    ][:3]
    source_match = re.search(r"来源[:：]\s*(\S+)", text)
    source = source_match.group(1) if source_match else ""

    if rows:
        languages = Counter(row["language"] or "未知" for row in rows)
        top_rows = rows[:3]
        projects = "、".join(row["name"] for row in top_rows if row["name"])
        language_text = "、".join(f"{name} {count} 个" for name, count in languages.most_common(3))
        summary = f"这份文档整理了 {len(rows)} 条趋势项目数据"
        if source:
            summary += f"，来源是 {source}"
        if language_text:
            summary += f"。主要语言分布：{language_text}"
        if projects:
            summary += f"。靠前条目包括：{projects}"
        return summary + "。适合用来做热门项目筛选、技术趋势观察和后续任务拆解。"

    sentences = [
        item.strip()
        for item in re.split(r"[。！？!?；;\n]", text)
        if len(item.strip()) >= 12
    ]
    keywords = list(tokenize(text))[:8]
    parts = []
    if headings:
        parts.append(f"主题：{'、'.join(headings)}")
    if sentences:
        parts.append("要点：" + "；".join(sentences[:3]))
    if keywords:
        parts.append(f"关键词：{'、'.join(keywords)}")
    return "。".join(parts)[:520] or f"这份文档主要内容为：{text[:220]}"


def tokenize(text: str) -> set[str]:
    text = text.lower()
    words = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z0-9_]{2,}", text)
    tokens: set[str] = set()
    for word in words:
        if word in STOP_WORDS:
            continue
        tokens.add(word)
        if re.fullmatch(r"[\u4e00-\u9fff]{3,}", word):
            for index in range(len(word) - 1):
                gram = word[index : index + 2]
                if gram not in STOP_WORDS:
                    tokens.add(gram)
    return tokens


def strip_model_artifacts(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL | re.IGNORECASE)
    return clean_text(text)


def score_chunk(question: str, content: str) -> float:
    q_words = tokenize(question)
    c_words = tokenize(content)
    if not q_words or not c_words:
        return 0.0
    overlap = q_words & c_words
    return len(overlap) / max(len(q_words), 1)


def evidence_thresholds(question: str) -> Dict[str, float]:
    if is_strict_absence_question(question):
        return {"min_score": 0.32, "min_coverage": 0.35}
    if is_overview_question(question):
        return {"min_score": 0.08, "min_coverage": 0.05}
    return {"min_score": 0.18, "min_coverage": 0.18}


def enough_evidence_to_answer(question: str, chunks: List[Dict[str, Any]]) -> bool:
    return evaluate_rag_answer(question, chunks, "").get("verdict") != "no_evidence"


def is_overview_question(question: str) -> bool:
    if any(keyword in question for keyword in ("有没有", "是否", "有没有介绍", "有没有说明", "有没有提到")):
        return False
    return any(keyword in question for keyword in OVERVIEW_KEYWORDS)


def is_strict_absence_question(question: str) -> bool:
    strict_markers = (
        "有没有",
        "是否",
        "有没有给出",
        "有没有说明",
        "有没有介绍",
        "有没有提到",
        "有没有完整",
    )
    evidence_markers = (
        "yaml",
        "api key",
        "deepseek",
        "langgraph",
        "kubernetes",
        "训练大模型",
        "节点",
        "配置文件",
        "部署方案",
        "主从复制",
        "训练数据",
        "mirage",
        "下载地址",
        "完整复现",
        "未公开",
        "内部",
    )
    lower = question.lower()
    return any(marker in question for marker in strict_markers) and any(marker in lower for marker in evidence_markers)


def has_direct_evidence_for_strict_question(question: str, chunks: List[Dict[str, Any]]) -> bool:
    merged = "\n".join(chunk.get("content", "") for chunk in chunks).lower()
    lower = question.lower()
    if "api key" in lower:
        return bool(re.search(r"(sk-[a-z0-9]{12,}|密钥[:：]\\s*\\S{12,}|api[_ -]?key[:：=]\\s*\\S{12,})", merged))
    if "yaml" in lower or "kubernetes" in lower:
        return "apiversion:" in merged or re.search(r"(^|\\n)kind:\\s*\\w+", merged) is not None
    if "配置文件" in lower or "docker compose" in lower:
        return "docker-compose" in merged or "services:" in merged or "version:" in merged
    if "下载地址" in lower:
        return re.search(r"下载地址[:：]\\s*https?://\\S+", merged) is not None
    if "完整复现" in lower or "代码" in lower:
        has_code_block = re.search(r"```(python|bash|javascript|typescript)", merged) is not None
        return "完整代码" in merged or "复现步骤" in merged or has_code_block
    if "部署方案" in lower or "主从复制" in lower or "训练大模型" in lower or "langgraph" in lower:
        return "部署步骤" in merged or "配置步骤" in merged or "主从复制" in merged
    if "内部" in lower or "未公开" in lower:
        return False
    return False


def fetch_overview_chunks(knowledge_base_id: str, top_k: int = 8) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id AS chunk_id,
                c.document_id,
                c.chunk_index,
                c.content,
                d.file_name AS document_name
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.knowledge_base_id = ?
            ORDER BY d.created_at DESC, c.chunk_index ASC
            """,
            (knowledge_base_id,),
        ).fetchall()

    selected: List[Dict[str, Any]] = []
    seen_docs: set[str] = set()
    for row in rows:
        if row["document_id"] in seen_docs:
            continue
        selected.append(
            {
                "chunk_id": row["chunk_id"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "chunk_index": row["chunk_index"],
                "content": row["content"],
                "score": 1.0,
            }
        )
        seen_docs.add(row["document_id"])
        if len(selected) >= top_k:
            return selected

    for row in rows:
        if any(item["chunk_id"] == row["chunk_id"] for item in selected):
            continue
        selected.append(
            {
                "chunk_id": row["chunk_id"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "chunk_index": row["chunk_index"],
                "content": row["content"],
                "score": 0.8,
            }
        )
        if len(selected) >= top_k:
            break
    return selected


def retrieve_chunks(knowledge_base_id: str, question: str, top_k: int = 5, hybrid: bool = True) -> List[Dict[str, Any]]:
    from .vector_store import search_similar_chunks

    vector_results = search_similar_chunks(knowledge_base_id, question, top_k, hybrid)
    if vector_results and not is_overview_question(question):
        return vector_results

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id AS chunk_id,
                c.document_id,
                c.chunk_index,
                c.content,
                d.file_name AS document_name
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.knowledge_base_id = ?
            """,
            (knowledge_base_id,),
        ).fetchall()

    scored: List[Dict[str, Any]] = []
    for row in rows:
        score = score_chunk(question, row["content"])
        if score > 0:
            scored.append(
                {
                    "chunk_id": row["chunk_id"],
                    "document_id": row["document_id"],
                    "document_name": row["document_name"],
                    "chunk_index": row["chunk_index"],
                    "content": row["content"],
                    "score": round(score, 4),
                }
            )
    scored.sort(key=lambda item: item["score"], reverse=True)
    if vector_results:
        merged: Dict[str, Dict[str, Any]] = {item["chunk_id"]: item for item in vector_results}
        for item in scored:
            merged.setdefault(item["chunk_id"], item)
        return list(merged.values())[:top_k]
    if not scored and is_overview_question(question):
        return fetch_overview_chunks(knowledge_base_id, top_k)
    return scored[:top_k]


def build_local_answer(question: str, chunks: List[Dict[str, Any]]) -> str:
    if not chunks:
        return "当前知识库中没有找到足够依据。你可以先上传相关文档，或换一个更贴近资料内容的问题。"

    exact_project = find_exact_project_match(question, chunks)
    if exact_project:
        return build_project_answer(question, exact_project)

    by_doc: Dict[str, List[Dict[str, Any]]] = {}
    for chunk in chunks:
        by_doc.setdefault(chunk["document_name"], []).append(chunk)

    if is_overview_question(question):
        sections = []
        for document_name, doc_chunks in list(by_doc.items())[:5]:
            merged = "\n".join(chunk["content"] for chunk in doc_chunks[:4])
            insights = extract_markdown_insights(merged)
            if insights:
                sections.append(f"《{document_name}》\n" + "\n".join(f"- {item}" for item in insights[:6]))
            else:
                snippet = merged.replace("\n", " ")[:260]
                sections.append(f"《{document_name}》\n- 主要内容：{snippet}...")
        return (
            "可以。当前问题更像是在让系统概括知识库内容，我先基于已上传文档做一个总览。\n\n"
            f"{chr(10).join(chr(10) + section for section in sections)}\n\n"
            "整体看，这批资料适合做三件事：\n"
            "1. 找热门项目和论文方向，判断最近 AI/开发生态在关注什么。\n"
            "2. 挑出和你产品相关的工具，例如知识库、文档处理、PPT 生成、短视频、API 资源等。\n"
            "3. 把值得研究的项目保存成任务，逐个阅读 README、试跑 Demo、整理可借鉴功能。\n\n"
            "你可以继续追问：哪些项目最值得关注、这些内容能拆成什么任务、或者按工具/论文/应用方向分类。"
        )

    markdown_insights: List[str] = []
    for chunk in chunks[:5]:
        markdown_insights.extend(extract_markdown_insights(chunk["content"]))
    if markdown_insights:
        unique_insights = []
        seen = set()
        for item in markdown_insights:
            key = item.split("：", 1)[0]
            if key in seen:
                continue
            seen.add(key)
            unique_insights.append(item)
            if len(unique_insights) >= 8:
                break
        return (
            f"基于当前知识库，我找到了一些和「{question}」相关的条目：\n\n"
            + "\n".join(f"- {item}" for item in unique_insights)
            + "\n\n可以优先关注：高星项目、和你当前产品直接相关的文档处理/知识库/AI 应用工具，以及能马上试跑的开源项目。"
        )

    bullet_points = []
    for chunk in chunks[:3]:
        snippet = chunk["content"].replace("\n", " ")
        bullet_points.append(f"- 来自《{chunk['document_name']}》：{snippet[:120]}...")
    evidence = "\n".join(bullet_points)
    return (
        f"基于当前知识库，我找到了和「{question}」相关的资料片段。\n\n"
        f"{evidence}\n\n"
        "MVP 当前使用本地检索摘要回答。配置 OpenAI 兼容模型 API 后，这里会由大模型基于引用资料生成更自然的回答。"
    )


def extract_markdown_insights(text: str) -> List[str]:
    insights: List[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|") or "---" in line or "仓库" in line:
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) >= 4:
            name = cells[0]
            language = cells[1]
            cn_summary = cells[2]
            stars = cells[4] if len(cells) > 4 else ""
            if name and cn_summary:
                star_text = f"，星标 {stars}" if stars else ""
                insights.append(f"{name}（{language}）：{cn_summary}{star_text}。")
        if len(insights) >= 8:
            break
    if insights:
        return insights

    for line in text.splitlines():
        line = line.strip()
        if line.startswith("中文导读："):
            insights.append(line)
        elif line.startswith("- 关键词：") and "未提供" not in line:
            insights.append(line.replace("- ", ""))
        elif line.startswith("|") and "中文说明" in line:
            continue
        if len(insights) >= 6:
            break
    return insights


def extract_markdown_rows(text: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|") or "---" in line or "仓库" in line:
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) < 7:
            continue
        rows.append(
            {
                "name": cells[0],
                "language": cells[1],
                "summary_cn": cells[2],
                "description": cells[3],
                "stars": cells[4],
                "forks": cells[5],
                "today": cells[6],
                "link": cells[7] if len(cells) > 7 else "",
            }
        )
    return rows


def find_exact_project_match(question: str, chunks: List[Dict[str, Any]]) -> Optional[Dict[str, str]]:
    normalized_question = question.lower().replace(" ", "")
    best_match: Optional[Dict[str, str]] = None
    for chunk in chunks:
        for row in extract_markdown_rows(chunk["content"]):
            name = row["name"]
            if not name:
                continue
            owner, _, repo = name.partition("/")
            candidates = {name.lower(), owner.lower(), repo.lower()}
            candidates = {candidate.replace(" ", "") for candidate in candidates if candidate}
            if any(candidate in normalized_question for candidate in candidates):
                row["document_name"] = chunk["document_name"]
                best_match = row
                if name.lower().replace(" ", "") in normalized_question:
                    return row
    return best_match


def build_project_answer(question: str, project: Dict[str, str]) -> str:
    name = project["name"]
    summary = project["summary_cn"]
    description = project["description"]
    language = project["language"]
    stars = project["stars"]
    forks = project["forks"]
    today = project["today"]
    link = project["link"]
    return (
        f"你问的应该是《{project.get('document_name', '当前文档')}》里的 `{name}`。\n\n"
        f"它的核心信息是：\n"
        f"- 项目：{name}\n"
        f"- 主要语言：{language or '未提供'}\n"
        f"- 中文说明：{summary or '文档里没有提供中文说明'}\n"
        f"- 原始简介：{description or '文档里没有提供简介'}\n"
        f"- 热度：{stars or '未知'} stars，{forks or '未知'} forks，{today or '今日新增未知'}\n"
        f"- 链接：{link or '文档里没有提供链接'}\n\n"
        "从这条数据看，它值得关注的点主要有三个：\n"
        "1. 热度很高，说明最近社区关注度强，适合作为趋势观察对象。\n"
        "2. 它和 AI/大模型工作流相关，可能能给知行者的“技能、任务、知识库工作流”设计提供参考。\n"
        "3. 下一步建议打开仓库，看 README、目录结构、安装方式和示例，判断它是工具集合、Agent 技能库，还是某种可复用模板。\n\n"
        "注意：以上分析只基于你当前知识库里的趋势表格。如果要更深入，比如解释它的源码结构或真实用法，需要再把该仓库 README 或代码文档上传进知识库。"
    )


def get_enabled_model_config(provider: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with connect() as conn:
        if provider:
            row = conn.execute(
                "SELECT * FROM model_configs WHERE enabled = 1 AND provider = ? ORDER BY updated_at DESC LIMIT 1",
                (provider,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM model_configs WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1"
            ).fetchone()
    return dict(row) if row else None


def openai_compatible_chat_completions_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise ValueError("base_url 为空")
    if re.search(r"/v1$", base, re.IGNORECASE):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def api_key_plain_for_bearer(api_key_stored: str) -> str:
    if is_encrypted(api_key_stored):
        plain = decrypt_secret(api_key_stored)
    else:
        plain = api_key_stored or ""
    plain = plain.strip()
    if plain.lower().startswith("bearer "):
        plain = plain[7:].strip()
    return plain


def raise_for_openai_compatible_response(response: requests.Response) -> None:
    if response.ok:
        return
    text = (response.text or "")[:800]
    try:
        payload = response.json()
        msg = payload.get("error", {}).get("message") if isinstance(payload.get("error"), dict) else None
        if not msg:
            msg = payload.get("message") or payload.get("detail")
    except Exception:
        msg = None
    hint = ""
    if response.status_code == 401:
        hint = (
            " 常见原因：① Key 不是 MiniMax 开放平台里的「API / 接口密钥」或已失效；"
            "② 填写时多复制了「Bearer 」前缀（保存时只填密钥本身）；"
            "③ 国内账号需将 Base URL 改为 https://api.minimaxi.com（末尾不要重复 /v1）。"
        )
    raise requests.HTTPError(f"{response.status_code} {response.reason}{hint} 响应：{msg or text}", response=response)


def call_chat_model(
    config: Dict[str, Any],
    question: str,
    chunks: List[Dict[str, Any]],
    model_name: Optional[str] = None,
) -> str:
    context = "\n\n".join(
        f"[{index + 1}] 文档：{chunk['document_name']}，片段：{chunk['content']}"
        for index, chunk in enumerate(chunks)
    )
    messages = [
        {
            "role": "system",
            "content": (
                "你是知行者的知识问答助手。请优先基于参考资料回答。"
                "如果资料不足，请明确说明当前知识库中没有找到足够依据。不要编造引用。"
            ),
        },
        {
            "role": "user",
            "content": f"用户问题：{question}\n\n参考资料：\n{context}",
        },
    ]
    url = openai_compatible_chat_completions_url(config["base_url"])
    payload = {
        "model": model_name or config["default_model"],
        "messages": messages,
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {api_key_plain_for_bearer(config['api_key'])}",
        "Content-Type": "application/json",
    }
    timeout_seconds = float(os.getenv("ZHIXINGZHE_CHAT_TIMEOUT_SECONDS", "15"))
    response = requests.post(url, headers=headers, json=payload, timeout=timeout_seconds)
    raise_for_openai_compatible_response(response)
    data = response.json()
    return strip_model_artifacts(str(data["choices"][0]["message"]["content"]))


def test_chat_model(provider: str, base_url: str, api_key: str, model_name: str) -> str:
    config = {
        "provider": provider,
        "base_url": base_url,
        "api_key": api_key,
        "default_model": model_name,
    }
    answer = call_chat_model(
        config,
        "请只回复：连接成功",
        [
            {
                "document_name": "连接测试",
                "content": "这是一次模型连接测试。请确认接口可以正常返回。",
            }
        ],
        model_name,
    )
    return answer.strip()


def answer_question(
    knowledge_base_id: str,
    question: str,
    provider: Optional[str] = None,
    model_name: Optional[str] = None,
) -> Tuple[str, List[Dict[str, Any]], int, bool, Optional[str]]:
    started = time.time()
    chunks = retrieve_chunks(knowledge_base_id, question)
    config = get_enabled_model_config(provider)
    used_fallback = False
    warning = None
    preliminary_evaluation = evaluate_rag_answer(question, chunks, "")

    if preliminary_evaluation["verdict"] == "no_evidence":
        latency_ms = int((time.time() - started) * 1000)
        warning = "当前知识库没有找到足够依据。"
        return build_local_answer(question, []), [], latency_ms, used_fallback, warning

    if config and chunks:
        try:
            answer = call_chat_model(config, question, chunks, model_name)
        except Exception as exc:
            print(f"[model_fallback] provider={config.get('provider')} error={exc}")
            used_fallback = True
            warning = "模型暂时不可用，已使用本地知识库分析。"
            answer = build_local_answer(question, chunks)
    else:
        if config and not chunks:
            warning = "当前知识库没有找到可用依据。"
        answer = build_local_answer(question, chunks)

    latency_ms = int((time.time() - started) * 1000)
    return answer, chunks, latency_ms, used_fallback, warning


def evaluate_rag_answer(question: str, chunks: List[Dict[str, Any]], answer: str = "") -> Dict[str, Any]:
    question_terms = tokenize(question)
    evidence_terms = set()
    for chunk in chunks:
        evidence_terms.update(tokenize(chunk.get("content", "")))
    covered_terms = sorted(question_terms & evidence_terms)
    missing_terms = sorted(question_terms - evidence_terms)
    top_score = max((float(chunk.get("score") or 0) for chunk in chunks), default=0.0)
    coverage_ratio = len(covered_terms) / max(len(question_terms), 1)
    thresholds = evidence_thresholds(question)
    has_citations = bool(chunks)
    if not chunks:
        verdict = "no_evidence"
        suggestion = "没有检索到引用。正确行为是拒答或提示当前知识库依据不足。"
    elif is_overview_question(question) and top_score >= thresholds["min_score"]:
        verdict = "grounded"
        suggestion = "当前是概览或定义类问题，已检索到可用于概括的资料片段。"
    elif is_strict_absence_question(question) and not has_direct_evidence_for_strict_question(question, chunks):
        verdict = "no_evidence"
        suggestion = "这是要求确认具体证据是否存在的问题，当前没有找到直接证据，应拒答或提示没有找到依据。"
    elif not covered_terms:
        verdict = "no_evidence"
        suggestion = "虽然检索到了片段，但没有覆盖问题中的关键概念，应拒答或补充资料。"
    elif top_score < thresholds["min_score"] and coverage_ratio < thresholds["min_coverage"]:
        verdict = "no_evidence"
        suggestion = "相似度和问题覆盖都不足，应拒答或提示当前知识库依据不足。"
    elif top_score < thresholds["min_score"] or coverage_ratio < thresholds["min_coverage"] or len(covered_terms) <= 1:
        verdict = "weak_evidence"
        suggestion = "检索依据偏弱，建议补充文档、改写问题，或调高召回数量后再回答。"
    else:
        verdict = "grounded"
        suggestion = "已检索到可引用片段，回答应只围绕这些片段展开。"

    return {
        "retrieved_count": len(chunks),
        "has_citations": has_citations,
        "top_score": round(top_score, 4),
        "coverage_ratio": round(coverage_ratio, 4),
        "min_score": thresholds["min_score"],
        "min_coverage": thresholds["min_coverage"],
        "covered_terms": covered_terms[:12],
        "missing_terms": missing_terms[:12],
        "verdict": verdict,
        "suggestion": suggestion,
        "answer_length": len(answer or ""),
    }


def build_rag_learning_notes(params: Dict[str, Any], chunks: List[Dict[str, Any]], evaluation: Dict[str, Any]) -> List[str]:
    notes = []
    chunk_size = int(params.get("chunk_size") or 0)
    overlap = int(params.get("overlap") or 0)
    top_k = int(params.get("top_k") or 0)
    hybrid = bool(params.get("hybrid", True))
    if chunk_size < 500:
        notes.append("当前切片偏短，适合精准事实问答，但可能丢失上下文。")
    elif chunk_size > 1200:
        notes.append("当前切片偏长，适合总结类问题，但可能让相似度变钝。")
    else:
        notes.append("当前切片长度适中，适合作为 RAG 入门实验基线。")
    if overlap == 0:
        notes.append("当前没有重叠，边界处的信息可能被切开。")
    elif overlap > chunk_size * 0.3:
        notes.append("当前重叠比例偏高，召回可能更稳，但向量数量和成本会上升。")
    else:
        notes.append("当前有少量重叠，有助于保留跨片段上下文。")
    if top_k <= 3:
        notes.append("当前 Top K 较小，回答更聚焦，但可能漏掉补充证据。")
    elif top_k >= 8:
        notes.append("当前 Top K 较大，召回更多，但 Prompt 更容易混入弱相关片段。")
    else:
        notes.append("当前 Top K 适中，适合观察检索片段质量。")
    if hybrid:
        notes.append("当前启用了 BM25 + 向量混合检索：向量看语义相似，BM25 看关键词命中。")
    else:
        notes.append("当前关闭了混合检索：结果主要依赖向量相似度，适合和混合检索做对照。")
    if not chunks:
        notes.append("这次没有检索到片段，请换问题、补文档，或调大切片和 Top K。")
    elif evaluation.get("verdict") == "weak_evidence":
        notes.append("这次依据偏弱，建议对比更大的 chunk_size 或更高质量的 embedding 模型。")
    else:
        notes.append("这次有可引用片段，下一步重点检查引用内容是否真的回答了问题。")
    return notes


def save_chat(
    knowledge_base_id: str,
    question: str,
    answer: str,
    citations: List[Dict[str, Any]],
    latency_ms: int,
    session_id: Optional[str] = None,
    model_provider: Optional[str] = None,
    model_name: Optional[str] = None,
) -> str:
    now = now_iso()
    with connect() as conn:
        if session_id:
            existing = conn.execute("SELECT id FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
        else:
            existing = None

        if not existing:
            session_id = new_id("session")
            title = question[:30] or "新的会话"
            conn.execute(
                """
                INSERT INTO chat_sessions (id, knowledge_base_id, title, model_provider, model_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (session_id, knowledge_base_id, title, model_provider, model_name, now, now),
            )
        else:
            conn.execute("UPDATE chat_sessions SET updated_at = ? WHERE id = ?", (now, session_id))

        conn.execute(
            """
            INSERT INTO chat_messages (id, session_id, role, content, citations, latency_ms, created_at)
            VALUES (?, ?, 'user', ?, NULL, NULL, ?)
            """,
            (new_id("msg"), session_id, question, now),
        )
        conn.execute(
            """
            INSERT INTO chat_messages (id, session_id, role, content, citations, latency_ms, created_at)
            VALUES (?, ?, 'assistant', ?, ?, ?, ?)
            """,
            (new_id("msg"), session_id, answer, json.dumps(citations, ensure_ascii=False), latency_ms, now),
        )
    return session_id or ""


def generate_tasks_from_content(content: str, knowledge_base_id: Optional[str] = None) -> List[Dict[str, Any]]:
    sentences = re.split(r"[。！？\n；;]", content)
    tasks: List[Dict[str, Any]] = []
    action_keywords = ("学习", "完成", "整理", "实现", "验证", "搭建", "阅读", "输出", "配置", "上传")
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 6:
            continue
        if not any(keyword in sentence for keyword in action_keywords):
            continue
        title = sentence[:36]
        tasks.append(
            {
                "title": title,
                "description": sentence,
                "status": "todo",
                "priority": "medium",
                "source_type": "ai_answer",
                "source_id": None,
                "knowledge_base_id": knowledge_base_id,
                "ai_reason": "从 AI 回答中识别到可执行动作。",
            }
        )
        if len(tasks) >= 5:
            break
    if not tasks:
        tasks.append(
            {
                "title": "整理下一步行动清单",
                "description": "当前内容没有明显任务，建议先人工确认下一步行动。",
                "status": "todo",
                "priority": "low",
                "source_type": "ai_answer",
                "source_id": None,
                "knowledge_base_id": knowledge_base_id,
                "ai_reason": "内容缺少明确动作，生成兜底任务。",
            }
        )
    return tasks


def mask_api_key(api_key: str) -> str:
    return mask_secret(api_key)
