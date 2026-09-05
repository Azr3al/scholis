#!/usr/bin/env python3
"""Print Django test module labels for the full backend suite."""

from __future__ import annotations

from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    labels: list[str] = []

    for path in sorted((root / "schedjuice_backend" / "tests").glob("test_*.py")):
        labels.append(".".join(path.with_suffix("").relative_to(root).parts))

    for app in sorted(root.glob("app_*")):
        has_tests_py = (app / "tests.py").exists()
        has_tests_dir = (app / "tests").is_dir()

        if has_tests_dir:
            for path in sorted((app / "tests").glob("test_*.py")):
                labels.append(".".join(path.with_suffix("").relative_to(root).parts))

        if has_tests_py and not has_tests_dir:
            labels.append(f"{app.name}.tests")

        for path in sorted(app.glob("test_*.py")):
            labels.append(".".join(path.with_suffix("").relative_to(root).parts))

    for label in labels:
        print(label)


if __name__ == "__main__":
    main()
