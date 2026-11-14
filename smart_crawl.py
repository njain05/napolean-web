"""
Smart crawl for Napoléon: visit the most promising links first.

A normal crawler visits links in the order it finds them (breadth-first) and
throws away irrelevant pages *after* downloading them. With a mission (intent)
set, SmartFrontier scores every link *before* visiting it and always marches on
the best one next, so relevant pages are found sooner and fewer requests are spent.

Each link is scored from:
  * NapoleanAI.score_link  - keyword matches in the URL and the link's text
                             (the team's existing scorer in ai_engine.py)
  * semantic similarity    - meaning of the link text + URL words vs. the mission,
                             using the same MiniLM embedding model as the rest of the app

Without a mission it behaves exactly like the old FIFO queue (breadth-first).

Drop-in for queue.Queue in the crawl loop: put((url, depth)), get(), empty().
Optional page budget: max_pages (or env NAPOLEON_MAX_PAGES).
"""

import heapq
import itertools
import os
import re
from urllib.parse import urljoin, urlparse, unquote, urlunparse, parse_qsl, urlencode

import numpy as np
from bs4 import BeautifulSoup

import qa_engine  # Ask Napoléon: every crawled page also feeds the question-answering index

ANCHOR_TEXT_LIMIT = 200
SKIP_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".json", ".xml", ".exe", ".zip",
                   ".rar", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".mp3", ".mp4", ".avi", ".css", ".js")
TRACKING_PARAMS = ("utm_", "fbclid", "gclid", "ref", "share")
SECOND_LEVEL = {"ac", "co", "gov", "org", "edu", "net", "com", "nic", "res"}


# --------------------------------------------------------------------------- links
# Replacement for Napolean.extract_links_from_html / normalize_link that
#   * keeps ?query pages (CMS sites like gndec.ac.in/?q=node/3 are otherwise all
#     collapsed into the home page), dropping only tracking parameters
#   * treats subdomains of the same site as the same site (cse.gndec.ac.in belongs
#     to gndec.ac.in), comparing real hostnames, never substrings

def site_root(host):
    """gndec.ac.in for cse.gndec.ac.in, example.com for www.example.com."""
    parts = host.lower().split(":")[0].split(".")
    if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in SECOND_LEVEL:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def normalize_link(url):
    try:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        p = urlparse(url)
        if not p.netloc:
            return None
        query = urlencode(sorted((k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                                 if not k.lower().startswith(TRACKING_PARAMS)), safe="/:")
        return urlunparse((p.scheme, p.netloc.lower(), p.path.rstrip("/"), "", query, ""))
    except Exception:
        return None


def same_site(url, reference_url):
    try:
        u, r = urlparse(url), urlparse(reference_url)
    except Exception:
        return False
    if u.scheme not in ("http", "https") or not u.netloc:
        return False
    return site_root(u.netloc) == site_root(r.netloc)


def extract_links_from_html(html, base_domain):
    """Same-site links on a page. `base_domain` is the page's own URL (relative links resolve from it)."""
    links = set()
    try:
        soup = BeautifulSoup(html or "", "html.parser")
    except Exception:
        return links
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        full = urljoin(base_domain, href)
        if not same_site(full, base_domain) or urlparse(full).path.lower().endswith(SKIP_EXTENSIONS):
            continue
        link = normalize_link(full)
        if link:
            links.add(link)
    return links

SLUG_NOISE = {"index", "html", "htm", "php", "aspx", "asp", "www", "page", "catalogue", "category"}


def _slug_words(url):
    """Turn a URL path into words: /books/mystery_3/index.html -> 'books mystery'."""
    path = unquote(urlparse(url).path)
    words = re.split(r"[^A-Za-z]+", path)
    return " ".join(w.lower() for w in words if len(w) > 2 and w.lower() not in SLUG_NOISE)


class SmartFrontier:
    def __init__(self, ai=None, intent=None, max_pages=None, max_depth=None, log=None):
        self.max_depth = max_depth
        self.ai = ai
        self.intent = (intent or "").strip()
        self.smart = bool(self.intent and ai is not None)
        env_budget = os.environ.get("NAPOLEON_MAX_PAGES", "")
        budget = max_pages or (int(env_budget) if env_budget.isdigit() else 0)
        self.max_pages = int(budget) if budget else None
        self.log = log or (lambda text, level="info": print(f"[smart_crawl][{level}] {text}"))

        self.heap = []
        self.counter = itertools.count()
        self.anchors = {}         # normalized url -> link text seen on pages
        self.pending_scores = {}  # url -> score (filled in batches by remember_anchors)
        self.popped = 0
        self.budget_announced = False
        qa_engine.store.reset()  # a new campaign starts a fresh Q&A index

        embedder = getattr(ai, "embedder", None)
        intent_emb = getattr(ai, "intent_embedding", None)
        self.embedder = embedder if (self.smart and embedder is not None and intent_emb is not None) else None
        if self.embedder is not None:
            v = np.asarray(intent_emb, dtype=np.float32)
            self.intent_vec = v / (np.linalg.norm(v) or 1.0)

        if self.smart:
            how = "link text + meaning" if self.embedder is not None else "keywords only"
            budget_note = f", budget {self.max_pages} pages" if self.max_pages else ""
            self.log(f"Smart crawl ON for mission '{self.intent}': best links first ({how}{budget_note}).", "gold")
        elif self.max_pages:
            self.log(f"Page budget: {self.max_pages} pages (no mission set, so normal breadth-first order).", "info")

    # ------------------------------------------------------------------ scoring

    def remember_anchors(self, html, page_url):
        """Read link texts from a page and score all its links in one batch.

        Call this right after a page is fetched, before its links are put() in.
        """
        if not isinstance(html, str):
            return
        qa_engine.store.add_page(page_url, html)
        if not self.smart:
            return
        base = page_url  # same base the crawl loop passes to extract_links_from_html
        found = {}
        try:
            for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
                # Same resolution as the crawl loop uses, so the URLs match.
                link = normalize_link(urljoin(base, a["href"].strip()))
                if not link:
                    continue
                text = (a.get("title") or a.get_text(" ", strip=True) or "").strip()
                if text:
                    found.setdefault(link, set()).add(text[:ANCHOR_TEXT_LIMIT])
        except Exception:
            return
        for link, texts in found.items():
            old = self.anchors.get(link, "")
            merged = " | ".join(sorted(texts | ({old} if old else set())))
            self.anchors[link] = merged[:ANCHOR_TEXT_LIMIT * 2]

        # Batch semantic scoring for speed (one model call per page, not per link).
        links = list(found)
        semantic = {}
        if self.embedder is not None and links:
            texts = [f"{self.anchors.get(l, '')} {_slug_words(l)}".strip() or l for l in links]
            try:
                vecs = self.embedder.encode(texts, convert_to_numpy=True, batch_size=64)
                norms = np.linalg.norm(vecs, axis=1, keepdims=True)
                norms[norms == 0] = 1.0
                sims = (vecs / norms) @ self.intent_vec
                semantic = {l: float(s) for l, s in zip(links, sims)}
            except Exception:
                semantic = {}
        for link in links:
            self.pending_scores[link] = self._combine(link, semantic.get(link))

    def _combine(self, link, semantic_sim):
        anchor = self.anchors.get(link, "")
        try:
            keyword = float(self.ai.score_link(link, anchor_text=anchor))
        except Exception:
            keyword = 0.0
        if semantic_sim is None:
            return round(keyword, 3)
        # MiniLM similarities for related short texts sit around 0.3-0.7; stretch to 0-1.
        sem = max(0.0, min(1.0, (semantic_sim - 0.1) / 0.5))
        return round(0.5 * keyword + 0.5 * sem, 3)

    def score(self, link):
        if not self.smart:
            return 0.0
        if link in self.pending_scores:
            return self.pending_scores.pop(link)
        return self._combine(link, None)

    # ------------------------------------------------------------------ queue interface

    def put(self, item):
        url, depth = item
        if self.max_depth is not None and depth > self.max_depth:
            return  # the loop would skip it anyway; keep it out of the budget
        s = self.score(url)
        # Highest score first; ties go to shallower pages, then discovery order (= BFS).
        heapq.heappush(self.heap, (-s, depth, next(self.counter), url, s))

    def get(self):
        neg, depth, _, url, s = heapq.heappop(self.heap)
        self.popped += 1
        if self.smart and self.popped > 1:
            label = self.anchors.get(url, "").split(" | ")[0][:60] or _slug_words(url) or url
            self.log(f"Smart pick #{self.popped} (score {s:.2f}): '{label}'", "info")
        return url, depth

    def empty(self):
        if self.max_pages and self.popped >= self.max_pages:
            if not self.budget_announced:
                self.budget_announced = True
                self.log(f"Page budget of {self.max_pages} reached — {len(self.heap)} lower-priority "
                         f"links left unvisited.", "gold")
            return True
        return not self.heap

    def qsize(self):
        return len(self.heap)
