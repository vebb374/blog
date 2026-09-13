---
author: Chaitanya Krishna
pubDatetime: 2026-09-13T18:00:00+05:30
title: "Our AI candidate started as a for-loop"
featured: true
draft: false
tags:
  - ai-agents
  - testing
  - playwright
description: "Three turns of chat completion in a for-loop, and a test that asserted six messages existed. Everything after that was the product refusing to stay that simple."
---

The first version took an afternoon.

Our product runs job interviews with an AI. It talks, it listens, it decides what to ask next. To test it I needed something on the other side of the call, so I wrote the dumbest thing that could work: wait for the interviewer to say something, hand the text to `gpt-4.1-nano`, send the reply back.

```ts
const CANDIDATE_SYSTEM_PROMPT = [
  "You are a senior software engineer attending a job interview.",
  "Answer in ONE short sentence, 20 words maximum, professionally.",
  "Stay on topic and never break character.",
].join(" ");

const CONVERSATION_TURNS = 3;
```

Three turns. Twenty words each. It ran green on the first try, which felt great for about two weeks.

## Table of contents

## The assertion that asserted nothing

Here is what the test checked when it passed:

```ts
expect(chatClient.getHistory()).toHaveLength(CONVERSATION_TURNS * 2);
```

Six messages exist. That's it. Not that the answers were relevant. Not that the interviewer got anywhere. A candidate replying "yes" three times would have passed, and so would one replying in Latin.

I'd automated the shape of an interview and none of its content. The green tick was real; the test underneath it was decorative.

That would have stayed embarrassing-but-harmless if the product had stood still. It didn't.

## Three turns is not an interview

Real interviews don't run for three turns. They run until the interviewer decides it's done — six turns, twenty-six, depending entirely on how the candidate answers.

A counter can't express *stop when the other side stops*. Worse, it can't tell the difference between an interview ending properly and one hanging, because both look like "the loop finished."

So ending had to become a decision rather than a number. That meant giving the model a tool to make it with: `endInterview`.

That one change quietly ended the for-loop. Once the model decides when to stop, you're in an agent loop whether you've called it one or not.

## Then it had to type

The next thing the product shipped was coding questions.

A chat client can say "I'd use a hash map here" all day long. It cannot open the editor, write a solution, and run the tests against it. The moment a real candidate could be asked to *do* something instead of describe it, my fake one was mute in a way no assertion would catch — it would still answer, still sound plausible, still go green.

So the candidate needed hands.

Design questions came next, and brought a whiteboard — a third surface, with its own rules and a habit of covering the second one. After that, audio-only interviews, where the interviewer's turn has no clean end signal at all. You infer it from text that stops growing.

None of that was foreseeable, and the for-loop was still the right first version. It was cheap, it proved the socket injection worked, and it told me inside a day that the idea was viable.

What's worth noticing is where the pressure came from. Not the model — `gpt-4.1-nano` in a loop could hold a conversation fine. It came from the product's surface area. Every new thing a real candidate could do was a new thing mine couldn't, and each gap arrived disguised as a passing test.

## The loop that eats itself

The agent runs on the Vercel AI SDK's `ToolLoopAgent` with `toolChoice: "required"`, so it must call a tool every step. It can't trail off into prose.

Most of the tools are boring. `editCode` writes into the editor, `runTestCases` clicks Run, `endInterview` ends it.

`sendResponse` is the one worth looking at. It speaks, blocks on the interviewer's reply, and returns that reply as its own tool result.

So the tool result *is* the next turn. The SDK's tool loop and the conversation are the same loop — which means there's no orchestrator anywhere in the harness, no turn manager, no outer `while`. The whole interview is one `generate()` call that returns when the model calls `endInterview`.

I didn't design that. I wrote the obvious thing, noticed the outer loop had nothing left to do, and deleted it.

![Architecture of the candidate rig: the ToolLoopAgent calls into a live Playwright-driven interview page across three surfaces, every tool result returns stamped with the current surface, and sendResponse sends text to the interviewer over a WebSocket whose reply becomes the next tool result.](../../assets/posts/agent-loop.png)

## The agent has no eyes

Three surfaces, and a model that only ever receives text. Ask for a code edit while the whiteboard is covering the editor and you get a tool call that does nothing at all — silently, successfully, into the void.

My first fix was navigation tools. `showCodingPanel`, `showDesignBoard`, one per surface. It worked, and it was exactly wrong: four new ways for the model to be somewhere it didn't mean to be, and every interesting failure now wearing a navigation costume.

What replaced them is one line in every tool result.

```ts
async function formatResult(body: string): Promise<string> {
  await refreshSurface();          // re-read the live DOM
  return `surface=${currentSurface}\n${body}`;
}
```

`surface=ide`. `surface=design`. Every result, no exceptions. The navigation tools went in the bin, and each acting tool now quietly walks to the surface it needs before doing its job.

The state is never stored and trusted. It gets re-derived from the DOM before every single tool returns, because the page changes underneath the agent between turns. Constantly. There's a second AI driving the other side of it.

## Ordering is cheaper than proof

Deriving the state is four visibility checks, and the order is the whole design:

```ts
if      (await whiteboard.isVisible())          currentSurface = "design";
else if (await codingWorkbench.isVisible())     currentSurface = "ide";
else if (await codingProblemPanel.isVisible())  currentSurface = "problem";
else if (await designProblemPanel.isVisible())  currentSurface = "designProblem";
else                                            currentSurface = "none";
```

`design` goes first because the whiteboard sits on top of the coding panel. Flip those two and an open whiteboard reports `ide`, and the agent starts typing code into a canvas.

`designProblem` goes last, and that one has a better reason. The design-brief check is "the panel is showing and there's no Solve it button." I couldn't establish that the coding phase never renders something that would also satisfy it.

I could have gone and proved it. Instead I ordered the checks so it can't matter — by the time that branch is reachable, both coding checks have already failed, so a programming interview can't be routed down the design path no matter what the selectors do.

![The surface state machine: five states probed in a fixed order — design, ide, problem, designProblem, none — each identified by a concrete DOM condition, with designProblem probed fourth so it is unreachable in a coding-only interview.](../../assets/posts/surface-state.png)

Proofs rot when the markup changes. The ordering doesn't.

## Never throw in a live call

`toolChoice: "required"` has a sharp edge. If a tool throws, the exception comes out of `generate()` and takes the whole run with it.

That call is live. There's an interviewer mid-question on the other end. Killing the process because a selector timed out is not a thing I'm willing to ship.

So tools catch their own errors and hand them back as text:

```ts
catch (error) {
  return `Error reading question context: ${errText(error)}`;
}
```

Now a failure is something the model can read and work around, instead of something that ends the interview.

One exception, on purpose. Writing code into the editor reads the buffer back and throws if the write didn't land. If the editor silently dropped it, everything after that point is fiction — better to stop than to keep testing an imaginary solution.

## Speaking without a microphone

There's no microphone and no text-to-speech. The candidate's speech is text injected straight over the interview's WebSocket.

That isn't laziness. Synthesising audio, playing it into a virtual mic, and hoping the far end transcribes it correctly would turn every test into a test of the audio pipeline. I want to test the interviewer's reasoning.

Two things from that layer cost me time and might save you some.

Interrupting the interviewer means sending an interrupt, then waiting for it to confirm it stopped speaking. Arm the waiter *before* you send the interrupt. Otherwise the confirmation beats your listener to it and you sit there waiting for an event that already happened — which, naturally, only shows up under load.

And `ws.send()` on a socket in CLOSING doesn't throw. It drops the frame and says nothing. So the send path picks the newest open socket every time rather than caching one, because a cached socket that quietly closed is a message that vanishes with no error anywhere.

## The bug it found first

All of this exists to catch things. The first real thing it caught wasn't in my harness.

Design questions put a brief on screen. The interviewer announces it's doing that — and never reads the brief aloud.

A human tester glances at the panel, absorbs it without noticing they did, and answers. My candidate couldn't. No eyes, only the transcript. So it sat there answering a question nobody had told it.

Which is also what happens to anyone relying on the audio. Someone using a screen reader. Someone who looked away. The automated candidate had a strictly narrower sensory channel than a human tester, and the narrow channel is the only reason the gap ever became visible.

The fix was one rule: fetch the question text before answering a design question. Took ten minutes.

## If you're building one of these

Give the agent fewer tools and better results. My navigation tools looked like capability and were really just four more ways to get lost; a state stamp on every result did the same job with none of the surface.

Don't let a tool throw inside a loop where throwing ends a live session. Hand the error back as data and let the model decide what to do with it.

And when you catch yourself about to prove that some state can't happen, check whether you can just order things so the question never comes up.

The thing I keep coming back to, though, is that first test. It was green for two weeks. It was green because six messages existed. Every hard part of this system exists because that green tick was lying, and nothing about the tick itself was ever going to tell me.
