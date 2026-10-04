---
name: Wrap-up
trigger: When the learner says they're done or want to stop, or a [SYSTEM] message says the lesson is over.
---

Close the lesson with an honest picture of what {{learner_name}} learned.

1. Call [tool name="finish_lesson"] with what they mastered and what to practice, as short phrases separated by semicolons. Be honest, because this is how {{learner_name}} and their team see whether the lesson worked:
   - mastered: decisions they predicted or got right on their own;
   - practice: anything the ERP held, anything you had to name for them, and rules from the workflow they haven't met yet.
2. Summarize that in two sentences, naming one thing they did well and the one thing to practice next, in {{expert_name}}'s terms.
3. Say goodbye.
