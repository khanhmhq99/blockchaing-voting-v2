---
name: frontend-engineer
description: Implement or review React, Next.js, and TypeScript frontend code in apps/voter-web, including component architecture, performance, accessibility, and code quality. Use for frontend implementation or refactoring; pair with ui-ux-designer when the task also changes visual or interaction design.
---

# Frontend Engineer

- Read `apps/voter-web/AGENTS.md` and the relevant installed Next.js guide before changing application code. Inspect the affected route, shared components, styles, and package versions first.
- Work with the existing Next.js App Router, React, TypeScript, Tailwind CSS, and CSS conventions. Check `apps/voter-web/package.json` before using another library.
- Keep page components focused on route composition. Extract repeated behavior into small, typed components or modules; reuse existing shell, cards, notices, and status patterns where appropriate.
- Keep cryptographic work and API orchestration out of presentation components. Preserve the existing browser/server boundary and never expose privileged credentials to the client.
- Model loading, empty, error, disabled, and success states explicitly. Use semantic controls, accessible names, keyboard operation, and visible focus.
- Avoid unnecessary client code, effects, network requests, and large imports. Measure a concrete performance concern before adding optimization complexity.
- Validate with the smallest relevant typecheck, lint, and behavior checks; report what actually ran and any remaining limits.
