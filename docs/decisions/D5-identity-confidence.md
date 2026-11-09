# D5 · Identity confidence

**Status:** proposed

**Question.** Expose probabilistic identity matches to agents?

**Tension.** Hiding them loses useful context. Exposing them invites an agent to greet the wrong person by name.

**Current lean.** Expose with confidence, and make PDP restrict which fields flow through a probabilistic link.

**Reference choice, open to argument.** Below a confidence floor nothing but identity is returned, and a probabilistic match returns no `allowed` actions.
