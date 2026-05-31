# Editorial / pedagogy constants. Things that encode "what counts as
# on-level for grade N" — not things the operator tunes via env or UI.
#
# Coming in later v1 phases (drop into THIS file when they land — don't
# scatter them across consumer modules):
#   - GRADE_TO_BAND   single-grade -> Learning Commons band, added in
#                     Task 4.1 (evaluator)
#   - FONT_SIZES      per-grade PDF body font, added in Task 8.2 (renderer)
#
# v2 brainstorms (see docs/v2-ideas.md "Pedagogy table extensions"):
#   - Scaffolding playbook    (when to add definitions, picture support,
#                              sentence chunking, etc.)
#   - Sentence-length targets (per-grade max sentence length the generator
#                              should aim for)

WORDS_PER_PAGE: dict[tuple[str, bool], int] = {
    # (reading_level, include_drawing_box): words per page
    #
    # Box-on values match conventional leveled-reader page counts
    # (which assume illustration space at the top of the page).
    # Box-off values are doubled to fill the area freed up by removing
    # the box.
    ("K", True):  20,  ("K", False):  40,
    ("1", True):  40,  ("1", False):  80,
    ("2", True):  70,  ("2", False): 140,
    ("3", True): 100,  ("3", False): 200,
    ("4", True): 150,  ("4", False): 300,
    ("5", True): 200,  ("5", False): 400,
}

FONT_SIZES: dict[str, int] = {
    # Per-grade PDF body font, in points. Larger for early readers;
    # plateaus at grade 4 because 14pt is already comfortable for grade-5
    # text on letter-size pages.
    "K": 24, "1": 20, "2": 18, "3": 16, "4": 14, "5": 14,
}

LINE_SPACING: dict[str, float] = {
    # Per-grade leading multiplier (line height = font_size * multiplier).
    # Early readers benefit from extra vertical space between lines —
    # easier to track from one line to the next without losing place.
    # Tapers to standard 1.3× by grade 4.
    "K": 1.6, "1": 1.5, "2": 1.4, "3": 1.35, "4": 1.3, "5": 1.3,
}

# Single-grade -> Learning Commons grade band. The grade-level rubric
# only emits bands (K-1, 2-3, 4-5, 6-8, 9-10, 11-CCR); our UI offers
# single grades. evaluator.py expands the teacher's target grade
# through this table before comparing against the judge's verdict.
GRADE_TO_BAND: dict[str, str] = {
    "K": "K-1", "1": "K-1",
    "2": "2-3", "3": "2-3",
    "4": "4-5", "5": "4-5",
}
