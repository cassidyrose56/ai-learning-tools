from app.pedagogy import WORDS_PER_PAGE


def test_words_per_page_doubles_when_drawing_box_off():
    for level in ["K", "1", "2", "3", "4", "5"]:
        on = WORDS_PER_PAGE[(level, True)]
        off = WORDS_PER_PAGE[(level, False)]
        assert off == on * 2, f"level {level}: {off} != 2*{on}"
