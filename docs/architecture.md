# AIC Architecture Decisions

## Product principle
AIC preserves user-owned work context across AI assistants, coding agents, and development environments.

## Project context and personal memory
Project context and personal memory are separate data domains.
- Project context: goals, tasks, decisions, issues, constraints, relevant files, and failed attempts.
- Personal memory: user-confirmed facts, preferences, goals, and approved observations about recurring work patterns.

A project export must not automatically include the user's complete personal memory.

## Memory learning policy
AIC may analyze conversation history and project history only when the user has authorized access to those sources.

The memory system may propose inferred observations, but it must ask the user for explicit approval before saving them as persistent memories.

Inferred observations should include evidence, confidence, and timestamps where practical. Users must be able to inspect, edit, reject, and delete memories.

## Context sharing
AIC must let users review and select the information they share. Secret detection is a safety layer, not a guarantee that all sensitive information will be detected.

## Integration boundaries
Use user-authorized imports and supported provider interfaces. Do not scrape private sessions, extract credentials, or bypass provider access controls or usage limits.

## Versioning
Context packages and personal memory use separate schemas and versioning. Changes to either format must be validated and tested before release.
