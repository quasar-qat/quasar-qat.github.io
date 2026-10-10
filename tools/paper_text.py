#!/usr/bin/env python3
"""Convert the QUASAR arXiv v2 LaTeX source into normalized plain text.

Outputs (written next to this script unless --out is given):
  paper_plain.txt       one paragraph per line; headings marked "## 3 Methodology"
                        / "### 3.1 ..."; figure, table and algorithm captions kept
                        as "Figure 1: ...", bodies of figures/tables/algorithms dropped
  paper_sentences.json  [{id, section, sentence, kind, para, src}, ...]

The text is the canonical "paper prose" for the project page: every sentence on
the page must be a verbatim substring of paper_plain.txt (see check_bank.py).

Conventions (stdlib only, two passes like LaTeX so forward \\ref's resolve):
  * \\citep / \\cite are removed ("methods \\citep{x}." -> "methods."); \\citet is
    rendered as in the PDF ("Li et al. (2025)").
  * \\ref / \\eqref resolve to the PDF numbers ("Figure 3", "Equation (2)",
    "Appendix A.1"); \\label is dropped.
  * "~" -> space, "\\%" -> "%", "--" -> "–", "---" -> "—", ``x'' -> “x”,
    $\\sim$ -> "~"; inline math becomes a readable plain form (\\times -> ×,
    \\le -> ≤, \\widehat S_t -> Ŝ_t, x^2 -> x², \\frac{a}{b} -> a/b).
    Straight apostrophes stay straight (the PDF shows ’).
  * Display math is kept inline in its paragraph (plain form).

Usage:
  python3 tools/paper_text.py [--src DIR] [--out DIR]
  (--src defaults to $QUASAR_ARXIV_SRC: the unpacked arXiv 2608.13966v2 source)
"""
import argparse
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.environ.get("QUASAR_ARXIV_SRC")

# Private-use markers used during conversion; none survive into the outputs.
PARA = "\ue000"      # paragraph break
RUNIN = "\ue001"     # start of a run-in heading (\paragraph{...})
RUNIN_END = "\ue002"
SBREAK = "\ue003"    # hard sentence break (not rendered)
DISP_END = "\ue004"  # end of a display-math block

# ----------------------------------------------------------------------------
# symbol tables
# ----------------------------------------------------------------------------
GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε",
    "varepsilon": "ε", "zeta": "ζ", "eta": "η", "theta": "θ", "kappa": "κ",
    "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ",
    "sigma": "σ", "tau": "τ", "phi": "φ", "varphi": "φ", "chi": "χ",
    "psi": "ψ", "omega": "ω", "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ",
    "Lambda": "Λ", "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
}
MATH_SYM = {
    "times": "×", "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥", "neq": "≠",
    "ne": "≠", "approx": "≈", "sim": "~", "simeq": "≃", "propto": "∝",
    "in": "∈", "notin": "∉", "subseteq": "⊆", "subset": "⊂", "to": "→",
    "rightarrow": "→", "leftarrow": "←", "mapsto": "↦", "gets": "←",
    "infty": "∞", "sum": "Σ", "prod": "Π", "int": "∫", "nabla": "∇",
    "partial": "∂", "top": "⊤", "star": "⋆", "cdot": "·", "ldots": "…",
    "dots": "…", "cdots": "⋯", "preceq": "⪯", "succeq": "⪰",
    "lesssim": "≲", "gtrsim": "≳", "langle": "⟨", "rangle": "⟩",
    "lVert": "‖", "rVert": "‖", "Vert": "‖", "lvert": "|", "rvert": "|",
    "mid": "|", "circ": "∘", "downarrow": "↓", "uparrow": "↑",
    "ddagger": "‡", "dagger": "†", "pm": "±", "mp": "∓",
    "lfloor": "⌊", "rfloor": "⌋", "lceil": "⌈", "rceil": "⌉",
    "forall": "∀", "exists": "∃", "cup": "∪", "cap": "∩", "emptyset": "∅",
    "Rightarrow": "⇒", "iff": "⇔", "ell": "ℓ", "prime": "′",
    "inf": "inf", "sup": "sup", "min": "min", "max": "max", "arg": "arg",
    "argmin": "argmin", "argmax": "argmax", "log": "log", "exp": "exp",
    "Pr": "Pr", "det": "det", "lim": "lim", "diag": "diag",
    # paper macros (macros.tex)
    "round": "round", "R": "ℝ", "E": "𝔼", "loss": "ℒ", "Hess": "H",
}
MATHBB = {"R": "ℝ", "E": "𝔼", "N": "ℕ", "Z": "ℤ", "Q": "ℚ", "C": "ℂ", "P": "ℙ"}
MATHCAL = {"L": "ℒ", "H": "ℋ", "F": "ℱ", "O": "𝒪", "N": "𝒩", "D": "𝒟",
           "S": "𝒮", "X": "𝒳", "Y": "𝒴", "B": "ℬ", "E": "ℰ", "M": "ℳ"}
SUP = {"0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶",
       "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "−": "⁻", "-": "⁻", "=": "⁼",
       "(": "⁽", ")": "⁾"}
ACCENT = {"hat": "\u0302", "widehat": "\u0302", "bar": "\u0304",
          "overline": "\u0305", "tilde": "\u0303", "widetilde": "\u0303",
          "dot": "\u0307", "vec": "\u20d7"}
TEXT_SYM = {
    "ldots": "…", "dots": "…", "textless": "<", "textgreater": ">",
    "textbackslash": "\\", "L": "Ł", "l": "ł", "o": "ø", "O": "Ø",
    "ss": "ß", "ae": "æ", "AE": "Æ", "textbar": "|", "textasciitilde": "~",
    "textendash": "–", "textemdash": "—", "S": "§", "P": "¶",
    "copyright": "©", "texttrademark": "™", "textregistered": "®",
}
CONTROL_SYM_TEXT = {
    "%": "%", "&": "&", "_": "_", "#": "#", "$": "$", "{": "{", "}": "}",
    " ": " ", ",": " ", ";": " ", ":": " ", "!": "", "\\": " ", "-": "",
    "/": "", "@": "", "\n": " ", "|": "‖", "'": "", "`": "", '"': "",
}
# commands whose single argument is emitted as converted text
PASS1 = {"textbf", "emph", "textit", "textrm", "textsf", "textsc", "texttt",
         "text", "textup", "textnormal", "mathrm", "mathbf", "mathit",
         "mathsf", "mathtt", "operatorname", "underline", "mbox", "hbox",
         "boldsymbol", "bm", "textmd", "uppercase", "MakeUppercase",
         "makebox"}
# commands ignored together with N mandatory arguments (optional args skipped)
IGNORE_ARGS = {
    "hspace": 1, "vspace": 1, "setlength": 2, "renewcommand": 2,
    "newcommand": 2, "newlength": 1, "lhead": 1, "rhead": 1, "chead": 1,
    "bibliography": 1, "bibliographystyle": 1, "arrayrulecolor": 1,
    "definecolor": 3, "fontsize": 2, "includegraphics": 1, "graphicspath": 1,
    "hypersetup": 1, "rowcolor": 1, "columncolor": 1, "cellcolor": 1,
    "color": 1, "addlinespace": 0, "setcounter": 2, "addtocounter": 2,
    "vskip": 0, "pagestyle": 1, "thispagestyle": 1, "nocite": 1,
}
IGNORE0 = {
    "centering", "small", "footnotesize", "scriptsize", "tiny", "normalsize",
    "large", "Large", "LARGE", "huge", "maketitle", "newpage", "clearpage",
    "cleardoublepage", "FloatBarrier", "phantomsection", "begingroup",
    "endgroup", "noindent", "indent", "selectfont",
    "toprule", "midrule", "bottomrule", "hline", "relax", "protect",
    "nobreak", "displaystyle", "textstyle", "scriptstyle", "limits",
    "nolimits", "left", "right", "big", "bigl", "bigr", "Big", "Bigl", "Bigr",
    "bigg", "biggl", "biggr", "Bigg", "Biggl", "Biggr", "middle", "raggedright",
    "raggedleft", "smallskip", "medskip", "bigskip", "allowbreak", "linebreak",
    "pagebreak", "ignorespaces", "unskip", "strut", "hfill", "vfill",
    "rmfamily", "bfseries", "itshape", "normalfont", "sffamily", "ttfamily",
    "null", "leavevmode",
}
SPACE_CMDS = {"quad", "qquad", "enspace", "thinspace", "medspace",
              "thickspace", "space", "enskip", "nobreakspace"}
FLOATS = {"figure": "Figure", "figure*": "Figure", "table": "Table",
          "table*": "Table", "algorithm": "Algorithm"}
DISPLAY = {"equation", "equation*", "align", "align*", "gather", "gather*",
           "multline", "multline*", "displaymath", "eqnarray", "eqnarray*"}
NUMBERED_DISPLAY = {"equation", "align", "gather", "multline", "eqnarray"}
THEOREMS = {"theorem": "Theorem", "remark": "Remark", "lemma": "Lemma",
            "corollary": "Corollary", "proposition": "Proposition",
            "definition": "Definition", "assumption": "Assumption"}
DROP_ENVS = {"tabular", "tabular*", "tabularx", "algorithmic", "thebibliography",
             "tikzpicture"}
MATH_INNER_ENVS = {"aligned", "cases", "array", "split", "matrix", "pmatrix",
                   "bmatrix", "gathered"}


def roman(n):
    vals = [(10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s
            n -= v
    return out


# ----------------------------------------------------------------------------
# source loading
# ----------------------------------------------------------------------------
def strip_comments(text):
    # A % comment eats the rest of the line, the newline and the next line's
    # leading blanks (TeX semantics). \% is a literal percent sign.
    return re.sub(r"(?<!\\)%[^\n]*(\n[ \t]*)?", "", text)


def read_tex(src, name):
    path = os.path.join(src, name if name.endswith(".tex") else name + ".tex")
    with open(path, encoding="utf-8") as fh:
        return strip_comments(fh.read())


def resolve_inputs(src, text, depth=0):
    if depth > 20:
        raise RuntimeError("\\input nesting too deep")

    def rep(m):
        return resolve_inputs(src, read_tex(src, m.group(2).strip()), depth + 1)

    return re.sub(r"\\(input|include)\{([^}]*)\}", rep, text)


def input_order(src, name="main.tex", seen=None):
    """Files in the order they are \\input (for provenance lookups)."""
    seen = [] if seen is None else seen
    fname = name if name.endswith(".tex") else name + ".tex"
    if fname in seen or not os.path.exists(os.path.join(src, fname)):
        return seen
    seen.append(fname)
    for m in re.finditer(r"\\(?:input|include)\{([^}]*)\}", read_tex(src, fname)):
        input_order(src, m.group(1).strip(), seen)
    return seen


def parse_bbl(src):
    """key -> 'Li et al. (2025)' for \\citet."""
    path = os.path.join(src, "main.bbl")
    out = {}
    if not os.path.exists(path):
        return out
    t = open(path, encoding="utf-8").read()
    for m in re.finditer(r"\\bibitem\[", t):
        i, depth = m.end(), 1
        while depth:
            if t[i] == "[":
                depth += 1
            elif t[i] == "]":
                depth -= 1
            i += 1
        opt = t[m.end():i - 1]
        km = re.match(r"\s*\{([^}]*)\}", t[i:])
        if not km:
            continue
        opt = re.sub(r"\{\\natexlab\{(\w+)\}\}", r"\1", opt)
        om = re.match(r"(.*?)\((\d{4}\w?)\)", opt, re.S)
        if not om:
            continue
        names = re.sub(r"\s+", " ", om.group(1).replace("~", " ")).strip()
        names = names.replace("{", "").replace("}", "").replace("\\&", "&")
        out[km.group(1).strip()] = f"{names} ({om.group(2)})"
    return out


# ----------------------------------------------------------------------------
# converter
# ----------------------------------------------------------------------------
class Converter:
    def __init__(self, labels, bib):
        self.labels = labels
        self.bib = bib
        self.found = {}
        self.unresolved = set()
        self.unknown_cmds = {}
        self.unknown_envs = set()
        self.sec = self.sub = self.subsub = 0
        self.appendix = False
        self.counters = {"Figure": 0, "Table": 0, "Algorithm": 0,
                         "equation": 0}
        self.thm = {}
        self.ctx = [""]  # label-value stack

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def match_brace(s, i):
        """s[i] == '{' -> index of the matching '}'."""
        depth = 0
        j = i
        n = len(s)
        while j < n:
            c = s[j]
            if c == "\\":
                j += 2
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return j
            j += 1
        raise ValueError("unbalanced brace at %d: %r" % (i, s[i:i + 80]))

    @staticmethod
    def skip_ws(s, i, newlines=True):
        while i < len(s) and (s[i] in " \t" or (newlines and s[i] == "\n")):
            i += 1
        return i

    def read_arg(self, s, i):
        """Read one mandatory argument; returns (content, new_index)."""
        i = self.skip_ws(s, i)
        if i >= len(s):
            return "", i
        if s[i] == "{":
            j = self.match_brace(s, i)
            return s[i + 1:j], j + 1
        if s[i] == "\\":
            m = re.match(r"\\([A-Za-z]+|.)", s[i:])
            return m.group(0), i + len(m.group(0))
        return s[i], i + 1

    def read_opt(self, s, i):
        """Optional [..] argument; returns (content or None, new_index)."""
        j = self.skip_ws(s, i)
        if j < len(s) and s[j] == "[":
            depth, k = 0, j
            while k < len(s):
                c = s[k]
                if c == "\\":
                    k += 2
                    continue
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                elif c == "]" and depth == 0:
                    return s[j + 1:k], k + 1
                k += 1
        return None, i

    @staticmethod
    def env_end(s, i, env):
        """Body of \\begin{env} starting at i -> (body_end, after_end)."""
        pat = re.compile(r"\\(begin|end)\{" + re.escape(env) + r"\}")
        depth = 1
        for m in pat.finditer(s, i):
            depth += 1 if m.group(1) == "begin" else -1
            if depth == 0:
                return m.start(), m.end()
        raise ValueError("no \\end{%s}" % env)

    def record_label(self, key, value=None):
        self.found[key] = self.ctx[-1] if value is None else value

    def ref(self, key):
        if key in self.labels:
            return self.labels[key]
        self.unresolved.add(key)
        return "??"

    def sec_num(self):
        return chr(64 + self.sec) if self.appendix else str(self.sec)

    @staticmethod
    def text_fix(run):
        run = run.replace("---", "—").replace("--", "–")
        run = run.replace("``", "“").replace("''", "”").replace("`", "‘")
        return run

    # ------------------------------------------------------------- main loop
    def conv(self, s, math=False):
        out = []
        i, n = 0, len(s)
        specials = "\\{}$~" + ("_^&'" if math else "")
        while i < n:
            c = s[i]
            if c not in specials:
                j = i
                while j < n and s[j] not in specials:
                    j += 1
                run = s[i:j]
                if math:
                    run = re.sub(r"\s+", " ", run).replace("-", "−")
                else:
                    run = self.text_fix(run.replace("\n", " "))
                out.append(run)
                i = j
                continue
            if c == "~":
                out.append(" ")
                i += 1
            elif c == "{":
                j = self.match_brace(s, i)
                out.append(self.conv(s[i + 1:j], math))
                i = j + 1
            elif c == "}":
                i += 1
            elif c == "$":
                j = i + 1
                while j < n and not (s[j] == "$" and s[j - 1] != "\\"):
                    j += 1
                out.append(self.clean_math(self.conv(s[i + 1:j], True)))
                i = j + 1
            elif c in "_^":  # math sub/superscript
                arg, i = self.read_arg(s, i + 1)
                out.append(self.script(c, self.conv(arg, True).strip()))
            elif c == "&":
                out.append(" ")
                i += 1
            elif c == "'":  # prime
                out.append("′")
                i += 1
            else:  # backslash
                i = self.command(s, i, out, math)
        return "".join(out)

    @staticmethod
    def script(kind, inner):
        if kind == "^":
            if inner in ("⊤",):
                return "ᵀ"
            if inner in ("⋆", "*"):
                return "⋆"
            if inner and all(ch in SUP for ch in inner):
                return "".join(SUP[ch] for ch in inner)
            return "^" + inner if len(inner) == 1 else "^(" + inner + ")"
        if re.fullmatch(r"[A-Za-z0-9α-ωΑ-Ω]+", inner) or len(inner) == 1:
            return "_" + inner
        return "_{" + inner + "}"

    @staticmethod
    def clean_math(m):
        m = re.sub(r"\s+", " ", m).strip()
        # relations get one space on each side, as typeset
        m = re.sub(r"\s*([↦≈≤≥⪯≲←→⇒])\s*", r" \1 ", m)
        # operator names followed directly by an operand: "inf_x ℒ(x)"
        m = re.sub(r"(?<![A-Za-z])((?:arg)?(?:inf|sup|min|max)(?:_\{[^}]*\}|_[A-Za-z0-9]+)?)"
                   r"(?=[^\s(\[{,.;:)\]}_^])", r"\1 ", m)
        m = re.sub(r"\s+([,)\]}.;:!])", r"\1", m)
        m = re.sub(r"([(\[{])\s+", r"\1", m)
        m = re.sub(r" {2,}", " ", m).strip()
        return unicodedata.normalize("NFC", m)

    # --------------------------------------------------------------- commands
    def command(self, s, i, out, math):
        m = re.match(r"\\([A-Za-z]+)(\*?)|\\(.)", s[i:], re.S)
        if m.group(3) is not None:  # control symbol
            sym = m.group(3)
            i += 2
            if sym == "[":  # \[ display math \]
                j = s.index("\\]", i)
                out.append(self.display(s[i:j], numbered=False))
                return j + 2
            if sym == "(":  # \( inline math \)
                j = s.index("\\)", i)
                out.append(self.clean_math(self.conv(s[i:j], True)))
                return j + 2
            if math:
                out.append({"|": "‖", "{": "{", "}": "}", ",": " ", ";": " ",
                            ":": " ", "!": "", " ": " ", "\\": " ", "%": "%",
                            "_": "_", "#": "#", "&": "&", "$": "$"}.get(sym, sym))
            else:
                out.append(CONTROL_SYM_TEXT.get(sym, sym))
            return i
        name, star = m.group(1), m.group(2)
        i += len(m.group(0))
        if star and name not in ("section", "subsection", "subsubsection",
                                 "paragraph", "hspace", "vspace", "caption"):
            i -= 1  # '*' is not part of this command
            star = ""
        j = self.skip_ws(s, i)  # TeX skips blanks after a control word
        if PARA not in s[i:j]:
            i = j

        if name == "begin":
            env, i = self.read_arg(s, i)
            body_end, after = self.env_end(s, i, env)
            out.append(self.environment(env, s[i:body_end], math))
            return after
        if name in ("section", "subsection", "subsubsection"):
            _, i = self.read_opt(s, i)
            title, i = self.read_arg(s, i)
            out.append(self.heading(name, bool(star), title))
            return i
        if name == "paragraph":
            title, i = self.read_arg(s, i)
            out.append(PARA + RUNIN + self.conv(title).strip() + RUNIN_END + " ")
            return i
        if name == "appendix":
            self.appendix = True
            self.sec = 0
            return i
        if name == "par":
            out.append(PARA)
            return i
        if name == "label":
            key, i = self.read_arg(s, i)
            self.record_label(key.strip())
            return i
        if name in ("ref", "autoref", "cref", "Cref", "pageref"):
            key, i = self.read_arg(s, i)
            out.append(self.ref(key.strip()))
            return i
        if name == "eqref":
            key, i = self.read_arg(s, i)
            out.append("(" + self.ref(key.strip()) + ")")
            return i
        if name in ("cite", "citep", "citealp", "citeauthor", "citeyear",
                    "citet", "citealt", "parencite", "textcite"):
            _, i = self.read_opt(s, i)
            _, i = self.read_opt(s, i)
            keys, i = self.read_arg(s, i)
            if name in ("citet", "textcite", "citealt"):
                parts = [self.bib.get(k.strip(), k.strip())
                         for k in keys.split(",")]
                out.append(", ".join(parts))
            return i
        if name == "href":
            _, i = self.read_arg(s, i)
            txt, i = self.read_arg(s, i)
            out.append(self.conv(txt, math))
            return i
        if name == "url":
            txt, i = self.read_arg(s, i)
            out.append(txt)
            return i
        if name == "footnote":
            txt, i = self.read_arg(s, i)
            out.append(" (" + self.conv(txt).strip() + ")")
            return i
        if name == "caption":  # stray caption outside a float
            _, i = self.read_opt(s, i)
            txt, i = self.read_arg(s, i)
            out.append(self.conv(txt, math))
            return i
        if name == "scalebox":
            _, i = self.read_arg(s, i)
            _, i = self.read_opt(s, i)
            txt, i = self.read_arg(s, i)
            out.append(self.conv(txt, math))
            return i
        if name == "multicolumn":
            _, i = self.read_arg(s, i)
            _, i = self.read_arg(s, i)
            txt, i = self.read_arg(s, i)
            out.append(self.conv(txt, math))
            return i
        if name in PASS1:
            arg, i = self.read_arg(s, i)
            out.append(self.conv(arg, math))
            return i
        if name in IGNORE_ARGS:
            while True:
                opt, i2 = self.read_opt(s, i)
                if opt is None:
                    break
                i = i2
            for _ in range(IGNORE_ARGS[name]):
                _, i = self.read_arg(s, i)
            return i
        if name in IGNORE0:
            if name in ("left", "right") and i < len(s) and s[i] == ".":
                i += 1
            return i
        if name in SPACE_CMDS:
            out.append(" ")
            return i
        if name in ("frac", "tfrac", "dfrac", "cfrac"):
            a, i = self.read_arg(s, i)
            b, i = self.read_arg(s, i)
            a = self.clean_math(self.conv(a, True))
            b = self.clean_math(self.conv(b, True))
            simple = re.compile(r"[\w∂ℒℝ𝔼αβγδεζηθκλμνξπρστφχψω′⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+$")
            a = a if simple.match(a) else "(" + a + ")"
            b = b if simple.match(b) else "(" + b + ")"
            out.append(" " + a + "/" + b + " ")
            return i
        if name == "sqrt":
            _, i = self.read_opt(s, i)
            a, i = self.read_arg(s, i)
            a = self.clean_math(self.conv(a, True))
            out.append("√" + (a if len(a) == 1 else "(" + a + ")"))
            return i
        if name in ACCENT:
            a, i = self.read_arg(s, i)
            a = self.clean_math(self.conv(a, True))
            out.append(a + ACCENT[name] if len(a) == 1 else a)
            return i
        if name == "mathbb":
            a, i = self.read_arg(s, i)
            out.append(MATHBB.get(a.strip(), a.strip()))
            return i
        if name in ("mathcal", "mathscr"):
            a, i = self.read_arg(s, i)
            out.append(MATHCAL.get(a.strip(), a.strip()))
            return i
        if name == "norm":
            a, i = self.read_arg(s, i)
            out.append("‖" + self.conv(a, True) + "‖")
            return i
        if name in ("item",):
            _, i = self.read_opt(s, i)
            out.append(PARA)
            return i
        if math and name in MATH_SYM:
            out.append(MATH_SYM[name])
            return i
        if math and name in GREEK:
            out.append(GREEK[name])
            return i
        if not math and name in TEXT_SYM:
            out.append(TEXT_SYM[name])
            return i
        if name in GREEK:
            out.append(GREEK[name])
            return i
        if name in MATH_SYM:
            out.append(MATH_SYM[name])
            return i
        self.unknown_cmds[name] = self.unknown_cmds.get(name, 0) + 1
        out.append(name if math else "")
        return i

    # ------------------------------------------------------------ structures
    def heading(self, kind, star, title):
        t = self.conv(title).strip()
        if kind == "section":
            if star:
                return PARA + "## " + t + PARA
            self.sec += 1
            self.sub = self.subsub = 0
            num = self.sec_num()
            self.ctx[0] = num
            return PARA + "## " + num + " " + t + PARA
        if kind == "subsection":
            if star:
                return PARA + "### " + t + PARA
            self.sub += 1
            self.subsub = 0
            num = "%s.%d" % (self.sec_num(), self.sub)
            self.ctx[0] = num
            return PARA + "### " + num + " " + t + PARA
        if star:
            return PARA + "#### " + t + PARA
        self.subsub += 1
        num = "%s.%d.%d" % (self.sec_num(), self.sub, self.subsub)
        self.ctx[0] = num
        return PARA + "#### " + num + " " + t + PARA

    def display(self, body, numbered, label_num=None):
        if label_num is not None:
            self.ctx.append(label_num)
        m = self.clean_math(self.conv(body, True))
        if label_num is not None:
            self.ctx.pop()
        return " " + m + DISP_END

    def environment(self, env, body, math):
        if env == "abstract":
            return PARA + "## Abstract" + PARA + self.conv(body) + PARA
        if env in FLOATS:
            return self.float_env(FLOATS[env], body)
        if env in DISPLAY:
            if env in NUMBERED_DISPLAY:
                self.counters["equation"] += 1
                return self.display(body, True, str(self.counters["equation"]))
            return self.display(body, False)
        if env in MATH_INNER_ENVS:
            _, k = self.read_opt(body, 0)
            if env == "array" or env.endswith("matrix"):
                _, k = self.read_arg(body, k) if env == "array" else ("", k)
            return self.conv(body[k:], True)
        if env in THEOREMS:
            opt, k = self.read_opt(body, 0)
            kind = THEOREMS[env]
            self.thm[kind] = self.thm.get(kind, 0) + 1
            num = str(self.thm[kind])
            head = kind + " " + num
            if opt:
                head += " (" + self.conv(opt).strip() + ")"
            self.ctx.append(num)
            txt = self.conv(body[k:])
            self.ctx.pop()
            return PARA + head + ". " + txt + PARA
        if env == "proof":
            opt, k = self.read_opt(body, 0)
            head = self.conv(opt).strip() if opt else "Proof"
            return PARA + head + ". " + self.conv(body[k:]) + PARA
        if env in ("itemize", "enumerate", "description"):
            opt, k = self.read_opt(body, 0)
            items = re.split(r"\\item\b", body[k:])[1:]
            parts = []
            for idx, it in enumerate(items, 1):
                iopt, ik = self.read_opt(it, 0)
                if iopt is not None:
                    lab = self.conv(iopt).strip() + " "
                elif env == "enumerate":
                    if opt and "roman" in opt:
                        lab = "(%s) " % roman(idx)
                    elif opt and "alph" in opt:
                        lab = "(%s) " % chr(96 + idx)
                    else:
                        lab = "%d. " % idx
                else:
                    lab = ""
                parts.append(PARA + lab + self.conv(it[ik:]).strip())
            return "".join(parts) + PARA
        if env in DROP_ENVS:
            for lm in re.finditer(r"\\label\{([^}]*)\}", body):
                self.record_label(lm.group(1).strip())
            return " "
        if env in ("center", "flushleft", "flushright", "quote", "quotation",
                   "minipage", "small", "footnotesize"):
            _, k = self.read_opt(body, 0)
            return self.conv(body[k:], math)
        self.unknown_envs.add(env)
        return self.conv(body, math)

    def float_env(self, kind, body):
        _, k = self.read_opt(body, 0)
        body = body[k:]
        cm = re.search(r"\\caption\*?", body)
        if not cm:
            return PARA
        j = cm.end()
        _, j = self.read_opt(body, j)
        cap, _ = self.read_arg(body, j)
        self.counters[kind] += 1
        num = str(self.counters[kind])
        for lm in re.finditer(r"\\label\{([^}]*)\}", body):
            self.record_label(lm.group(1).strip(), num)
        self.ctx.append(num)
        txt = self.conv(cap)
        self.ctx.pop()
        return PARA + kind + " " + num + ": " + txt.strip() + PARA


# ----------------------------------------------------------------------------
# paragraphs and sentences
# ----------------------------------------------------------------------------
def tidy(p):
    p = p.replace("\u00a0", " ")
    p = re.sub(DISP_END + r"\s*(?=[A-Z(“])", SBREAK + " ", p)
    p = p.replace(DISP_END, " ")
    p = re.sub(r"[ \t\n]+", " ", p)
    p = re.sub(r" +([.,;:!?)\]])", r"\1", p)
    p = re.sub(r"([(\[]) +", r"\1", p)
    p = re.sub(r"\(\s*\)", "", p)  # empty parens left by removed citations
    p = re.sub(r" +" + SBREAK, SBREAK, p)
    p = re.sub(SBREAK + r" +", SBREAK, p)
    p = re.sub(r" {2,}", " ", p)
    return unicodedata.normalize("NFC", p.strip())


def to_paragraphs(doc):
    raw = [tidy(p) for p in doc.split(PARA)]
    raw = [p for p in raw if p.replace(SBREAK, "").strip()]
    paras = []
    pending = ""
    for p in raw:
        if pending:
            p = pending + " " + p
            pending = ""
        stripped = re.sub(RUNIN + r".*?" + RUNIN_END, "", p).strip()
        if p.startswith(RUNIN) and not stripped:
            pending = p  # run-in heading alone: attach to next paragraph
            continue
        paras.append(p)
    if pending:
        paras.append(pending)
    out = []
    for p in paras:
        p = p.replace(RUNIN, "").replace(RUNIN_END, "")
        p = re.sub(r" {2,}", " ", p).strip()
        out.append(p)
    return out


ABBREV = ("e.g.", "i.e.", "et al.", "Fig.", "Figs.", "Eq.", "Eqs.", "Alg.",
          "vs.", "cf.", "Sec.", "Secs.", "App.", "Tab.", "resp.", "approx.",
          "sym.", "int.", "No.", "Ref.", "w.r.t.", "a.k.a.", "Thm.", "Prop.")
ABBREV_RE = re.compile(r"(?:^|[\s(\[“\"])(?:%s)$" % "|".join(re.escape(a) for a in ABBREV))
SENT_END = re.compile(r"[.!?][”’\")\]]*(?=\s+[\"“(\[A-Z0-9ŁŜ∇ℒΣ𝔼‖Δ])")


def split_sentences(p):
    sents = []
    for chunk in p.split(SBREAK):
        start = 0
        for m in SENT_END.finditer(chunk):
            end = m.end()
            head = chunk[start:m.start() + 1]
            if ABBREV_RE.search(head):
                continue
            # single-letter initial ("A.") or enumerator like "(i)." are rare;
            # do not split after a lone capital letter.
            if re.search(r"(?:^|\s)[A-Z]\.$", head):
                continue
            s = chunk[start:end].strip()
            if s:
                sents.append(s)
            start = end
        tail = chunk[start:].strip()
        if tail:
            sents.append(tail)
    return [re.sub(r" {2,}", " ", s) for s in sents]


# ----------------------------------------------------------------------------
# provenance (file:line) lookup
# ----------------------------------------------------------------------------
WORD = re.compile(r"[A-Za-z]{2,}")


class Provenance:
    def __init__(self, src, files):
        self.files = []
        for f in files:
            toks = []
            text = read_tex(src, f)
            if f == "main.tex":  # only the title and the document body
                head, sep, body = text.partition("\\begin{document}")
                head = "\n".join(l if "\\title{" in l else ""
                                 for l in head.split("\n"))
                text = head + sep + body
            text = re.sub(r"\\(?:citep|citet|cite|ref|eqref|label|input)\{[^}]*\}",
                          lambda m: " " * len(m.group(0)), text)
            for ln, line in enumerate(text.split("\n"), 1):
                # "\textbf{Qu}antization" -> "Quantization"
                line = re.sub(r"\\[A-Za-z]+(?=\{)", "", line)
                line = re.sub(r"\\[A-Za-z]+", " ", line)
                line = line.replace("{", "").replace("}", "")
                for w in WORD.findall(line):
                    toks.append((w.lower(), ln))
            index = {}
            for k, (w, _) in enumerate(toks):
                index.setdefault(w, []).append(k)
            self.files.append((f, toks, index))

    def find(self, sentence):
        """'file.tex:line' where the sentence starts (majority vote of word windows)."""
        sentence = re.sub(r"^(Figure|Table|Algorithm) \d+: ", "", sentence)
        words = [w.lower() for w in WORD.findall(sentence)]
        if not words:
            return None
        for w in sorted({min(width, len(words)) for width in (6, 4, 3, 2)},
                        reverse=True):
            votes = {}
            for k in range(0, len(words) - w + 1):
                win = words[k:k + w]
                for f, toks, index in self.files:
                    for pos in index.get(win[0], ()):
                        if [t[0] for t in toks[pos:pos + w]] == win:
                            anchor = (f, max(0, pos - k))
                            votes[anchor] = votes.get(anchor, 0) + 1
            if votes:
                (f, pos), _ = max(votes.items(), key=lambda kv: kv[1])
                toks = next(t for name, t, _ in self.files if name == f)
                return "%s:%d" % (f, toks[pos][1])
        return None


# ----------------------------------------------------------------------------
def build(src):
    main = read_tex(src, "main.tex")
    title = re.search(r"\\title\{(.*?)\}\s*\n", main, re.S)
    doc = main[main.index("\\begin{document}") + len("\\begin{document}"):
               main.index("\\end{document}")]
    doc = resolve_inputs(src, doc)
    doc = re.sub(r"\n[ \t]*\n(?:[ \t]*\n)*", " " + PARA + " ", doc)
    bib = parse_bbl(src)

    labels = {}
    for _ in range(2):  # pass 1 collects \label values, pass 2 resolves \ref
        conv = Converter(labels, bib)
        text = conv.conv(doc)
        labels = conv.found
    paras = to_paragraphs(text)
    if title:
        paras.insert(0, "# " + Converter({}, bib).conv(title.group(1)).strip())
    return paras, conv


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--out", default=HERE)
    args = ap.parse_args()
    if not args.src:
        sys.exit("paper_text.py: set --src or $QUASAR_ARXIV_SRC (unpacked arXiv 2608.13966v2 source)")
    if not os.path.isfile(os.path.join(args.src, "main.tex")):
        sys.exit("paper_text.py: no main.tex in %s (--src / $QUASAR_ARXIV_SRC)" % args.src)

    paras, conv = build(args.src)
    prov = Provenance(args.src, input_order(args.src))

    lines, sentences = [], []
    section = ""
    sid = 0
    for pi, p in enumerate(paras):
        plain = re.sub(r" {2,}", " ", p.replace(SBREAK, " ")).strip()
        if plain.startswith("#"):
            if lines:
                lines.append("")
            lines.append(plain)
            section = plain.lstrip("#").strip()
            continue
        lines.append(plain)
        kind = "body"
        cm = re.match(r"(Figure|Table|Algorithm) \d+: ", plain)
        if cm:
            kind = cm.group(1).lower() + "_caption"
        for s in split_sentences(p):
            s = s.strip()
            assert s in plain, (s, plain)
            sid += 1
            sentences.append({
                "id": sid, "section": section, "sentence": s, "kind": kind,
                "para": pi, "src": prov.find(s),
            })

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "paper_plain.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    with open(os.path.join(args.out, "paper_sentences.json"), "w", encoding="utf-8") as fh:
        json.dump(sentences, fh, ensure_ascii=False, indent=1)

    nparas = sum(1 for l in lines if l and not l.startswith("#"))
    print("paragraphs: %d  sentences: %d  labels: %d" % (nparas, len(sentences), len(conv.found)))
    print("figures %(Figure)d  tables %(Table)d  algorithms %(Algorithm)d  equations %(equation)d"
          % conv.counters)
    if conv.unresolved:
        print("UNRESOLVED refs:", sorted(conv.unresolved), file=sys.stderr)
    if conv.unknown_cmds:
        print("unknown commands:", conv.unknown_cmds, file=sys.stderr)
    if conv.unknown_envs:
        print("unknown envs:", sorted(conv.unknown_envs), file=sys.stderr)
    missing = sum(1 for s in sentences if not s["src"])
    print("sentences without source line: %d" % missing)
    leftover = [l for l in lines if re.search(r"[\\$\ue000-\ue004]|\?\?", l)]
    if leftover:
        print("WARNING: %d lines with leftover LaTeX/markers" % len(leftover), file=sys.stderr)
        for l in leftover[:10]:
            print("  ", l[:160], file=sys.stderr)


if __name__ == "__main__":
    main()
