#!/usr/bin/env python3
"""Dependency-free, read-only checks for this incident's repository infection paths.

Run from any directory: python scripts/check-repository-security.py [repository]
Exit 0: checked rules passed; 1: findings; 2: invalid target or unreadable files.
This is a targeted guard, not an antivirus or proof that a machine is clean.
"""
import hashlib
import json
from pathlib import Path
import re
import sys

KNOWN_SHA256 = "3ae470cabb9412bf5f0e64e1f71b458e14eb10b19070845597d5b8230b27d552"
SKIP = {".git", "node_modules", ".next", ".next-integration", "dist", "coverage", "artifacts",
        "test-results", "playwright-report", "__pycache__", ".venv", "venv"}
CODE = {".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".lfk"}
FONTS = {".woff", ".woff2", ".ttf", ".otf", ".eot"}
LIFECYCLE = {"preinstall", "install", "postinstall", "prepare"}


def inspect(path, data):
    """Inspect bytes only. Never import, evaluate, or execute inspected content."""
    issues = []
    name = path.as_posix().lower()
    suffix = path.suffix.lower()
    text = data.decode("utf-8", errors="replace")
    if hashlib.sha256(data).hexdigest() == KNOWN_SHA256:
        issues.append("KNOWN_PAYLOAD")
    if suffix == ".lfk":
        issues.append("DISGUISED_SCRIPT_EXTENSION")
    if path.name.lower() in {"temp_auto_push.bat", "temp_interactive_push.bat"}:
        issues.append("UNREVIEWED_PUSH_HELPER")
    editor = ".vscode/" in name or suffix == ".code-workspace"
    if editor:
        if re.search(r'["\']runOn["\']\s*:\s*["\']folderOpen["\']', text):
            issues.append("AUTOMATIC_EDITOR_TASK")
        if re.search(r'["\']task\.allowAutomaticTasks["\']\s*:\s*(true|["\']on["\'])', text):
            issues.append("AUTOMATIC_TASK_PERMISSION")
        if re.search(r'fa-solid\.lfk|node\s+[^\r\n]*\.(?:woff2?|ttf|eot|lfk)', text, re.I):
            issues.append("EDITOR_EXECUTES_ASSET")
    if name.endswith("package.json"):
        try:
            package = json.loads(text)
            scripts = package.get("scripts", {})
            if not isinstance(scripts, dict):
                issues.append("INVALID_PACKAGE_SCRIPTS")
            elif LIFECYCLE.intersection(scripts):
                issues.append("INSTALL_LIFECYCLE_REQUIRES_SECURITY_REVIEW")
        except (ValueError, AttributeError):
            issues.append("INVALID_PACKAGE_JSON")
    if suffix in CODE or suffix in FONTS:
        if ("0x1eef0849eda15d87f64e51c73c8442cf3c8bcef3" in text.lower()
                or all(marker in text for marker in ("x-payload-b64", "windowsHide", "spawn("))):
            issues.append("REMOTE_LOADER_SIGNATURE")
        # Matches this payload's concealed JavaScript, including renamed copies.
        escapes = len(re.findall(r'\\u[0-9a-fA-F]{4}', text))
        if escapes > 50 and re.search(r'\b(?:global|require|function)\b', text):
            issues.append("OBFUSCATED_EXECUTABLE")
        if suffix in FONTS and re.search(r'\b(?:require\s*\(|global\s*\[|eval\s*\()', text):
            issues.append("JAVASCRIPT_IN_FONT")
    if (name.endswith(".claude/settings.json") or name.endswith(".claude/settings.local.json")):
        try:
            if json.loads(text).get("hooks"):
                issues.append("AGENT_EXECUTION_HOOK_REQUIRES_REVIEW")
        except (ValueError, AttributeError):
            issues.append("INVALID_AGENT_SETTINGS")
    return issues


def scan(root):
    findings = []
    checked = 0
    def walk(directory):
        nonlocal checked
        for path in sorted(directory.iterdir()):
            relative = path.relative_to(root)
            if path.is_symlink():
                findings.append((relative.as_posix(), "SYMLINK_REQUIRES_REVIEW"))
                continue
            if path.is_dir():
                if path.name not in SKIP:
                    walk(path)
            elif path.is_file():
                # Secrets are not opened or printed by this check.
                if path.name == ".env" or path.name.startswith(".env."):
                    continue
                checked += 1
                if path.stat().st_size > 4 * 1024 * 1024:
                    if path.suffix.lower() in CODE or ".vscode" in relative.parts:
                        findings.append((relative.as_posix(), "EXECUTABLE_TOO_LARGE_TO_REVIEW"))
                    continue
                findings.extend((relative.as_posix(), issue)
                                for issue in inspect(relative, path.read_bytes()))
    walk(root)
    hooks = root / ".git" / "hooks"
    if hooks.is_dir():
        for hook in sorted(hooks.iterdir()):
            if hook.is_file() and not hook.name.endswith(".sample"):
                findings.append((f".git/hooks/{hook.name}", "LOCAL_GIT_HOOK_REQUIRES_REVIEW"))
    return checked, findings


def main():
    if len(sys.argv) > 2:
        print("Usage: python check-repository-security.py [repository]", file=sys.stderr)
        return 2
    root = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else Path(__file__).resolve().parents[1]
    if not root.is_dir():
        print("Repository directory does not exist.", file=sys.stderr)
        return 2
    try:
        checked, findings = scan(root)
    except OSError:
        print("Security check incomplete: a file could not be read.", file=sys.stderr)
        return 2
    for path, issue in findings:
        print(f"FAIL {issue}: {path}")
    print(f"Checked {checked} files; {len(findings)} finding(s). Excludes dependencies, build output, secrets and Git objects.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
