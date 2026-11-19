# LuxeLifeOS

**Your Personal Chief of Staff.**
*Work toward the life you want without losing the life you have.*

LuxeLifeOS is a premium Personal Chief of Staff application designed to integrate personal and professional life management, strategic goal setting, executive prioritization, boundary intelligence, and intentional living into one sophisticated operating system.

LuxeLifeOS is a premium, mobile-first web app that helps you manage your personal and professional life together. It shows what deserves your attention today, tracks strategic goals, and helps you set and keep boundaries around your time. Every recommendation comes from transparent rules you can check by hand.

- **No AI, no API keys, no accounts, no backend.** All logic runs on your device.
- **Private by design.** Your data is stored only in your browser's local storage on your device and is never sent to a server.
- **Works offline** and installs on iPhone as a home-screen app (Progressive Web App).

**Live app:** https://demitrea.github.io/LuxeLifeOS/
**Roadmap:** [ROADMAP.md](ROADMAP.md) (including the planned Microsoft Outlook integration)

---

## Contents

1. [Features](#features)
2. [How the rules work](#how-the-rules-work)
   - [Calendar import (.ics)](#calendar-import-ics)
3. [Technology](#technology)
4. [Project structure](#project-structure)
5. [Run it locally](#run-it-locally)
6. [Testing](#testing)
7. [Deploy to GitHub Pages](#deploy-to-github-pages)
8. [Install on iPhone](#install-on-iphone)
9. [Releasing updates](#releasing-updates)
10. [Data, privacy and backups](#data-privacy-and-backups)
11. [Project requirements checklist](#project-requirements-checklist)
12. [Known limitations](#known-limitations)

---

## Features

| Screen | What it does |
|---|---|
| **Today** — Daily Executive Briefing | Top 3 priorities with a "Why?" score breakdown, a recommended *Focus first* task, **today's schedule** (meetings from imported calendars plus timed tasks), overdue items, follow-ups due, the next 7 days, today's work capacity, today's boundary alerts, and the weekly Executive Review. |
| **My Life** — Life management | Create, edit, complete and delete tasks across eight life areas: Career, Business, Education (professional) and Finances, Family, Relationships, Wellness, Personal Growth (personal). Track follow-ups and commitments. Filter by life area; view open or completed. |
| **My Goals** — Strategic goals | 30-day, 60-day, 90-day, 6-month and 12-month goals, each broken into milestones. Progress is calculated from completed milestones, and each goal is marked On track, At risk, Behind or Complete. Link tasks to goals. |
| **Boundaries** — Boundary Intelligence | Working hours, working days, maximum daily work, rest-day protection, and recurring protected time (for example family dinner). Shows upcoming conflicts and a 7-day capacity view. Warns you *before* you save a task that crosses a boundary and lets you override deliberately. **Imports calendar files (.ics)** from Outlook or other calendar apps, entirely on the device. Also holds backup, restore, sample data and erase controls. |
| **Executive Review** (opens from Today) | Monday–Sunday summary: completed and unfinished tasks, goal status, planned work against capacity, conflicts and overrides, and areas needing attention. |

A **"How LuxeLifeOS decides"** guide (the **?** button) shows every rule inside the app.

---

## How the rules work

All rules are deterministic: the same data on the same date always produces the same result. Every number below lives in one file, [`js/logic/config.js`](js/logic/config.js), so it can be adjusted after review, and the automated tests show exactly what changes.

### Priority score (0–100)

**Score = Urgency (40) + Importance (30) + Goal alignment (20) + Effort (10)**

| Urgency (days until due) | Points |
|---|---|
| Overdue | 40 |
| Due today | 36 |
| Due tomorrow | 32 |
| Due in 2–3 days | 26 |
| Due in 4–7 days | 18 |
| Due in 8–14 days | 10 |
| Due in 15–30 days | 5 |
| Due in more than 30 days | 2 |
| No due date | 0 |

| Importance | Points |
|---|---|
| Your rating 1–5 × 6 | 6–30 |

| Goal alignment | Points |
|---|---|
| Not linked to a goal | 0 |
| Linked to a goal | 12 |
| Linked to a goal that is **Behind** | 20 |

| Effort (estimate) | Points |
|---|---|
| Up to 30 min | 10 |
| 31–60 min | 8 |
| 61–120 min | 6 |
| 121–240 min | 3 |
| More than 240 min | 1 |
| No estimate | 5 |

**Tie-breakers, in order:** earlier due date (no due date sorts last), then higher importance, then the older task, then task ID.

**Today's Top 3** are drawn from open tasks that are not planned for a future day.

**Worked example:** a task due tomorrow (32), rated 4 (24), linked to a goal that is Behind (20), estimated at 90 minutes (6) scores **32 + 24 + 20 + 6 = 82**. This exact case is an automated test.

### Goal progress and status

- **Progress %** = round(completed milestones ÷ total milestones × 100). A goal with no milestones shows 0%.
- **Expected %** = days elapsed since the start date ÷ days between start and target, kept between 0 and 100.
- **Default target dates:** 30, 60, 90, 180 and 365 days after the start, editable.
- **Status**, checked in order:
  1. Every milestone done → **Complete**
  2. Target date has passed → **Behind**
  3. Progress is more than **25** points below expected → **Behind**
  4. Progress is more than **10** points below expected → **At risk**
  5. Otherwise → **On track**

### Boundary conflicts

Work tasks are those in **Career, Business and Education**. Checks run on tasks that have a planned date. Time-of-day checks also need a start time.

| Conflict | Severity | Triggered when |
|---|---|---|
| Over capacity | High | Work planned for a day is more than your daily maximum |
| Near capacity | Notice | Work planned is above 85% of your daily maximum (up to 100%) |
| Rest day | High | An open work task is planned on a non-working day while rest days are protected |
| Outside working hours | Medium | A timed work task starts before or ends after your working hours |
| Protected time | High | **Any** timed task (work or personal), or a meeting from a **professional** calendar, overlaps a protected block on that weekday |
| Double-booked | Medium | A timed task overlaps a busy meeting, or two busy meetings overlap (across any calendars) |

**Meetings from imported calendars:**
- Busy, timed meetings from calendars marked **Professional** count toward daily work capacity. They are also checked for rest days, working hours and protected time, just like work tasks.
- **Personal** calendar events are only checked for double-booking. A family event during family time is not a conflict.
- All-day events and events marked *free* never count.
- Calendar events are read-only, so a conflict involving only meetings can be **acknowledged** on the Boundaries screen. You then change the meeting in your calendar app.

- **Overlap rule:** two time spans overlap when *startA < endB* and *startB < endA*. Touching edges (ending at 18:00 when a block starts at 18:00) is not an overlap.
- **Capacity** counts every work task planned that day, finished or not (finished work still used that day's hours), plus professional meetings. Capacity alerts appear only while there is open work or a meeting that day.
- **Warning before you commit:** when you save a task, LuxeLifeOS compares the day before and after the change. If the change creates a high or medium conflict (or adds work to a day that is already over capacity), it asks you to choose **Change the plan**, **Save anyway** or **Cancel**. *Save anyway* records an intentional override, and the conflict is then shown as **Acknowledged**. Notices never block saving.

### Executive Review

- The week runs Monday to Sunday.
- **Completed** = tasks finished this week.
- **Unfinished** = open tasks due by Sunday (including overdue tasks) or planned this week.
- **Capacity** = working days × your daily maximum.
- **Needs attention** lists:
  - life areas with overdue tasks
  - goals that are Behind
  - weekly planned work above weekly capacity
  - neglected areas: an open task has waited 14 or more days and nothing in that area has been completed in the last 14 days

### Calendar import (.ics)

You can import calendars exported from Outlook, or from any app that produces iCalendar (.ics) files.

**What happens to the file**
- It is read in the browser **on your device** and never uploaded.
- Only each event's title, times and location are kept. Descriptions, attendees and notes are discarded.

**How to import**
1. Go to **Boundaries → Calendars → Import calendar (.ics)** and choose the file.
2. Name the calendar and mark it **Professional** or **Personal**.
3. To refresh it later, import a newer file and choose **Replace** for that calendar.

**How to export from Outlook**
- **Outlook for Windows (classic):** *File → Save Calendar*, then *More Options* to choose the date range.
- **Outlook on the web / Outlook.com:** *Settings → Calendar → Shared calendars → Publish a calendar*, then open the ICS link to download the file. Anyone with a published link can view the calendar, so unpublish it afterwards.
- **iPhone:** save the .ics file to the Files app (for example from an email attachment), then choose it in LuxeLifeOS.

**What is supported**
- Single and all-day events.
- Recurring meetings (daily, weekly, monthly and yearly patterns, including "second Tuesday" and "last Friday"), skipped and moved occurrences, and cancelled meetings, which are left out.
- Times in UTC are converted to the device's time zone. Times labelled with a named time zone are used as written, which is correct when you export from the same time zone as the device.
- Each import covers the **past 7 days through the next 90 days**.
- Repeating patterns that cannot be expanded (for example, hourly) keep only their first occurrence, and the import screen tells you.

Live, automatic Outlook sync for multiple accounts is planned for a future version. See [ROADMAP.md](ROADMAP.md).

---

## Technology

| Layer | Choice |
|---|---|
| Interface | Plain HTML, CSS and JavaScript ES modules. No framework, no build step, no dependencies. |
| Fonts | System fonts only (Iowan Old Style / Georgia for headings, the system sans-serif for text), so nothing is fetched from outside. |
| Storage | `localStorage`, one JSON document under the key `luxelifeos.v1` (schema version 2, with automatic migration from version 1) |
| Calendar import | Built-in iCalendar (.ics) parser in [`js/integrations/ics.js`](js/integrations/ics.js); no libraries |
| Offline | Service worker ([`sw.js`](sw.js)) that caches every app file on first load |
| Install | Web app manifest ([`manifest.webmanifest`](manifest.webmanifest)) and Apple touch icon |
| Tests | Node.js built-in test runner (`node --test`), Node 20 or newer |
| Hosting | GitHub Pages |

---

## Project structure

```
index.html              App shell, tab bar, iPhone meta tags
manifest.webmanifest    PWA manifest (name, icons, standalone display)
sw.js                   Service worker for offline use
.nojekyll               Tells GitHub Pages to serve files as-is
css/styles.css          Design system (ivory, charcoal, gold)
js/app.js               Controller: state, routing, actions
js/store.js             Local storage, validation, backup, sample data
js/logic/               Pure, testable rules (no browser APIs)
  config.js             Every weight and threshold
  dates.js              Time-zone-safe date helpers
  priority.js           Priority score and ranking
  goals.js              Goal progress and status
  boundaries.js         Conflict detection
  review.js             Weekly Executive Review
js/integrations/         Calendar sources (future integrations plug in here)
  contract.js           Shared CalendarSource / CalendarEvent format
  ics.js                On-device .ics parser and recurrence expansion
js/ui/                  Screen and sheet rendering
icons/                  App icons (180, 192, 512 and maskable 512)
tests/                  Automated tests for every rule
```

---

## Run it locally

Service workers need a web server (opening `index.html` directly from disk will not enable offline mode). From the project folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. `npm start` runs the same command.

---

## Testing

### Automated tests (rules and storage)

Requires Node.js 20 or newer. Nothing needs to be installed.

```bash
npm test
```

The suite checks every priority bracket at its boundaries (for example, due in 3 days vs. 4), the 10- and 25-point goal thresholds, each conflict rule (including meetings and double-booking), the warning-before-commit logic, the weekly review, .ics parsing and recurrence expansion, save/load, migration from version 1 data, corrupt-data recovery and backup import validation.

### Manual test checklist

1. **First run:** the Today screen shows a welcome card. Tap **Explore with fictional sample data**.
2. **Priorities:** tap a score (for example **80**). The four factors should add up to the total.
3. **Tasks:** in **My Life**, add, edit, complete and delete a task. After deleting, tap **Undo**.
4. **Goals:** in **My Goals**, tick a milestone. The progress ring and status update.
5. **Boundary warning:** add a Career task for today at 18:30 for 1 hour. A **Before you commit** sheet lists *Protected time* and *Outside working hours*. Choose **Save anyway**, then check that it appears as **Acknowledged** under **Boundaries**.
6. **Capacity:** set **Maximum work per day** to 1 hour, then plan a 2-hour Career task for today. You should see an **Over capacity** warning.
7. **Persistence:** close the app completely and reopen it. Your data is still there.
8. **Offline:** turn on Airplane Mode and reopen the app. It loads and works normally.
9. **Backup:** **Export backup**, **Erase all data**, then **Import backup**. Everything returns.
10. **Calendar import:** in **Boundaries → Calendars**, import an .ics file and mark it Professional. Its meetings appear in **Today's schedule**. An evening meeting during protected time shows a *Protected time* alert. A task planned on top of a meeting triggers a *Double-booked* warning.

---

## Deploy to GitHub Pages

1. Push the files to the `main` branch of the public repository `demitrea/LuxeLifeOS`.
2. On GitHub, open the repository → **Settings** → **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **`main`** and **`/ (root)`**, then click **Save**.
4. After a minute or two the app is live at **https://demitrea.github.io/LuxeLifeOS/**.
   The **Actions** tab shows the deployment's progress.

All paths in the app are relative (`./`), so it works from the `/LuxeLifeOS/` sub-path. GitHub Pages serves over HTTPS, which service workers require.

---

## Install on iPhone

1. Open **https://demitrea.github.io/LuxeLifeOS/** in **Safari**.
2. Tap the **Share** button (the square with an arrow).
3. Scroll down and tap **Add to Home Screen**. The name shows as **LuxeLifeOS**. Tap **Add**.
4. Open **LuxeLifeOS** from your home screen. It runs full screen in its own window, without Safari's address bar.

On iOS 16.4 and later, **Add to Home Screen** is also available from the Share menu of other browsers such as Chrome, but Safari is the most reliable.

> **Important:** the home-screen app keeps its own storage, separate from Safari. Data you enter in a Safari tab will not appear in the installed app. Install first, then add your data. To move data, use **Export backup** and **Import backup**.

---

## Releasing updates

The service worker serves cached files first, so the app opens instantly offline. To ship a change:

1. Edit the files.
2. In [`sw.js`](sw.js), change `CACHE_VERSION` (for example `luxelifeos-v1` → `luxelifeos-v2`). If you added a new file, add it to `APP_FILES`.
3. Commit and push to `main`.
4. On the iPhone, fully close LuxeLifeOS (swipe it away in the app switcher), then open it once or twice. The new version installs in the background and appears on the next launch.

---

## Data, privacy and backups

- All data lives in `localStorage` on your device under `luxelifeos.v1`. LuxeLifeOS makes **no network requests** other than loading its own files from GitHub Pages.
- Imported calendar files are processed on the device. Only event titles, times and locations are stored.
- **No AI model or AI API** is used. No API keys, passwords, analytics or third-party services.
- Your data is erased if you delete the app from your home screen or clear the website's data in Settings. Use **Boundaries → Export backup** regularly.
- If saved data is ever unreadable, it is set aside under `luxelifeos.v1.corrupt` rather than overwritten.
- Sample data is **entirely fictional**. It contains no real people, places, employers or contact details.

---

## Project requirements checklist

| Requirement | How LuxeLifeOS meets it |
|---|---|
| Working web application | Static HTML/CSS/JS app hosted on GitHub Pages |
| Installable on iPhone as a PWA | Web app manifest, Apple touch icon and iOS meta tags |
| Opens from its own icon in a standalone window | `"display": "standalone"` and `apple-mobile-web-app-capable` |
| Saves data locally between sessions | `localStorage`, saved on every change |
| Works offline after installation | Service worker caches all app files |
| Calculates priorities, goal progress and boundary conflicts | `js/logic/priority.js`, `goals.js`, `boundaries.js`, covered by automated tests |
| Mobile-friendly and easy to learn | Mobile-first layout, 44pt+ touch targets, welcome card, sample data, in-app rules guide |
| Public GitHub repository and GitHub Pages | `demitrea/LuxeLifeOS` |
| No AI, API keys, passwords or backend | Pure client-side code with no external requests. Calendar import reads a local file; there is no Microsoft sign-in or API call in Version 1. |
| Data stays on the device | No network calls. Backups are files you control. |
| README with setup, testing, deployment and installation | This document |

---

## Known limitations

These are deliberate scope limits for version 1.

- Data does not sync between devices (by design, nothing leaves the device). Use export/import to move it.
- No push notifications or reminders, because these would require a server.
- No recurring tasks. Protected time blocks repeat weekly.
- Protected time blocks cannot cross midnight.
- Life areas and their professional/personal grouping are fixed.
- All milestones count equally toward goal progress.
- Imported calendars are snapshots. Re-import to refresh. There is no live Outlook sync yet ([planned](ROADMAP.md)).
- Calendar times labelled with a named time zone are read as written (not converted between time zones).
