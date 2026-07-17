"""CrewAI integration for wigolo — local-first web intelligence tools.

The core run functions (:mod:`crewai_wigolo._core`) and input schemas
(:mod:`crewai_wigolo.types`) import cleanly without crewai. The CrewAI tool
classes and the ``wigolo_tools`` factory are imported lazily, so a consumer
without crewai installed only hits an ImportError when they actually touch a
tool — not on ``import crewai_wigolo``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from crewai_wigolo._core import (
    build_client,
    run_crawl,
    run_extract,
    run_fetch,
    run_research,
    run_search,
)
from crewai_wigolo.types import (
    CrawlInput,
    ExtractInput,
    FetchInput,
    ResearchInput,
    SearchInput,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from crewai_wigolo.tools import (
        WigoloCrawlTool,
        WigoloExtractTool,
        WigoloFetchTool,
        WigoloResearchTool,
        WigoloSearchTool,
        wigolo_tools,
    )

_LAZY_TOOL_ATTRS = {
    "WigoloSearchTool",
    "WigoloFetchTool",
    "WigoloResearchTool",
    "WigoloCrawlTool",
    "WigoloExtractTool",
    "wigolo_tools",
}

__all__ = [
    # crewai-free core
    "build_client",
    "run_search",
    "run_fetch",
    "run_research",
    "run_crawl",
    "run_extract",
    # input schemas
    "SearchInput",
    "FetchInput",
    "ResearchInput",
    "CrawlInput",
    "ExtractInput",
    # crewai tools (lazy)
    "WigoloSearchTool",
    "WigoloFetchTool",
    "WigoloResearchTool",
    "WigoloCrawlTool",
    "WigoloExtractTool",
    "wigolo_tools",
]


def __getattr__(name: str) -> Any:
    """Lazily import crewai-backed tool classes on first access."""
    if name in _LAZY_TOOL_ATTRS:
        from crewai_wigolo import tools

        return getattr(tools, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
