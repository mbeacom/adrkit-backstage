# Security Policy

This repository follows adrkit's security policy:
<https://github.com/mbeacom/adrkit/security/policy>.

**Please do not open a public issue for a security vulnerability.** Report it privately
through this repository's
[Security tab](https://github.com/mbeacom/adrkit-backstage/security/advisories) with
**Report a vulnerability**, or through adrkit's, as that policy describes. If private reporting
is not available to you, use the email contact in adrkit's policy.

## Supported versions

Nothing in this repository is published, so no version is supported. The code in `spike/` is a
throwaway experiment, not software to deploy. Its `app-config.yaml` turns off Backstage's
default auth policy on purpose (see `spike/SPIKE.md`). That is a known property of the spike,
not a vulnerability to report. A report that the setting has reached anything outside
`spike/` is welcome.
