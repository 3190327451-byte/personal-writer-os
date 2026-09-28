# Industry Research Skill

A compact, evidence-aware skill for industry, market, company, product-portfolio, and business-model research. It is designed for ongoing research: new materials are evaluated, routed, and integrated without allowing the authoritative report to grow by accumulation.

## What makes it different

- Plans research around decision-changing claims rather than source summaries.
- Separates facts, source claims, research inferences, and hypotheses.
- Evaluates source independence at the data-generating origin.
- Routes every new material to discard, lead, backend evidence, integrated revision, or a strictly gated new section.
- Uses truth, decision, and compression gates before delivery.
- Supports quick, standard, and deep research without forcing the same process on every request.
- Treats report maintenance and compression as first-class research work.

## Install

Copy the `industry-research` folder to your Codex skills directory:

```text
~/.codex/skills/industry-research
```

Then restart Codex or open a new task if it does not appear immediately.

## Use

Invoke it explicitly with `$industry-research`, or describe an industry/company research task and allow automatic selection.

Example:

```text
Use $industry-research to analyze a game company, its released portfolio,
officially announced pipeline, capabilities, and risks. Keep the report concise,
separate confirmed facts from inference, and identify the next signals to monitor.
```

For ongoing reports:

```text
Use $industry-research to evaluate this new material against the existing report.
Prefer replacing or compressing existing text; add a section only if it answers a
new high-value decision question.
```

## Structure

```text
industry-research/
├── SKILL.md
├── agents/openai.yaml
└── references/
    ├── deliverables.md
    └── evidence-and-maintenance.md
```

## Design sources

The skill is original and tailored to a long-running industry-report workflow. Its evidence discipline was informed by public research-skill patterns including claim-led planning, origin-level source independence, gap closure, convergence-based stopping, counter-evidence, and formal report gates. Those patterns were adapted to reduce process overhead and report bloat.

## License

MIT
