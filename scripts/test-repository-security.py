"""Synthetic fixtures only; never runs or embeds the incident payload."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import re

spec = importlib.util.spec_from_file_location("guard", Path(__file__).with_name("check-repository-security.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class SecurityGuardTests(unittest.TestCase):
    def test_disguised_extension_and_renamed_font(self):
        self.assertIn("DISGUISED_SCRIPT_EXTENSION", guard.inspect(Path("public/test.lfk"), b"dummy"))
        self.assertIn("JAVASCRIPT_IN_FONT", guard.inspect(Path("public/new.woff"), b"global['x'] = 1"))

    def test_automatic_tasks_in_jsonc_and_workspace(self):
        data = b'{ // comment\n "runOn": "folderOpen", "task.allowAutomaticTasks": true }'
        for path in [".vscode/tasks.json", "project.code-workspace"]:
            issues = guard.inspect(Path(path), data)
            self.assertIn("AUTOMATIC_EDITOR_TASK", issues)
            self.assertIn("AUTOMATIC_TASK_PERMISSION", issues)

    def test_install_hook_and_invalid_manifest(self):
        self.assertIn("INSTALL_LIFECYCLE_REQUIRES_SECURITY_REVIEW", guard.inspect(Path("package.json"), b'{"scripts":{"postinstall":"anything"}}'))
        self.assertIn("INVALID_PACKAGE_JSON", guard.inspect(Path("package.json"), b"broken"))

    def test_renamed_obfuscated_code(self):
        data = b"function example() {} " + b"\\u0061" * 60
        self.assertIn("OBFUSCATED_EXECUTABLE", guard.inspect(Path("renamed.js"), data))

    def test_normal_source_and_font(self):
        self.assertEqual([], guard.inspect(Path("app.ts"), b"export const value = 1;"))
        self.assertEqual([], guard.inspect(Path("brand.woff2"), b"wOF2\x00\x01\x02"))
        self.assertEqual([], guard.inspect(Path("package.json"), b'{"scripts":{"build":"tsc"}}'))
        self.assertEqual([], guard.inspect(Path(".vscode/tasks.json"), b'{"runOn":"default"}'))

    def test_decoded_loader_indicators(self):
        markers = b"x-payload-b64 windowsHide spawn("
        self.assertIn("REMOTE_LOADER_SIGNATURE", guard.inspect(Path("renamed.js"), markers))

    def test_workflows_use_pinned_actions_and_guard_before_npm_install(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / ".github/workflows/repository-security.yml").read_text()
        self.assertIn("contents: read", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("python scripts/check-repository-security.py", workflow)
        self.assertIn("python scripts/test-repository-security.py", workflow)
        for path in (root / ".github/workflows").glob("*.yml"):
            source = path.read_text()
            for revision in re.findall(r"uses:\s+actions/[^@\s]+@([^\s]+)", source):
                self.assertRegex(revision, r"^[0-9a-f]{40}$")
            # Reset at each job: a guard in one job cannot protect another job.
            guarded = False
            for line in source.splitlines():
                if re.match(r"^  [A-Za-z0-9_-]+:", line):
                    guarded = False
                if "run: python scripts/check-repository-security.py" in line:
                    guarded = True
                if re.search(r"run:\s+npm\s+(ci|install)\b", line):
                    self.assertTrue(guarded, f"{path.name}: installation before security guard")

    def test_untracked_files_are_checked_and_dependencies_excluded(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as directory:
            root = Path(directory)
            (root / "untracked.lfk").write_text("synthetic")
            (root / "node_modules").mkdir()
            (root / "node_modules/ignored.lfk").write_text("synthetic")
            (root / ".git/hooks").mkdir(parents=True)
            (root / ".git/hooks/pre-push").write_text("synthetic")
            count, findings = guard.scan(root)
            self.assertEqual(1, count)
            self.assertIn(("untracked.lfk", "DISGUISED_SCRIPT_EXTENSION"), findings)
            self.assertIn((".git/hooks/pre-push", "LOCAL_GIT_HOOK_REQUIRES_REVIEW"), findings)


if __name__ == "__main__":
    unittest.main()
