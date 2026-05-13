# OpenSpec

OpenSpec хранит продуктовые и инженерные спецификации этого проекта.

Использовать его для плановых изменений, которым нужны понятный proposal, delta требований, design notes, tasks, проверка и archive trail до того, как реализация становится частью основной линии проекта.

## Language Rule

Содержательные OpenSpec-артефакты в этом проекте пишутся на русском языке:

- `proposal.md`;
- `design.md`;
- `tasks.md`;
- `spec.md`;
- описания требований, сценариев, критериев приемки, рисков и решений.

Английские служебные заголовки, delta-маркеры и ключевые слова OpenSpec (`ADDED Requirements`, `MODIFIED Requirements`, `Requirement`, `Scenario`, `SHALL`, `WHEN`, `THEN`) допустимы только там, где они нужны для валидатора, CLI или общепринятого формата OpenSpec.

Если задача описана коротко или неоднозначно, OpenSpec-артефакты сначала создаются как русский draft с явными assumptions или после интервью с пользователем. Такой draft не является основанием для implementation, пока пользователь не подтвердил смысл change.

Common commands:

```powershell
npm run openspec:list
npm run openspec:specs
npm run openspec:validate
npx openspec show <change-or-spec>
```

Codex slash-command workflow:

```text
/opsx:propose <change-name>
/opsx:apply
/opsx:archive
```

The existing project workflow files in `.codex-workflow/` remain valid. OpenSpec is added as the structured spec/change layer for future development, not as a replacement for current operational notes.
