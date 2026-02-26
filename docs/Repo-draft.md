Scope / goals
	•	Provide a unified design that supports multiple backends (“providers”) and a consistent output format for the statusline.
	•	Display usage breakdowns:
	•	daily / weekly / monthly
	•	model-specific
	•	credit-based usage (when applicable)
	•	reset countdown (dynamic: end-of-day or rolling 24h, depending on provider semantics)

Providers to support first
	1.	sub2api
	•	Reference: /Users/liafo/Development/GitWorkspace/sub2api/Usage_Endpoint.md
	2.	claude-relay-service
	•	Reference: /Users/liafo/Development/GitWorkspace/claude-relay-service/docs/api-user-stats-endpoint.md

Provider switching must be supported and the architecture must be open to adding more providers.

Implementation references to study (for patterns)
	•	TUI style + polling + caching patterns:
	•	/Users/liafo/Development/GitWorkspace/claude-pulse/AGENTS.md
	•	/Users/liafo/Development/GitWorkspace/ccusage/STATUSLINE_IMPLEMENTATION_REVIEW.md
	•	/Users/liafo/Development/GitWorkspace/CCometixLine/USAGE_OPTIONS_TUI_STYLE.md
	•	Backend structure + multi-statusline architecture + customization + run mechanism:
	•	/Users/liafo/Development/GitWorkspace/ccstatusline

Required customization features (spec-level)
	•	Progress display modes:
	•	bar (claude-pulse style)
	•	percentage-only
	•	nerd-icon style
	•	Per-component settings:
	•	color customization
	•	hide/show toggle
	•	Countdown display:
	•	switches automatically between “reset end of day” vs “rolling 24h” based on provider data model
	•	Config:
	•	currently JSON file only
	•	TUI-based config editor may come later (note in roadmap)
	•	Must follow Claude Code aux project conventions.
	•	Must remain compatible with ccstatusline as the baseline runtime/host implementation.

Extensibility requirements
	•	Provider selection: built-in (sub2api, claude-relay-service) + easy to add more.
	•	User-defined provider mapping:
	•	allow custom provider definitions
	•	allow mapping arbitrary response keys → our normalized usage fields
	•	Support both:
	•	subscription-based usage (quota windows)
	•	credit-based usage (remaining/used credits)

Output required from you (handbook/spec)

Produce a single implementation handbook that includes:
	1.	Architecture overview (modules, data flow, separation of concerns)
	2.	Normalized usage schema (the internal shape all providers map into)
	3.	Provider adapters for sub2api + claude-relay-service (fields to extract, edge cases, reset semantics)
	4.	Polling + caching strategy (intervals, disk cache format, backoff, failure behavior)
	5.	Statusline rendering model (components, layout rules, color/progress modes, hide/show)
	6.	JSON config schema (with examples)
	7.	Compatibility notes for integrating with ccstatusline
	8.	Implementation checklist (step-by-step plan the next agent can follow)

Goal: a developer should be able to implement the tool from this handbook without re-reading all the reference repos.

