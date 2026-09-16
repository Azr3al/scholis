#!/usr/bin/env python3
"""Inventory and prune clean git worktrees idle for N days."""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Worktree:
    path: Path
    branch: str
    head: str


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )


def parse_worktrees(repo: Path) -> list[Worktree]:
    proc = run(["git", "worktree", "list", "--porcelain"], cwd=repo)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)
    items: list[Worktree] = []
    path: Path | None = None
    head = ""
    branch = ""
    for line in proc.stdout.splitlines():
        if line.startswith("worktree "):
            if path is not None:
                items.append(Worktree(path=path, branch=branch, head=head))
            path = Path(line[len("worktree ") :])
            head = ""
            branch = ""
        elif line.startswith("HEAD "):
            head = line[len("HEAD ") :]
        elif line.startswith("branch "):
            ref = line[len("branch ") :]
            branch = ref.split("/")[-1] if ref else ""
        elif line == "detached":
            branch = "(detached)"
    if path is not None:
        items.append(Worktree(path=path, branch=branch, head=head))
    # Skip primary worktree (repo root)
    return [w for w in items if w.path.resolve() != repo.resolve()]


def is_dirty(path: Path) -> bool:
    proc = run(["git", "status", "--porcelain"], cwd=path)
    return bool(proc.stdout.strip())


def commit_date(repo: Path, head: str) -> dt.datetime | None:
    if not head:
        return None
    proc = run(["git", "show", "-s", "--format=%cI", head], cwd=repo)
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    return dt.datetime.fromisoformat(proc.stdout.strip())


def path_mtime(path: Path) -> dt.datetime:
    ts = path.stat().st_mtime
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc)


def activity(repo: Path, wt: Worktree) -> dt.datetime:
    dates = [path_mtime(wt.path)]
    cd = commit_date(repo, wt.head)
    if cd is not None:
        if cd.tzinfo is None:
            cd = cd.replace(tzinfo=dt.timezone.utc)
        dates.append(cd.astimezone(dt.timezone.utc))
    return max(dates)


def branch_merged_into_dev(repo: Path, branch: str) -> bool:
    if not branch or branch == "(detached)":
        return False
    for tip in ("origin/dev", "dev"):
        proc = run(["git", "merge-base", "--is-ancestor", branch, tip], cwd=repo)
        if proc.returncode == 0:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--be-repo", type=Path, required=True)
    parser.add_argument("--fe-repo", type=Path, required=True)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--apply", action="store_true", help="Actually remove; default dry-run")
    parser.add_argument("--out-md", type=Path, required=True)
    args = parser.parse_args()

    now = dt.datetime.now(tz=dt.timezone.utc)
    cutoff = now - dt.timedelta(days=args.days)
    rows: list[dict] = []

    for label, repo in (("be", args.be_repo), ("fe", args.fe_repo)):
        for wt in parse_worktrees(repo):
            dirty = is_dirty(wt.path)
            act = activity(repo, wt)
            action = "skipped_recent"
            branch_deleted = False
            notes = ""
            if dirty:
                action = "skipped_dirty"
            elif act <= cutoff:
                if args.apply:
                    rem = run(["git", "worktree", "remove", "--force", str(wt.path)], cwd=repo)
                    if rem.returncode != 0:
                        # retry without --force if path already gone issues; record failure
                        rem = run(["git", "worktree", "remove", str(wt.path)], cwd=repo)
                    if rem.returncode != 0:
                        action = "failed"
                        notes = (rem.stderr or rem.stdout).strip()
                    else:
                        action = "removed"
                        if branch_merged_into_dev(repo, wt.branch):
                            br = run(["git", "branch", "-d", wt.branch], cwd=repo)
                            branch_deleted = br.returncode == 0
                            if not branch_deleted:
                                notes = f"branch left: {(br.stderr or br.stdout).strip()}"
                        else:
                            notes = "branch left (not merged into dev)"
                else:
                    action = "would_remove"
                    notes = "dry-run"
            rows.append(
                {
                    "repo": label,
                    "path": str(wt.path),
                    "branch": wt.branch,
                    "last_activity": act.date().isoformat(),
                    "dirty": dirty,
                    "action": action,
                    "branch_deleted": branch_deleted,
                    "notes": notes,
                }
            )

    lines = [
        f"# Worktree prune ({now.date().isoformat()})",
        "",
        f"Cutoff: idle ≥ {args.days} days (activity ≤ {cutoff.date().isoformat()}). Apply={args.apply}.",
        "",
        "| repo | path | branch | last_activity | dirty | action | branch_deleted | notes |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        notes = (r["notes"] or "").replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {r['repo']} | `{r['path']}` | `{r['branch']}` | {r['last_activity']} | {r['dirty']} | {r['action']} | {r['branch_deleted']} | {notes} |"
        )
    lines.append("")
    args.out_md.write_text("\n".join(lines))
    print(f"Wrote {args.out_md} ({len(rows)} worktrees)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
