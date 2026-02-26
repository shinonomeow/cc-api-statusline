Provider autodetection (fast, scalable, per-terminal)

Instead of a manual provider switch, implement a performance-focused autodetect mechanism that chooses the correct provider based on ANTHROPIC_BASE_URL (and/or a lightweight probe), then parses responses with the matching adapter.

Requirements
	•	Fast path: detection must add near-zero overhead to each poll.
	•	Scales with many providers: adding more providers must not slow down normal polling (avoid linear “try every provider” probes).
	•	Per-terminal support: users can run different terminals with different env values; detection must be per process/env, not global.
	•	Stable caching: once detected, cache the chosen provider keyed by ANTHROPIC_BASE_URL (and possibly auth mode) to avoid re-detection on every poll.
	•	Robust fallback: if detection fails or endpoint changes, fall back to a safe re-detect path with backoff.

Suggested approach (design-level)
	•	Prefer deterministic detection based on URL patterns or an explicit “capabilities” endpoint if available (O(1) lookup).
	•	If probing is required, use a single cheap request (HEAD/GET to a known stats endpoint) and decide based on:
	•	status code
	•	minimal identifying fields in JSON (signature keys), without deep parsing
	•	Maintain a registry of providers with:
	•	a match(baseUrl) function (string/pattern match, constant time)
	•	a signature for response validation (set membership checks, constant time)
	•	the adapter/parser

Outcome: users can point ANTHROPIC_BASE_URL to different upstreams in different terminals and the statusline will automatically handle each provider correctly, with no performance degradation as the provider list grows.