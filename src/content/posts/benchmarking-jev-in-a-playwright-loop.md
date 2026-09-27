---
author: Chaitanya Krishna
pubDatetime: 2026-09-26T19:00:00+05:30
title: "I gave my browser tests a model that answers in probabilities"
featured: false
draft: false
tags:
  - ai-agents
  - testing
  - playwright
  - evals
description: "Jev answers in 1.2 seconds and costs almost nothing, so I wired it into a Playwright agent loop and measured it against a large model. Almost every number I got back was a property of my own harness."
---

Jev is being demoed playing Doom and Flappy Bird at roughly ten decisions a second. That number is what made me curious. My browser tests spend most of their wall clock waiting for a large model to look at a page and decide what to click. If a model can decide ten times a second, does automated testing get faster?

I spent a week finding out. The short answer is that I still cannot tell you whether Jev is better or worse than a large model at this job. The reason is more interesting than the answer would have been.

## Table of contents

## First, what Jev actually is

Almost every post I read about Jev gets this wrong, so it is worth being precise before anything else.

**Jev cannot drive a browser.** It has no tools, no code generation, and no multi-step loop. It is what TypeSafe calls a System One model: you hand it a state blob and a typed question, and it returns a calibrated probability. There are three primitives — `Choice` (pick one of N options), `Noul` (how likely is this statement to be true), and `Score` (rate against a rubric).

There is also a browser agent called "Jev Ultrafast", made by browser-use. Different product, different company. The two get conflated constantly, and if you go in expecting the model to click things you will be confused for an afternoon.

So the question is not "Jev instead of a large model". Something still has to drive the browser. The question is whether Jev can be the *judge* inside a loop that a large model still drives.

## How I wired it in

Playwright's accessibility snapshot gives you the page as a tree, where every interactive element carries a ref:

```
- textbox "email@example.com" [ref=e83]
- textbox "········" [ref=e85]
- button "Login" [ref=e91]
```

I wrote a small CLI around that snapshot. It renders the tree, lists every interactive element by ref, and asks Jev a `Choice` question.

```
$ jev-cli choose "the password input field" --snapshot page.yml
{"ref":"e85","label":"textbox \"········\"","confidence":0.95,"latencyMs":1188}
```

The runner then does the boring part — `fill e85` — and nothing in the test refers to a CSS selector or a `data-testid`. Rename the button, restructure the DOM, and the question still means the same thing.

The second use is the one I ended up liking more. After a step runs, ask whether something is true of the resulting page:

```
$ jev-cli verify "a create-test dialog is open on the page" --snapshot page.yml
{"probability":0.75,"holds":true}
```

That is a test assertion that arrives as a number rather than a boolean, which turns out to matter a great deal. More on that below.

## The benchmark

I built three tracks against a real production web app — a recruiter tool with a login, a dashboard, and a create-assessment modal. Everything ran read-only against a test company account, and the agent was explicitly forbidden from creating, publishing or archiving anything.

**Track 1 — step decision.** A scripted six-step flow (log in, navigate, open a modal, pick a job role). At each step, both judges get the goal, the page tree, and a list of every interactive element. They pick a ref. Graded against the element the scripted run actually used.

**Track 2 — assertion oracle.** Each step contributes one true and one false post-condition, so a judge that always answers "yes" scores 50%, not 100%. Both judges return a probability; thresholded at 0.5.

**Track 3 — end to end.** Four full agent runs of the same task, two with a Jev helper available and two without, scored on success, rule adherence, cost, wall clock and turn count.

Both judges were Jev and Claude Opus 5. Three repeats of everything. Two complete runs on the same day.

Then I read the results, and the trouble started.

## Almost every number was a property of my harness

### The latency gap was my own CLI

Jev answered in about 1.2 seconds. Claude took about 8.8. That is a 7× gap and it is the number I was ready to write down.

Except the Claude baseline runs through a CLI, and the CLI reports its own API time separately from wall clock. The median `duration_api_ms` across both runs was **2175 ms and 2085 ms**. Six and a half seconds of that was a Node process starting up, once per call.

Jev's median was 1158 ms and 1197 ms. So the honest ratio is **under 2×**, not 7×.

It gets slightly worse. My Jev client stops its timer the moment `fetch` resolves, before reading the response body, so Jev's figure is a little understated. Under 2× is an upper bound on its advantage.

If you are timing a model through a CLI, you are timing the CLI.

### Most of the cost gap was the same illusion

Per judgment call, Claude cost about $0.036 and Jev about $0.0001. Roughly 300×.

Of Claude's $0.036, only **$0.0009 was the actual prompt and completion**. Roughly 97% is a fixed system prompt and tool schemas, re-sent on every single turn, because each call is a fresh one-shot invocation. The fresh input on a typical call was literally two tokens; about twelve thousand tokens per call were cached harness prompt.

And there is a second problem with that ratio, which is worse:

**Jev does not report a price.** Every Jev dollar figure in this project is computed from a published rate card, recorded in my own code as `"TypeSafe cookbook, 2026-08 -- unverified against console"`. The price table also assumes output tokens are free. If they are not, every Jev cost is understated and every ratio inflated by an unknown factor.

So "300× cheaper" is a billed number divided by a modelled number, where ~97% of the numerator is my own tooling. I am not publishing that ratio, and I would be cautious about anyone else's.

### Three repeats is not thirty-six samples

My summary said n=18 for decisions and n=36 for assertions. Those are row counts.

The harness loops three repeats over **six cached corpus steps**, twice. So the real figures are **six distinct decision cases and twelve distinct assertion cases**. Those repeats are near-deterministic — identical answers almost every time — so they add close to zero information while tripling the apparent sample size.

Which means "Jev 67% versus Claude 83%" on decisions is **four out of six against five out of six**. A one-item gap, reported to two significant figures.

### Half of the assertion corpus did no work

Twelve assertion cases, six true and six false. The false ones were things like "a candidate profile page is shown" when the page was plainly a login form.

Neither model ever missed one. False positives were 0 out of 18 for both models in both runs.

**Every single miss, by either model, across both runs and all repeats, was a false negative on a true case.** The six negatives contributed exactly zero discrimination, so the real discriminating set is six positives. The design note in my own code says the balanced set means "a judge that always says yes scores 50%, not 100%" — true, but a judge that always says yes scores 100% on the half that decides the ranking.

## The part that actually changed how I build

Strip out the repeats and the whole benchmark comes down to two disagreements. Each model got exactly one distinct assertion wrong.

Both of them were right.

### Case one: the model that said the fields were empty

Claude was asked whether the email and password fields were both filled in. Truth: yes. It answered **0.10, 0.08, 0.12** across three repeats — confidently no.

Here is what it was actually shown:

```
textbox "email@example.com" [e83]
textbox "········" [e85]
```

Those are the *placeholders*. My renderer kept the accessible name and discarded the value the user had typed. Claude was looking at two empty boxes and said they were empty, which is correct, and my scoring rule marked it wrong.

Once the renderer was fixed and the corpus recaptured, the same tree reads:

```
textbox "email@example.com" [e83]: recruiter@example.com
textbox "········" [e85]: ••••••
```

and Claude scores 100% on that track.

### Case two: the model that said it could not see the dialog

Jev was asked whether "a dialog is open asking to select the assessment type and job role". Truth: yes. It answered between **0.38 and 0.45** — probably not.

Three separate bugs meant the words *dialog*, *assessment type* and *job role* appeared nowhere in what it was given.

The first is a filter: my compact renderer keeps a node only if it is interactive or has an accessible name. A `dialog` node has neither, so it was dropped entirely.

The second is this, and it is still live in my code as I write:

```js
const label = n.name && n.name !== n.text ? ` "${n.name}"` : "";
const value = n.text && n.text !== n.name ? `: ${n.text}` : "";
```

Upstream, the parser sets `name = name || text`. So for a text-only node — `generic [ref=f11e606]: Select the job role` — `name` and `text` are equal, both guards evaluate false, and **the text is deleted**. Every static label on the modal vanished. On the create-assessment dialog that removed 94 to 126 text nodes per page.

I had already found and fixed this bug once. The fix landed in the parser, and the renderer quietly undoes it. My own README claims it is fixed.

So Jev reported that it could not see something I had never shown it, and my scoring rule called that an error.

### What those two cases have in common

Both models' only failures were honest answers about missing evidence. And in both cases the grader gave the point to whichever model guessed past the gap.

That is a scoring rule that reads the answer and ignores the confidence. It cannot distinguish *I know this is false* from *I cannot see it from here*, so it systematically rewards overconfidence — while I was benchmarking a model whose entire product is calibration.

Worse, I never stored the full probability distribution Jev returns with every `Choice`. I logged the argmax and the confidence. So top-two accuracy and decision-side calibration are unrecoverable from these runs, permanently, because I threw away the measurement I was trying to take.

## The end-to-end arm, and why it proves nothing

Four runs. All four succeeded, all reached the dialog, none clicked a destructive control, and every single run took exactly six interaction commands. The headline metric has **zero variance**, which means the task was too easy to separate the arms on the thing I actually cared about.

Everything distinguishing them is secondary: the Jev arm averaged 90 seconds against 63, and cost about 5% more. Three confounds, any one of which is fatal at n=2:

**Order.** The runner loops run-outer, condition-inner, in fixed order. Every Jev run is the second of its pair, minutes later, against live production. No counterbalancing, no randomisation.

**Tooling asymmetry.** Both control runs invoked the `playwright-cli` skill doc at the very first turn. Neither Jev run did — the helper instructions appear to have displaced it. Both Jev runs then burned two to three turns discovering that `playwright-cli type` does not exist, reading `--help`, and landing on `fill`. That detour is 6 to 8 seconds, about 27% of the gap.

**Different pages.** The two arms clicked different refs for the same button, so the DOM was not identical between them.

Jev round trips account for roughly 21 seconds and the detour about 7, against a 27-second gap — together they over-explain it, so the two cannot be separated. And the within-arm spread on cost is $0.118, which is larger than the $0.081 between-arm delta.

The honest statement is: adding Jev cost nothing in success rate, and I could not measure its latency cost, because the arm that used it also skipped the skill doc and ran second.

One number does survive, and I like it. Of the extra cost the Jev arm incurred, **Jev's own API bill was about 1.5%**. The rest is Claude turns spent composing the question and reading the answer. Whatever a cheap helper costs you, it is not the helper.

## What Jev actually did in the live loop

Six `choose` calls across two runs:

- Three correct and above my 0.6 confidence gate. These genuinely saved work.
- Two correct but *below* the gate (0.45 and 0.53, both identifying the same navigation link). The agent re-checked by hand, so the delegation was wasted.
- One wrong but *above* the gate: it picked a blank adjacent button at 0.68. The agent caught it — "the helper's pick was a blank adjacent button; the actual labelled one is f11e194" — and overrode it.

Both gate directions misfired inside a single pair of runs. That is the most useful thing I learned about operating one of these models, and it came from four runs, not from the benchmark.

There were also four `verify` calls, all correct. I am not going to quote that as a hit rate, because **every one of them was a confirmatory question whose true answer was yes.** There is not a single negative verify case in the live loop. A judge that always returns 0.8 scores four out of four.

## Where the confidence number actually pays

Here is the one genuinely encouraging result, computed from the stored data rather than argued.

On decisions, if Jev answers only when it reports 0.80 or higher, it is **correct every time** — on 47% of the workload. But be careful with that: those 47% are only three distinct steps out of six, and they are the easy ones. It is evidence that the confidence signal is real, not evidence of a 47% cost saving.

On assertions, Jev makes **zero errors outside a band of ±0.15 around 0.5**, while still answering 85% of cases. Every single one of its misses sits in that narrow band of genuine uncertainty.

That is the shape of a useful instrument: not "it is accurate", but "it knows which questions it should not be answering". A large model gives you prose, and prose is not a number you can threshold.

## Has anyone else actually done this

Before publishing I went looking for someone who had put Jev in a real test suite and
written up what happened. I did not find one.

There is demo code aimed specifically at testers — routing failed CI tests to a root cause
with `Choice`, scoring release impact, asking "will a retry pass?" with `Noul`. It is a good
starting point. But it is demo code: no reported outcomes, no accuracy over time, nothing
about what broke after a month.

The production reports that do exist are all from adjacent work:

- Vercel reviewing tool calls before they execute, reporting up to 18× faster than the
  model it replaced
- a support team triaging 284 chats at 93% accuracy, with spam caught at 100% and zero
  false positives
- 21 writing checks run across 27 articles, 777 judgments returned in under a second

Look at the shape of those. Reviewing a command that already exists. Classifying a ticket
that already arrived. Checking a passage that is already written. Every one is a
*judge the thing in front of you* task.

Not one of them is a *work out what to do next* task.

That is the same split this benchmark ran into, found independently by people with different
products and different corpora. Either nobody has tried the planning half at scale yet, or
they tried it and it did not go well enough to write up. I would genuinely like to know
which.

Worth noting the model is also very new, access is still gated, and at least one reviewer
points out that the public accuracy evidence leans on model-generated reference labels. Take
every number in this space, including mine, with that in mind.

## What I would fix before running this again

1. Fix the renderer collapse and stop dropping unnamed structural nodes. It corrupted the input to both models on the two hardest cases.
2. Store the full probability distribution, not the argmax.
3. Report distinct-item counts, and use repeats only as evidence of determinism.
4. Write assertion negatives that are actually hard. Every one of mine was a gross state mismatch.
5. Score by calibration — Brier score, selective accuracy, a defer band — not by thresholded accuracy at 0.5.
6. Counterbalance the end-to-end arm order and give both arms identical tooling.
7. Grow the corpus well past six steps.
8. Reconfirm the Jev rate against the billing console, or keep labelling every cost figure as modelled.

## Measured, billed, and modelled

Because it matters, and because almost nobody separates these:

**Billed** (provider-reported): all Claude per-call costs, the end-to-end per-run costs, token counts, and API durations.

**Measured** (observed by my harness): wall clock, Jev latency, turn counts, command counts, accuracy grades, and final-state verification against the live page.

**Modelled** (computed from an unverified rate card): every Jev dollar figure without exception, and therefore every cost ratio between the two models.

I have quoted no Jev cost ratio in this post for that reason.

## So should you use it

For picking an element out of a page when you can ask a narrow question, and for assertions where you keep the probability instead of flattening it to a boolean — yes, that looks genuinely useful, and the selector-free tests are nicer to maintain than anything I had before.

As a planner inside the loop, I have no evidence either way, and neither does anyone else quoting my kind of numbers.

The thing I would take away, if you take one thing: an eval that reads only the answer will quietly rank the model that guesses above the model that tells you it cannot see. Mine did that on both of the only two cases where it had any opinion at all.

Before you publish a benchmark number, go and read one thing your system got wrong. Not the score. The actual input you handed the model.
