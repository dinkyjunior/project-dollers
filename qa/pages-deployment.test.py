"""Deployment success requires both the exact build and hosted content identity."""
import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('pages', Path(__file__).resolve().parents[1] / 'scripts/verify-pages-deployment.py')
PAGES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PAGES)


class DeploymentTests(unittest.TestCase):
    def run_verifier(self, build, content, clock):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'index.html').write_bytes(b'verified-page')
            def api(endpoint):
                return {'html_url': 'https://example.invalid/project/'} if endpoint.endswith('/pages') else build
            with patch.object(PAGES, 'ROOT', root), patch.object(PAGES, 'api', side_effect=api), patch.object(PAGES, 'hosted_files', return_value=['index.html']), patch.object(PAGES.urllib.request, 'urlopen', side_effect=lambda *a, **k: io.BytesIO(content)), patch.object(PAGES.time, 'monotonic', side_effect=clock), patch.object(PAGES.time, 'sleep'), patch.dict(PAGES.os.environ, {'GITHUB_REPOSITORY':'owner/repo'}), patch('sys.argv', ['verify', '--commit', 'approved', '--timeout', '5']), contextlib.redirect_stdout(io.StringIO()) as output:
                PAGES.main()
                return output.getvalue()

    def test_exact_build_and_hosted_bytes_required(self):
        result = self.run_verifier({'commit':'approved','status':'built'}, b'verified-page', [0,0])
        self.assertIn('hostedFilesVerified', result)

    def test_old_build_cannot_establish_deployment(self):
        with self.assertRaisesRegex(SystemExit, 'timed out'):
            self.run_verifier({'commit':'old','status':'built'}, b'verified-page', [0,0,6])

    def test_stale_hosted_bytes_cannot_establish_deployment(self):
        with self.assertRaisesRegex(SystemExit, 'Hosted files do not match'):
            self.run_verifier({'commit':'approved','status':'built'}, b'stale-page', [0,0,6])

    def test_failed_build_reported(self):
        with self.assertRaisesRegex(SystemExit, 'Pages build failed'):
            self.run_verifier({'commit':'approved','status':'errored','error':'build error'}, b'verified-page', [0,0])


if __name__ == '__main__':
    unittest.main()
