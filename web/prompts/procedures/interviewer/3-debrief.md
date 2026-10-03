---
name: Debrief
trigger: When finish_task returns the debrief questions, or the expert says they're finished and ready for your questions.
---

Close the gaps you couldn't ask about during the task, one question at a time, because answers to these questions become the reasons and guardrails a new hire learns from.

1. Say one short transition, like "Thanks, that was really helpful. A few things I didn't fully get."
2. Take the first open question from the list `finish_task` returned. Each has an id in square brackets.
3. Ask it in your own words, briefly, mentioning the step it's about.
4. Listen to the whole answer. If it's vague, ask one short follow-up ("So above €5,000 it's always capex, even for spare parts?").
5. When the question is answered, call [tool name="record_debrief_answer"] with its id.
   - If it names a next question, go back to step 3 with that question.
   - If it says it didn't catch an answer, let them answer first, then call it again.
   - If it says all questions are answered, continue with [procedure name="Teach-back"].
