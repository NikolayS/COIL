# COIL — Design Brief

## What it is
COIL is a personal territory tracking & journaling app for men doing self-development work.
"Territories" = the 5 life areas: Self, Health, Relationships, Wealth, Business.

## Current prototype (to improve upon)
Dark theme, olive/gold palette, premium feel. Good bones, poor execution.
Problems: flat typography, clunky checkbox UX, invisible progress bar, inconsistent spacing.

## Aesthetic direction
Refined dark luxury. Think Field Notes meets a war room. NOT a wellness app. NOT purple gradients.
- Dark backgrounds: #1a1a18 base, #242420 cards
- Gold accent: #c9a84c (the COIL gold)
- Territory colors: green (Self), coral/red (Health), amber (Relationships), blue (Wealth), purple (Business)
- Typography: Playfair Display for headings (authority), DM Mono for numbers/scores, Inter for body
- Checkboxes: satisfying tap targets, animated fills, not bare outlines
- Progress: visible, meaningful, motivating

## 4 tabs to build

### 1. DAILY
- Week header: "WEEK OF Feb 24, 2026" + score "12/35" (large, prominent)
- Day picker: Mon–Sun, compact, current day highlighted in gold
- Territories section: 5 rows, each with color dot, name, and a proper toggle (not bare checkbox)
- Wolf Check: 4 options (Wise / Open / Loving / Fierce) — pill selector, one active at a time
- Drinks counter: − / number / + with weekly total shown
- Journal notes textarea (auto-expand)
- "What could I have done better?" textarea

### 2. WEEKLY
- Territory breakdown: colored progress bars, X/7 per territory
- Drinks total for the week
- Reflection questions (7 total):
  - Wins (one big one)
  - Gratitude
  - Lessons / Challenges
  - Did I achieve my focus/stretch from last week?
  - Focus for coming week
  - Stretch for coming week
  - Will I reach my goal if I continue this way?
  - Is my cup overflowing?
  - What areas need improvement?

### 3. EXPORT
- "COPY FULL COIL REPORT" — primary gold CTA
- "ARCHIVE & START NEW WEEK" — secondary
- "RESET" — danger
- Preview of the markdown report below

### 4. PAST WEEKS
- List of archived weeks, click to expand
- Empty state: "No archived weeks yet"

## Tech
- Next.js 15 App Router, TypeScript, Tailwind CSS
- State: useState for now (localStorage persistence), Supabase later
- Mobile-first, works in browser, PWA-ready

## Key UX principles
- Every interaction should feel satisfying (spring animations on toggles)
- Score should always be visible
- Saving should be automatic and instant (optimistic UI)
- Must work offline (localStorage)
