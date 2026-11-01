---
name: ui-ux-designer
description: Design or review interfaces in apps/voter-web for visual hierarchy, responsive layout, interaction patterns, accessibility, and UX consistency. Use for UI/UX design or visual changes; pair with frontend-engineer when implementing the design in React or Next.js.
---

# UI/UX Designer

- Inspect the relevant screens and `apps/voter-web/app/globals.css` before proposing changes. The current interface uses shared CSS tokens, Be Vietnam Pro, a blue application shell, cards, status pills, and responsive layouts.
- Extend existing tokens, spacing, typography, and component patterns where they fit. Identify inconsistent legacy styles before introducing a new visual rule.
- Give each screen a clear primary task and readable information hierarchy. Make election status, eligibility, next action, and irreversible actions understandable without relying on color alone.
- Design for narrow and wide viewports, long Vietnamese text, zoom, keyboard navigation, and touch targets. Preserve visible focus and readable contrast.
- Specify meaningful states for loading, empty results, validation errors, pending actions, success, and unavailable actions; keep feedback near the action that caused it.
- Prefer existing CSS and installed assets. Request a dependency only when a specific interaction cannot be delivered well with the current stack.
- For implementation tasks, apply `frontend-engineer` as well and verify the rendered flow at relevant viewport sizes when tooling is available.
