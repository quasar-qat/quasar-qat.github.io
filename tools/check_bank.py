#!/usr/bin/env python3
"""Check that every sentence-bank entry is an exact substring of the paper text.

Entries are the `> ...` lines of sentence_bank.md plus the backticked fragment
in each `| F<n> | ... |` table row. The paper text is paper_plain.txt, built
from the arXiv v2 LaTeX source by paper_text.py.

Usage:
  python3 tools/check_bank.py                       # check the bank
  python3 tools/check_bank.py --strings page.txt    # check one string per line
  python3 tools/check_bank.py --normalize ...       # fold ’ ‘ “ ” and NBSP first
Exit status is 1 if anything is missing.
"""
import argparse
import difflib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def fold(s):
    return (s.replace("’", "'").replace("‘", "'")
             .replace("“", '"').replace("”", '"')
             .replace(" ", " "))


def bank_entries(path):
    """[(label, text)] from the bank markdown."""
    out, label = [], None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        m = re.match(r"\*\*([A-Z]+\d+)\*\*", line)
        if m:
            label = m.group(1)
        if line.startswith("> "):
            out.append((label or "?", line[2:]))
        m = re.match(r"\| (F\d+) \| `([^`]+)` \|", line)
        if m:
            out.append((m.group(1), m.group(2)))
    return out


def nearest(text, plain_lines):
    best = difflib.get_close_matches(text, plain_lines, n=1, cutoff=0.0)
    if not best:
        return ""
    sm = difflib.SequenceMatcher(None, text, best[0])
    i, j, size = sm.find_longest_match(0, len(text), 0, len(best[0]))
    return "longest common run: %r" % text[i:i + size][:80]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--bank", default=os.path.join(HERE, "sentence_bank.md"))
    ap.add_argument("--plain", default=os.path.join(HERE, "paper_plain.txt"))
    ap.add_argument("--strings", help="file with one string to check per line")
    ap.add_argument("--normalize", action="store_true",
                    help="fold typographic quotes and NBSP before comparing")
    args = ap.parse_args()

    plain = open(args.plain, encoding="utf-8").read()
    if args.strings:
        entries = [("L%d" % i, l.rstrip("\n"))
                   for i, l in enumerate(open(args.strings, encoding="utf-8"), 1)
                   if l.strip()]
    else:
        entries = bank_entries(args.bank)
    if args.normalize:
        plain = fold(plain)
        entries = [(k, fold(t)) for k, t in entries]

    lines = [l for l in plain.split("\n") if l]
    missing = [(k, t) for k, t in entries if t not in plain]
    n_frag = sum(1 for k, _ in entries if re.fullmatch(r"F\d+", k))
    print("%d/%d exact substrings of %s (%d entries + %d fragments)" % (
        len(entries) - len(missing), len(entries),
        os.path.basename(args.plain), len(entries) - n_frag, n_frag))
    for k, t in missing:
        print("MISSING %s: %s" % (k, t[:120]))
        print("        %s" % nearest(t, lines))
    dup = {t for _, t in entries if [x for _, x in entries].count(t) > 1}
    if dup:
        print("note: %d duplicated entries" % len(dup))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
