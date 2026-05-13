from __future__ import annotations

import re
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


SplitStrategy = Literal["character", "paragraph", "recursive"]

EXAMPLE_TEXT = """# RAG 系统入门

RAG 是 Retrieval-Augmented Generation 的缩写，中文常称为检索增强生成。它的核心思想是先从知识库中检索相关资料，再让大模型基于资料生成回答。

## 为什么需要文本切分

企业文档通常很长，可能是 PDF、Word、网页、接口文档或测试方案。大模型和向量数据库都不适合直接处理一整本长文档，所以需要把文档拆成多个 chunk。

好的 chunk 应该语义完整，长度适中，并且能被用户问题准确召回。如果 chunk 太短，容易丢上下文；如果 chunk 太长，容易混入噪声，影响检索和回答。

## chunk size 和 overlap

chunk size 控制每个切片的最大长度。overlap 控制相邻切片之间保留多少重复文本。适当 overlap 可以避免答案刚好落在两个切片边界时被切断。

## 常见切分方式

基础方式是按固定字符长度切分。更好的方式是优先按标题、段落、句子等自然边界切分。递归切分会先尝试大分隔符，再尝试小分隔符，最后才按字符硬切。

## 和 Embedding 的关系

文本切分之后，每个 chunk 会单独做 embedding，并写入向量数据库。用户提问时，问题也会做 embedding，然后和 chunk 向量计算相似度，召回最相关的 chunk。
"""


class SplitRequest(BaseModel):
    text: str = Field(min_length=1)
    strategy: SplitStrategy = "recursive"
    chunkSize: int = Field(default=260, ge=40, le=2000)
    overlap: int = Field(default=60, ge=0, le=800)


app = FastAPI(title="文本切分实验室 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def chunk_with_overlap(parts: list[str], chunk_size: int, overlap: int) -> list[dict]:
    chunks: list[dict] = []
    cursor = 0
    previous_tail = ""

    for part in parts:
        clean = part.strip()
        if not clean:
            cursor += len(part)
            continue

        start = cursor
        while clean:
            prefix = previous_tail[-overlap:] if overlap and previous_tail else ""
            body_limit = max(1, chunk_size - len(prefix))
            body = clean[:body_limit]
            clean = clean[body_limit:]
            text = f"{prefix}{body}" if prefix else body
            chunks.append(
                {
                    "id": f"chunk-{len(chunks) + 1}",
                    "text": text,
                    "start": start,
                    "end": start + len(body),
                    "length": len(text),
                    "overlapPrefix": len(prefix),
                }
            )
            previous_tail = text
            start += len(body)
        cursor += len(part)

    return chunks


def split_character(text: str, chunk_size: int, overlap: int) -> list[dict]:
    chunks = []
    step = max(1, chunk_size - overlap)
    for index, start in enumerate(range(0, len(text), step)):
        end = min(len(text), start + chunk_size)
        value = text[start:end]
        if not value.strip():
            continue
        chunks.append(
            {
                "id": f"chunk-{len(chunks) + 1}",
                "text": value,
                "start": start,
                "end": end,
                "length": len(value),
                "overlapPrefix": overlap if index > 0 else 0,
            }
        )
        if end >= len(text):
            break
    return chunks


def split_paragraph(text: str, chunk_size: int, overlap: int) -> list[dict]:
    paragraphs = re.split(r"(\n\s*\n)", text)
    merged = []
    buffer = ""
    for part in paragraphs:
        if not part.strip():
            if buffer:
                buffer += part
            continue
        candidate = f"{buffer}{part}" if buffer else part
        if len(candidate) <= chunk_size:
            buffer = candidate
        else:
            if buffer:
                merged.append(buffer)
            buffer = part
    if buffer:
        merged.append(buffer)
    return chunk_with_overlap(merged, chunk_size, overlap)


def recursive_units(text: str, chunk_size: int) -> list[str]:
    separators = ["\n## ", "\n# ", "\n\n", "。", "；", "\n", "，", " "]
    units = [text]
    for separator in separators:
        next_units = []
        changed = False
        for unit in units:
            if len(unit) <= chunk_size:
                next_units.append(unit)
                continue
            pieces = split_keep_separator(unit, separator)
            if len(pieces) == 1:
                next_units.append(unit)
            else:
                changed = True
                next_units.extend(pieces)
        units = next_units
        if changed and all(len(unit) <= chunk_size for unit in units):
            break
    return units


def split_keep_separator(text: str, separator: str) -> list[str]:
    if separator not in text:
        return [text]
    pieces = text.split(separator)
    result = []
    for index, piece in enumerate(pieces):
        if not piece:
            continue
        prefix = separator if index > 0 else ""
        result.append(f"{prefix}{piece}")
    return result


def split_recursive(text: str, chunk_size: int, overlap: int) -> list[dict]:
    units = recursive_units(text, chunk_size)
    merged = []
    buffer = ""
    for unit in units:
        candidate = f"{buffer}{unit}" if buffer else unit
        if len(candidate) <= chunk_size:
            buffer = candidate
            continue
        if buffer:
            merged.append(buffer)
        if len(unit) > chunk_size:
            merged.extend([unit[index:index + chunk_size] for index in range(0, len(unit), chunk_size)])
            buffer = ""
        else:
            buffer = unit
    if buffer:
        merged.append(buffer)
    return chunk_with_overlap(merged, chunk_size, overlap)


def split_text(payload: SplitRequest) -> dict:
    text = normalize_text(payload.text)
    overlap = min(payload.overlap, max(0, payload.chunkSize - 1))
    if payload.strategy == "character":
        chunks = split_character(text, payload.chunkSize, overlap)
    elif payload.strategy == "paragraph":
        chunks = split_paragraph(text, payload.chunkSize, overlap)
    else:
        chunks = split_recursive(text, payload.chunkSize, overlap)

    return {
        "strategy": payload.strategy,
        "chunkSize": payload.chunkSize,
        "overlap": overlap,
        "sourceLength": len(text),
        "chunkCount": len(chunks),
        "chunks": chunks,
        "quality": quality_summary(chunks, payload.chunkSize),
    }


def quality_summary(chunks: list[dict], chunk_size: int) -> dict:
    if not chunks:
        return {"avgLength": 0, "tooShort": 0, "tooLong": 0, "boundaryRisk": 0}
    lengths = [chunk["length"] for chunk in chunks]
    too_short = sum(1 for value in lengths if value < chunk_size * 0.35)
    too_long = sum(1 for value in lengths if value > chunk_size * 1.08)
    boundary_risk = sum(1 for chunk in chunks if not chunk["text"].endswith(("。", "\n", "！", "？", ".", ":", "：")))
    return {
        "avgLength": round(sum(lengths) / len(lengths), 1),
        "tooShort": too_short,
        "tooLong": too_long,
        "boundaryRisk": boundary_risk,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "strategies": ["character", "paragraph", "recursive"]}


@app.get("/api/example")
def example() -> dict:
    return {"text": EXAMPLE_TEXT}


@app.post("/api/split")
def split_api(payload: SplitRequest) -> dict:
    return split_text(payload)
