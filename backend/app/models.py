from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class AppBaseModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class KnowledgeBaseCreate(AppBaseModel):
    name: str = Field(min_length=1, max_length=50)
    description: str = Field(default="", max_length=500)


class KnowledgeBaseUpdate(AppBaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)


class KnowledgeBaseDeleteRequest(AppBaseModel):
    delete_documents: bool = True


class KnowledgeBaseOut(AppBaseModel):
    id: str
    name: str
    description: str
    document_count: int
    created_at: str
    updated_at: str


class DocumentOut(AppBaseModel):
    id: str
    knowledge_base_id: str
    file_name: str
    file_type: str
    file_size: int
    status: str
    summary: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class DocumentUpdate(AppBaseModel):
    file_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    content: Optional[str] = Field(default=None, min_length=1)


class Citation(AppBaseModel):
    document_id: str
    document_name: str
    chunk_id: str
    chunk_index: int
    snippet: str
    score: float


class ChatRequest(AppBaseModel):
    knowledge_base_id: str
    question: str = Field(min_length=1, max_length=2000)
    session_id: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None


class ChatResponse(AppBaseModel):
    session_id: str
    answer: str
    citations: List[Citation]
    used_fallback: bool = False
    warning: Optional[str] = None


class ChatSessionUpdate(AppBaseModel):
    title: str = Field(min_length=1, max_length=80)


class TaskCreate(AppBaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = ""
    status: Literal["todo", "doing", "done", "canceled"] = "todo"
    priority: Literal["high", "medium", "low"] = "medium"
    source_type: str = "manual"
    source_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    ai_reason: Optional[str] = None


class TaskUpdate(AppBaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    status: Optional[Literal["todo", "doing", "done", "canceled"]] = None
    priority: Optional[Literal["high", "medium", "low"]] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    ai_reason: Optional[str] = None


class TaskOut(AppBaseModel):
    id: str
    title: str
    description: str
    status: str
    priority: str
    source_type: str
    source_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    ai_reason: Optional[str] = None
    created_at: str
    updated_at: str


class TaskGenerateRequest(AppBaseModel):
    source_message_id: Optional[str] = None
    content: str = Field(min_length=1)
    knowledge_base_id: Optional[str] = None


class TaskGenerateResponse(AppBaseModel):
    tasks: List[TaskCreate]


class ModelConfigCreate(AppBaseModel):
    provider: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    default_model: str = Field(min_length=1)
    enabled: bool = True


class ModelConfigUpdate(AppBaseModel):
    provider: Optional[str] = Field(default=None, min_length=1)
    base_url: Optional[str] = Field(default=None, min_length=1)
    api_key: Optional[str] = Field(default=None, min_length=1)
    default_model: Optional[str] = Field(default=None, min_length=1)
    enabled: Optional[bool] = None


class ModelConfigOut(AppBaseModel):
    id: str
    provider: str
    base_url: str
    api_key_masked: str
    default_model: str
    enabled: bool
    created_at: str
    updated_at: str


class ModelConfigTestRequest(AppBaseModel):
    provider: str
    base_url: str
    api_key: str
    default_model: str


class ModelConfigTestResponse(AppBaseModel):
    ok: bool
    message: str


class ApiError(AppBaseModel):
    code: str
    message: str
    detail: Optional[Any] = None


class LiveTrendExplanationBatch(AppBaseModel):
    urls: List[str] = Field(default_factory=list)


class LiveTrendExplanationGenerate(AppBaseModel):
    url: str = Field(min_length=4, max_length=2048)
    source_title: str = Field(min_length=1, max_length=200)
    item: Dict[str, Any] = Field(default_factory=dict)
    force: bool = False
