# @augure/code-mode

## 0.2.1

### Patch Changes

- Updated dependencies [8a71557]
  - @augure/types@0.6.0
  - @augure/sandbox@0.1.5
  - @augure/tools@0.4.2

## 0.2.0

### Minor Changes

- c19fca6: Add tiered approval for high-risk tools and file-based Docker bridge for code-mode tool calls.

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

### Patch Changes

- Updated dependencies [c19fca6]
  - @augure/types@0.5.0
  - @augure/tools@0.4.1
  - @augure/sandbox@0.1.4

## 0.1.4

### Patch Changes

- Updated dependencies [d26c70d]
  - @augure/types@0.4.0
  - @augure/tools@0.4.0
  - @augure/sandbox@0.1.3

## 0.1.3

### Patch Changes

- Updated dependencies [1f2df3d]
  - @augure/tools@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [33060dd]
  - @augure/tools@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [eae2fe8]
  - @augure/types@0.3.0
  - @augure/sandbox@0.1.2
  - @augure/tools@0.1.1
