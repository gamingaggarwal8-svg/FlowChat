# FlowChat agent guidance

## Frontend design

For frontend design, review, layout, colour, typography, accessibility, responsive
behaviour and UI polish, read and use the project-local Impeccable skill:

`.agents/skills/impeccable/SKILL.md`

The installed source and version are recorded in
`.agents/skills/impeccable/UPSTREAM.json`. The skill is installed project-locally
for Codex; it is not an npm runtime dependency.

Preserve the requested FlowChat scope and existing business calculations. Keep
synthetic data and prepared transcripts clearly labelled. A design change must
not invent metrics, silently change payment rules, reveal floor prices in customer
messages, or claim automatic audio transcription when only playback is connected.

Use the existing light workspace as the visual baseline unless a redesign is
requested. Frontend work should retain responsive charts, readable labels,
keyboard-accessible controls, and distinct customer/supplier/inventory screens.

## Validation

Run checks appropriate to changed code: `npm test`, `npm run lint`,
`npm run typecheck`, and `npm run build`. Documentation or skill installation
alone does not require rerunning application tests.

Never commit real `.env` files, credentials, installed dependencies, or build caches.
