# Contributing to tex-html-parser

Thanks for contributing to `@newtonschool/tex-html-parser`.

## Prerequisites

- Node.js 20+
- npm 10+

## Local Setup

```bash
npm install
```

## Development Workflow

1. Create a branch from `master` for your change.
2. Make focused changes with clear commit messages.
3. Update documentation when behavior or public usage changes.
4. Run local checks before opening a pull request.

## Local Checks

```bash
npm run build
npm test
npm run test:package
```

## Test Expectations

- Add or update tests for any parser behavior change.
- Keep test names descriptive and scenario-focused.
- Cover both expected behavior and malformed/unsupported TeX fallback behavior.
- Include sanitization-focused test cases when touching HTML output or link handling.

## Pull Request Guidelines

1. Keep PRs small and focused on one objective.
2. Explain the problem, approach, and impact in the PR description.
3. Include representative input/output examples for parser changes.
4. Confirm local checks were run and mention any intentional exceptions.
5. Request review only after code and docs are ready.

## Commit Guidance

- Prefer short, imperative commit titles.
- Group related changes together.
- Avoid mixing refactors with behavior changes unless required.
