#!/usr/bin/env python3
"""Split static_site/data/index.json into index.json + references.json + peak-table.json.

Home, list and overview render only the materials/layer-types/cations/stats, so the
references and the peak table do not need to be in the file fetched on every route.
This rewrites index.json without those two keys and writes each to its own file.
Idempotent: if the keys are already gone it just refreshes the two side files.

Run from the repository root:  python tools/split_index.py
"""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path("static_site/data")


def main() -> None:
    index_path = DATA / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))

    references = index.pop("references", None)
    peak_table = index.pop("peak_table", None)

    if references is not None:
        (DATA / "references.json").write_text(
            json.dumps(references, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"references.json: {len(references)} entries")
    if peak_table is not None:
        (DATA / "peak-table.json").write_text(
            json.dumps(peak_table, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"peak-table.json: {len(peak_table)} rows")

    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"index.json: {index_path.stat().st_size} bytes, keys: {', '.join(index)}")


if __name__ == "__main__":
    main()
