# Research note: trust should attach to artifacts, not narration

Good agentic development practice is not "review every diff carefully" and
it is not "trust the agent's account of its own work." It is: route trust
through externally checkable artifacts — specs, architecture decision
records, harness rules — and reserve a human's own adversarial verification
for the few places where those artifacts claim to protect something that
actually matters, like a privacy boundary. The field's working default is
closer to the opposite of this, and the evidence against it is specific
enough to be worth taking seriously rather than gesturing at.

[Perry et al. (CCS '23)](https://arxiv.org/abs/2211.03622) ran a controlled
study of programmers solving security-relevant tasks with and without an AI
assistant. Participants with assistance wrote measurably less secure code —
and were *more* confident it was secure than the unassisted group. This is
the finding that should worry anyone treating "the agent said it works" as
evidence: the one variable that moved in the wrong direction was confidence,
not just correctness. A test suite an agent reports as green is the same
kind of claim, reported by the same kind of source, and the paper gives a
concrete reason not to take it at face value by default.

[Andrej Karpathy's "vibe coding"](https://anuragwagh.com/blog/who-coined-vibe-coding-andrej-karpathy-definition)
(Feb 2025) names the practice this argument pushes back against most
directly: "accept the output without deeply reading it... forget that the
code even exists." It is worth taking the strongest version of this
position seriously rather than dismissing it, because the obvious reply —
"so read every diff" — doesn't actually survive contact with how agentic
tools are used now. [Trust-Calibrated Code Review](https://arxiv.org/abs/2606.01969)
makes this concrete: reviewing a multi-file, agent-generated change is a
trust-calibration problem, not a diffing problem, because line-by-line
review doesn't scale to the volume and shape of what an agent produces in
one pass. And the [Microsoft Research review of overreliance on AI](https://www.microsoft.com/en-us/research/wp-content/uploads/2022/06/Aether-Overreliance-on-AI-Review-Final-6.21.22.pdf)
shows why "just review more carefully" degrades on its own anyway: automation
bias grows specifically once a tool has performed well a few times in a row,
which describes almost every session with a current coding agent. Telling a
developer to read every line harder is advice that gets quietly ignored
exactly when it matters most.

So the counter-case is real: exhaustive manual review is not the answer, and
a position that implies it would fail on its own terms. The resolution isn't
to review less, it's to review a different thing. An artifact — a spec test,
an ADR, a rule written into a harness file — is reviewed once and then
*reused* on every subsequent change, instead of re-litigated from scratch
each time a diff lands. That changes the shape of the scaling problem Trust-
Calibrated Code Review identifies: the thing that doesn't scale is re-reading
generated code, not maintaining a fixed, growing set of checkable claims
about what the system must never do.

But artifacts have their own failure mode, and a position that doesn't meet
it isn't finished: an agent capable of producing confident, plausible
narration is equally capable of producing a confident, plausible-looking
*artifact* — a test that passes without exercising the real risk, a spec
that reads as rigorous without constraining the thing that actually matters.
[Rethinking Code Review in the Age of AI](https://arxiv.org/abs/2605.17548)
makes exactly this point about multi-agent pipelines: automation bias doesn't
disappear when you add a verification step, it just moves to whichever layer
still has a human in the loop, and an unverified verification step is not a
verification step. The artifact lowers the odds of this failure — it is
checkable in a way narration isn't — but it does not eliminate it. What
closes the gap is the same move twice: a human periodically acts as an
actual adversary against the specific claim an artifact makes, the way
testing a privacy rule means opening a second browser as a genuinely
separate person rather than trusting that a test run from inside one process
proves two people see different things. The artifact tells you what the
system is supposed to guarantee; the adversarial check is what tells you the
artifact itself wasn't the thing that was wrong.
