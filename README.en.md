# FoodManagement

[日本語](README.md) | **English**

[![CI](https://github.com/cedarcraftworks/FoodManagement/actions/workflows/ci.yml/badge.svg)](https://github.com/cedarcraftworks/FoodManagement/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/demo-live-2f6f5e)](https://cedarcraftworks.github.io/FoodManagement/)

A web app for community kitchens (kodomo shokudo) and food banks in Japan. Staff share the stock of donated food and its expiry dates on their phones, and on distribution day the app proposes **what to hand out, earliest expiry first**, to cut food thrown away past its date.

**[▶ Open the demo](https://cedarcraftworks.github.io/FoodManagement/)** — no sign-up; it runs on a fictional kitchen's stock.

## What it does

1. **Stock sorted by expiry**, with expired / within 3 days / within 7 days highlighted
2. **Receiving** by barcode (JAN, camera or typed; the check digit catches misreads). A product registered once fills in its name next time
3. **Distribution plan**: enter the number of households and items per household per category; stock is allocated First-Expired-First-Out and shortages are reported
4. **Concurrent updates detected** with optimistic locking, so two volunteers never make the count drift
5. **Monthly report** of received / distributed / disposed items and the disposal rate by category
6. **Roles**: only an organization's admin can change settings or add staff

See the [requirements](docs/requirements.md) and the [staff guide](docs/user-guide.md) (both in Japanese).

## Design decisions

- **Never propose unsafe food.** Items past their *use-by* date are always excluded; items past their *best-before* date are excluded unless the organization opts in.
- **Counts never drift.** A decrement succeeds only if the version the user saw is still current and enough stock remains, in one SQL statement. Confirming a distribution is one transaction: if any lot conflicts, nothing changes. The database also enforces `quantity >= 0`.
- **Every change is logged** in the same transaction; reports are built from that log.
- **No personal data** about recipients — only household counts.
- **Deterministic.** "Today" is passed in, and the allocation rule is pinned by [shared test cases](contract/cases.json).

## Architecture

| Part | Stack | Role |
| --- | --- | --- |
| [web/](web) | TypeScript, React, esbuild, Biome, Playwright | UI; the demo also plans in the browser |
| [api/](api) | Java 21, Spring Boot 3, Spring Security, Flyway, OpenAPI, Testcontainers, JaCoCo | Auth and roles, stock updates (optimistic locking, transactions), forwards to the planner |
| [planner/](planner) | Python 3.12, FastAPI, pytest, mypy, ruff | FEFO allocation and monthly report |
| [contract/](contract) | JSON | Test cases both Python and TypeScript must pass |

## Run and test

```bash
cd web && npm install && npm run dev          # demo UI only
docker compose up --build                      # PostgreSQL + planner + API
cd planner && pytest && mypy                   # Python
cd api && mvn verify                           # Java (needs Docker)
cd web && npm test && npm run typecheck        # TypeScript
cd web && npm run build:demo && npm run e2e    # end-to-end in Chromium
```

All of these run on every push in GitHub Actions.

## License

[MIT](LICENSE)
