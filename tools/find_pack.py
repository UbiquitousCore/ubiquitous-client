#!/usr/bin/env python
"""Print the path of a build's res.bin, extracting it from an .ipa if needed.

    python tools/find_pack.py 1.1.4
    UBIQUITOUS_PACK=$(python tools/find_pack.py 1.1.4) npm test

Looks, in order, in `.cache/<version>/` here, then in `.cache/<version>/` of
any sibling checkout. Failing that it unpacks res.bin and tables.bin from
`*-<version>.ipa` found in the directories given by --ipa-dir (repeatable) or
the UBIQUITOUS_IPA_DIR environment variable, into `.cache/<version>/` here
(git-ignored). Nothing it prints or writes is ever committed.

Exit code 0 = path printed on stdout, 1 = not found (reason on stderr).
"""

from __future__ import print_function

import argparse
import glob
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WANTED = ("res.bin", "tables.bin")


def cached(version):
    here = os.path.join(ROOT, ".cache", version, "res.bin")
    siblings = sorted(glob.glob(os.path.join(os.path.dirname(ROOT), "*", ".cache", version, "res.bin")))
    for path in [here] + siblings:
        if os.path.isfile(path):
            return path
    return None


def extract(version, ipa_dirs):
    for folder in ipa_dirs:
        for ipa in sorted(glob.glob(os.path.join(folder, "**", "*-%s.ipa" % version), recursive=True)):
            out = os.path.join(ROOT, ".cache", version)
            os.makedirs(out, exist_ok=True)
            with zipfile.ZipFile(ipa) as archive:
                for name in archive.namelist():
                    parts = name.split("/")
                    if len(parts) == 3 and parts[0] == "Payload" and parts[2] in WANTED:
                        sys.stderr.write("extracting %s from %s\n" % (parts[2], os.path.basename(ipa)))
                        with archive.open(name) as src, open(os.path.join(out, parts[2]), "wb") as dst:
                            while True:
                                chunk = src.read(1 << 20)
                                if not chunk:
                                    break
                                dst.write(chunk)
            if os.path.isfile(os.path.join(out, "res.bin")):
                return os.path.join(out, "res.bin")
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("version", help="build, e.g. 1.1.4 or 2.2.0")
    parser.add_argument("--ipa-dir", action="append", default=[], help="folder searched for .ipa files")
    args = parser.parse_args()

    found = cached(args.version)
    if not found:
        env = os.environ.get("UBIQUITOUS_IPA_DIR")
        found = extract(args.version, args.ipa_dir + ([env] if env else []))
    if not found:
        sys.stderr.write(
            "no res.bin for %s: put one in .cache/%s/ or pass --ipa-dir / set UBIQUITOUS_IPA_DIR\n"
            % (args.version, args.version)
        )
        return 1
    print(found)
    return 0


if __name__ == "__main__":
    sys.exit(main())
