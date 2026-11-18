# LuxeLifeOS Product Roadmap

*Work toward the life you want without losing the life you have.*

This roadmap describes where LuxeLifeOS is going after the initial release. Version 1 is the offline Personal Chief of Staff delivered for Project 2. Later versions are plans, not commitments, and each one will be reviewed against the same principles before it is built.

## Guiding principles

1. **The offline core comes first.** Briefing, goals, priorities and Boundary Intelligence must keep working with no connection and no account.
2. **Privacy by design.** Data stays on the device unless the user explicitly connects a service. LuxeLifeOS never runs its own server.
3. **Read-only first.** Any connected account starts with the smallest read-only permissions. Write access, if ever offered, is a separate, explicit opt-in.
4. **The user stays in control.** Every connection can be inspected, limited and disconnected, and disconnecting deletes that account's data from the device.
5. **Transparent rules, no AI.** Integrations supply data. The same published, testable rules decide priorities and conflicts.

---

## Release overview

| Version | Focus | Status |
|---|---|---|
| **1.0 — Project 2** | Offline Personal Chief of Staff: Today briefing, My Life, My Goals, Boundary Intelligence, Executive Review, **on-device calendar file (.ics) import** | **Built** |
| 1.1 | Polish from real-world testing: scoring weight review, recurring tasks, editable life areas | Planned |
| **2.0** | **Microsoft Outlook integration**: multiple read-only accounts, consolidated calendars, flagged-email follow-ups, pending commitments | Designed (this document) |
| 2.x | Optional write actions (for example, suggest declining a meeting that breaks a boundary), with explicit opt-in | Exploratory |

---

## Version 1.0: what is in the Project 2 release

- Offline PWA, installable on iPhone, with data stored only on the device.
- Deterministic priority scoring (40 / 30 / 20 / 10), goal progress and status (10- and 25-point thresholds), and boundary conflict detection.
- **Calendar file (.ics) import, entirely on the device.** This is the first step toward Outlook integration and delivers part of it without any sign-in or API:
  - Import one or more calendars exported from Outlook (or any calendar app), each labelled **Professional** or **Personal**.
  - Meetings appear in a consolidated **Today's schedule** alongside timed tasks.
  - Professional meetings count toward daily work capacity and are checked against working hours, rest days and **protected personal time**.
  - **Double-booking** is detected across all calendars and tasks.
  - Recurring meetings are expanded (daily, weekly, monthly and yearly patterns, exceptions and moved occurrences). Cancelled meetings are skipped.
  - Only titles, times and locations are kept. Descriptions, attendees and notes are discarded.
  - Calendars are a snapshot (past 7 days to next 90 days), refreshed by re-importing.

**Not in Version 1:** Microsoft sign-in, Outlook API connections, email access and any network calls beyond loading the app itself.

---

## Version 2.0: Microsoft Outlook integration (design)

### Goals

Support **multiple authorized Outlook accounts**, for example a personal Outlook.com account and a work Microsoft 365 account, with their calendars and email, so that LuxeLifeOS can:

| # | Planned feature | How it works |
|---|---|---|
| 1 | **Consolidated calendar and meeting overview** | Events from every connected account (and any imported .ics files) merge into Today's schedule and the 7-day view, labelled by account. |
| 2 | **Scheduling conflict detection across life domains** | The existing rules run unchanged on Outlook events: double-booking across accounts, capacity, working hours and rest days. Each calendar is mapped to Professional or Personal. |
| 3 | **Follow-up tracking for important emails** | Emails the user has **flagged** in Outlook become follow-up items in My Life, with the flag's due date when one is set. Completing the flag in Outlook completes the item on the next sync. |
| 4 | **Identification of pending commitments** | Transparent rules, no AI: flagged emails without a completion date, meeting invitations not yet responded to, and meetings the user organizes that are coming up soon. Each item shows which rule identified it. |
| 5 | **Boundary alerts for professional meetings in protected time** | Already implemented in Version 1 for imported calendars. With live sync, alerts update automatically when meetings change. |
| 6 | **User-controlled, read-only permissions** | Per-account toggles for *Calendar* and *Flagged email*, a plain-language list of the permissions granted, and **Disconnect**, which signs out and deletes that account's data from the device. |

### Architecture

LuxeLifeOS stays a static app on GitHub Pages with **no backend**. The device talks directly to Microsoft.

```
iPhone (LuxeLifeOS PWA)                          Microsoft
┌──────────────────────────────────────┐        ┌──────────────────────────┐
│ Outlook adapter (js/integrations/)   │──────▶ │ Microsoft identity       │
│  · sign-in: MSAL.js, auth code + PKCE│ ◀──────│  platform (sign-in)      │
│  · read-only Microsoft Graph calls   │──────▶ │ Microsoft Graph          │
│            │                         │ ◀──────│  /me/calendarView        │
│            ▼                         │        │  /me/messages (flagged)  │
│ CalendarEvent / follow-up objects    │        └──────────────────────────┘
│            │                         │
│            ▼                         │
│ Same rules: priority, boundaries,    │
│ review (unchanged)                   │
│ Local storage on device              │
└──────────────────────────────────────┘
```

- **Sign-in:** Microsoft Authentication Library for JavaScript (`@azure/msal-browser`) using the authorization code flow with PKCE, the recommended flow for single-page apps. It needs no client secret and no server.
- **App registration:** a single-page-application registration in Microsoft Entra ID, with the GitHub Pages address as the redirect URI. It would support both personal Microsoft accounts and work or school accounts.
- **Multiple accounts:** MSAL keeps a separate token cache entry per signed-in account. Each account is stored as a `CalendarSource` (`type: 'outlook'`, `accountId`).
- **Offline behavior:** sync happens when the app opens with a connection. Offline, the last synced snapshot is used, exactly like an imported .ics file.
- **Library hosting:** the MSAL library would be bundled with the app at a pinned version and cached by the service worker, not loaded from a third-party CDN at runtime.

### Permissions (delegated, read-only)

| Permission | Why | When requested |
|---|---|---|
| `User.Read` | Show which account is connected (name, email) | On connect |
| `Calendars.Read` | Read the user's calendar events | When the user turns on *Calendar* for that account |
| `Mail.ReadBasic` | Read flagged messages' subject, sender, received date and flag (no message bodies or attachments) | When the user turns on *Flagged email* |
| `offline_access` | Keep the connection between app launches | On connect |

Permissions are requested incrementally, only when a feature is switched on. No write permissions (`Calendars.ReadWrite`, `Mail.Send`, and so on) are requested in Version 2.0.

**Planned Microsoft Graph requests**

| Purpose | Request |
|---|---|
| Calendar | `GET /me/calendarView?startDateTime=…&endDateTime=…`. This returns recurring meetings already expanded into occurrences. A `Prefer: outlook.timezone` header gives times in the device's time zone. |
| Follow-ups | `GET /me/messages?$filter=flag/flagStatus eq 'flagged'&$select=subject,from,receivedDateTime,flag,webLink` |

### Mapping Outlook data to LuxeLifeOS

| Outlook | LuxeLifeOS |
|---|---|
| Event (`subject`, `start`, `end`, `isAllDay`, `showAs`, `isCancelled`, `location`) | `CalendarEvent` (`title`, `date`/`startTime`, `endDate`/`endTime`, `allDay`, `busy = showAs ≠ free`, skip if cancelled, `location`) |
| Calendar marked Professional / Personal by the user | `CalendarSource.category` |
| Flagged message (`subject`, `flag.dueDateTime`, `webLink`) | Follow-up task (`isFollowUp: true`, `followUpDate`, `source: { type: 'outlook', ref: messageId, label: account }`) |
| Invitation with no response yet (`responseStatus` = none or not responded) | Pending commitment |

Message bodies, attendees and attachments are never downloaded or stored.

### Already prepared in Version 1

The Version 1 code was structured so that this integration can be added without rewriting the core:

- [`js/integrations/contract.js`](js/integrations/contract.js) defines the `CalendarSource` and `CalendarEvent` shapes, including `type: 'outlook'` and `accountId`. The Outlook source type is declared but marked unavailable.
- The boundary, priority and review rules accept calendar events from any source. Imported `.ics` events already exercise every rule Outlook events will use.
- Tasks carry an optional `source` field (null today), ready to link a follow-up to the Outlook email it came from.
- Stored data has a schema version (currently 2) with automatic migration, so new fields can be added safely.
- Conflict acknowledgements for read-only calendar events are stored locally, so they work the same for Outlook events.

### Implementation steps for Version 2.0

1. Register the single-page application in Microsoft Entra ID and confirm the account types and redirect URIs.
2. Add `js/integrations/outlook.js`, an adapter that signs in, fetches events and flagged mail, and returns `CalendarEvent` and follow-up objects.
3. Add an **Accounts** section to Boundaries: connect, per-account feature toggles, a permission summary, last sync time, and disconnect.
4. Sync on launch when online, and record the last successful sync for each account.
5. Test with recorded Microsoft Graph response fixtures (no live calls in automated tests).
6. Update the README, privacy notes and the in-app "How LuxeLifeOS decides" guide.

### Privacy, security and legal considerations

These matter for an app that handles both personal and employer data. They are not legal advice.

- **Data minimization:** read only what each feature needs (no email bodies). Store only derived fields, and only on the device.
- **Consent and transparency:** explain each permission in plain language before requesting it. Show what is stored, and allow deletion at any time.
- **Work accounts:** a work or school organization may require administrator approval before an app can access its data, and its policies may restrict copying work data to personal devices. LuxeLifeOS should respect a refusal gracefully and never try to bypass it.
- **Token handling:** tokens are kept in the browser by MSAL and never leave the device except to Microsoft. Disconnecting clears them.
- **Change in data flow:** connecting Outlook introduces network calls to Microsoft and a Microsoft sign-in. This is outside Project 2's requirements, which is why it is planned for after the initial release and will always be optional.

### Open questions

- Which flag due-date and priority rules best surface "important" email without AI? A candidate: flagged and marked high importance, or flagged with a due date within 7 days.
- Should personal calendar events ever count toward a separate "personal capacity"?
- How long should synced snapshots be kept on the device: 7 days back and 90 forward, as with .ics, or user-configurable?

---

## Other ideas under consideration

- Recurring tasks and routines.
- Editable life areas and professional/personal assignment.
- Local reminders where the platform allows them without a server.
- Additional calendar sources through the same contract: Google Calendar and Apple iCloud calendars work today through .ics export.
- Weighted milestones for goal progress.
