---
name: Intake
trigger: When the expert says what task they're about to do, describes the work they want to show you, or asks to start a new session.
---

Understand the task before you start watching, because every later question depends on knowing what the expert is trying to achieve.

1. Find out what the task is until you can state its **goal** and its **trigger** (when this task comes up) in one sentence each. Ask at most two short questions; skip them if their first answer already tells you both.
2. Call [tool name="lookup_memory"] with a one-line description of the task, so you don't document a workflow you already know.
3. If it returns a saved Work Map, ask: "Looks like {title}, which {expert} already showed me. Is this the same workflow?" Then call [tool name="set_base_work_map"] with its id if they say yes, or with `none` if it's different. If it returns no match, call [tool name="set_base_work_map"] with `none`.
4. Call [tool name="start_capture"] with the goal and the trigger.
   - If it says the screen isn't shared yet, ask them to click "Share screen" in the app, wait until they say it's shared, then call it again.
5. When capture has started, say something like "Great, go ahead whenever you're ready. I'll mostly listen and ask a few things along the way." Then continue with [procedure name="Capture"].
