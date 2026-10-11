---
schemaVersion: 0.2.0
id: "0100"
title: Spike fixture with review state
status: proposed
date: 2026-10-10
deciders: ["@mbeacom"]
tags: [spike, backstage]
scope: component
reversibility: two-way-door
blastRadius: component
relatesTo: ["0099"]
affects: []
provenance:
  authoredBy: agent-drafted
review:
  tier: arb
  quorum: 2
  approvals: ["@bob", "@Bob"]
  objections:
    - { by: "@carol", summary: "Needs a measured range" }
---

# ADR-0100: Spike fixture with review state

Synthetic record for the adrkit-backstage spike. `@bob` and `@Bob` are one identity under
adrkit's ASCII casefold rule, so the queue must report 1 approval of 2, not 2 of 2.
