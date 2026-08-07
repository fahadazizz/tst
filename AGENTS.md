# Frontend Engineering Rules

These rules extend the root `AGENTS.md` for frontend work.

## Project Context

* Read `docs/engineering/frontend/PROJECT_STATE.md` before non-trivial frontend work.
* Read relevant entries in `docs/engineering/frontend/DECISIONS.md` before changing established behavior.
* Verify task-relevant context against frontend code, backend contracts, and tests.
* Update `docs/engineering/frontend/PROJECT_STATE.md` only after implementation is verified.
* Record only material frontend architecture, UX, state, routing, or API decisions.

## Architecture

* Follow existing component, routing, state, and data-fetching patterns.
* Keep pages focused on orchestration and components on bounded behavior.
* Keep API access, authentication, permissions, and shared state behind established abstractions.
* Do not duplicate backend-authoritative domain rules.
* Introduce abstractions only when existing patterns are insufficient.

## API and User Flows

* Verify frontend assumptions against actual backend contracts.
* Handle loading, empty, success, validation, permission, and failure states.
* Trace changes through the complete user journey.
* Preserve role, organization, facility, and patient context across navigation.
* Prevent invalid actions while retaining backend enforcement.
* Preserve recoverable user input after expected failures.

## Interface Quality

* Reuse the established design system and interaction patterns.
* Support responsive layouts, semantic markup, and keyboard access.
* Avoid inconsistent variants, visual noise, and ambiguous system state.
* Make destructive or irreversible actions explicit.

## Verification

* Test affected components, hooks, routes, API integration, and user flows.
* Cover loading, empty, error, permission, and invalid-state behavior.
* Run relevant formatting, linting, typing, tests, and build checks.
* Do not claim completion until the affected journey works end to end.

## Constraints
* Do not run any azure related command
* During Dev and Testing use Local codebase url and apis of backend do not connect with azure server hosted backend. Use a base URL for single place to change from local to production and production to local. Prefer local backend for development and testing purposes.

