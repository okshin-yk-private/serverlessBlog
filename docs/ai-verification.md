# Verification by change scope

Use the current package scripts and CI configuration as the command source of truth.
The commands below are local checks; no deployment or AWS authentication is implied.
Inspect prerequisites before running unfamiliar tests. E2E configuration may access
AWS or deployed environments: use a confirmed local fixture configuration, or obtain
explicit authorization for the target environment.

| Change | Required local verification |
| --- | --- |
| Ordinary documentation only (excluding agent instructions/skills) | Check changed Markdown formatting and relative references; no application tests. |
| Agent instructions, skills, discovery, hooks | `bun run test:unit:config`; validate skill metadata/references and modified script behavior; no application suites unless application behavior also changes. |
| Admin only | `bun run typecheck:admin`, `bun run test:unit:admin`, admin ESLint and formatting of changed files. |
| Astro public site only | `bun run typecheck:astro`, `bun run test:unit:astro`, formatting; relevant build/output checks for generated HTML, routes, feeds, or SEO. |
| Go only | `make -C go-functions lint` and `bun run test:go`; exercise affected handler/contracts. |
| Deploy scripts | `bun run test:unit:deploy`; inspect affected CI/deployment contracts without deploying. |
| Terraform | `terraform fmt -check` for changed files and `terraform validate` for affected root modules with initialized providers; relevant mock tests where supported. A cloud plan/apply is a separate authorized action. |
| CI / test configuration | `bun run test:unit:config` plus checks that exercise the changed workflow or test runner behavior. |
| Shared application contracts, broad dependencies, cross-component application changes, uncertain impact | `bun run verify` plus relevant E2E/Terraform/build checks that verify does not cover. |

For UI behavior, add relevant browser/E2E verification when unit checks do not establish
the acceptance criteria. For behavior changes, prefer a regression test that fails for
the original bug; do not invent runtime tests for prose, formatting, or static diagram edits.
Preserve coverage thresholds and existing hooks/CI. Selecting local checks does not
permit skipping required CI jobs or bypassing hooks.

Before final reporting, run `git diff --check`. State commands and outcomes, missing
prerequisites, and checks not run. Once appropriate checks pass, broaden testing only
for a new change, failure, or unresolved concern.
