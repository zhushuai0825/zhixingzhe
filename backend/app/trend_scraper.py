from __future__ import annotations

import html
import json
import re
import time
from typing import Any, Dict, List, Tuple

import requests


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}
_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_SECONDS = 300


def fetch_live_trends(force: bool = False) -> Dict[str, Any]:
    cache_key = "live_trends"
    cached = _CACHE.get(cache_key)
    if cached and not force and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    github_python = safe_fetch_github("https://github.com/trending/python", "GitHub Python")
    github_all = safe_fetch_github("https://github.com/trending", "GitHub 全部")
    hf_spaces = safe_fetch_hf_spaces("https://huggingface.co/spaces")
    hf_papers = safe_fetch_hf_papers("https://huggingface.co/papers/trending")
    data = {
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "sources": [github_python, github_all, hf_spaces, hf_papers],
        "items": github_python["items"][:5] + github_all["items"][:5] + hf_spaces["items"][:5] + hf_papers["items"][:5],
    }
    _CACHE[cache_key] = (time.time(), data)
    return data


def trends_to_markdown(source: Dict[str, Any]) -> str:
    title = source.get("title", "实时趋势")
    url = source.get("url", "")
    lines = [
        f"# {title}实时数据",
        "",
        f"- 来源：{url}",
        f"- 抓取时间：{time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "| 名称 | 类型/语言 | 热度 | 今日新增 | 链接 | 摘要 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for item in source.get("items", []):
        heat = item.get("stars") or ""
        today = item.get("today") or ""
        if item.get("source") == "huggingface":
            heat = f"{heat} likes" if heat else ""
        lines.append(
            "| {name} | {language} | {heat} | {today} | {url} | {description} |".format(
                name=escape_markdown_cell(item.get("title") or item.get("name") or ""),
                language=escape_markdown_cell(item.get("language") or item.get("source") or ""),
                heat=escape_markdown_cell(heat),
                today=escape_markdown_cell(today),
                url=escape_markdown_cell(item.get("url") or ""),
                description=escape_markdown_cell(item.get("description") or item.get("authors") or ""),
            )
        )
    return "\n".join(lines) + "\n"


def escape_markdown_cell(value: str) -> str:
    return clean_plain(value).replace("|", "\\|")


def safe_fetch_github(url: str, title: str) -> Dict[str, Any]:
    try:
        return {"title": title, "url": url, "status": "ok", "items": fetch_github_trending(url)}
    except Exception as exc:
        return {"title": title, "url": url, "status": "failed", "error": str(exc), "items": []}


def safe_fetch_hf_papers(url: str) -> Dict[str, Any]:
    try:
        return {"title": "Hugging Face 论文", "url": url, "status": "ok", "items": fetch_hf_papers(url)}
    except Exception as exc:
        return {"title": "Hugging Face 论文", "url": url, "status": "failed", "error": str(exc), "items": []}


def safe_fetch_hf_spaces(url: str) -> Dict[str, Any]:
    try:
        return {"title": "Hugging Face Spaces", "url": url, "status": "ok", "items": fetch_hf_spaces(url)}
    except Exception as exc:
        return {"title": "Hugging Face Spaces", "url": url, "status": "failed", "error": str(exc), "items": []}


def request_text(url: str) -> str:
    response = requests.get(url, headers=HEADERS, timeout=25)
    response.raise_for_status()
    return response.text


def fetch_github_trending(url: str, limit: int = 10) -> List[Dict[str, Any]]:
    page = request_text(url)
    articles = page.split('<article class="Box-row">')[1:]
    items: List[Dict[str, Any]] = []
    for article in articles[:limit]:
        name_match = re.search(r'<h2[^>]*>.*?<a[^>]*href="/([^"]+)"[^>]*>(.*?)</a>', article, re.S)
        if not name_match:
            continue
        name = clean_html(name_match.group(1))
        desc_match = re.search(r'<p[^>]*class="[^"]*col-9[^"]*"[^>]*>(.*?)</p>', article, re.S)
        language_match = re.search(r'itemprop="programmingLanguage">([^<]+)<', article)
        today_match = re.search(r'([\d,]+)\s+stars today', article)
        star_match = re.search(r'/stargazers"[^>]*>(.*?)</a>', article, re.S)
        fork_match = re.search(r'/forks"[^>]*>(.*?)</a>', article, re.S)
        items.append(
            {
                "source": "github",
                "name": name,
                "title": name,
                "description": clean_html(desc_match.group(1)) if desc_match else "",
                "language": clean_html(language_match.group(1)) if language_match else "",
                "stars": extract_number(star_match.group(1)) if star_match else "",
                "forks": extract_number(fork_match.group(1)) if fork_match else "",
                "today": today_match.group(1) if today_match else "",
                "url": f"https://github.com/{name}",
            }
        )
    return items


def fetch_hf_papers(url: str, limit: int = 10) -> List[Dict[str, Any]]:
    page = request_text(url)
    props = extract_hydrater_props(page, "DailyPapers")
    papers = props.get("dailyPapers", []) if isinstance(props, dict) else []
    items: List[Dict[str, Any]] = []
    for entry in papers[:limit]:
        paper = entry.get("paper", {})
        paper_id = paper.get("id", "")
        title = paper.get("title", "")
        authors = paper.get("authors", [])
        items.append(
            {
                "source": "huggingface",
                "name": paper_id,
                "title": title,
                "description": clean_plain(paper.get("summary", ""))[:180],
                "language": "paper",
                "stars": entry.get("numLikes", paper.get("upvotes", "")) or "",
                "forks": "",
                "today": "",
                "authors": "、".join(author.get("name", "") for author in authors[:3] if author.get("name")),
                "url": f"https://huggingface.co/papers/{paper_id}" if paper_id else url,
            }
        )
    if items:
        return items

    links = re.findall(r'href="(/papers/[^"]+)"[^>]*>(.*?)</a>', page, re.S)
    seen = set()
    for href, label in links:
        title = clean_html(label)
        paper_id = href.rsplit("/", 1)[-1]
        if not title or paper_id in seen:
            continue
        seen.add(paper_id)
        items.append(
            {
                "source": "huggingface",
                "name": paper_id,
                "title": title,
                "description": "",
                "language": "paper",
                "stars": "",
                "forks": "",
                "today": "",
                "url": f"https://huggingface.co{href}",
            }
        )
        if len(items) >= limit:
            break
    return items


def fetch_hf_spaces(url: str, limit: int = 10) -> List[Dict[str, Any]]:
    page = request_text(url)
    cards = re.findall(r'<article[^>]*class="[^"]*"[^>]*>(.*?)</article>', page, re.S)
    items: List[Dict[str, Any]] = []
    seen = set()
    for card in cards:
        link_match = re.search(r'href="/spaces/([^"]+)"', card)
        title_match = re.search(r'href="/spaces/[^"]+"[^>]*>(.*?)</a>', card, re.S)
        if not link_match:
            continue
        name = clean_html(link_match.group(1))
        if name in seen:
            continue
        seen.add(name)
        title = clean_html(title_match.group(1)) if title_match else name
        likes_match = re.search(r'([\d,]+)\s*</[^>]+>\s*</[^>]+>\s*<[^>]+>\s*like', card, re.I)
        items.append(
            {
                "source": "huggingface",
                "name": name,
                "title": title or name,
                "description": "",
                "language": "space",
                "stars": likes_match.group(1) if likes_match else "",
                "forks": "",
                "today": "",
                "url": f"https://huggingface.co/spaces/{name}",
            }
        )
        if len(items) >= limit:
            break
    if items:
        return items

    links = re.findall(r'href="/spaces/([^"]+)"[^>]*>(.*?)</a>', page, re.S)
    for name, label in links:
        name = clean_html(name)
        if not name or name in seen:
            continue
        seen.add(name)
        items.append(
            {
                "source": "huggingface",
                "name": name,
                "title": clean_html(label) or name,
                "description": "",
                "language": "space",
                "stars": "",
                "forks": "",
                "today": "",
                "url": f"https://huggingface.co/spaces/{name}",
            }
        )
        if len(items) >= limit:
            break
    return items


def extract_hydrater_props(page: str, target: str) -> Dict[str, Any]:
    marker = f'data-target="{target}" data-props="'
    start = page.find(marker)
    if start < 0:
        return {}
    start += len(marker)
    end = page.find('"', start)
    if end < 0:
        return {}
    encoded = page[start:end]
    decoded = html.unescape(encoded)
    return json.loads(decoded)


def clean_html(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return clean_plain(html.unescape(value))


def clean_plain(value: str) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def extract_number(value: str) -> str:
    text = clean_html(value)
    match = re.search(r"[\d,]+", text)
    return match.group(0) if match else ""
