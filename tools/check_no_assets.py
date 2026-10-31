#!/usr/bin/env python
"""Fail if anything git would commit looks like game data rather than our code.

HARD RULE for this repository: we publish only code we wrote. Nothing
extracted from the .ipa may be committed -- no textures, models, tables,
terrain, sounds, no decoded or re-encoded copies of them, no JSON dumps of
them, and no screenshots of the game rendering them.

Game data, images, sound, fonts and archives are banned by extension, and
any other file whose bytes are not text is refused as binary. The few
images this repository does ship are named
one by one in ALLOWED, and each of those must also have an entry in
PROVENANCE (who made it, how, and that no game asset went into it). An
allowed image is still opened and refused if it carries an AI-provenance
manifest its entry does not accept, or, for an SVG, an embedded raster.

Run before committing, or wire it into a pre-commit hook:

    python tools/check_no_assets.py            # check staged + untracked
    python tools/check_no_assets.py --tracked  # audit everything tracked

Exit code 0 = clean, 1 = something must not be committed.
"""

from __future__ import print_function

import os
import re
import subprocess
import sys

# Extensions that are game data in any form, decoded or not.
BANNED_EXT = {
    ".ipa", ".bin", ".bdae", ".tbl", ".tga", ".pvr", ".trn", ".msk", ".shw",
    ".itm", ".wld", ".phy", ".beff", ".swf", ".wav", ".dds", ".ktx",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".mp4", ".webm",
    ".pkm", ".astc", ".nav", ".terrain",
    # What else an unpacked .ipa holds: property lists, interface files,
    # string tables, the pack of interface words, and graph and data exports.
    ".plist", ".nib", ".strings", ".bar", ".graphml", ".sql", ".csv",
    ".sqlite", ".glb", ".gltf", ".obj", ".fbx", ".dump",
    # Video, sound and fonts. Fonts arrive through npm and are copied into
    # the build; none is committed.
    ".mov", ".m4v", ".avi", ".mkv",
    ".mp3", ".ogg", ".aac", ".m4a", ".caf", ".aif", ".aiff", ".flac", ".mid",
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
    # Archives and captures, which can hold any of the above.
    ".zip", ".gz", ".tgz", ".bz2", ".7z", ".tar", ".rar", ".xz", ".dmg",
    ".pak", ".apk", ".jar", ".pcap", ".pcapng", ".har",
    # An .svg is text, and can carry a whole raster inside it as a data: URI.
    # The extension proves nothing, so .svg is banned like the rest and ours
    # are named in ALLOWED.
    ".svg",
}

# How much of a file is read to tell text from binary. Everything this
# repository publishes is text except the images named in ALLOWED, so a
# binary file under any other name is refused whatever its extension says.
BINARY_SNIFF = 8192

# The pictures among those. An allowed file with one of these extensions
# needs a provenance entry and has its bytes inspected.
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"}

# Text files can smuggle a raster past an extension check. Any file we would
# otherwise let through gets read and checked for one.
EMBEDDED_IMAGE = re.compile(r"data:image/[a-zA-Z.+-]+;base64,")

# Only these are worth opening; a .ts or .md can embed just as easily as an
# .svg, so the check is by "is it text we are about to publish", not by kind.
SCANNED_EXT = {
    ".svg", ".html", ".htm", ".css", ".md", ".ts", ".tsx", ".js", ".jsx",
    ".json", ".txt", ".py", ".webmanifest",
}

# A data: URI this big is a payload, not an inline 1x1 spacer or a cursor.
EMBEDDED_IMAGE_LIMIT = 4 * 1024

# What a base64 payload is made of, so its end can be found without
# guessing at which quote or bracket closes it.
B64_CHARS = frozenset(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=")

# Byte markers of a C2PA / content-credentials manifest. JUMBF boxes are
# typed `jumb` / `jumd`, the manifest store is labelled `c2pa`, and a PNG
# carries the store in a `caBX` chunk. Generative tools write these when
# they create or edit an image, so their presence means the picture's
# history includes a step nobody here can vouch for.
PROVENANCE_MANIFEST = (b"c2pa", b"jumd", b"caBX")

# An SVG may draw only with its own vector elements. `<image` pulls in a
# raster, and a `data:` URI inlines one; either can hide a copied picture
# inside a file that reads as hand-written markup.
SVG_RASTER = re.compile(br"<image\b|data:", re.IGNORECASE)

# Narrow, reviewed exceptions, by exact path. Add to these only for files
# we authored ourselves, with a reason. Every image here also needs an entry
# in PROVENANCE.
ALLOWED = {
    # npm dependency lockfile; its size is package metadata, not game data.
    "client/package-lock.json",
    # The desktop window's own lockfile, for the same reason.
    "desktop/package-lock.json",
    # PWA app icons.
    "client/public/icons/icon-192.png",
    "client/public/icons/icon-512.png",
    "client/public/icons/icon-512-maskable.png",
    "client/public/icons/apple-touch-icon.png",
    # Browser-tab favicons, from the same artwork as the app icons.
    "client/public/icons/favicon-16.png",
    "client/public/icons/favicon-32.png",
}

# Where each allowed image says who made it and how.
PROVENANCE = "docs/IMAGES.md"

# An entry opens with a heading naming the file by its repository path in
# backticks, e.g. "### `client/public/icons/icon-192.png`".
ENTRY_HEADING = re.compile(r"^#{2,4}\s+`([^`]+)`\s*$")

# The line an entry writes to accept a provenance manifest in its file.
MANIFEST_ACCEPTED = re.compile(r"^\s*[-*]?\s*AI provenance manifest:\s*accepted\b",
                               re.IGNORECASE)

# A committed .json is fine for config but not for dumped scene/model data.
JSON_SIZE_LIMIT = 64 * 1024

# Directories of local notes that are never committed.
BANNED_DIRS = ("work/bdae_docs/",)


def git(*args):
    out = subprocess.check_output(("git",) + args, stderr=subprocess.STDOUT)
    return [row for row in out.decode("utf-8", "replace").splitlines() if row]


def candidate_files(tracked_only):
    if tracked_only:
        return git("ls-files")
    # What a `git add -A` would pick up: staged plus untracked-but-not-ignored.
    # A staged deletion publishes nothing, so it is not a candidate.
    staged = git("diff", "--cached", "--name-only", "--diff-filter=d")
    untracked = git("ls-files", "--others", "--exclude-standard")
    return sorted(set(staged) | set(untracked))


def read_provenance(path):
    """Map each file the provenance notes describe to its entry's lines."""
    entries = {}
    if not os.path.exists(path):
        return entries
    with open(path, "rb") as handle:
        text = handle.read().decode("utf-8", "replace")
    current = None
    for row in text.splitlines():
        heading = ENTRY_HEADING.match(row)
        if heading:
            current = heading.group(1).strip()
            entries[current] = []
        elif row.startswith("#"):
            current = None
        elif current is not None:
            entries[current].append(row)
    return entries


def offences(paths, allowed=None, provenance=None):
    allowed = ALLOWED if allowed is None else allowed
    notes = read_provenance(PROVENANCE if provenance is None else provenance)
    found = []
    for path in paths:
        norm = path.replace("\\", "/")
        ext = os.path.splitext(norm)[1].lower()
        if norm in allowed:
            if ext in IMAGE_EXT:
                why = allowed_image(norm, ext, notes)
                if why:
                    found.append((norm, why))
            continue
        if norm.startswith(BANNED_DIRS):
            found.append((norm, "local notes directory, never committed"))
            continue
        if ext in BANNED_EXT:
            found.append((norm, "game asset / screenshot extension '%s'" % ext))
            continue
        if ext == ".json" and os.path.exists(norm):
            size = os.path.getsize(norm)
            if size > JSON_SIZE_LIMIT:
                found.append((norm, "%d KB .json -- looks like dumped game data"
                              % (size // 1024)))
                continue
        if is_binary(norm):
            found.append((norm, "binary content -- only text is published"))
            continue
        if ext in SCANNED_EXT:
            why = embedded_image(norm)
            if why:
                found.append((norm, why))
    return found


def is_binary(path):
    """Whether a file's opening bytes are not UTF-8 text."""
    if not os.path.isfile(path):
        return False
    try:
        with open(path, "rb") as handle:
            head = handle.read(BINARY_SNIFF + 4)
    except OSError:
        return False
    if b"\x00" in head:
        return True
    try:
        head[:BINARY_SNIFF].decode("utf-8")
    except UnicodeDecodeError as exc:
        # A multi-byte character cut by the sniff window is still text.
        return exc.start < BINARY_SNIFF - 3
    return False


def allowed_image(path, ext, notes):
    """Why an image named in ALLOWED still may not be committed, if it may not."""
    if not os.path.exists(path):
        # A staged deletion: nothing is being published.
        return None
    entry = notes.get(path)
    if entry is None:
        return "allowed image with no entry in %s" % PROVENANCE
    with open(path, "rb") as handle:
        body = handle.read()
    if ext == ".svg" and SVG_RASTER.search(body):
        return "SVG embeds a raster (<image> or data: URI)"
    marker = next((m for m in PROVENANCE_MANIFEST if m in body), None)
    if marker and not any(MANIFEST_ACCEPTED.match(row) for row in entry):
        return ("carries an AI-provenance manifest ('%s') its provenance entry "
                "does not accept" % marker.decode("ascii"))
    return None


def embedded_image(path):
    """Report a base64 image payload hiding inside an otherwise-text file."""
    if not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as handle:
            body = handle.read().decode("utf-8", "replace")
    except OSError:
        return None
    for match in EMBEDDED_IMAGE.finditer(body):
        # Measure the payload, not the declaration: a tiny inline SVG cursor
        # or a 1x1 spacer is not what this is looking for.
        end = match.end()
        stop = end
        while stop < len(body) and body[stop] in B64_CHARS:
            stop += 1
        if stop - end > EMBEDDED_IMAGE_LIMIT:
            return ("embedded %d KB base64 image -- an extension check cannot "
                    "see this" % ((stop - end) // 1024))
    return None


def main(argv):
    tracked_only = "--tracked" in argv
    try:
        paths = candidate_files(tracked_only)
        # Allowed images are held to their provenance whenever the guard
        # runs, not only when staged: dropping an entry from the notes makes
        # the file it described unpublishable.
        if not tracked_only:
            paths = sorted(set(paths) | (set(git("ls-files")) & ALLOWED))
    except (subprocess.CalledProcessError, OSError) as exc:
        print("could not ask git for files: %s" % exc, file=sys.stderr)
        return 2

    bad = offences(paths)
    if not bad:
        print("clean: %d files checked, no game data staged" % len(paths))
        return 0

    print("REFUSING: these must not be committed (see AGENTS.md 'Asset hygiene')",
          file=sys.stderr)
    for path, why in bad:
        print("  %-60s %s" % (path, why), file=sys.stderr)
    print("\nAdd them to .gitignore, or delete them. If an image really is ours,"
          "\nadd it to ALLOWED in this script with a reason and give it an"
          "\nentry in %s." % PROVENANCE, file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
