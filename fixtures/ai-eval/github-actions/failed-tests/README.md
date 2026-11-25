# Failed tests

A synthetic pytest run fails one assertion. The job log is a representative GitHub Actions log with timestamps, a
`FAILED` line and the assertion detail.

What it proves: the extractor finds test failures and preserves the assertion, and the envelope exposes
`error:6001:0` as a citable source.

Known limitation: the fixture does not prove the extractor will pick the most important line in a noisy log; it only
proves deterministic selection and citation. The future rubric is separate from the observable evidence.
