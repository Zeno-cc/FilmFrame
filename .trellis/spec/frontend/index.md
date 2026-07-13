# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for frontend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Current |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Current |
| [Hook Guidelines](./hook-guidelines.md) | Hook lifecycle and extraction patterns | Current |
| [State Management](./state-management.md) | Session, derived and persistent state | Current |
| [Quality Guidelines](./quality-guidelines.md) | Tests, accessibility and review gates | Current |
| [Type Safety](./type-safety.md) | Domain types and runtime validation | Current |

---

## Pre-Development Checklist

Before changing frontend code:

1. Read [Directory Structure](./directory-structure.md) for the target module boundary.
2. Read [Component Guidelines](./component-guidelines.md) for UI work, or [Hook Guidelines](./hook-guidelines.md) for lifecycle work.
3. Read [State Management](./state-management.md) for `App.tsx`, async workflows, and artifact ownership.
4. Read [Type Safety](./type-safety.md) when changing domain fields or browser/storage inputs.
5. Read [Quality Guidelines](./quality-guidelines.md) before writing tests or finishing the task.

## Quality Check

- Run `npm run check`, `npm run test:e2e`, and `git diff --check`.
- Confirm Object URL/resource cleanup and stale-result behavior.
- Verify affected responsive and accessible interaction paths.

---

**Language**: All documentation should be written in **English**.
