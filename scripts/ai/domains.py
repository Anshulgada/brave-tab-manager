"""Curated domain taxonomies, realistic tab templates, and topic clusters for Tabman.

Contains high-fidelity web entities, path schemas, title patterns, and
hard-negative pairs across 12 distinct web domain verticals.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TabTemplate:
    """A realistic browser tab representation."""

    url: str
    title: str
    content_type: str
    domain: str
    sub_topic: str
    tags: tuple[str, ...] = field(default_factory=tuple)

    @property
    def formatted_text(self) -> str:
        """Formatted representation for embedding models."""
        return f"{self.title} | {self.url} [{self.content_type}]"


# 12 Curated Domain Verticals with realistic, high-fidelity tab templates
DOMAIN_TAXONOMY: dict[str, list[TabTemplate]] = {
    # Vertical 1: Frontend & UI Engineering
    "frontend_dev": [
        TabTemplate(
            url="https://react.dev/learn/synchronizing-with-effects",
            title="Synchronizing with Effects - React Official Documentation",
            content_type="documentation",
            domain="frontend_dev",
            sub_topic="react_hooks",
            tags=("react", "hooks", "frontend", "javascript"),
        ),
        TabTemplate(
            url="https://github.com/facebook/react/issues/24502",
            title=(
                "Issue #24502: useEffect firing twice on initial mount in StrictMode"
                " - facebook/react"
            ),
            content_type="code_issue",
            domain="frontend_dev",
            sub_topic="react_hooks",
            tags=("react", "github", "bug", "frontend"),
        ),
        TabTemplate(
            url="https://github.com/facebook/react/pull/28231",
            title=(
                "feat(react-compiler): add memoization analysis for custom hook deps"
                " - facebook/react"
            ),
            content_type="code_pull",
            domain="frontend_dev",
            sub_topic="react_hooks",
            tags=("react", "compiler", "pr", "frontend"),
        ),
        TabTemplate(
            url=(
                "https://nextjs.org/docs/app/building-your-application/routing/"
                "server-components"
            ),
            title="React Server Components (RSC) & Streaming SSR - Next.js Docs",
            content_type="documentation",
            domain="frontend_dev",
            sub_topic="nextjs_rsc",
            tags=("nextjs", "react", "rsc", "frontend"),
        ),
        TabTemplate(
            url="https://tailwindcss.com/docs/grid-template-columns",
            title="Grid Template Columns - Core Utility Plugins - Tailwind CSS",
            content_type="documentation",
            domain="frontend_dev",
            sub_topic="styling_css",
            tags=("tailwind", "css", "grid", "frontend"),
        ),
        TabTemplate(
            url="https://vite.dev/config/shared-options.html",
            title="Configuring Shared Build and Server Options - Vite Official Guide",
            content_type="documentation",
            domain="frontend_dev",
            sub_topic="tooling_vite",
            tags=("vite", "bundler", "tooling", "frontend"),
        ),
        TabTemplate(
            url="https://github.com/vercel/next.js/discussions/54911",
            title=(
                "Discussion: Turbopack vs Webpack caching in Next 15 - vercel/next.js"
            ),
            content_type="discussion",
            domain="frontend_dev",
            sub_topic="nextjs_rsc",
            tags=("nextjs", "turbopack", "webpack", "frontend"),
        ),
        TabTemplate(
            url=(
                "https://tanstack.com/query/v5/docs/framework/react/guides/"
                "query-cancellation"
            ),
            title="Query Cancellation & AbortSignal Integration - TanStack Query v5",
            content_type="documentation",
            domain="frontend_dev",
            sub_topic="state_query",
            tags=("tanstack", "query", "async", "frontend"),
        ),
    ],
    # Vertical 2: Backend & Systems Engineering
    "backend_systems": [
        TabTemplate(
            url="https://docs.rs/tokio/latest/tokio/sync/mpsc/index.html",
            title="tokio::sync::mpsc - Multi-producer, single-consumer async channels",
            content_type="documentation",
            domain="backend_systems",
            sub_topic="rust_async",
            tags=("rust", "tokio", "async", "backend"),
        ),
        TabTemplate(
            url="https://github.com/tokio-rs/tokio/issues/5211",
            title=(
                "Task starvation when worker thread handles uncooperative futures - "
                "tokio-rs/tokio"
            ),
            content_type="code_issue",
            domain="backend_systems",
            sub_topic="rust_async",
            tags=("rust", "tokio", "concurrency", "backend"),
        ),
        TabTemplate(
            url="https://fastapi.tiangolo.com/advanced/custom-response/",
            title="Custom Response - HTML, Streaming, and ORJSON - FastAPI",
            content_type="documentation",
            domain="backend_systems",
            sub_topic="python_api",
            tags=("python", "fastapi", "async", "backend"),
        ),
        TabTemplate(
            url="https://www.postgresql.org/docs/current/explicit-locking.html",
            title="Explicit Locking & Table vs Row Locks - PostgreSQL Documentation",
            content_type="documentation",
            domain="backend_systems",
            sub_topic="database_sql",
            tags=("postgres", "sql", "concurrency", "database"),
        ),
        TabTemplate(
            url="https://github.com/redis/redis/pull/12830",
            title="Improve memory efficiency of radix tree encoding - redis/redis",
            content_type="code_pull",
            domain="backend_systems",
            sub_topic="database_cache",
            tags=("redis", "cache", "performance", "backend"),
        ),
        TabTemplate(
            url="https://go.dev/doc/effective_go",
            title="Effective Go - Concurrency with Goroutines - Go Documentation",
            content_type="documentation",
            domain="backend_systems",
            sub_topic="go_concurrency",
            tags=("golang", "goroutines", "concurrency", "backend"),
        ),
        TabTemplate(
            url="https://github.com/golang/go/issues/64103",
            title="runtime: GC mark termination pause regression - golang/go",
            content_type="code_issue",
            domain="backend_systems",
            sub_topic="go_concurrency",
            tags=("golang", "gc", "performance", "systems"),
        ),
    ],
    # Vertical 3: Machine Learning & AI
    "ml_ai": [
        TabTemplate(
            url=(
                "https://pytorch.org/docs/stable/generated/"
                "torch.nn.functional.scaled_dot_product_attention.html"
            ),
            title="scaled_dot_product_attention - FlashAttention-2 Kernels - PyTorch",
            content_type="documentation",
            domain="ml_ai",
            sub_topic="pytorch_transformers",
            tags=("pytorch", "cuda", "transformers", "ai"),
        ),
        TabTemplate(
            url="https://github.com/huggingface/transformers/pull/31420",
            title=(
                "Add Gemma 2 & EmbeddingGemma model definitions - "
                "huggingface/transformers"
            ),
            content_type="code_pull",
            domain="ml_ai",
            sub_topic="huggingface_models",
            tags=("transformers", "gemma", "embeddings", "ai"),
        ),
        TabTemplate(
            url="https://ollama.com/library/gemma2:9b",
            title="gemma2:9b - Google Gemma 2 instruct model - Ollama Library",
            content_type="documentation",
            domain="ml_ai",
            sub_topic="local_llms",
            tags=("ollama", "gemma", "local-ai", "llm"),
        ),
        TabTemplate(
            url=(
                "https://ai.google.dev/gemma/docs/embeddinggemma/"
                "fine-tuning-embeddinggemma-with-sentence-transformers"
            ),
            title="Fine-tune EmbeddingGemma with Sentence Transformers - Google AI",
            content_type="tutorial",
            domain="ml_ai",
            sub_topic="embedding_tuning",
            tags=("google", "gemma", "fine-tuning", "sentence-transformers"),
        ),
        TabTemplate(
            url="https://github.com/vllm-project/vllm/issues/7412",
            title="PagedAttention KV cache fragmentation - vllm-project/vllm",
            content_type="code_issue",
            domain="ml_ai",
            sub_topic="llm_inference",
            tags=("vllm", "cuda", "serving", "ai"),
        ),
        TabTemplate(
            url=(
                "https://huggingface.co/docs/sentence-transformers/"
                "package_reference/trainer"
            ),
            title="SentenceTransformerTrainer & MultipleNegativesRankingLoss - HF",
            content_type="documentation",
            domain="ml_ai",
            sub_topic="embedding_tuning",
            tags=("sentence-transformers", "embeddings", "trainer", "ml"),
        ),
    ],
    # Vertical 4: API References & Web Standards
    "api_docs": [
        TabTemplate(
            url=(
                "https://developer.mozilla.org/en-US/docs/Web/API/"
                "Web_Workers_API/Using_web_workers"
            ),
            title="Using Web Workers - MDN Web Docs",
            content_type="documentation",
            domain="api_docs",
            sub_topic="web_apis",
            tags=("mdn", "workers", "javascript", "browser"),
        ),
        TabTemplate(
            url=(
                "https://developer.mozilla.org/en-US/docs/Web/API/"
                "IndexedDB_API/Using_IndexedDB"
            ),
            title="Using IndexedDB - Key-value Stores & Transactions - MDN Web Docs",
            content_type="documentation",
            domain="api_docs",
            sub_topic="web_apis",
            tags=("mdn", "indexeddb", "storage", "browser"),
        ),
        TabTemplate(
            url="https://docs.stripe.com/api/payment_intents/create",
            title="Create a PaymentIntent - API Reference - Stripe Documentation",
            content_type="documentation",
            domain="api_docs",
            sub_topic="payment_apis",
            tags=("stripe", "payments", "api", "fintech"),
        ),
        TabTemplate(
            url="https://docs.github.com/en/rest/pulls/pulls#list-pull-requests",
            title="List pull requests for a repository - GitHub REST API Docs",
            content_type="documentation",
            domain="api_docs",
            sub_topic="rest_apis",
            tags=("github", "api", "rest", "git"),
        ),
    ],
    # Vertical 5: Research & Academic Papers
    "research_papers": [
        TabTemplate(
            url="https://arxiv.org/abs/1706.03762",
            title="[1706.03762] Attention Is All You Need - Vaswani et al. - arXiv",
            content_type="paper",
            domain="research_papers",
            sub_topic="deep_learning",
            tags=("arxiv", "attention", "transformer", "paper"),
        ),
        TabTemplate(
            url="https://arxiv.org/abs/2205.13147",
            title="[2205.13147] Matryoshka Representation Learning (MRL) - arXiv",
            content_type="paper",
            domain="research_papers",
            sub_topic="embeddings_research",
            tags=("arxiv", "mrl", "embeddings", "paper"),
        ),
        TabTemplate(
            url="https://arxiv.org/abs/2403.08295",
            title="[2403.08295] Gemma: Open Models Based on Gemini Research - arXiv",
            content_type="paper",
            domain="research_papers",
            sub_topic="llm_architectures",
            tags=("arxiv", "gemma", "gemini", "paper"),
        ),
        TabTemplate(
            url="https://paperswithcode.com/sota/semantic-textual-similarity-on-mteb",
            title="MTEB Benchmark: Text Embedding Leaderboard - Papers with Code",
            content_type="benchmark",
            domain="research_papers",
            sub_topic="embeddings_research",
            tags=("mteb", "embeddings", "benchmark", "research"),
        ),
    ],
    # Vertical 6: Video & Tutorials
    "video_tutorials": [
        TabTemplate(
            url="https://www.youtube.com/watch?v=kYv3kX_k6q4",
            title="TypeScript 5.5 Full Course - Inferred Type Predicates Explained",
            content_type="video",
            domain="video_tutorials",
            sub_topic="coding_videos",
            tags=("youtube", "typescript", "course", "video"),
        ),
        TabTemplate(
            url="https://www.youtube.com/watch?v=SqcY0GlETPk",
            title="React 19 in 100 Seconds - Server Actions and use() Hook - Fireship",
            content_type="video",
            domain="video_tutorials",
            sub_topic="coding_videos",
            tags=("youtube", "react", "fireship", "video"),
        ),
        TabTemplate(
            url="https://www.youtube.com/watch?v=M576WGiDBdQ",
            title="Build a Local Vector Database from Scratch in Rust - Full Guide",
            content_type="video",
            domain="video_tutorials",
            sub_topic="systems_videos",
            tags=("youtube", "rust", "vector-db", "video"),
        ),
        TabTemplate(
            url="https://www.youtube.com/watch?v=b4wHhI2qM3E",
            title="Lofi Hip Hop Radio - Beats to Relax/Study to - Lofi Girl",
            content_type="music_stream",
            domain="video_tutorials",
            sub_topic="music_livestream",
            tags=("youtube", "music", "lofi", "stream"),
        ),
    ],
    # Vertical 7: Community Discussions & Problem Solving
    "community_discussions": [
        TabTemplate(
            url=(
                "https://stackoverflow.com/questions/53120972/"
                "how-to-fix-cannot-read-properties-of-undefined-reading-map"
            ),
            title=(
                "js - How to fix TypeError: Cannot read properties of undefined "
                "- Stack Overflow"
            ),
            content_type="troubleshooting",
            domain="community_discussions",
            sub_topic="javascript_help",
            tags=("stackoverflow", "javascript", "debugging", "help"),
        ),
        TabTemplate(
            url="https://news.ycombinator.com/item?id=40192841",
            title="Ask HN: Offline-first workflow for tab management?",
            content_type="discussion",
            domain="community_discussions",
            sub_topic="hacker_news",
            tags=("hackernews", "offline-first", "tabs", "discussion"),
        ),
        TabTemplate(
            url=(
                "https://www.reddit.com/r/webdev/comments/1c30xla/"
                "why_is_state_management_still_so_fragmented_in_2026/"
            ),
            title="State management in 2026: Zustand vs Signals : r/webdev",
            content_type="discussion",
            domain="community_discussions",
            sub_topic="reddit_tech",
            tags=("reddit", "webdev", "state-management", "discussion"),
        ),
        TabTemplate(
            url=(
                "https://www.reddit.com/r/MachineLearning/comments/1d49102/"
                "r_the_unreasonable_effectiveness_of_matryoshka_embeddings/"
            ),
            title="[R] Matryoshka embeddings in RAG systems : r/MachineLearning",
            content_type="discussion",
            domain="community_discussions",
            sub_topic="reddit_ml",
            tags=("reddit", "machinelearning", "embeddings", "mrl"),
        ),
    ],
    # Vertical 8: Cloud, Infrastructure & DevOps
    "cloud_devops": [
        TabTemplate(
            url=(
                "https://us-east-1.console.aws.amazon.com/ecs/v2/clusters/"
                "production-cluster/services"
            ),
            title="Amazon ECS Clusters > production-cluster - AWS Console",
            content_type="cloud_console",
            domain="cloud_devops",
            sub_topic="aws_ecs",
            tags=("aws", "ecs", "containers", "devops"),
        ),
        TabTemplate(
            url="https://vercel.com/my-org/tabman-docs/deployments/dpl_82k930fa019",
            title="Deployment dpl_82k930fa019 Overview & Realtime Logs - Vercel",
            content_type="cloud_console",
            domain="cloud_devops",
            sub_topic="vercel_deploy",
            tags=("vercel", "deployments", "ci", "devops"),
        ),
        TabTemplate(
            url=(
                "https://dash.cloudflare.com/83910283/workers/services/view/"
                "tabman-auth/production"
            ),
            title="Cloudflare Workers > tabman-auth > Production Metrics & Tail Logs",
            content_type="cloud_console",
            domain="cloud_devops",
            sub_topic="cloudflare_workers",
            tags=("cloudflare", "workers", "serverless", "devops"),
        ),
        TabTemplate(
            url="https://docs.docker.com/compose/compose-file/05-services/",
            title="Compose file spec: Services and healthcheck - Docker Docs",
            content_type="documentation",
            domain="cloud_devops",
            sub_topic="docker_compose",
            tags=("docker", "containers", "compose", "devops"),
        ),
    ],
    # Vertical 9: Hardware, Tech Specs & Shopping
    "shopping_hardware": [
        TabTemplate(
            url="https://www.nvidia.com/en-us/design-visualization/rtx-6000/",
            title="NVIDIA RTX 6000 Ada Generation - 48GB GDDR6 Workstation GPU",
            content_type="product_spec",
            domain="shopping_hardware",
            sub_topic="gpu_hardware",
            tags=("nvidia", "gpu", "ada-6000", "hardware"),
        ),
        TabTemplate(
            url="https://pcpartpicker.com/list/kF73Qq",
            title="Ryzen 9 7950X, RTX 6000 Ada Workstation - PCPartPicker",
            content_type="hardware_build",
            domain="shopping_hardware",
            sub_topic="pc_parts",
            tags=("pcpartpicker", "workstation", "hardware", "specs"),
        ),
        TabTemplate(
            url="https://www.amazon.com/dp/B0CK2QJ6F1",
            title="LG 38WN95C-W 38 Inch UltraWide Curved QHD+ Monitor - Amazon",
            content_type="shopping",
            domain="shopping_hardware",
            sub_topic="monitors",
            tags=("amazon", "monitor", "ultrawide", "shopping"),
        ),
        TabTemplate(
            url=(
                "https://keychron.com/products/"
                "keychron-q1-pro-qmk-via-wireless-custom-mechanical-keyboard"
            ),
            title="Keychron Q1 Pro Wireless Custom Mechanical Keyboard - Keychron",
            content_type="shopping",
            domain="shopping_hardware",
            sub_topic="keyboards",
            tags=("keychron", "mechanical-keyboard", "hardware", "shopping"),
        ),
    ],
    # Vertical 10: Design, Fonts & Creative Inspiration
    "design_ui": [
        TabTemplate(
            url="https://www.figma.com/design/9kQZ1a9J0/Tabman-Design-System-2.0",
            title="Tabman Design System 2.0 - Components, Tokens, Shadows - Figma",
            content_type="design_file",
            domain="design_ui",
            sub_topic="figma_systems",
            tags=("figma", "design", "tokens", "ui"),
        ),
        TabTemplate(
            url="https://fonts.google.com/specimen/Space+Grotesk",
            title="Space Grotesk - Monospaced-derived Sans Serif - Google Fonts",
            content_type="typography",
            domain="design_ui",
            sub_topic="typography",
            tags=("fonts", "space-grotesk", "typography", "design"),
        ),
        TabTemplate(
            url="https://dribbble.com/shots/23901928-Productivity-Dashboard-Dark-Mode-UI",
            title="Productivity Dashboard Dark Mode UI & Glassmorphism by Studio Seven",
            content_type="inspiration",
            domain="design_ui",
            sub_topic="dribbble_ui",
            tags=("dribbble", "ui", "inspiration", "design"),
        ),
    ],
    # Vertical 11: Productivity, Project Management & Workspaces
    "productivity_tools": [
        TabTemplate(
            url=(
                "https://linear.app/tabman-team/issue/TAB-104/"
                "tab-discovery-research-implementation"
            ),
            title="TAB-104: Tab discovery research and local model - Linear",
            content_type="task_management",
            domain="productivity_tools",
            sub_topic="linear_tasks",
            tags=("linear", "project-management", "tasks", "work"),
        ),
        TabTemplate(
            url="https://notion.so/workspace/Tabman-Architecture-RFC-03810283",
            title="Tabman Architecture RFC: Persistent Hash Routing - Notion",
            content_type="document",
            domain="productivity_tools",
            sub_topic="notion_notes",
            tags=("notion", "docs", "rfc", "productivity"),
        ),
        TabTemplate(
            url="https://docs.google.com/document/d/1yZk3810_2kL90fa2/edit",
            title="Q4 2026 Engineering Roadmap & Milestones - Google Docs",
            content_type="document",
            domain="productivity_tools",
            sub_topic="google_docs",
            tags=("google-docs", "roadmap", "work", "productivity"),
        ),
    ],
    # Vertical 12: Internal Browser Utilities & Localhost
    "internal_localhost": [
        TabTemplate(
            url=(
                "chrome-extension://mjdcmeijkjiiaigacpbdbgieldgfilmo/"
                "dashboard.html#/organize"
            ),
            title="Tabman Dashboard - Smart Organize Kanban Board",
            content_type="internal_tab",
            domain="internal_localhost",
            sub_topic="tabman_internal",
            tags=("tabman", "dashboard", "extension", "internal"),
        ),
        TabTemplate(
            url="brave://extensions/",
            title="Extensions - Brave Browser Internal Settings & Developer Mode",
            content_type="internal_tab",
            domain="internal_localhost",
            sub_topic="browser_settings",
            tags=("brave", "settings", "extensions", "browser"),
        ),
        TabTemplate(
            url="http://localhost:5173/dashboard.html#/windows",
            title="Vite Dev Server - Tabman Local Preview - Port 5173",
            content_type="localhost",
            domain="internal_localhost",
            sub_topic="local_dev",
            tags=("localhost", "vite", "dev", "preview"),
        ),
        TabTemplate(
            url="http://localhost:11434/api/tags",
            title="Ollama Local Model API Endpoint - Localhost Port 11434",
            content_type="localhost",
            domain="internal_localhost",
            sub_topic="local_dev",
            tags=("localhost", "ollama", "api", "local-ai"),
        ),
    ],
    # Vertical 13: Finance, Markets & Crypto
    "finance_crypto": [
        TabTemplate(
            url="https://www.tradingview.com/chart/?symbol=NASDAQ%3ANVDA",
            title="NVDA Stock Chart & Technical Indicators - TradingView",
            content_type="market_chart",
            domain="finance_crypto",
            sub_topic="stock_charts",
            tags=("tradingview", "stocks", "finance", "markets"),
        ),
        TabTemplate(
            url="https://finance.yahoo.com/quote/AAPL/key-statistics/",
            title="Apple Inc. (AAPL) Valuation & Balance Sheet - Yahoo Finance",
            content_type="financial_data",
            domain="finance_crypto",
            sub_topic="equity_research",
            tags=("yahoo-finance", "stocks", "valuation", "investing"),
        ),
        TabTemplate(
            url="https://www.sec.gov/edgar/searchedgar/companysearch",
            title="EDGAR Company Search - Form 10-K & 10-Q Filings - SEC.gov",
            content_type="regulatory_filing",
            domain="finance_crypto",
            sub_topic="sec_filings",
            tags=("sec", "edgar", "filings", "finance"),
        ),
    ],
    # Vertical 14: Gaming & Interactive Entertainment
    "gaming_entertainment": [
        TabTemplate(
            url="https://store.steampowered.com/app/1091500/Cyberpunk_2077/",
            title="Cyberpunk 2077 on Steam - System Requirements & Reviews",
            content_type="game_store",
            domain="gaming_entertainment",
            sub_topic="steam_games",
            tags=("steam", "gaming", "cyberpunk", "entertainment"),
        ),
        TabTemplate(
            url="https://www.twitch.tv/directory/game/Valorant",
            title="VALORANT - Top Live Streams, Clips & Esports - Twitch",
            content_type="livestream",
            domain="gaming_entertainment",
            sub_topic="twitch_streams",
            tags=("twitch", "valorant", "livestream", "gaming"),
        ),
        TabTemplate(
            url="https://eldenring.wiki.fextralife.com/Weapons",
            title="Elden Ring Weapons Table & Stat Scaling Guide - Fextralife Wiki",
            content_type="game_wiki",
            domain="gaming_entertainment",
            sub_topic="game_guides",
            tags=("gaming", "wiki", "elden-ring", "guides"),
        ),
    ],
    # Vertical 15: Travel, Flights & Navigation
    "travel_navigation": [
        TabTemplate(
            url="https://www.google.com/travel/flights/search?tfs=CBwQAQ",
            title="Google Flights - Compare Airfare, Flight Times & Price Graph",
            content_type="travel_booking",
            domain="travel_navigation",
            sub_topic="flight_search",
            tags=("google-flights", "travel", "flights", "booking"),
        ),
        TabTemplate(
            url="https://www.airbnb.com/rooms/10293841",
            title="Modern Panoramic Mountain Cabin in Swiss Alps - Airbnb",
            content_type="lodging",
            domain="travel_navigation",
            sub_topic="vacation_rentals",
            tags=("airbnb", "travel", "lodging", "vacation"),
        ),
        TabTemplate(
            url="https://maps.google.com/?q=Tokyo+Station+Japan",
            title="Tokyo Station - Street Map, Transit Lines & Hours - Google Maps",
            content_type="mapping",
            domain="travel_navigation",
            sub_topic="maps_navigation",
            tags=("google-maps", "navigation", "travel", "transit"),
        ),
    ],
    # Vertical 16: Career, Job Search & Professional Networking
    "career_jobs": [
        TabTemplate(
            url="https://www.linkedin.com/jobs/view/4019201948/",
            title="Senior Staff Systems Engineer - Remote - LinkedIn Job Post",
            content_type="job_posting",
            domain="career_jobs",
            sub_topic="job_search",
            tags=("linkedin", "jobs", "career", "hiring"),
        ),
        TabTemplate(
            url="https://www.levels.fyi/companies/google/salaries/software-engineer",
            title="Google Software Engineer Salaries & Total Compensation - Levels.fyi",
            content_type="compensation_data",
            domain="career_jobs",
            sub_topic="salary_benchmarks",
            tags=("levels-fyi", "salaries", "career", "compensation"),
        ),
        TabTemplate(
            url="https://boards.greenhouse.io/anthropic/jobs/4019283",
            title="Research Engineer, Alignment - Greenhouse Job Application",
            content_type="job_application",
            domain="career_jobs",
            sub_topic="job_applications",
            tags=("greenhouse", "jobs", "careers", "application"),
        ),
    ],
    # Vertical 17: News, Journalism & Media
    "news_media": [
        TabTemplate(
            url="https://www.reuters.com/technology/artificial-intelligence/",
            title="Artificial Intelligence & Tech News Coverage - Reuters",
            content_type="news_article",
            domain="news_media",
            sub_topic="tech_news",
            tags=("reuters", "news", "ai", "journalism"),
        ),
        TabTemplate(
            url="https://www.theverge.com/tech",
            title="The Verge - Tech Reviews, Gadgets & Science News",
            content_type="tech_journalism",
            domain="news_media",
            sub_topic="consumer_tech",
            tags=("the-verge", "tech", "gadgets", "news"),
        ),
        TabTemplate(
            url="https://www.bloomberg.com/technology",
            title="Bloomberg Technology - Semiconductor Supply Chain & Markets",
            content_type="business_news",
            domain="news_media",
            sub_topic="business_tech",
            tags=("bloomberg", "business", "technology", "news"),
        ),
    ],
    # Vertical 18: Audio, Podcasts & Music
    "audio_podcasts": [
        TabTemplate(
            url="https://open.spotify.com/episode/38k190fa2",
            title="Lex Fridman Podcast #420: Yann LeCun on Future of AI - Spotify",
            content_type="podcast_episode",
            domain="audio_podcasts",
            sub_topic="tech_podcasts",
            tags=("spotify", "podcast", "lex-fridman", "audio"),
        ),
        TabTemplate(
            url="https://podcasts.apple.com/us/podcast/huberman-lab/id1545953110",
            title="Huberman Lab Podcast - Neuroscience & Optimization - Apple Podcasts",
            content_type="podcast_show",
            domain="audio_podcasts",
            sub_topic="science_podcasts",
            tags=("apple-podcasts", "huberman", "science", "audio"),
        ),
        TabTemplate(
            url="https://soundcloud.com/discover/sets/weekly-focus",
            title="Deep Focus Electronic & Ambient Mix - SoundCloud",
            content_type="music_stream",
            domain="audio_podcasts",
            sub_topic="ambient_music",
            tags=("soundcloud", "music", "focus", "ambient"),
        ),
    ],
}
