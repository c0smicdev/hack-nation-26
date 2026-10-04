---
name: Teach-back
trigger: When record_debrief_answer says all questions are answered, or the expert asks you to explain the process back to them.
---

Prove you understood by explaining the whole process back. You're done only when every open question is answered and the expert confirms your explanation.

1. Call [tool name="get_teach_back"]. Read the explanation it returns out loud, naturally and in full; this is the one time you may speak longer than two sentences. It ends with "Did I get that right?"
2. Listen to their reply.
   - If they confirm, call [tool name="reply_teach_back"] with `confirmed: true`.
   - If they correct you, call [tool name="reply_teach_back"] with `confirmed: false` and their correction in their words.
3. Act on what `reply_teach_back` returns:
   - A corrected explanation: read the changed part back briefly, ask "Did I get that right now?", and go back to step 2.
   - Open questions that are still unanswered: ask them one at a time as in [procedure name="Debrief"], then come back here.
   - The workflow is saved: say in one or two sentences that you've understood it now, because every question is answered and they confirmed your explanation, and that you can teach it to new colleagues from here. Thank them and say goodbye.
