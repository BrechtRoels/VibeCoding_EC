# Workshop Demo — Build an **Expense Tracker** three ways

One app, three philosophies. Participants build the *same* small app in each mode and
feel the difference between **Vibecoding**, **Spec-Driven Development**, and **Harness
Engineering**.

> **The app — "Expense Tracker"**
> Add an expense (description + amount + category), see the list and a running total,
> delete an entry, and have it all **persist after a refresh**.
> It's small enough to vibe in one prompt, structured enough to spec out, and a perfect
> fit for a company harness.

**Why this app:** it's stateful and interactive (so you can actually *use* it in the
preview), it persists with `localStorage` (proves the generated app really works), and it
has clear, testable requirements (great for the spec workflow).

---

## Before you start (everyone)
1. Open the app and log in — password: **`PwCVibeCoding2026`**.
2. You'll see a floating menu with the three modes. You'll visit them in order: **1 → 2 → 3**.
3. Each mode is a mini-IDE: **file explorer** (left), **code editor + Preview tab** (middle),
   **agent chat** (right). The ⛶ button on any preview opens it **full screen**.

Suggested timing: ~10 min per mode + 10 min discussion (≈ 40 min total).

---

## Exercise 1 — Vibecoding  *(fast, exploratory, iterative)*

**Goal:** experience one-prompt generation and the *iterate-test-fix* loop.

1. In the **Vibe Chat**, type:
   ```
   an expense tracker where I can add expenses with a description, amount and category, see the total, and delete entries
   ```
2. Watch the **Builder Agent** reply in chat, then **stream the code** into the editor.
   Open the **Preview** tab and **add a couple of expenses** — it works.
3. Now **iterate — entirely by chat**. Send these one at a time and watch each new version
   build on the last (see `history/v1.html`, `v2.html`… appear in the explorer):
   ```
   make the total bigger and bold, and show it at the top
   ```
   ```
   add a colored pill for each category
   ```
   ```
   let me edit an expense, not just delete it
   ```
4. **Prove it's real:** add expenses, then **refresh the browser** → your data is still there
   (it persists via `localStorage`).

**Observe / discuss:** every run picks its own styling and structure; the first result is
rarely perfect; you converge by chatting. There's no spec and no guardrails — it's fast and
fun, but two people will get two different apps.

---

## Exercise 2 — Spec-Driven (Kiro-style)  *(structured, traceable, approval-gated)*

**Goal:** see context-first development — the spec is the source of truth, and agents
execute it task by task.

1. Switch to **Spec-Driven**. Notice the `.kiro/steering/` files already there (project
   context). In the chat, type the same idea:
   ```
   an expense tracker with description, amount, category, a running total, delete, and persistence
   ```
2. Kiro creates `.kiro/specs/expense-tracker/` and writes **`requirements.md`** (EARS:
   *"WHEN … THE SYSTEM SHALL …"*). **Read it**, then click **✓ Approve & continue**.
   *(Try editing a requirement first, or hit ↻ Regenerate, to feel the gate.)*
3. Approve again to generate **`design.md`** (data model, components, traceability), and once
   more for **`tasks.md`** (a checklist `T1…Tn`).
4. Approve the tasks → watch **per-task execution**: each task builds into `index.html` and its
   checkbox flips `[ ] → [x]` in `tasks.md`, with the agent logging progress. A **verify** step
   then audits the app against the spec.
5. **Iterate the right way — through the spec.** With the build done, type:
   ```
   add a monthly budget with a warning when expenses exceed it
   ```
   It **loops back to requirements** and re-runs the phases.
   *(Or: open `requirements.md`, edit it, and use **Re-sync downstream ↓**.)*

**Observe / discuss:** slower to start, but everything is documented and traceable — each line
of code traces to a task and a requirement. Two people following the same spec get the same app.

---

## Exercise 3 — Harness Engineering  *(guardrailed, uniform, production-aligned)*

**Goal:** see how a company *enforces* consistency — like real `.cursor/rules`,
`copilot-instructions.md` and a lint/CI gate.

1. Switch to **Harness**. Open the `locked/` folder and skim the **rule files**:
   `AGENTS.md`, `.cursor/rules/house-style.mdc`, `.github/copilot-instructions.md`,
   `house-lint.json`, `design-system.css`. These are injected into every build.
2. In the chat, type a feature (note: you only describe the *feature* — the look is decided):
   ```
   an expense claims list with status filters and a submit button
   ```
3. Watch it build using **only** the locked design system, then the **Harness Gate (CI)** runs
   `house-lint` and posts a pass/fail report. If anything fails, it **auto-fixes** and re-checks.
4. **Prove the consistency** — build a *different* feature:
   ```
   a team directory with search
   ```
   Notice it has the **identical look, layout and shell** as the first one.

**Observe / discuss:** you gave up freedom and got consistency for free — every app on the
harness looks and is structured the same, guaranteed by the gate, not by hoping people follow
a style guide.

---

## Wrap-up — compare the three
| | Vibecoding | Spec-Driven | Harness |
|---|---|---|---|
| Speed to first result | ⚡ instant | 🐢 slower (spec first) | ⚡ fast |
| Consistency between people | ❌ low | ⚠️ medium (same spec) | ✅ enforced |
| Traceability | ❌ none | ✅ req → task → code | ✅ rules + lint |
| Best for | prototypes, exploration | complex/critical features | production at scale |

**Discussion prompts**
- Which app did you *trust* most, and why?
- When would each approach be the right call on a real project?
- Where do these combine in practice? (vibe a prototype → spec it → ship it on a harness)

---

### Facilitator notes
- Use **mock mode** (`./run.sh --mock`) for a dry run that doesn't call GenAI.
- Exercise 2 makes the most LLM calls (per-task) — give it a minute; it's meant to feel
  deliberate. Use **⚡ Quick Plan** to skip the approval gates if you're short on time.
- Everything persists in the browser session; **Sign-out** isn't needed between exercises.
- Encourage the ⛶ **full-screen** preview when someone wants to really *use* their app.
