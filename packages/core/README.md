# @axon/core

Shared transport-agnostic Axon logic.

This package is the first extraction step toward the eventual monorepo
layout. It holds code that should be reusable across:

- the CLI
- the desktop app
- a future browser/WebHID app

Current contents:

- catalog/model helpers
- shared typed errors
- transport abstraction
- transport-agnostic wire/HID protocol helpers
