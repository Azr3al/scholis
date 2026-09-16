#!/usr/bin/env python
"""Concurrency stress test for the unified chat REST endpoints
(Phase 3 mobile migration). See:
docs/superpowers/plans/2026-07-04-unified-chat-schema-phase3-mobile-migration-implementation.md

Point this at a LOCAL dev server backed by local Docker Postgres — never at
the shared Railway dev DB, since --include-writes creates real messages,
reactions, and read-state rows.

Usage (from schedjuice-reimagined-be/, with the dev server + local Postgres
running, see scripts/README section below):

    ./env/bin/python scripts/stress_test_chat_apis.py \
        --base-url http://127.0.0.1:8000/api/v1 \
        --tenant schedjuice.thiha.net \
        --course-ids 101,102,103,104,105 \
        --concurrency 25 \
        --requests 1000 \
        --run-id stress-001

Then, to check for N+1 query patterns surfaced under load (requires
DEBUG=true and NPLUSONE_ENABLED=true on the server process):

    ./env/bin/python scripts/nplusone/summarize.py logs/nplusone/*.jsonl \
        --output logs/nplusone/reports/stress-001.json --run-id stress-001
"""

from __future__ import annotations

import argparse
import random
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from threading import Lock

import requests
from requests.adapters import HTTPAdapter


@dataclass
class RequestResult:
    action: str
    status_code: int | None
    elapsed_ms: float
    error: str | None = None


@dataclass
class SharedState:
    """Data discovered up front and mutated safely from worker threads."""

    course_ids: list[int]
    thread_id_by_course: dict[int, int]
    dm_thread_id: int | None = None
    latest_message_by_thread: dict[int, int] = field(default_factory=dict)
    lock: Lock = field(default_factory=Lock)

    def record_latest_message(self, thread_id: int, message_id: int) -> None:
        with self.lock:
            self.latest_message_by_thread[thread_id] = message_id

    def random_message_id(self, thread_id: int) -> int | None:
        with self.lock:
            return self.latest_message_by_thread.get(thread_id)


def _login(base_url: str, tenant: str, email: str, password: str) -> str:
    resp = requests.post(
        f"{base_url}/login",
        json={"email": email, "password": password},
        headers={"X-Tenant": tenant},
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json()
    token = (body.get("data") or {}).get("access") or body.get("access")
    if not token:
        raise RuntimeError(f"Login response had no access token: {body}")
    return token


def _resolve_threads(
    session: requests.Session, base_url: str, headers: dict, course_ids: list[int]
) -> dict[int, int]:
    thread_id_by_course: dict[int, int] = {}
    for cid in course_ids:
        resp = session.get(f"{base_url}/courses/{cid}/chat/thread", headers=headers, timeout=15)
        resp.raise_for_status()
        thread_id_by_course[cid] = resp.json()["data"]["id"]
    return thread_id_by_course


def _make_actions(
    session: requests.Session,
    base_url: str,
    headers: dict,
    state: SharedState,
    include_writes: bool,
    run_id: str,
):
    req_headers = {**headers, "X-NPlusOne-Run-Id": run_id}

    def batch_preview() -> requests.Response:
        k = random.randint(1, len(state.course_ids))
        ids = random.sample(state.course_ids, k)
        return session.get(
            f"{base_url}/courses/chat/last-messages",
            params={"course_ids": ",".join(map(str, ids))},
            headers=req_headers,
            timeout=15,
        )

    def thread_messages() -> requests.Response:
        thread_id = random.choice(list(state.thread_id_by_course.values()))
        resp = session.get(
            f"{base_url}/chat/threads/{thread_id}/messages", headers=req_headers, timeout=15
        )
        if resp.ok:
            results = (resp.json().get("data") or {}).get("results") or []
            if results:
                state.record_latest_message(thread_id, results[0]["id"])
        return resp

    def presence() -> requests.Response:
        thread_id = random.choice(list(state.thread_id_by_course.values()))
        return session.get(
            f"{base_url}/chat/threads/{thread_id}/presence", headers=req_headers, timeout=15
        )

    def read_state_put() -> requests.Response:
        thread_id = random.choice(list(state.thread_id_by_course.values()))
        message_id = state.random_message_id(thread_id)
        if message_id is None:
            return thread_messages()
        return session.put(
            f"{base_url}/chat/threads/{thread_id}/read-state",
            json={"last_read_message_id": message_id},
            headers=req_headers,
            timeout=15,
        )

    def reaction_toggle() -> requests.Response:
        thread_id = random.choice(list(state.thread_id_by_course.values()))
        message_id = state.random_message_id(thread_id)
        if message_id is None:
            return thread_messages()
        emoji = random.choice(["\U0001f44d", "\u2764\ufe0f", "\U0001f602"])
        return session.post(
            f"{base_url}/chat/threads/{thread_id}/messages/{message_id}/reactions",
            json={"emoji": emoji},
            headers=req_headers,
            timeout=15,
        )

    def dm_message_post() -> requests.Response:
        if state.dm_thread_id is None:
            return batch_preview()
        return session.post(
            f"{base_url}/chat/threads/{state.dm_thread_id}/messages",
            json={"content": {"text": f"stress {time.time()}", "mentions": []}},
            headers=req_headers,
            timeout=15,
        )

    weighted: list[tuple[str, callable, int]] = [
        ("batch_preview", batch_preview, 4),
        ("thread_messages", thread_messages, 4),
        ("presence", presence, 2),
    ]
    if include_writes:
        weighted += [
            ("read_state_put", read_state_put, 2),
            ("reaction_toggle", reaction_toggle, 1),
            ("dm_message_post", dm_message_post, 1),
        ]
    return weighted


def _weighted_choice(weighted: list[tuple[str, callable, int]]):
    names, funcs, weights = zip(*weighted)
    idx = random.choices(range(len(funcs)), weights=weights, k=1)[0]
    return names[idx], funcs[idx]


def _run_one(name: str, func) -> RequestResult:
    start = time.monotonic()
    try:
        resp = func()
        elapsed_ms = (time.monotonic() - start) * 1000
        return RequestResult(action=name, status_code=resp.status_code, elapsed_ms=elapsed_ms)
    except Exception as exc:  # noqa: BLE001 - want every failure captured, not raised
        elapsed_ms = (time.monotonic() - start) * 1000
        return RequestResult(action=name, status_code=None, elapsed_ms=elapsed_ms, error=str(exc))


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(len(ordered) * pct))
    return ordered[idx]


def _print_summary(results: list[RequestResult], wall_seconds: float) -> None:
    by_action: dict[str, list[RequestResult]] = {}
    for r in results:
        by_action.setdefault(r.action, []).append(r)

    print("\n=== Stress test summary ===")
    print(f"Total requests: {len(results)} in {wall_seconds:.1f}s "
          f"({len(results) / wall_seconds:.1f} req/s)")
    header = f"{'action':<16} {'count':>6} {'errors':>7} {'p50 ms':>8} {'p90 ms':>8} {'p99 ms':>8}"
    print(header)
    print("-" * len(header))
    total_errors = 0
    for action, rows in sorted(by_action.items()):
        latencies = [r.elapsed_ms for r in rows]
        errors = [r for r in rows if r.error or (r.status_code and r.status_code >= 400)]
        total_errors += len(errors)
        print(
            f"{action:<16} {len(rows):>6} {len(errors):>7} "
            f"{statistics.median(latencies):>8.1f} {_percentile(latencies, 0.9):>8.1f} "
            f"{_percentile(latencies, 0.99):>8.1f}"
        )
    error_rate = total_errors / len(results) * 100 if results else 0
    print(f"\nError rate: {error_rate:.1f}% ({total_errors}/{len(results)})")
    if total_errors:
        print("\nSample errors:")
        seen = set()
        for r in results:
            if not (r.error or (r.status_code and r.status_code >= 400)):
                continue
            key = (r.action, r.status_code, r.error)
            if key in seen:
                continue
            seen.add(key)
            print(f"  [{r.action}] status={r.status_code} error={r.error}")
            if len(seen) >= 10:
                break


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api/v1")
    parser.add_argument("--tenant", required=True, help="X-Tenant header value, e.g. schedjuice.thiha.net")
    parser.add_argument("--email", default="james@schedjuice.com")
    parser.add_argument("--password", default="password123")
    parser.add_argument("--course-ids", required=True, help="Comma-separated course ids the test user belongs to")
    parser.add_argument("--dm-thread-id", type=int, default=None, help="Existing DM thread id for write stress")
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--requests", type=int, default=500)
    parser.add_argument("--run-id", default="stress-001", help="Tag applied to nplusone captures for this run")
    parser.add_argument(
        "--include-writes",
        action="store_true",
        help="Also exercise read-state PUT, reaction toggle, and DM message POST (mutates data)",
    )
    args = parser.parse_args()

    course_ids = [int(x) for x in args.course_ids.split(",") if x.strip()]
    if not course_ids:
        print("No course ids supplied", file=sys.stderr)
        sys.exit(1)

    print(f"Logging in as {args.email} against tenant {args.tenant}...")
    token = _login(args.base_url, args.tenant, args.email, args.password)

    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=args.concurrency, pool_maxsize=args.concurrency)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant": args.tenant}

    print(f"Resolving chat threads for {len(course_ids)} course(s)...")
    thread_id_by_course = _resolve_threads(session, args.base_url, headers, course_ids)

    state = SharedState(course_ids=course_ids, thread_id_by_course=thread_id_by_course, dm_thread_id=args.dm_thread_id)
    weighted = _make_actions(session, args.base_url, headers, state, args.include_writes, args.run_id)

    print(
        f"Running {args.requests} requests at concurrency={args.concurrency} "
        f"(writes {'ENABLED' if args.include_writes else 'disabled'})..."
    )
    start = time.monotonic()
    results: list[RequestResult] = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = []
        for _ in range(args.requests):
            name, func = _weighted_choice(weighted)
            futures.append(pool.submit(_run_one, name, func))
        for fut in as_completed(futures):
            results.append(fut.result())
    wall_seconds = time.monotonic() - start

    _print_summary(results, wall_seconds)
    print(
        f"\nIf NPLUSONE_ENABLED=true on the server, summarize captures with run-id={args.run_id!r}:\n"
        f"  ./env/bin/python scripts/nplusone/summarize.py logs/nplusone/*.jsonl "
        f"--output logs/nplusone/reports/{args.run_id}.json --run-id {args.run_id}"
    )


if __name__ == "__main__":
    main()
