#!/usr/bin/env python3
"""Build a publishable static site bundle for GitHub Pages.

The data under ``static_site/data/`` is prebuilt and committed: this repository
is public and contains no Django code and no database dump, so no data is
generated here. When the underlying data changes, regenerate that directory
elsewhere and commit it.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
import shutil
import subprocess
from pathlib import Path
from typing import Iterable, Set


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def safe_iter(values: Iterable[str | None]) -> Iterable[str]:
    for value in values:
        if value:
            yield value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="static_site/site", help="Output directory for publishable site")
    parser.add_argument("--data", default="static_site/data", help="Generated data directory")
    parser.add_argument("--media", default="mediafiles", help="Source media directory")
    parser.add_argument("--jsmol", default="staticfiles/database/jsmol", help="Source JSmol directory")
    args = parser.parse_args()

    repo_root = Path.cwd()
    output_root = repo_root / args.output
    data_root = repo_root / args.data
    media_root = repo_root / args.media
    jsmol_root = repo_root / args.jsmol
    app_root = repo_root / "static_site" / "app"

    if not data_root.is_dir():
        raise SystemExit(
            f"Data directory {data_root} not found. Regenerate static_site/data/ and commit it."
        )

    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    # Chart.js is vendored from node_modules rather than a CDN, so the page loads
    # nothing from a third party. package-lock.json pins the version.
    # No Hammer.js: it only drives chartjs-plugin-zoom's touch gestures, which are
    # all disabled. The plugin guards it (`if (Hammer) { startHammer(...) }`) and
    # still installs chart.zoom/pan/resetZoom, which is all the buttons need.
    vendored = [
        ("chart.js/dist/chart.umd.min.js", "chart.min.js"),
        ("chartjs-plugin-zoom/dist/chartjs-plugin-zoom.min.js", "chartjs-plugin-zoom.min.js"),
    ]
    for rel, name in vendored:
        src = repo_root / "node_modules" / Path(rel)
        if src.exists():
            copy_file(src, output_root / "assets" / name)
        else:
            print(f"WARNING: {src} missing - run `npm ci`")

    # Stamp the build into the page: the git revision plus the time it was built.
    # It becomes the cache-busting query string as well, so a deploy invalidates
    # the assets automatically and there is no version number to maintain, and it
    # is visible on the page so a deployed site can be told apart from a stale one.
    try:
        revision = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=repo_root,
            capture_output=True, text=True, check=True).stdout.strip()
    except Exception:  # noqa: BLE001 - a tarball export has no git
        revision = "nogit"
    build_id = f"{revision}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}"
    index_html = (app_root / "index.html").read_text(encoding="utf-8").replace("__BUILD__", build_id)
    (output_root / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (output_root / "index.html").write_text(index_html, encoding="utf-8")
    print(f"Build id: {build_id}")
    copy_file(app_root / "404.html", output_root / "404.html")
    # Icons and robots.txt sit in app/ and are copied straight through.
    for extra in ("favicon.svg", "robots.txt"):
        if (app_root / extra).exists():
            copy_file(app_root / extra, output_root / extra)
    shutil.copytree(app_root / "assets", output_root / "assets", dirs_exist_ok=True)
    shutil.copytree(data_root, output_root / "data", dirs_exist_ok=True)
    shutil.copytree(jsmol_root, output_root / "staticfiles" / "database" / "jsmol", dirs_exist_ok=True)
    (output_root / ".nojekyll").write_text("", encoding="utf-8")

    referenced_media: Set[str] = set()
    materials_dir = data_root / "materials"
    for material_file in materials_dir.glob("*.json"):
        # Lazily loaded series sit beside their material as <slug>.<series>.json
        # and are plain arrays, not material objects.
        if "." in material_file.stem:
            continue
        material = json.loads(material_file.read_text(encoding="utf-8"))
        files = material.get("files", {})
        # Only what the frontend can actually reach. The four *_data fields are the
        # CSVs Django parsed its rows from — their values are already in the JSON
        # and nothing links to the files, so shipping them added ~6 MB nobody could
        # open. Same for reference PDFs, which no page links to either. They stay
        # in the repository as the source of record; they just are not deployed.
        referenced_media.update(safe_iter(
            files.get(key) for key in ("cif", "cif_for_jsmol", "structure_plot")
        ))

    layer_types_dir = data_root / "layer-types"
    for layer_file in layer_types_dir.glob("*.json"):
        layer = json.loads(layer_file.read_text(encoding="utf-8"))
        if layer.get("plot"):
            referenced_media.add(layer["plot"])

    absent = []
    for rel_path in sorted(referenced_media):
        src = media_root / rel_path
        if src.exists():
            copy_file(src, output_root / "mediafiles" / rel_path)
        else:
            absent.append(rel_path)

    if absent:
        # build_data already drops material file fields whose file is missing, so
        # anything left here is referenced from somewhere it does not check
        # (currently reference PDFs). Never fail silently on it.
        print(f"WARNING: {len(absent)} referenced media file(s) not found in {media_root}:")
        for rel_path in absent:
            print(f"  missing: {rel_path}")

    print(f"Site bundle created: {output_root}")
    print(f"Data files: {len(list((output_root / 'data').rglob('*.json')))}")
    print(f"Media files copied: {len(list((output_root / 'mediafiles').rglob('*.*')))}")


if __name__ == "__main__":
    main()
