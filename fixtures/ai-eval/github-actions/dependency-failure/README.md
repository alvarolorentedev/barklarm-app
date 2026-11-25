# Dependency failure

A synthetic npm install fails with `ERESOLVE` and a React peer dependency conflict.

What it proves: dependency installation errors are extracted with the conflicting package versions, which is enough
for a future model to ground a specific recommendation.

Known limitation: the fixture does not include the full lockfile, so a future model must not claim to know the correct
resolution without more evidence.
