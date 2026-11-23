# Repository validation rules

Before creating or updating a pull request, run:

```bash
npm run check:pr
```

Do not push, open a PR, or report validation as complete until this command passes after the final code edit.

`check:pr` is the local equivalent of the PR static-quality gates. It checks changed-file formatting, focused/disabled tests, ESLint with zero warnings, TypeScript, and the core season/profile lifecycle regressions.

If `package.json` or `package-lock.json` changed, also run:

```bash
npm audit --omit=dev --audit-level=high
```

Do not bypass the pre-push hook with `--no-verify` to get a failing change onto GitHub. Fix the underlying validation failure instead.

Targeted feature tests are still required when relevant. Passing `check:pr` does not replace tests specific to the code being changed.

## Betrayals season rules

When a change affects phases, eligibility, protections, votes, win conditions, or the season economy, update the player guide in `src/betrayals/BetrayalsRules.tsx` in the same change. Use shared game values where possible. Add any new source that owns a player-facing rule to the source list in `scripts/check-betrayals-rules.mjs`.

Keep the handbook suitable for first-time players. Explain objectives, role abilities, and the choices players make. Leave the upper limit on Betrayers and hidden decision logic out of the handbook.

After reviewing the resulting guide against the gameplay changes, record the review with `node scripts/check-betrayals-rules.mjs --record-reviewed`. The automatic check is part of `check:pr` and runs before the Pages build.
