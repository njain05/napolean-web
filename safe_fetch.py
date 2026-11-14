"""
Safe fetching for Napoléon: polite crawling + proxy rotation.

Drop-in replacement for Napolean.fetch_html_with_requests (same arguments,
same (status_code, html) return value), so the crawler itself is unchanged.

What it adds:
  * Proxy rotation  - every request goes out through the next proxy in the pool.
                      A proxy that fails or gets blocked is rested for a while.
  * Speed limit     - at most one request every NAPOLEON_DELAY seconds per website
                      (default 1.0), or slower if the site's robots.txt asks for it.
  * Back-off        - on 429 / 5xx / network errors: wait, switch proxy, retry.
  * robots.txt      - pages the site asks crawlers not to visit are skipped.
  * Browser headers - realistic, rotating User-Agent and Accept headers.

Configuration (all optional; with nothing set it simply crawls politely, no proxies):
  NAPOLEON_PROXIES        comma/space separated proxy URLs, e.g.
                          "http://user:pass@1.2.3.4:8080, http://5.6.7.8:3128"
  config/proxies.txt      same, one proxy per line (# for comments). Git-ignored.
  NAPOLEON_DELAY          seconds between requests to the same website (default 1.0)
  NAPOLEON_MAX_RETRIES    retries per page after the first try (default 3)
  NAPOLEON_RESPECT_ROBOTS "0" to ignore robots.txt (default "1")
  NAPOLEON_DIRECT_FALLBACK "0" to never connect without a proxy when every proxy
                          is resting (default "1": fall back to a direct connection)
"""

import os
import random
import re
import threading
import time
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
PROXY_FILE = os.path.join(HERE, "config", "proxies.txt")

DELAY = float(os.environ.get("NAPOLEON_DELAY", "1.0"))
MAX_RETRIES = int(os.environ.get("NAPOLEON_MAX_RETRIES", "3"))
RESPECT_ROBOTS = os.environ.get("NAPOLEON_RESPECT_ROBOTS", "1") != "0"
DIRECT_FALLBACK = os.environ.get("NAPOLEON_DIRECT_FALLBACK", "1") != "0"

MAX_WAIT = 10.0            # never sleep longer than this in one go (keeps Stop responsive)
PROXY_REST_SECONDS = 60.0  # how long a failing/blocked proxy is taken out of rotation
RETRY_STATUSES = {429, 500, 502, 503, 504}
BLOCK_STATUSES = {403, 407, 429}  # likely "this IP/proxy is blocked"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]
ROBOTS_AGENT = "Napoleon"  # name we check robots.txt rules against ("*" rules also apply)


# --------------------------------------------------------------------------- logging

def _log(text, level="info"):
    """Show a message in the app's live log if the service is running, else print it."""
    try:
        from napoleon_service import NapoleonService
        NapoleonService.get_instance().log(text, level)
    except Exception:
        print(f"[safe_fetch][{level.upper()}] {text}")


# --------------------------------------------------------------------------- proxies

def _normalize_proxy(raw):
    raw = raw.strip()
    if not raw or raw.startswith("#"):
        return None
    if "://" not in raw:
        raw = "http://" + raw
    return raw


def _load_proxies():
    items = re.split(r"[\s,]+", os.environ.get("NAPOLEON_PROXIES", ""))
    if os.path.exists(PROXY_FILE):
        with open(PROXY_FILE, encoding="utf-8") as fh:
            items += [line.split("#", 1)[0] for line in fh]
    seen, proxies = set(), []
    for raw in items:
        p = _normalize_proxy(raw)
        if p and p not in seen:
            seen.add(p)
            proxies.append(p)
    return proxies


def _mask(proxy):
    """Hide credentials when showing a proxy in logs."""
    return re.sub(r"//[^@/]+@", "//***@", proxy) if proxy else "direct"


class ProxyPool:
    """Round-robin proxy rotation; failing proxies rest for a while."""

    def __init__(self, proxies):
        self.proxies = list(proxies)
        self.rest_until = {p: 0.0 for p in self.proxies}
        self.index = 0
        self.lock = threading.Lock()

    def __len__(self):
        return len(self.proxies)

    def next(self, avoid=None):
        """Next usable proxy, or None for a direct connection."""
        if not self.proxies:
            return None
        now = time.time()
        with self.lock:
            for _ in range(len(self.proxies)):
                p = self.proxies[self.index % len(self.proxies)]
                self.index += 1
                if self.rest_until[p] <= now and p != avoid:
                    return p
            # Everything else is resting; allow `avoid` again if it is usable.
            if avoid and self.rest_until.get(avoid, 0) <= now:
                return avoid
        if DIRECT_FALLBACK:
            if now - getattr(self, "_last_direct_warning", 0.0) > PROXY_REST_SECONDS:
                self._last_direct_warning = now
                _log("All proxies are resting — connecting directly (your own IP) for now. "
                     "Set NAPOLEON_DIRECT_FALLBACK=0 to wait for a proxy instead.", "warning")
            return None
        # Wait for the proxy that comes back soonest.
        soonest = min(self.proxies, key=lambda p: self.rest_until[p])
        time.sleep(min(MAX_WAIT, max(0.0, self.rest_until[soonest] - now)))
        return soonest

    def rest(self, proxy, reason):
        if not proxy:
            return
        with self.lock:
            self.rest_until[proxy] = time.time() + PROXY_REST_SECONDS
            usable = sum(1 for p in self.proxies if self.rest_until[p] <= time.time())
        _log(f"Proxy {_mask(proxy)} rested for {int(PROXY_REST_SECONDS)}s ({reason}). "
             f"{usable}/{len(self.proxies)} proxies still active.", "warning")

    def all_resting(self):
        now = time.time()
        return bool(self.proxies) and all(t > now for t in self.rest_until.values())


# --------------------------------------------------------------------------- politeness

class Politeness:
    """Per-website speed limit and robots.txt cache."""

    def __init__(self):
        self.next_allowed = {}   # host -> earliest time of the next request
        self.robots = {}         # host -> RobotFileParser or None (allow all)
        self.lock = threading.Lock()

    def wait_turn(self, host):
        delay = max(DELAY, self.crawl_delay(host))
        with self.lock:
            now = time.time()
            start = max(now, self.next_allowed.get(host, 0.0))
            self.next_allowed[host] = start + delay
        if start > now:
            time.sleep(min(MAX_WAIT, start - now))

    def push_back(self, host, seconds):
        """Make every later request to this host wait at least `seconds` more."""
        with self.lock:
            self.next_allowed[host] = max(self.next_allowed.get(host, 0.0), time.time() + seconds)

    def crawl_delay(self, host):
        rp = self.robots.get(host)
        try:
            d = rp.crawl_delay(ROBOTS_AGENT) if rp else None
            return min(MAX_WAIT, float(d)) if d else 0.0
        except Exception:
            return 0.0

    def allowed(self, url, session, pool):
        if not RESPECT_ROBOTS:
            return True
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if host not in self.robots:
            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            proxy = None
            for _ in range(max(1, min(3, len(pool)))):  # try a few proxies, not just one
                proxy = pool.next(avoid=proxy)
                try:
                    resp = session.get(robots_url, headers=_browser_headers(), timeout=5,
                                       proxies=_proxies_arg(proxy))
                except Exception:
                    if proxy:
                        pool.rest(proxy, "could not load robots.txt")
                    continue
                rp = None  # no robots.txt (404 etc.): everything allowed
                if resp.status_code == 200:
                    rp = RobotFileParser()
                    rp.parse(resp.text.splitlines())
                self.robots[host] = rp
                break
            else:
                return True  # network trouble: allow this page, try robots.txt again next time
        rp = self.robots[host]
        return rp is None or rp.can_fetch(ROBOTS_AGENT, url)


# --------------------------------------------------------------------------- helpers

def _browser_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
    }


def _proxies_arg(proxy):
    return {"http": proxy, "https": proxy} if proxy else None


def _retry_after_seconds(response, attempt):
    header = response.headers.get("Retry-After", "") if response is not None else ""
    if header.strip().isdigit():
        return min(MAX_WAIT, float(header.strip()))
    return min(MAX_WAIT, (2 ** attempt) + random.uniform(0, 1))  # 1-2s, 2-3s, 4-5s, ...


_session = requests.Session()
_pool = ProxyPool(_load_proxies())
_polite = Politeness()
_announced = False


def reload_proxies():
    """Re-read NAPOLEON_PROXIES and config/proxies.txt (e.g. after editing the file)."""
    global _pool
    _pool = ProxyPool(_load_proxies())
    return len(_pool)


def status():
    """Small summary, handy for debugging or an API endpoint."""
    return {
        "proxies_total": len(_pool),
        "proxies_resting": sum(1 for t in _pool.rest_until.values() if t > time.time()),
        "delay_seconds": DELAY,
        "max_retries": MAX_RETRIES,
        "respect_robots": RESPECT_ROBOTS,
    }


# --------------------------------------------------------------------------- main entry

def fetch_html_with_requests(url, timeout=5):
    """Fetch a page politely, through rotating proxies, with retries.

    Returns (status_code, html) like the original, or (None, None) when the page
    could not be fetched (or robots.txt asks us not to).
    """
    global _announced
    if not _announced:
        _announced = True
        proxy_note = f"{len(_pool)} rotating prox{'y' if len(_pool) == 1 else 'ies'}" if len(_pool) else "no proxies (direct)"
        _log(f"Safe crawling on: max 1 request / {DELAY:g}s per site, {proxy_note}, "
             f"robots.txt {'respected' if RESPECT_ROBOTS else 'ignored'}, up to {MAX_RETRIES} retries.", "info")

    host = urlparse(url).netloc.lower()

    if not _polite.allowed(url, _session, _pool):
        _log(f"Skipped {url} — the site's robots.txt asks crawlers not to visit it.", "warning")
        return None, None

    response = None
    proxy = None
    for attempt in range(MAX_RETRIES + 1):
        proxy = _pool.next(avoid=proxy if attempt else None)
        _polite.wait_turn(host)
        try:
            response = _session.get(url, headers=_browser_headers(), timeout=timeout,
                                    allow_redirects=True, proxies=_proxies_arg(proxy))
        except (requests.exceptions.ProxyError, requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as e:
            if proxy:
                _pool.rest(proxy, type(e).__name__)
            if attempt < MAX_RETRIES:
                wait = _retry_after_seconds(None, attempt)
                _log(f"Network error on {url} via {_mask(proxy)}; retrying in {wait:.1f}s "
                     f"({attempt + 1}/{MAX_RETRIES}).", "warning")
                time.sleep(wait)
                continue
            print(f"[Error fetching {url}]: {e}")
            return None, None
        except Exception as e:
            print(f"[Error fetching {url}]: {e}")
            return None, None

        code = response.status_code
        if code in BLOCK_STATUSES and proxy:
            _pool.rest(proxy, f"HTTP {code}")
        retryable = code in RETRY_STATUSES or (code in BLOCK_STATUSES and len(_pool) > 1)
        if retryable and attempt < MAX_RETRIES:
            wait = _retry_after_seconds(response, attempt)
            _polite.push_back(host, wait)  # slow down for the whole site, not just this page
            _log(f"{url} answered HTTP {code}; backing off {wait:.1f}s and retrying "
                 f"({attempt + 1}/{MAX_RETRIES}).", "warning")
            continue
        break

    # Without a charset in Content-Type, requests assumes ISO-8859-1, which turns
    # UTF-8 symbols like "–" into "â€“". Detect the real encoding instead.
    if "charset" not in response.headers.get("Content-Type", "").lower():
        response.encoding = response.apparent_encoding
    return response.status_code, response.text
