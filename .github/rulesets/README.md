# Branch rulesets

Wersjonowane źródło prawdy dla rulesetów GitHuba (Settings → Rules → Rulesets).
GitHub nie czyta tych plików automatycznie — po zmianie zastosuj przez `gh`:

```bash
# aktualizacja istniejącego rulesetu
gh api repos/klaps-hq/klaps.radar/rulesets/17462424 --method PUT --input .github/rulesets/main.json

# utworzenie od zera (np. po skasowaniu)
gh api repos/klaps-hq/klaps.radar/rulesets --method POST --input .github/rulesets/main.json
```

| Plik        | Ruleset                   | ID       |
| ----------- | ------------------------- | -------- |
| `main.json` | main - PR required checks | 17462424 |
