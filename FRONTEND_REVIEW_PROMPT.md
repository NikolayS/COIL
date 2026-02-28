You are doing a UI/UX review and improvement pass on the COIL app — a personal territory tracking & journaling app with a premium dark aesthetic.

Read the frontend design skill guidance here first:
https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md

Then read DESIGN_BRIEF.md and the current src/app/page.tsx and src/app/globals.css.

Do a full UI/UX review and implement improvements. Think like a senior product designer. Focus on:

1. **Visual hierarchy** — is it clear what's most important on each screen?
2. **Spacing & rhythm** — consistent, intentional whitespace
3. **Interactive states** — do buttons/toggles feel satisfying? Hover, active, checked states
4. **Typography** — size scale, weight contrast, readability
5. **Color usage** — are the territory colors used consistently and meaningfully?
6. **Empty states** — are they helpful and on-brand?
7. **Mobile UX** — thumb-friendly tap targets (min 44px), no accidental taps
8. **Micro-interactions** — checkbox animations, tab transitions, counter feel
9. **Light theme** — does it look as good as the dark theme?
10. **Overall polish** — what makes it feel cheap vs premium?

Make concrete improvements directly in the code. Don't just report issues — fix them.

Key constraints:
- Keep localStorage state management as-is
- Keep the 4-tab structure (Daily/Weekly/Export/Past Weeks)
- Keep Geist font
- Keep the gold (#c9a84c dark / #9a7230 light) as primary accent
- Mobile-first, max-w-md

When done, run: openclaw system event --text "COIL UI/UX review complete — improvements deployed" --mode now
