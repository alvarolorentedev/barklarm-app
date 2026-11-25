# Insufficient evidence

A synthetic nightly job fails, but its log is empty and no steps are reported. The collection is partial by design.

What it proves: the engine reports an empty log, no error signal and missing step metadata instead of inventing a
cause. Phase 2 must turn that into an explicit "not enough evidence" response.

Known limitation: the job may have failed on the runner before logging; Phase 1 cannot see that layer.
