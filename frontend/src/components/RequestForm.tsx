import { useEffect, useState } from "react";
import type { GenerateRequest, Presets, ReadingLevel, Genre } from "../types";

interface Props {
  onSubmit: (req: GenerateRequest) => void;
}

const LEVELS: ReadingLevel[] = ["K", "1", "2", "3", "4", "5"];

export default function RequestForm({ onSubmit }: Props) {
  const [presets, setPresets] = useState<Presets>({});
  const [childName, setChildName] = useState("");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("3");
  const [genre, setGenre] = useState<Genre>("fiction");
  const [pages, setPages] = useState(2);
  const [includeBox, setIncludeBox] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/presets")
      .then((r) => r.json())
      .then(setPresets);
  }, []);

  function toggleSelected(t: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleExpanded(c: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function addCustom(category: string) {
    const draft = (customDrafts[category] || "").trim();
    if (!draft) return;
    setSelected((prev) => new Set(prev).add(draft));
    setCustomDrafts((prev) => ({ ...prev, [category]: "" }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!childName.trim()) errs.push("Student name is required.");
    if (selected.size === 0) errs.push("Pick at least one topic.");
    if (pages < 1) errs.push("Pages must be at least 1.");
    setErrors(errs);
    if (errs.length) return;
    onSubmit({
      child_name: childName.trim(),
      reading_level: readingLevel,
      genre,
      pages,
      include_drawing_box: includeBox,
      topics: Array.from(selected),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Student's name
        <input
          aria-label="Student's name"
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
        />
      </label>

      <label>
        Reading level
        <select
          value={readingLevel}
          onChange={(e) => setReadingLevel(e.target.value as ReadingLevel)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Genre</legend>
        {(["fiction", "non-fiction"] as const).map((g) => (
          <label key={g}>
            <input
              type="radio"
              name="genre"
              value={g}
              checked={genre === g}
              onChange={() => setGenre(g)}
            />
            {g}
          </label>
        ))}
      </fieldset>

      <label>
        Pages
        <input
          type="number"
          min={1}
          value={pages}
          onChange={(e) => setPages(parseInt(e.target.value, 10) || 0)}
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={includeBox}
          onChange={(e) => setIncludeBox(e.target.checked)}
        />
        Add a drawing box for the student to draw a picture
      </label>
      <p className="helper">
        The drawing box appears only in PDF downloads. Word downloads are plain text.
      </p>

      <div className="categories">
        {Object.entries(presets).map(([category, subtopics]) => (
          <div key={category}>
            <button type="button" onClick={() => toggleExpanded(category)}>
              {category}
            </button>
            {expanded.has(category) && (
              <div>
                {subtopics.map((sub) => (
                  <label key={sub}>
                    <input
                      type="checkbox"
                      name={sub}
                      checked={selected.has(sub)}
                      onChange={() => toggleSelected(sub)}
                    />
                    {sub}
                  </label>
                ))}
                <label>
                  Add custom topic to {category}
                  <input
                    value={customDrafts[category] || ""}
                    onChange={(e) =>
                      setCustomDrafts((p) => ({
                        ...p,
                        [category]: e.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => addCustom(category)}
                  aria-label={`Add ${category} topic`}
                >
                  Add
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button type="submit">Generate</button>
    </form>
  );
}
