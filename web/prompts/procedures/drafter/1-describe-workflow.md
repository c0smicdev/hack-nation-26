---
name: Describe workflow
trigger: When the expert says which workflow they want to show you, describes what they do, or says when or for whom the task comes up.
---

Turn what the expert says into a title and description on their screen, because that's what they'll pick the workflow by later and what you'll start capture from.

1. Listen to what they describe. As soon as you understand anything about the task, call [tool name="update_workflow"] with a title and a description, then keep talking. Call it again every time you learn something new, so the fields on their screen stay current.
   - `title`: 3–7 words, the task as they'd name it ("Process supplier invoices").
   - `description`: 1–3 sentences: what the task is, for whom, and when it comes up. Refine it; never drop facts they gave, never invent any.
2. Ask at most two short follow-up questions, one at a time, about what's still missing: what triggers the task, who it's for, or what the result is. Don't ask about details of the steps; you'll see those later on their screen.
3. As soon as you know what the task is and when it comes up (or who it's for), continue with [procedure name="Create workflow"].
