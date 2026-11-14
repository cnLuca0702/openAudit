# openAudit

Build a real Chinese audit demo workbench as a plugin for DSH 0.2.2-rc.1. Source requirements are in docs/source/方案原文.txt. All 24 scenarios must operate on persisted inputs with provenance; canned answers, no-op buttons and claiming untested features work are forbidden. All demo content is marked 演示模拟数据. Legal excerpts retain official URLs, effective dates, and 待人工核验 until a human approves applicability.

Shared working directory: edit only your assigned paths. Do not commit or push from workers. Coordinator owns root manifests, integration, deployment and final verification. Never expose or commit credentials, server tokens, or original infrastructure configuration. Old DSH is read-only; deploy only to /opt/dsh-v2.

Use Orca orchestration for workers. Follow the live dispatch preamble. Report actual tests and known gaps; no lifecycle completion before your task is actually complete.
