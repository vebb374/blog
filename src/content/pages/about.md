---
title: "About"
description: "Chaitanya Krishna — testing systems that don't behave the same way twice."
---

I'm Chaitanya. I work on quality engineering, and for the last few years that has mostly meant one problem wearing different costumes: **systems that don't give you the same answer twice.**

In 2023 that looked like a Selenium suite fanned out across AWS Lambda, where the flakiness turned out to be a boto session shared across threads. In 2025 it was a Playwright framework I built from the first commit, where the flakiest test was fixed by deleting forty thousand rows of pre-generated test data and deriving the value per worker instead. In 2026 it looks like an LLM judge whose prose said "no violations" while its score said 0.40.

Same bug, three stacks. It's almost always shared state, and it's almost never in the test.

These days I build AI agents that test AI products — a synthetic candidate that sits real interviews, and evaluation systems that score what came back. That work throws off more interesting failures per week than anything else I've done.

## What you'll find here

Write-ups with the mechanism in them. If a post says something was slow, it says what the measurement was and what the number became. If something broke, it says what I thought was wrong first — usually two or three wrong things before the real one.

I try not to publish anything I haven't actually run.

## Elsewhere

The links in the header are the reliable ones. If something here is wrong or you've hit the same problem differently, I'd genuinely like to hear about it.
