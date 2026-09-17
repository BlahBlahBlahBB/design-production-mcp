# DPM Production tools

These tools retain DPM's guarded workflow. They are intentionally separate from Illustrator Core and are the only public tools that require a verified MASTER/work-copy identity.

| Tool | Purpose | Backend | Protection |
| --- | --- | --- | --- |
| `create_work_copy` | Copy a saved MASTER to an explicit work path and authorize a managed session. | DPM filesystem verifier + managed session | MASTER protection, content hashes, exact active-work-copy check |
| `reconcile_work_copy` | Read-only recovery of a pending protected work-copy open. | DPM managed session | No write until exact work-copy identity is re-proven |
| `dpm_save_work_copy` | Save an authorized work copy. | DPM managed session | Rejects MASTER saves and unknown sessions |

The retained, non-public DPM Production building blocks are `SafeMutationContext`, `ObjectLocator`, managed sessions, timeout quarantine, template fingerprints/profiles, deterministic template text replacement, filesystem work-copy verification, and QR/CSV/Excel input parsing. They are reserved for future template and batch workflows, not normal Core editing.

DPM Production public-tool count: **3**.
