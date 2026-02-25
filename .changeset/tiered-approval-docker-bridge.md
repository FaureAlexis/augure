---
"@augure/types": minor
"@augure/channels": minor
"@augure/core": minor
"@augure/tools": patch
"@augure/skills": patch
"@augure/code-mode": minor
"augure": minor
---

Add tiered approval for high-risk tools and file-based Docker bridge for code-mode tool calls.

**Tiered Approval:**
- New `riskLevel` field on `NativeTool` — tools marked `"high"` require explicit user approval
- Channel-agnostic `ApprovalGate` with timeout auto-reject and fallback auto-approve
- Telegram implementation using InlineKeyboard approve/reject buttons
- `sandbox_exec`, `opencode`, and `manage_skill` marked as high-risk
- Configurable via `approval.enabled` and `approval.timeoutMs` in augure.json5

**Docker Code-Mode Bridge:**
- Real tool execution from Docker containers via file-based bridge
- Container harness writes `.bridge-req-{id}.json`, host polls and responds with `.bridge-resp-{id}.json`
- 120s timeout prevents infinite poll inside container
- Atomic temp+mv writes avoid partial reads
