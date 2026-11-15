# Contributing

1. Work on a `feat/...` or `fix/...` branch off `main`.
2. Write [Conventional Commits](https://www.conventionalcommits.org), for example `feat: add CSV export` or `fix: round shares to the centavo`.
3. Before each commit, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. CI runs the same checks.
4. Update the README with every change that a user or a new developer would notice.
5. Open a pull request into `main` and fill in the template.

Amounts are integer centavos everywhere; never use floats for money.

Versions follow [SemVer](https://semver.org) and are bumped only at a release, never in a normal commit.
