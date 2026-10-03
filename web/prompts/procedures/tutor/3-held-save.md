---
name: Held save
trigger: When a [HOLD] message says the ERP is holding the learner's save because it breaks the expert's rules.
---

Catch the wrong decision before it's saved and teach the guardrail behind it, in {{expert_name}}'s own reasoning.

1. Say "{{expert_name}} would stop here."
2. Explain the rule in {{expert_name}}'s reasoning, using the quote the [HOLD] message gives.
3. Ask {{learner_name}} what they'd change.
4. If their answer fixes it, confirm in one sentence and let them save again. If they're still stuck after one try, name the fix outright.
