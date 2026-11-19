# LuxeLifeOS — Project 2 Build Log

A factual record of how LuxeLifeOS was planned, built, tested, corrected and deployed for the AI & Legal Reasoning course (Project 2). It lists what changed and why, and records mistakes and corrections as they actually happened.

- **Repository:** https://github.com/demitrea/LuxeLifeOS
- **Live app:** https://demitrea.github.io/LuxeLifeOS/
- **Built with:** Claude Code (an AI coding assistant) used as a development tool, working in a cloud session under the project owner's direction and approval. The application itself contains **no AI** and calls no external services.

---

## Summary of releases

| Date (2026) | Commit | What |
|---|---|---|
| Nov 18 | `5eec4da` | Repository created by the owner with a one-paragraph README ("Initial commit") |
| Nov 18 | `6399b76` | Version 1: four screens, priority scoring, goals, Boundary Intelligence, Executive Review, offline PWA |
| Nov 18–19 | `6ea04a3` | On-device calendar (.ics) import and Microsoft Outlook roadmap |
| Nov 19 | `8d0bb54` | README: owner's original description preserved and exact repository name used |
| Nov 19 | — | GitHub Pages enabled by the owner; live site verified |
| Nov 19 | *(this release)* | Voice-first quick capture, schema v3, uncategorized tasks, one-time protected time, editable day parts |

Automated test count: **38 → 57 → 84**, all passing at each release.

---

## Phase 1 — Planning (Nov 18)

- Requirements were taken from the owner's brief: four screens, transparent rule-based priorities, goals, boundaries, offline PWA, GitHub Pages, and no AI, APIs, passwords or backend.
- A written plan was approved before any code was written, including the exact scoring rules:
  - Priority weights 40 / 30 / 20 / 10 (urgency, importance, goal alignment, effort), provisionally approved by the owner "subject to testing and verification".
  - Goal status thresholds: At risk when progress is more than 10 points below expected, Behind when more than 25.
- **Scope decisions for a ~4-hour build:**
  - The Executive Review became a panel opened from Today rather than a fifth screen.
  - Start times are optional.
  - Follow-ups are a flag on tasks, not a separate record type.
  - Life areas are a fixed list.
  - Recurring tasks and push notifications were left out. Push notifications would need a server.
- The app was renamed from "LifeOS" to **LuxeLifeOS** at the owner's request. The owner's existing `demitrea/LifeOS` repository was left untouched throughout.

## Phase 2 — Version 1 build (Nov 18)

- **Technology:**
  - Plain HTML, CSS and JavaScript modules, with no framework, build step or dependencies.
  - `localStorage` for data and a service worker for offline use.
  - Node's built-in test runner.
  - System fonts only, so nothing is fetched from third parties.
- **Logic** is written as pure functions in `js/logic/`, with `today` passed in instead of read from the clock, so every rule is deterministic and testable.
- **Accessibility:** every text color pair was checked for contrast. All pass WCAG AA (4.5:1 or better). The accent gold (2.82:1 on ivory) is used only for decoration, never for text.

**Corrections during Phase 2 (found by testing):**

| # | Problem found | Type | Fix |
|---|---|---|---|
| 1 | `npm test` used `node --test tests/`, which failed on Node 22 ("Cannot find module") | Configuration | Changed to `node --test`, which finds `*.test.js` files automatically |
| 2 | Removing work from an over-capacity day reported a "new" near-capacity notice | **Logic bug** | Capacity warnings now appear only when a change *increases* that day's work. Test added. |
| 3 | A test expected a task ending at 18:00 to overlap a block starting at 18:00 | Error in the test, not the app | The rule (touching edges don't overlap) was correct. The test was fixed. |
| 4 | The "Before you commit" warning sheet opened scrolled down, hiding its first sentence | UI bug | The scroll reset was applied to the wrong element and was corrected |
| 5 | The weekly review flagged life areas as "neglected" even for tasks created that day ("9 areas need attention") | Rule too broad | An area is now neglected only if an open task has waited 14+ days with nothing completed in that area since. Test added. |
| 6 | Tasks appeared twice on Today (Top 3 and "Due in the next 7 days") | UI | The upcoming list now excludes tasks already shown above |

## Phase 3 — Calendar import and Outlook roadmap (Nov 18–19)

- The owner asked for a Microsoft Outlook roadmap, with no live Outlook connection in Project 2. `ROADMAP.md` documents the planned design:
  - multiple read-only accounts, using Microsoft's sign-in library (MSAL) with PKCE
  - minimal Microsoft Graph permissions
  - no backend
- **Implemented now, on the device only:**
  - Import of calendar files (.ics) exported from Outlook or other calendar apps.
  - Recurring meetings are expanded, cancelled ones are skipped, and only title, time and location are kept.
  - Professional meetings count toward capacity and are checked against protected time. Double-booking is detected.
- **Storage schema version 2**, with automatic migration from version 1.
- A shared calendar format (`js/integrations/contract.js`) was introduced so that future Outlook accounts can feed the same rules.

**Corrections during Phase 3:**

| # | Problem found | Type | Fix |
|---|---|---|---|
| 7 | On phones, the Boundaries screen was 431px wide on a 390px display, so it appeared zoomed out. Two hidden file-picker inputs were stretched to full width by a more specific input style. **This bug had existed since Version 1.** | UI bug | Hidden-input styles made explicit. All screens were verified at 320, 390, 430 and 768px. |

**Unverified at the time:** the Outlook export menu steps in the README come from documentation knowledge. They were not tested against a live Outlook account.

## Phase 4 — Publishing (Nov 19)

| Step | What happened |
|---|---|
| Repository access | The first push attempts were refused. The Claude GitHub App was *authorized* on the owner's account but not *installed* with access to the new repository. The owner installed it for `LuxeLifeOS`. |
| Repository name | The repository is named **LuxeLifeOS** (not `luxelifeos` as first planned). All links were updated to the exact name. |
| Existing commit | The repository already contained the owner's "Initial commit" with a README. Instead of force-pushing, the new commits were **rebased on top of it**, and the owner's description was kept word for word. The push was a normal fast-forward (`5eec4da..8d0bb54`). |
| GitHub Pages | The session's network proxy blocks GitHub's Pages settings API, so **the owner enabled Pages** in repository settings. A separate personal cloud environment allowing only `demitrea.github.io` was created, with the owner's approval, to verify the live site. |
| Verification | All files load on the live site with the correct content types. Persistence (12 tasks survived a reload), offline reload (24 files cached), boundary warnings, calendar import, and layouts at 320–768px all passed **in an automated mobile browser**. |

## Phase 5 — Voice-first quick capture (Nov 19)

**Request:** make voice entry a core principle, with several commitments in one statement, deterministic rules, no invented details, a review before saving, one-tap save, Undo, and forms kept only as a fallback.

**Feasibility finding (researched before building):**
- Safari's Web Speech API (`webkitSpeechRecognition`) routes audio through Apple's speech services, and a page cannot force on-device processing.
- A WebKit contributor stated the API is not available in web apps added to the Home Screen.
- Chrome's on-device mode is a desktop feature; all iPhone browsers use WebKit.
- **Decision:** no in-app speech recognition. Voice input uses the **iPhone keyboard's own dictation**, so LuxeLifeOS receives text only. The app and README state plainly that Apple may process dictation on its servers and that on-device processing is not guaranteed.

**Owner decisions applied:**
1. Editable default time ranges (morning 06:00–12:00, afternoon 12:00–18:00, evening 18:00–22:00).
2. "Friday evening" is a **one-time** protected block unless recurrence is stated.
3. A category is never required. Items without a recognized area are saved as **Uncategorized**.
4. Several commitments can be reviewed and saved with one confirmation.
5. Questions are asked only when they would change a deadline, a time-sensitive commitment or a boundary.
6. The original wording is preserved when interpretation isn't confident.
7. Undo is available immediately after saving.

**What was built:**
- A prominent **"What's on your mind?"** card at the top of Today:
  - A large text box (18px text, so iOS doesn't zoom in) with a **Review** button, an **Add manually** link and an "About dictation" explainer.
  - The unsaved note survives reloads.
- A **review sheet** listing each item with its type, date, area and importance, the exact words each value came from, any question as one-tap options, and boundary warnings. Tapping an item opens an editor in place. One **Save** adds everything.
- **Undo** appears as a message and as a banner on Today for 10 minutes. It removes exactly the records just added, by their IDs, so later changes are never overwritten.
- **Parser** (`js/logic/capture.js`): fixed rules for splitting statements, types, dates, weekdays, times, durations, protected-time recurrence, and area and importance words. All word lists are in `js/logic/config.js`.
- **Schema version 3:**
  - Uncategorized tasks (`domain: null`), which never count as work.
  - One-time protected blocks (`date`).
  - Editable `dayParts`.
  - Versions 1 and 2 migrate automatically.
- Batch boundary checking (`diffConflicts`): new protected time is checked against **existing** tasks and meetings before saving.
- Offline cache renamed `luxelifeos-v1` → `luxelifeos-v2`, so installed copies pick up the new files.

**Corrections during Phase 5 (found by review and testing before deployment):**

| # | Problem found | Type | Fix |
|---|---|---|---|
| 8 | Draft word lists could produce wrong guesses: "key" (importance), "run" and "walk" (Wellness), "book" (Growth, though usually the verb "to book") | Rule review | Words removed before any testing. A test confirms "Run errands" stays uncategorized. |
| 9 | "Essay due **by** Friday" was not treated as a deadline: "by" was absorbed into the weekday phrase | Parser bug | "by" is no longer part of the weekday pattern, so the deadline rule sees it |
| 10 | Vague words ("next week") were removed from titles, silently losing the user's wording | Parser bug (data loss) | Vague words now stay in the title. Test added. |
| 11 | "Protect 6 to 8 tonight" ignored "6 to 8" and used the default evening range | Parser bug | Bare ranges are recognized. "Tonight" or "evening" settles PM; otherwise AM/PM is asked. Test added. |
| 12 | "Submit by 5pm Monday" was treated as a planned day, not a deadline (the time sat between "by" and "Monday") | Parser bug | The deadline check looks past an intervening time. Test added. |
| 13 | Protected-time labels began with "On" ("On Saturday 6 to 8") | Cosmetic | Leading prepositions are removed from labels |

**Intentional behavior changes (tests updated deliberately, not to hide failures):**
- An unrecognized life area used to be silently changed to "Personal Growth". It is now **Uncategorized**, per the owner's instruction never to invent a category.
- The migration test now expects schema version 3, and importing a backup from a *newer* version (4) is refused.
- An earlier browser test script looked for the offline cache by its old name (`luxelifeos-v1`) and reported 0 cached files after the rename. The script was updated, and the re-run reported 26 cached files.

**Test results before deployment (Phase 5):**
- `npm test`: **84 tests, 84 passed, 0 failed.**
- Automated mobile-browser tests on a local server:
  - Migration of version 2 data: all existing tasks, goals, protected blocks and calendar events were preserved and saved as version 3.
  - Draft kept after a reload.
  - The example sentence produced exactly 3 items (task, follow-up, one-time protected time) with no questions.
  - A one-tap correction took effect.
  - One-tap save worked, and Undo removed only the new items.
  - The ambiguous-weekday question appeared and blocked saving until answered.
  - Boundary warnings were shown in the review and recorded as overrides on save.
  - The manual form still works and offers Uncategorized.
  - Offline capture worked.
  - No console errors.
- Layouts with no sideways scrolling at 320 / 390 / 430 / 768px on all four screens, plus the review sheet and its editor.
- Regression runs of the earlier test scripts (core flow, calendar import) passed.

**Known limitations (also in the README):**
- The parser understands a defined set of English phrasings. Numeric dates are month/day.
- Goals, repeating tasks and edits to existing items cannot be made by voice yet.
- Voice entry depends on iPhone keyboard dictation and on Apple's processing of dictated speech.

---

## Not yet verified on a physical iPhone

All browser tests used an automated mobile browser (Chromium with iPhone screen sizes), not Safari on a real iPhone. These still need a hands-on check:
- installing to the Home Screen and opening full screen
- Airplane Mode use after installation
- keyboard dictation into the capture box
- the update from the previous installed version

The manual checklist in the README covers these steps.
