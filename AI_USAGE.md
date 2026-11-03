# AI usage

## Tools and how the work was split

- **Claude Code** (Opus/Sonnet) in VS Code, with the *superpowers* workflow skills: brainstorming → written design spec → implementation plan with complete code and tests → execution by fresh subagents per task, each followed by an independent spec-compliance review and a code-quality review.
- **What I did myself:**
  - framed the problem and the constraints: modular monolith, "small but correct", plans kept out of the repo;
  - took every architectural decision, from options and evidence the AI prepared: search engine, sync strategy, framework and UI-library versions, status semantics;
  - kept git in my hands: no commits by the agent, so I reviewed the working tree myself;
  - resolved environment issues (local Postgres service on 5432);
  - reviewed the results.
- **What I delegated:**
  - research (version compatibility, licences, search-engine trade-offs);
  - writing code and tests from the approved plan;
  - first-pass reviews;
  - running the verification commands.
- **Rule I set for the agents:** report every deviation from the plan with a reason, never weaken a test to make it pass, and never trust a report without re-checking. Reviewers had to verify claims by reading the code and running it, not by trusting the implementer's report.

## Where the AI's output was rejected, corrected or significantly changed

1. **Dependency "latest" tags would have broken the project.** The default `npm install` path would have pulled:
   - `prisma@latest`, which is an **8.0 release candidate** and does not match `@prisma/client` 7.10;
   - `typescript@latest`, which is **7.x** and unsupported by Angular;
   - NestJS 12, which is **ESM-only** and incompatible with the mandated Jest.

   All versions were checked against npm and pinned explicitly.
2. **PrimeNG licence.** The AI's first plan used Angular 22 + PrimeNG 22. Inspecting the package source showed that PrimeNG 22 renders an "Invalid PrimeUI License" banner without a commercial key. I chose Angular 21 + PrimeNG 21 (the last MIT release) and documented the conflict with "latest stable Angular".
3. **Search architecture.** The AI recommended Postgres full-text search and, for syncing, in-process events. I chose Meilisearch (typo tolerance, facets, a path to millions of documents) and a **transactional outbox** instead, because indexing updates must not be lost between commit and indexing.
4. **A silent data-loss bug in the import plan.** In the AI-written planner, a PIM row rejected for a typo in the status meant "product missing from export", so the product would have been **delisted overnight**. A review caught it. Now a SKU with a rejected row is left untouched, and when a row cannot be identified at all, nothing is delisted in that run.
5. **Review endpoint hardening.** A reviewer proved with probes that the plan's version:
   - turned a NUL character in a review into a 500 (Postgres rejects `\u0000`);
   - let any client bypass the rate limit by spoofing `X-Forwarded-For`, because the backend port was publicly exposed and every first-hop proxy was trusted;
   - would block a whole trade-fair hall behind one IP after five reviews.

   I had the input sanitised, the trusted proxies restricted, the port bound to loopback and the limit raised to 20 per 10 minutes, with the trade-off documented.
6. **Search quality, measured rather than guessed.** The AI's search returned the whole catalogue for a SKU query like `P-10004`. Five alternatives were compared on the real data. Global strategies broke ordinary queries such as "polysorbate 60" and "emulsifier skincare", so only SKU-shaped queries require all terms. The same measuring approach found that the outbox claim query did not use its index, via `EXPLAIN ANALYZE` on 200k rows.
7. **Small things "green tests" did not catch:**
   - an agent stripped the backslashes from Jest's regexes (tests still passed);
   - a Docker healthcheck failed because `localhost` resolves to IPv6 inside the container;
   - the generated Prisma 7 client did not load under Jest. A smoke test was added before any further work.

## What I learned about steering

Most value came from three things:
- insisting on evidence: version checks, licence files, probes against the real Meilisearch, `EXPLAIN` plans;
- independent reviewers who were told not to trust the implementer;
- keeping decisions with business impact (licences, abuse protection, what to hide from customers) as explicit, documented choices instead of defaults.
