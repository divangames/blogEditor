"""Build a static folder and ZIP archive for deployment to a custom web server."""

from pathlib import Path
import shutil
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "docs"
OUTPUT_DIR = ROOT / "server-deploy"
OUTPUT_ARCHIVE = ROOT / "server-deploy.zip"


def build_static_site() -> None:
    """Refresh the browser edition stored in the docs directory."""
    subprocess.run([sys.executable, "build_pages.py"], cwd=ROOT, check=True)


def prepare_output_folder() -> None:
    """Replace the generated server folder with the current static site."""
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    shutil.copytree(SOURCE, OUTPUT_DIR)


def prepare_zip_archive() -> None:
    """Create an archive whose root contains the deployable site files."""
    if OUTPUT_ARCHIVE.exists():
        OUTPUT_ARCHIVE.unlink()
    with zipfile.ZipFile(OUTPUT_ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(OUTPUT_DIR.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(OUTPUT_DIR))


def main() -> None:
    """Build and validate both deployment artifacts."""
    build_static_site()
    for required in (SOURCE / "index.html", SOURCE / "editor" / "index.html"):
        if not required.is_file():
            raise FileNotFoundError(f"Missing required deployment file: {required}")
    prepare_output_folder()
    prepare_zip_archive()
    file_count = sum(path.is_file() for path in OUTPUT_DIR.rglob("*"))
    archive_size_mb = OUTPUT_ARCHIVE.stat().st_size / (1024 * 1024)
    print()
    print(f"Server folder: {OUTPUT_DIR}")
    print(f"ZIP archive:   {OUTPUT_ARCHIVE}")
    print(f"Files: {file_count}; archive size: {archive_size_mb:.2f} MB")
    print("Upload the folder contents or extract the ZIP into the web root.")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Server package was not created: {exc}", file=sys.stderr)
        raise SystemExit(1)
