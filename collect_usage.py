#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Collect daily token usage from Hermes agent.log and DSH session zstd logs.

Outputs D:/Obsidian Vault/Obsidian Vault/.smart-dashboard/usage_daily.json.

Sources:
  - hermes: D:/Hermes/logs/agent.log lines matching provider=opencode-go
  - dsh:    C:/Users/华为/.dsh/sessions/*.jsonl.zstd assistant/message events
  - opencode: C:/Users/华为/.local/share/opencode/opencode.db session table
  - workbuddy: C:/Users/华为/.workbuddy/projects/**/*.jsonl message events
  - codebuddy: C:/Users/华为/.codebuddy/projects/**/*.jsonl message events
  - codex: C:/Users/华为/.codex/sessions/**/rollout-*.jsonl token_count events
"""

import glob
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone

# ---------------------------------------------------------------- zstandard
try:
    import zstandard
except ImportError:
    print("zstandard not found, installing via pip ...", flush=True)
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install",
            "-i", "https://pypi.tuna.tsinghua.edu.cn/simple", "zstandard",
        ])
        import zstandard
    except Exception as exc:  # pragma: no cover - install failure path
        print("Failed to install zstandard:", exc, flush=True)
        sys.exit(1)

# ------------------------------------------------------------------ config
HERMES_LOG = r"D:/Hermes/logs/agent.log"
DSH_SESSIONS_DIR = r"C:/Users/华为/.dsh/sessions"
OPENCODE_DB = r"C:/Users/华为/.local/share/opencode/opencode.db"
WORKBUDDY_PROJECTS_DIR = r"C:/Users/华为/.workbuddy/projects"
CODEBUDDY_PROJECTS_DIR = r"C:/Users/华为/.codebuddy/projects"
CODEX_SESSIONS_DIR = r"C:/Users/华为/.codex/sessions"
OUT_JSON = r"D:/Obsidian Vault/Obsidian Vault/.smart-dashboard/usage_daily.json"

# ---------------------------------------------------------------- regexes
HERMES_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2}).*API call #\d+: model=\S+ provider=\S+"
    r" in=(\d+) out=(\d+)"
)
HERMES_CACHE_RE = re.compile(r"cache=(\d+)/")


def date_from_time(time_field):
    """Extract 'YYYY-MM-DD' from a DSH event time field.

    Handles ISO strings ('2026-07-29T...', possibly with timezone) and
    numeric values that may be millisecond or second Unix timestamps.
    """
    if time_field is None:
        return None
    if isinstance(time_field, (int, float)):
        ts = time_field
        # millis (> 100 billion) vs seconds
        if ts > 1e11:
            ts = ts / 1000.0
        return time.strftime("%Y-%m-%d", time.localtime(ts))
    if isinstance(time_field, str):
        m = re.match(r"(\d{4}-\d{2}-\d{2})", time_field)
        if m:
            return m.group(1)
        try:
            ts = float(time_field)
            if ts > 1e11:
                ts = ts / 1000.0
            return time.strftime("%Y-%m-%d", time.localtime(ts))
        except (ValueError, OSError, OverflowError):
            return None
    return None


def parse_hermes(log_path):
    """Return {date: {"input":.., "output":.., "cache":.., "calls":..}}.

    Aggregates across agent.log AND rotated files (agent.log.1, .2, ...):
    Hermes rotates agent.log to agent.log.1 at ~5MB; without reading the
    rotated file, the pre-rotation portion of the current day is lost.
    """
    stats = {}
    files = [log_path] + sorted(
        glob.glob(log_path + ".*"),
        key=os.path.getmtime,  # oldest first; aggregation is additive anyway
    )
    for path in files:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    m = HERMES_RE.search(line)
                    if not m:
                        continue
                    date = m.group(1)
                    try:
                        inp = int(m.group(2))
                        out = int(m.group(3))
                    except ValueError:
                        continue
                    cm = HERMES_CACHE_RE.search(line)
                    cache = int(cm.group(1)) if cm else 0
                    rec = stats.setdefault(date, {"input": 0, "output": 0, "cache": 0, "calls": 0})
                    rec["input"] += inp
                    rec["output"] += out
                    rec["cache"] += cache
                    rec["calls"] += 1
        except FileNotFoundError:
            print("WARN: hermes log not found:", path, flush=True)
    return stats


def parse_dsh(sessions_dir):
    """Return {date: {"input":.., "output":..}} from assistant/message events."""
    stats = {}
    if not os.path.isdir(sessions_dir):
        print("WARN: dsh sessions dir not found:", sessions_dir, flush=True)
        return stats
    for root, _dirs, files in os.walk(sessions_dir):
        for name in files:
            if not name.endswith(".jsonl.zstd"):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "rb") as fh:
                    opener = zstandard.ZstdDecompressor().stream_reader(fh)
                    chunks = []
                    while True:
                        chunk = opener.read(1 << 20)
                        if not chunk:
                            break
                        chunks.append(chunk)
                    blob = b"".join(chunks)
            except Exception:
                # damaged file: skip entirely
                continue
            for raw in blob.split(b"\n"):
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    evt = json.loads(raw.decode("utf-8"))
                except Exception:
                    continue
                if evt.get("type") != "assistant/message":
                    continue
                data = evt.get("data") or {}
                usage = data.get("usage") if isinstance(data, dict) else None
                if not isinstance(usage, dict):
                    usage = evt.get("usage")
                if not isinstance(usage, dict):
                    continue
                inp = usage.get("inputTokens")
                out = usage.get("outputTokens")
                cache_read = usage.get("cacheReadTokens")
                try:
                    inp = int(inp) if inp is not None else 0
                    out = int(out) if out is not None else 0
                    cache_read = int(cache_read) if cache_read is not None else 0
                except (ValueError, TypeError):
                    continue
                date = date_from_time(evt.get("time"))
                if not date:
                    continue
                rec = stats.setdefault(date, {"input": 0, "output": 0, "cache": 0})
                rec["input"] += inp
                rec["output"] += out
                rec["cache"] += cache_read
    return stats


def parse_workbuddy(projects_dir):
    """Return {date: {"input":.., "output":.., "cache":.., "reasoning":.., "calls":..}}.

    Walks WorkBuddy session jsonl files under projects_dir. Token data lives
    in evt.providerData.usage (NOT evt.usage, NOT evt.data.usage). inputTokens
    already includes cached_tokens (OpenAI style) → stored input is the
    cache-miss value max(0, inputTokens - cache), aligned with dsh/opencode.
    Events without providerData.usage (reasoning / function_call_result / ...)
    are skipped. Damaged lines are skipped. Missing dir yields {} with WARN.
    """
    stats = {}
    if not os.path.isdir(projects_dir):
        print("WARN: workbuddy projects dir not found:", projects_dir, flush=True)
        return stats
    for root, _dirs, files in os.walk(projects_dir):
        for name in files:
            if not name.endswith(".jsonl"):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    for raw in fh:
                        raw = raw.strip()
                        if not raw:
                            continue
                        try:
                            evt = json.loads(raw)
                        except Exception:
                            continue
                        provider_data = evt.get("providerData")
                        if not isinstance(provider_data, dict):
                            continue
                        usage = provider_data.get("usage")
                        if not isinstance(usage, dict):
                            continue
                        try:
                            input_tokens = int(usage.get("inputTokens") or 0)
                            output_tokens = int(usage.get("outputTokens") or 0)
                        except (ValueError, TypeError):
                            continue
                        if input_tokens == 0 and output_tokens == 0:
                            continue
                        cache = sum(
                            d.get("cached_tokens", 0)
                            for d in (usage.get("inputTokensDetails") or [])
                            if isinstance(d, dict)
                        )
                        reasoning = sum(
                            d.get("reasoning_tokens", 0)
                            for d in (usage.get("outputTokensDetails") or [])
                            if isinstance(d, dict)
                        )
                        try:
                            cache = int(cache)
                            reasoning = int(reasoning)
                        except (ValueError, TypeError):
                            cache = 0
                            reasoning = 0
                        miss_input = max(0, input_tokens - cache)
                        date = date_from_time(evt.get("timestamp"))
                        if not date:
                            continue
                        rec = stats.setdefault(
                            date,
                            {"input": 0, "output": 0, "cache": 0, "reasoning": 0, "calls": 0},
                        )
                        rec["input"] += miss_input
                        rec["output"] += output_tokens
                        rec["cache"] += cache
                        rec["reasoning"] += reasoning
                        rec["calls"] += 1
            except OSError:
                continue
    return stats


def parse_codebuddy(projects_dir):
    """Return {date: {"input":.., "output":.., "cache":.., "reasoning":.., "calls":..}}.

    Walks CodeBuddy CLI session jsonl files under projects_dir. Token data
    lives in evt.providerData.usage (NOT evt.usage, NOT evt.data.usage).
    inputTokens already includes cached_tokens (OpenAI style) → stored input
    is the cache-miss value max(0, inputTokens - cache), aligned with
    workbuddy/dsh/opencode (prevents cache from being double-counted in
    totals). Events without providerData.usage (reasoning /
    function_call_result / file-history-snapshot / ...) are skipped.
    Damaged lines are skipped. Missing dir yields {} with WARN.
    """
    stats = {}
    if not os.path.isdir(projects_dir):
        print("WARN: codebuddy projects dir not found:", projects_dir, flush=True)
        return stats
    for root, _dirs, files in os.walk(projects_dir):
        for name in files:
            if not name.endswith(".jsonl"):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    for raw in fh:
                        raw = raw.strip()
                        if not raw:
                            continue
                        try:
                            evt = json.loads(raw)
                        except Exception:
                            continue
                        provider_data = evt.get("providerData")
                        if not isinstance(provider_data, dict):
                            continue
                        usage = provider_data.get("usage")
                        if not isinstance(usage, dict):
                            continue
                        try:
                            input_tokens = int(usage.get("inputTokens") or 0)
                            output_tokens = int(usage.get("outputTokens") or 0)
                        except (ValueError, TypeError):
                            continue
                        if input_tokens == 0 and output_tokens == 0:
                            continue
                        cache = sum(
                            d.get("cached_tokens", 0)
                            for d in (usage.get("inputTokensDetails") or [])
                            if isinstance(d, dict)
                        )
                        reasoning = sum(
                            d.get("reasoning_tokens", 0)
                            for d in (usage.get("outputTokensDetails") or [])
                            if isinstance(d, dict)
                        )
                        try:
                            cache = int(cache)
                            reasoning = int(reasoning)
                        except (ValueError, TypeError):
                            cache = 0
                            reasoning = 0
                        miss_input = max(0, input_tokens - cache)
                        date = date_from_time(evt.get("timestamp"))
                        if not date:
                            continue
                        rec = stats.setdefault(
                            date,
                            {"input": 0, "output": 0, "cache": 0, "reasoning": 0, "calls": 0},
                        )
                        rec["input"] += miss_input
                        rec["output"] += output_tokens
                        rec["cache"] += cache
                        rec["reasoning"] += reasoning
                        rec["calls"] += 1
            except OSError:
                continue
    return stats


def codex_date_from_ts(ts):
    """Convert an ISO UTC timestamp (e.g. 2026-08-30T13:07:18.227Z) to local YYYY-MM-DD."""
    if not isinstance(ts, str):
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone().strftime("%Y-%m-%d")


def parse_codex(sessions_dir):
    """Return {date: {"input":.., "output":.., "cache":.., "reasoning":.., "calls":..}}.

    Walks OpenAI Codex CLI rollout jsonl files under sessions_dir. Token data
    lives in events with type == 'event_msg' and payload.type == 'token_count',
    in payload.info.last_token_usage. input_tokens includes cached_input_tokens
    → stored input is the cache-miss value max(0, input - cached_input),
    aligned with workbuddy/codebuddy (input 不含 cache). cache_write_input_tokens
    is ignored (cache = cache_read only, consistent with dsh/opencode). Each
    token_count event adds one call. Events are attributed to the local date of
    their top-level UTC timestamp. Damaged files are skipped. Missing dir
    yields {} with WARN.
    """
    stats = {}
    if not os.path.isdir(sessions_dir):
        print("WARN: codex sessions dir not found:", sessions_dir, flush=True)
        return stats
    for root, _dirs, files in os.walk(sessions_dir):
        for name in files:
            if not (name.startswith("rollout-") and name.endswith(".jsonl")):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    for raw in fh:
                        raw = raw.strip()
                        if not raw:
                            continue
                        try:
                            evt = json.loads(raw)
                        except Exception:
                            continue
                        if evt.get("type") != "event_msg":
                            continue
                        payload = evt.get("payload")
                        if not isinstance(payload, dict):
                            continue
                        if payload.get("type") != "token_count":
                            continue
                        info = payload.get("info")
                        if not isinstance(info, dict):
                            continue
                        usage = info.get("last_token_usage")
                        if not isinstance(usage, dict):
                            continue
                        try:
                            input_tokens = int(usage.get("input_tokens") or 0)
                            cached = int(usage.get("cached_input_tokens") or 0)
                            output_tokens = int(usage.get("output_tokens") or 0)
                            reasoning = int(usage.get("reasoning_output_tokens") or 0)
                        except (ValueError, TypeError):
                            continue
                        date = codex_date_from_ts(evt.get("timestamp"))
                        if not date:
                            continue
                        rec = stats.setdefault(
                            date,
                            {"input": 0, "output": 0, "cache": 0, "reasoning": 0, "calls": 0},
                        )
                        rec["input"] += max(0, input_tokens - cached)
                        rec["output"] += output_tokens
                        rec["cache"] += cached
                        rec["reasoning"] += reasoning
                        rec["calls"] += 1
            except OSError:
                # damaged / unreadable file: skip entirely
                continue
    return stats


def parse_opencode(db_path):
    """Return {date: {"input":.., "output":.., "cache":.., "reasoning":.., "cache_write":.., "calls":..}}.

    Aggregates the opencode CLI message table (SQLite), one row per assistant
    message. Each message is attributed to the local date of its completion
    time ($.time.completed, falling back to $.time.created) — both are
    millisecond epoch timestamps. This fixes long sessions spanning midnight,
    which under session-level attribution lumped all tokens into the creation
    day. input excludes cache (consistent with dsh).
    Missing/unreadable database yields {} with a WARN, never an exception.
    """
    stats = {}
    if not os.path.isfile(db_path):
        print("WARN: opencode db not found:", db_path, flush=True)
        return stats
    try:
        # read-only WITHOUT immutable: immutable=1 makes SQLite ignore the
        # -wal sidecar, so messages not yet checkpointed into the main db
        # (i.e. everything recent, written while opencode was running) were
        # invisible → today's usage never reached the dashboard card.
        # Plain mode=ro still never modifies the DB but does read the WAL.
        conn = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    except sqlite3.Error as exc:
        print("WARN: cannot open opencode db:", exc, flush=True)
        return stats
    try:
        cur = conn.execute(
            r"""
            SELECT date(COALESCE(
                        json_extract(data,'$.time.completed'),
                        json_extract(data,'$.time.created')) / 1000,
                        'unixepoch','localtime') AS d,
                   SUM(json_extract(data,'$.tokens.input')),
                   SUM(json_extract(data,'$.tokens.output')),
                   SUM(json_extract(data,'$.tokens.cache.read')),
                   SUM(json_extract(data,'$.tokens.reasoning')),
                   SUM(json_extract(data,'$.tokens.cache.write')),
                   COUNT(*)
            FROM message
            WHERE json_extract(data,'$.role') = 'assistant'
              AND COALESCE(json_extract(data,'$.time.completed'),
                           json_extract(data,'$.time.created')) IS NOT NULL
            GROUP BY d
            """
        )
        for date, inp, out, cache_read, reasoning, cache_write, calls in cur.fetchall():
            if not date:
                continue
            rec = stats.setdefault(date, {"input": 0, "output": 0, "cache": 0, "reasoning": 0, "cache_write": 0, "calls": 0})
            rec["input"] += int(inp or 0)
            rec["output"] += int(out or 0)
            rec["cache"] += int(cache_read or 0)
            rec["reasoning"] += int(reasoning or 0)
            rec["cache_write"] += int(cache_write or 0)
            rec["calls"] += calls or 0
    except sqlite3.Error as exc:
        print("WARN: opencode db query failed:", exc, flush=True)
        return {}
    finally:
        conn.close()
    return stats


def load_existing(out_path):
    if os.path.exists(out_path):
        try:
            with open(out_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if data.get("schema_version") in (3, 4, 5, 6) and isinstance(data.get("days"), dict):
                return data["days"]
        except Exception:
            pass
    return {}


def merge_days(existing, source, src_name):
    for date, rec in source.items():
        cur = existing.setdefault(date, {})
        cur[src_name] = rec
        existing[date] = cur
    return existing


def main():
    quiet = "--quiet" in sys.argv
    hermes = parse_hermes(HERMES_LOG)
    dsh = parse_dsh(DSH_SESSIONS_DIR)
    opencode = parse_opencode(OPENCODE_DB)
    workbuddy = parse_workbuddy(WORKBUDDY_PROJECTS_DIR)
    codebuddy = parse_codebuddy(CODEBUDDY_PROJECTS_DIR)
    codex = parse_codex(CODEX_SESSIONS_DIR)

    days = load_existing(OUT_JSON)
    days = merge_days(days, hermes, "hermes")
    days = merge_days(days, dsh, "dsh")
    days = merge_days(days, opencode, "opencode")
    days = merge_days(days, workbuddy, "workbuddy")
    days = merge_days(days, codebuddy, "codebuddy")
    days = merge_days(days, codex, "codex")

    out_path = OUT_JSON
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    payload = {
        "schema_version": 6,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "days": days,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    if quiet:
        return
    # summary
    total_days = len(days)
    print(f"days total: {total_days}", flush=True)
    if days:
        last_date = sorted(days.keys())[-1]
        print(f"last day: {last_date} -> {days[last_date]}", flush=True)
    print("written:", out_path, flush=True)


if __name__ == "__main__":
    main()
