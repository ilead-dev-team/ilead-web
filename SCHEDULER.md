# Program job scheduler

This public repository runs a generic protected API tick every ten minutes. No backend source or credentials are published. The helper accepts only an HTTPS Render host and the exact internal jobs path, refuses redirects, sends an empty POST, and logs only status information. Its 90-second deadline accommodates API cold starts.

Repository Actions secrets: JOB_TICK_URL (staging API internal tick URL) and JOB_SECRET (the matching backend bearer secret). Never put either in NEXT_PUBLIC variables or browser code. Enable only after backend staging validation by setting repository variable ENABLE_JOB_TICK=true and backend JOBS_ENABLED=true. Workflow dispatch and cron both require main and public repository visibility.

Review workflow changes as security-sensitive: both code owners are trusted reviewers, authors cannot self-approve, and main must enforce the verify check and independent approval. Checkout has no persistent credentials and the workflow token is read-only.

Scheduled runs may be delayed; public schedules may stop after repository inactivity. Monitor failed runs and backend queue age. The API owns catch-up, deduplication, leases and retention eligibility. A 2xx acknowledgement does not mean all phases have finished. To pause, set ENABLE_JOB_TICK=false; keep secrets private.
