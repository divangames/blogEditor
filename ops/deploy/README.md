# VPS deployment by manifest

Production entry point: `/usr/local/sbin/update-outmax-editor`, a forced-command wrapper executing `/usr/bin/python3 /usr/local/libexec/outmax-deploy.py`. The restricted SSH key still has no shell access. Administrative installation uses a separate approved login; credentials are never packaged.

## Build and validate

1. Build a Python-hosting folder with `prepare_full_deploy.build_python_hosting`.
2. Set `deploy_vps.PACKAGE_DIR` to that folder and `PATCH_ARCHIVE` to a fresh path. Call `build_vps_patch()`; it collects deployable files recursively and creates `deploy-manifest.json`.
3. Run `python tests/deploy-manifest-check.py`; test the full and extracted manifest packages on isolated demo servers. Freeze the archive SHA256 before upload.
4. `deploy_vps.upload_archive(path)` uploads the tested ZIP through the restricted `deploy` command. The transport timeout is 600 seconds to accommodate dependencies and health checks.
5. Verify `DEPLOY_OK`, HTTP smoke checks and installed hashes. `/opt/outmax-editor-backups/manifest-<timestamp>-<id>/receipt.json` records the transaction and previous versions.

## Contract

Manifest v1 lists every file exactly once, with `path`, `size` and `sha256`. No unlisted payload files, links, special files, absolute/traversing paths, Windows separators, hidden paths, mutable data or machine credentials are accepted. ZIP CRC and all Python syntax are checked before installation. Files omitted from a later update are not deleted automatically.

Limits: ZIP 1000 bytes–50 MiB inclusive, expanded total 500 MiB, one file 100 MiB, 10,000 ZIP entries. Protected paths include `articles`, `uploads`, `logs`, `backups`, `.venv`, other hidden paths, `deploy_settings.py`, README with hosting credentials, database/key files and Python caches.

All new code files use mode 0644 and directories 0755. The loader/helper are outside the application tree and cannot be replaced by an application ZIP. Existing application settings and `/etc/outmax-editor.env` remain untouched.

An exclusive lock prevents parallel updates. Dependency installation is skipped when requirements are unchanged. On failure, replaced files are restored with original modes/owners; newly installed files and empty new directories are removed. The old dependency requirements are reapplied if dependencies changed, then the old service is restarted and checked. If service recovery fails, the loader reports that administrator attention is required. Existing archives without a manifest retain the original fixed-file installation behavior for compatibility; this does not prune newer files.

## Current production rollout

26.10.2026: manifest package `release/manifest-deploy-qa-20261026/manifest-vps.zip`, 347 files, 26,801,430 bytes. Result and immutable hash: `release/manifest-deploy-state.json`. Previous loader: `/usr/local/sbin/update-outmax-editor.backup-20261026-manifest`. Previous accepted application archive is kept in the package's `rollback` directory.

The previous loader can be reinstated by an administrator copying its backup over `/usr/local/sbin/update-outmax-editor` with mode 0750. This changes only the deployment mechanism, not application data. Automatic transaction rollback is tested with forced health and mid-copy failures on isolated directories on Windows and Linux.
