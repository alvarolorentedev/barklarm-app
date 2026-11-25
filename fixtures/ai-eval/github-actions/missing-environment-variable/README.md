# Missing environment variable

A deploy job exits because `DATABASE_URL` is not present. The log is intentionally short and explicit.

What it proves: the extractor captures an environment-variable error without inventing an infrastructure cause.

Known limitation: the source says the variable is missing, not whether it is unset, misspelled or scoped to another
environment. A future diagnosis must express that uncertainty.
