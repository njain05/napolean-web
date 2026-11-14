"""
HTTP routes for Ask Napoléon (question answering over the crawled pages).

  POST /api/ask         {"question": "..."}  ->  {"answer", "sources": [...], "mode"}
  GET  /api/ask/status                       ->  {"pages", "passages", "llm"}
"""

import os

from flask import Blueprint, jsonify, request

import qa_engine

ask_bp = Blueprint("ask", __name__)


@ask_bp.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()[:500]
    if not question:
        return jsonify({"error": "Please type a question."}), 400
    try:
        return jsonify(qa_engine.store.ask(question))
    except Exception as e:
        return jsonify({"error": f"Could not answer: {e}"}), 500


@ask_bp.route("/api/ask/status", methods=["GET"])
def status():
    stats = qa_engine.store.stats()
    if stats["pages"] == 0:
        qa_engine.store.load_from_crawled_json()
        stats = qa_engine.store.stats()
    stats["llm"] = bool(os.environ.get("ANTHROPIC_API_KEY")) and os.environ.get("NAPOLEON_LLM", "1") != "0"
    return jsonify(stats)
