"""Tests for check_no_assets, against synthetic files in a scratch directory.

    python -m unittest discover -s tools -p "test_*.py"
"""

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import check_no_assets as guard  # noqa: E402

# Enough of a PNG to be one; the checks only look at bytes.
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

PLAIN_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'


class Scratch(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.root = tempfile.mkdtemp()
        os.chdir(self.root)

    def tearDown(self):
        os.chdir(self.old)
        shutil.rmtree(self.root)

    def write(self, path, body):
        folder = os.path.dirname(path)
        if folder and not os.path.isdir(folder):
            os.makedirs(folder)
        with open(path, "wb") as handle:
            handle.write(body)

    def notes(self, *entries):
        """Provenance notes describing the given files, each as (path, extra lines)."""
        rows = ["# Provenance", ""]
        for path, extra in entries:
            rows += ["### `%s`" % path, "", "- Made by: someone", "- How: by hand",
                     "- Game assets used as input: none"] + list(extra) + [""]
        self.write("PROVENANCE.md", "\n".join(rows).encode("utf-8"))
        return "PROVENANCE.md"

    def check(self, paths, allowed):
        return dict(guard.offences(paths, allowed=set(allowed), provenance="PROVENANCE.md"))


class AllowedByNameOnly(Scratch):
    def test_an_image_beside_an_allowed_one_is_refused(self):
        self.notes(("art/coin.png", []))
        self.write("art/coin.png", PNG)
        self.write("art/other.png", PNG)
        found = self.check(["art/coin.png", "art/other.png"], ["art/coin.png"])
        self.assertNotIn("art/coin.png", found)
        self.assertIn("extension", found["art/other.png"])

    def test_an_allowed_image_with_no_entry_is_refused(self):
        self.notes(("art/coin.png", []))
        self.write("art/coin.png", PNG)
        self.write("art/ring.png", PNG)
        found = self.check(["art/coin.png", "art/ring.png"], ["art/coin.png", "art/ring.png"])
        self.assertNotIn("art/coin.png", found)
        self.assertIn("no entry", found["art/ring.png"])

    def test_no_notes_at_all_refuses_every_allowed_image(self):
        self.write("art/coin.png", PNG)
        found = self.check(["art/coin.png"], ["art/coin.png"])
        self.assertIn("no entry", found["art/coin.png"])

    def test_a_deleted_allowed_image_publishes_nothing(self):
        self.notes()
        self.assertEqual(self.check(["art/gone.png"], ["art/gone.png"]), {})

    def test_allowed_non_images_need_no_entry(self):
        self.notes()
        self.write("client/package-lock.json", b"{}")
        self.assertEqual(self.check(["client/package-lock.json"], ["client/package-lock.json"]), {})


class ProvenanceManifests(Scratch):
    def test_a_manifest_is_refused(self):
        for marker in (b"c2pa", b"jumd", b"caBX"):
            self.notes(("art/coin.png", []))
            self.write("art/coin.png", PNG + b"....." + marker + b"....")
            found = self.check(["art/coin.png"], ["art/coin.png"])
            self.assertIn("manifest", found.get("art/coin.png", ""), marker)

    def test_a_manifest_the_entry_accepts_passes(self):
        self.notes(("art/coin.png", ["- AI provenance manifest: accepted, resized only"]))
        self.write("art/coin.png", PNG + b"jumb....jumd....c2pa")
        self.assertEqual(self.check(["art/coin.png"], ["art/coin.png"]), {})

    def test_acceptance_belongs_to_one_entry(self):
        self.notes(("art/a.png", ["- AI provenance manifest: accepted"]), ("art/b.png", []))
        self.write("art/a.png", PNG + b"c2pa")
        self.write("art/b.png", PNG + b"c2pa")
        found = self.check(["art/a.png", "art/b.png"], ["art/a.png", "art/b.png"])
        self.assertNotIn("art/a.png", found)
        self.assertIn("manifest", found["art/b.png"])


class SvgRasters(Scratch):
    def test_a_plain_vector_svg_passes(self):
        self.notes(("art/ring.svg", []))
        self.write("art/ring.svg", PLAIN_SVG)
        self.assertEqual(self.check(["art/ring.svg"], ["art/ring.svg"]), {})

    def test_an_image_element_is_refused(self):
        self.notes(("art/ring.svg", []))
        self.write("art/ring.svg", b'<svg><image href="ring.png"/></svg>')
        self.assertIn("raster", self.check(["art/ring.svg"], ["art/ring.svg"])["art/ring.svg"])

    def test_any_data_uri_is_refused_however_small(self):
        self.notes(("art/ring.svg", []))
        self.write("art/ring.svg", b'<svg><rect fill="url(data:x)"/></svg>')
        self.assertIn("raster", self.check(["art/ring.svg"], ["art/ring.svg"])["art/ring.svg"])

    def test_an_svg_not_allowed_is_refused_by_extension(self):
        self.notes()
        self.write("art/ring.svg", PLAIN_SVG)
        self.assertIn("extension", self.check(["art/ring.svg"], [])["art/ring.svg"])


class TextAndData(Scratch):
    def test_a_large_base64_image_in_source_is_refused(self):
        self.notes()
        payload = b"A" * (guard.EMBEDDED_IMAGE_LIMIT + 10)
        self.write("src/x.ts", b"const x = 'data:image/png;base64," + payload + b"';")
        self.assertIn("base64", self.check(["src/x.ts"], [])["src/x.ts"])

    def test_game_data_extensions_are_refused(self):
        self.notes()
        found = self.check(["res.bin", "model/a.bdae", "ui/IGM.swf"], [])
        self.assertEqual(sorted(found), ["model/a.bdae", "res.bin", "ui/IGM.swf"])

    def test_fonts_sound_archives_and_app_files_are_refused(self):
        self.notes()
        paths = ["a.woff2", "a.ttf", "a.mp3", "a.zip", "a.mov", "a.m4v",
                 "Info.plist", "a.nib", "a.strings", "EN.bar", "a.graphml",
                 "a.sql", "a.csv"]
        self.assertEqual(sorted(self.check(paths, [])), sorted(paths))

    def test_binary_bytes_under_a_text_extension_are_refused(self):
        self.notes()
        self.write("src/x.ts", b"export const x = 1;\n\x00\x01\x02")
        self.assertIn("binary", self.check(["src/x.ts"], [])["src/x.ts"])

    def test_bytes_that_are_not_utf8_are_refused(self):
        self.notes()
        self.write("notes/x.txt", b"\xff\xfe\x80\x81 text")
        self.assertIn("binary", self.check(["notes/x.txt"], [])["notes/x.txt"])

    def test_utf8_text_passes(self):
        self.notes()
        self.write("src/x.ts", u"export const dash = '\u2014';\n".encode("utf-8"))
        self.write("README", b"plain words\n")
        self.assertEqual(self.check(["src/x.ts", "README"], []), {})

    def test_a_character_cut_by_the_sniff_window_is_still_text(self):
        self.notes()
        body = b"a" * (guard.BINARY_SNIFF - 1) + u"\u2014".encode("utf-8") + b"tail"
        self.write("src/long.ts", body)
        self.assertEqual(self.check(["src/long.ts"], []), {})

    def test_an_allowed_image_is_not_refused_as_binary(self):
        self.notes(("art/coin.png", []))
        self.write("art/coin.png", PNG)
        self.assertEqual(self.check(["art/coin.png"], ["art/coin.png"]), {})


class ShippedNotes(unittest.TestCase):
    def test_every_allowed_image_in_the_repository_has_an_entry(self):
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        notes = guard.read_provenance(os.path.join(repo, guard.PROVENANCE))
        images = [p for p in guard.ALLOWED
                  if os.path.splitext(p)[1].lower() in guard.IMAGE_EXT]
        self.assertTrue(images)
        for path in images:
            self.assertIn(path, notes, path)


if __name__ == "__main__":
    unittest.main()
