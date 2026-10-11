# Contributing to adrkit-backstage

This repository is experimental. The only code in it is the spike in [`spike/`](spike/), and
the planned packages in the [README](README.md) are not built yet. Open an issue before starting
anything larger than a fix, so the work stays inside the constraints the README lists. Those
constraints come from adrkit's accepted ADRs (0029, 0030, 0031, and 0053). Changing one of them
starts with a record in [mbeacom/adrkit](https://github.com/mbeacom/adrkit), not with a pull
request here.

## Sign-off is required

All commits require a [DCO](https://developercertificate.org/) sign-off. There is no CLA.

```bash
git commit -s -m "your message"
```

If you forgot to sign off earlier commits, re-sign the branch and force-push:

```bash
git rebase --signoff origin/main
git push --force-with-lease
```

The trailer must name you exactly: `Signed-off-by: Your Name <your@email>`.

GitHub's web editor does not add a sign-off. For browser edits, clone the branch locally, run
the rebase above, and force-push.

No CI job checks sign-off yet. Reviewers check it by hand, and an unsigned commit will not be
merged.

## Working on the spike

The spike is evidence, so keep it reproducible:

- Do not edit files under `spike/evidence/` by hand. Regenerate them, and say in `SPIKE.md`
  what changed and why.
- Do not commit absolute local paths. Scripts take paths from arguments or environment
  variables with relative defaults.
- `dangerouslyDisableDefaultAuthPolicy` belongs only in `spike/app-config.yaml`. Never add it
  anywhere else.
- Before you open a pull request, run the CI check from `spike/`:

  ```bash
  npm ci --ignore-scripts
  npx tsc --noEmit -p tsconfig.ci.json
  ```

## Security

Report vulnerabilities privately, as described in [`SECURITY.md`](SECURITY.md). Do not open
a public issue for them.
