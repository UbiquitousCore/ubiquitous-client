#!/usr/bin/env python
"""Fail if a doc comment sits directly above another comment.

A comment directly above another, with no code between them, is a doc whose
member moved out or was renamed: what a reader sees above a declaration then
describes something else. AGENTS.md section 5 asks for this check after
anything is moved. It sees both block docs and one-line docs.

    python tools/check_doubled_comments.py

Exit code 0 = clean, 1 = a hit, each printed as path:line.

The one benign hit is a `@vitest-environment` pragma above a test file's own
doc, and files under test/ are not scanned.
"""

from __future__ import print_function

import os
import re
import sys

ROOTS = ("client/src", "client/dev")
EXTENSIONS = (".ts", ".tsx")

OPENS = re.compile(r"^\s*/\*")
CLOSES_OWN_LINE = re.compile(r"^\s*\*/\s*$")
ONE_LINE_DOC = re.compile(r"^\s*/\*\*.*\*/\s*$")


def doc_ends(line):
    """Whether this line is where a doc comment ends."""
    return bool(CLOSES_OWN_LINE.match(line) or ONE_LINE_DOC.match(line))


def check(path):
    with open(path, encoding="utf-8") as handle:
        lines = handle.read().split("\n")
    hits = []
    for number in range(len(lines) - 1):
        if doc_ends(lines[number]) and OPENS.match(lines[number + 1]):
            hits.append(number + 1)
    return hits


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    bad = 0
    for top in ROOTS:
        for directory, _, names in os.walk(os.path.join(root, top)):
            for name in sorted(names):
                if not name.endswith(EXTENSIONS):
                    continue
                path = os.path.join(directory, name)
                for line in check(path):
                    print("%s:%d" % (os.path.relpath(path, root), line))
                    bad += 1
    if bad:
        print("%d doubled comment(s): the doc above another comment describes something else" % bad)
        return 1
    print("clean: no doubled comments")
    return 0


if __name__ == "__main__":
    sys.exit(main())
