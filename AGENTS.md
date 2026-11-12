# Project Guide

- Purpose: make the Code Graph Data Model well documented and easy to understand through an interactive presentation with descriptions, visualizations, and examples.
- The app presents [Code Graph Data Model v2.md](Code%20Graph%20Data%20Model%20v2.md), the sole source of truth.
- This is an offline, dependency-free HTML/CSS/JavaScript app. Open [index.html](index.html) directly; no server or package installation is required.
- [app.js](app.js) provides the structure explorer, guided walkthrough, semantic relations, and full specification views.
- After specification edits, run `node build-model.mjs` to regenerate [model-data.js](model-data.js); review summaries and supplemental references in [app.js](app.js). Do not edit generated data manually.
- [example-model.js](example-model.js) contains hand-authored C++ teaching records, not analyzer output. [structural-dependencies.js](structural-dependencies.js) derives dependency views, not canonical entities. Validate examples with `node --test example-model.test.mjs`.
- Keep explanations, diagrams, and examples faithful to the specification: distinguish syntax from semantics and established from possible dependencies; do not imply runtime execution.
- Preserve the lightweight offline design, readable presentation, and semantic theme tokens in [themes.css](themes.css). See [README.md](README.md) for usage and maintenance details.