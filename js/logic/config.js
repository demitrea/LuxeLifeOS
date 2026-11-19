// LuxeLifeOS — every tunable rule lives in this one file.
// Changing a weight or threshold here changes the whole app, and the tests
// in /tests show exactly which behaviour moved.

/** Priority score: four factors that add up to a maximum of 100 points. */
export const SCORING = Object.freeze({
  urgency: Object.freeze({
    max: 40,
    overdue: 40,
    noDueDate: 0,
    // The first bracket whose maxDays is >= days-until-due wins.
    brackets: Object.freeze([
      Object.freeze({ maxDays: 0, points: 36 }), // due today
      Object.freeze({ maxDays: 1, points: 32 }), // due tomorrow
      Object.freeze({ maxDays: 3, points: 26 }),
      Object.freeze({ maxDays: 7, points: 18 }),
      Object.freeze({ maxDays: 14, points: 10 }),
      Object.freeze({ maxDays: 30, points: 5 }),
    ]),
    beyond: 2, // due in more than 30 days
  }),
  importance: Object.freeze({ max: 30, perLevel: 6, defaultLevel: 3 }), // level 1–5 × 6
  alignment: Object.freeze({ max: 20, none: 0, linked: 12, linkedBehind: 20 }),
  effort: Object.freeze({
    max: 10,
    // The first bracket whose maxMinutes is >= the estimate wins.
    brackets: Object.freeze([
      Object.freeze({ maxMinutes: 30, points: 10 }),
      Object.freeze({ maxMinutes: 60, points: 8 }),
      Object.freeze({ maxMinutes: 120, points: 6 }),
      Object.freeze({ maxMinutes: 240, points: 3 }),
    ]),
    beyond: 1, // more than 240 minutes
    unknown: 5, // no estimate given
  }),
});

/** Goal status: how far actual progress may trail expected progress. */
export const GOAL_STATUS = Object.freeze({
  atRiskGap: 10, // At risk when progress < expected − 10
  behindGap: 25, // Behind  when progress < expected − 25
});

/** Default target date length for each goal horizon, in days. */
export const HORIZON_DAYS = Object.freeze({
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '6mo': 180,
  '12mo': 365,
});

export const HORIZONS = Object.freeze([
  Object.freeze({ id: '30d', label: '30 days' }),
  Object.freeze({ id: '60d', label: '60 days' }),
  Object.freeze({ id: '90d', label: '90 days' }),
  Object.freeze({ id: '6mo', label: '6 months' }),
  Object.freeze({ id: '12mo', label: '12 months' }),
]);

/** Boundary Intelligence thresholds. */
export const BOUNDARIES = Object.freeze({
  capacityNearRatio: 0.85, // "near capacity" notice above 85 %
});

/** Briefing and review windows. */
export const BRIEFING = Object.freeze({
  topCount: 3,
  upcomingDays: 7,
  neglectDays: 14,
});

/** Life domains. Only "professional" domains count toward work capacity. */
export const DOMAINS = Object.freeze([
  Object.freeze({ id: 'career', label: 'Career', type: 'professional' }),
  Object.freeze({ id: 'business', label: 'Business', type: 'professional' }),
  Object.freeze({ id: 'education', label: 'Education', type: 'professional' }),
  Object.freeze({ id: 'finances', label: 'Finances', type: 'personal' }),
  Object.freeze({ id: 'family', label: 'Family', type: 'personal' }),
  Object.freeze({ id: 'relationships', label: 'Relationships', type: 'personal' }),
  Object.freeze({ id: 'wellness', label: 'Wellness', type: 'personal' }),
  Object.freeze({ id: 'growth', label: 'Personal Growth', type: 'personal' }),
]);

/** Calendar import limits (on-device .ics files today; Outlook accounts later). */
export const INTEGRATIONS = Object.freeze({
  icsPastDays: 7, // keep events from the last 7 days …
  icsFutureDays: 90, // … through the next 90 days
  maxEventsPerSource: 3000,
});

/**
 * Quick capture ("What's on your mind?"): published, deterministic rules.
 * A life area is suggested only when the user's own words contain one of
 * these listed words, and only when they all point to the same area.
 */
export const CAPTURE = Object.freeze({
  // Default meaning of time-of-day words. Users can edit these in Boundaries.
  defaultDayParts: Object.freeze({
    morning: Object.freeze({ start: '06:00', end: '12:00' }),
    afternoon: Object.freeze({ start: '12:00', end: '18:00' }),
    evening: Object.freeze({ start: '18:00', end: '22:00' }),
  }),
  areaWords: Object.freeze({
    education: ['paper', 'essay', 'exam', 'midterm', 'quiz', 'homework', 'assignment', 'class', 'lecture', 'course', 'thesis', 'dissertation', 'study', 'studying', 'professor', 'syllabus', 'seminar', 'tutor', 'school', 'semester'],
    career: ['client', 'clients', 'report', 'meeting', 'boss', 'manager', 'presentation', 'proposal', 'office', 'coworker', 'colleague', 'interview', 'resume', 'team'],
    business: ['invoice', 'invoices', 'customer', 'customers', 'sales', 'startup', 'vendor', 'supplier', 'pitch', 'investor', 'investors', 'website'],
    finances: ['bill', 'bills', 'rent', 'budget', 'tax', 'taxes', 'bank', 'payment', 'mortgage', 'insurance', 'savings', 'loan', 'credit'],
    family: ['mom', 'dad', 'mother', 'father', 'kids', 'son', 'daughter', 'family', 'parents', 'sister', 'brother', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'aunt', 'uncle'],
    relationships: ['friend', 'friends', 'partner', 'girlfriend', 'boyfriend', 'anniversary', 'wedding', 'date night'],
    wellness: ['gym', 'workout', 'jog', 'doctor', 'dentist', 'therapy', 'therapist', 'yoga', 'meditate', 'meditation', 'checkup', 'prescription', 'pharmacy', 'physio'],
    growth: ['journal', 'journaling', 'learn', 'learning', 'practice', 'hobby', 'podcast', 'language'],
  }),
  // Importance is set only when one of these phrases is spoken.
  importanceWords: Object.freeze([
    Object.freeze({ level: 5, words: ['urgent', 'urgently', 'asap', 'as soon as possible', 'critical', 'top priority', 'immediately'] }),
    Object.freeze({ level: 4, words: ['important', 'high priority', 'crucial'] }),
    Object.freeze({ level: 2, words: ['low priority', 'whenever', 'someday', 'if i have time', 'no rush', 'not urgent', 'eventually'] }),
  ]),
  defaultImportance: 3,
});

export const SEVERITY_RANK = Object.freeze({ high: 0, medium: 1, notice: 2 });
