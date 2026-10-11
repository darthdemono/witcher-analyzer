"""Acceptance gate: every local Witcher save must decode with zero undecoded bytes and its summary must validate
against schema.json. Skips with no saves.   python3 -m unittest discover -s tests"""
import glob, json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from witcher import container
from witcher.errors import WitcherError
from witcher_to_md import load_db, summarize_file

CORPUS = ("/mnt/nobara-data/Backup/Documents/The Witcher/saves/*.TheWitcherSave", "~/Documents/The Witcher/**/*.TheWitcherSave")


def saves():
    return sorted({Path(f) for pat in CORPUS for f in glob.glob(str(Path(pat).expanduser()), recursive=True)})


class Saves(unittest.TestCase):
    def test_every_save_decodes_completely(self):
        files = saves()
        if not files: self.skipTest("no local saves")
        db = load_db()
        for f in files[:: max(1, len(files) // 12)]:  # a spread across the playthrough; the full set is tools/parity.mjs
            with self.subTest(save=f.name):
                m = summarize_file(f, db)
                self.assertEqual(m["integrity"]["undecodedBytes"], 0)
                self.assertGreater(m["quests"]["total"], 100)

    def test_summary_matches_schema(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("jsonschema not installed (dev-only check)")
        files = saves()
        if not files: self.skipTest("no local saves")
        schema = json.loads((ROOT / "schema.json").read_text())
        db = load_db()
        for f in files[:: max(1, len(files) // 4)]:
            with self.subTest(save=f.name):
                jsonschema.validate(json.loads(json.dumps(summarize_file(f, db), default=list)), schema)

    def test_junk_is_refused_cleanly(self):
        for blob in (b"", b"RGMH" + b"\0" * 100, b"not a save" * 1000):
            with self.assertRaises(WitcherError): container.read(blob)


if __name__ == "__main__":
    unittest.main()
