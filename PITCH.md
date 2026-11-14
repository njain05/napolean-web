# Napoléon — ask any website a question

**Other crawlers download everything and make you dig. Napoléon decides where to go before it goes, then answers your question in plain English, with the source page.**

Built for Hacknauts 2026 (GNDEC Ludhiana).

---

## Who is it for?

**People who have to understand an organisation quickly from its website.** For example:

| User | Their question | Today they… |
|---|---|---|
| **Analyst / due-diligence team** (vendor checks, investors, partnerships) | "Who runs this company? How do I contact them? Is their site exposing anything risky?" | open 50 tabs and copy-paste into a spreadsheet |
| **Student or parent choosing a college** | "Who is the HoD of CSE? What's the hostel fee? When is the deadline?" | click through menus, notices and PDFs |
| **Journalist / researcher** | "Which people and organisations show up across this site, and how are they connected?" | read page after page by hand |

The common problem: **the answer exists on the website, but it's buried across dozens of pages, menus and subdomains.** Site search is usually missing or useless.

---

## What's new (vs. Scrapy, Apify, Firecrawl, SpiderFoot…)

1. **Mission-guided crawling ("smart crawl").** You type what you want ("faculty and their departments"). Before visiting any link, Napoléon scores it by its text and meaning, then always visits the most promising one next. Normal crawlers go breadth-first and filter *after* downloading.
2. **Ask Napoléon.** After the crawl, ask questions in plain English and get the answer line plus the page it came from. It works **offline** with a local AI model, so it needs no API key, costs nothing and sends no data out. With an Anthropic key it also writes fluent answers that cite their sources.
3. **Polite and hard to block.** At most 1 request per second per site. It respects robots.txt, backs off on "slow down" errors, and rotates proxies when configured. Because the smart crawl visits fewer pages, it sends fewer requests, so the risk of an IP ban is lower.
4. **One place for the whole picture:** the answer, the people and organisations involved (entity graph), and a passive security check of the pages it already read.

## Proof

**Smart crawl vs. normal crawl.** Same site (books.toscrape.com), same mission ("mystery and thriller novels"), same 12-page budget:

| | Normal crawl | Smart crawl |
|---|---|---|
| Relevant pages found | 1 | **4** |
| Reached the "Mystery" section at | page 6 (by luck) | **page 2** |

**Real website: gndec.ac.in.** The mission was "faculty and their departments", with a 25–30 page budget.
- The smart crawl went to *Departments* 2nd, then *Members*, *Faculty* and *Director Desk*.
- Ask Napoléon answered all 5 of our test questions correctly, with the source page:

| Question | Answer |
|---|---|
| Who is the head of the computer science department? | HoD – CSE · Dr. Kiran Jyoti · 0161-5064501 |
| Who is the principal? | Dr. Sehijpal Singh · Ph.D., IIT Roorkee |
| Who is the HoD of IT? | Dr. KS Maan |
| Which department is Palwinder Kaur Bhangu from? | (IT) |
| Phone number for staff verification? | 0161-5064703, 8:30 AM–4:30 PM |

---

## 2-minute demo script

1. **(15 s) Problem.** "College and company websites hide answers across dozens of pages and subdomains."
2. **(30 s) Start a scan.** Enter `https://gndec.ac.in` and click the **Faculty & departments** example. Leave Max pages at 25, turn the security scan off, and press **Start scan**.
3. **(30 s) Live Log.** Point at the *"Smart pick #2 (score 0.75): 'Departments'"* lines. "It chooses where to go. It doesn't download everything."
4. **(30 s) Ask Napoléon tab.** The mission briefing is already there. Type *"Who is the HoD of IT?"* and show the answer and its source link.
5. **(15 s) Close.** "Polite by design: 1 request per second, robots.txt, back-off and proxy rotation. Offline AI, no data leaves the laptop."

Only security-scan websites you own or have permission to test.

---

## Run it

```bash
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
NAPOLEON_PORT=5050 python app.py        # open http://localhost:5050
```

Optional settings:

| Setting | What it does |
|---|---|
| `config/proxies.txt` (copy `config/proxies.example.txt`) | Rotating proxies, one per line |
| `NAPOLEON_DELAY=1.0` | Seconds between requests to the same site |
| `NAPOLEON_RESPECT_ROBOTS=0` | Ignore robots.txt (only on sites you own) |
| `ANTHROPIC_API_KEY=…` + `pip install anthropic` | Fluent AI-written answers in Ask Napoléon |

## Where things live

| File | Role |
|---|---|
| `smart_crawl.py` | Mission-guided link scoring and crawl order, plus a link reader for subdomains and `?q=` pages |
| `qa_engine.py`, `chat_api.py` | Ask Napoléon: passage index, hybrid word + meaning search, answers |
| `safe_fetch.py` | Polite fetching, proxy rotation, back-off, robots.txt |
| `static/js/ask.js`, `static/css/ask.css` | Chat tab, example missions, Max pages, Advanced toggle |
| `napoleon_service.py`, `ai_engine.py`, … | Original crawler, NLP, graph, report and security engine |

## Honest limitations

- Offline answers are the best-matching line from the site. They're good for who/what/where facts, weaker for "summarise everything" questions. An Anthropic key makes those better.
- Text inside PDFs and images isn't read yet.
- JavaScript-heavy sites need the Selenium option (under Advanced settings), and Selenium doesn't use the proxy pool.
