# Compilation error

A synthetic TypeScript check fails with `TS2322` at a precise file and position.

What it proves: compiler diagnostics are captured with file, line and error code, which supports a grounded future
recommendation.

Known limitation: the source file is not part of the evidence. A future model can cite the diagnostic but must not
invent the surrounding implementation.
