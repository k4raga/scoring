# Document Wiki Layer

Этот слой отделяет пользовательскую документацию проекта от исходных файлов и технических extractor-артефактов.

## Слои документов

1. Source documents
   - исходный архив;
   - оригинальные файлы из архива;
   - открываются напрямую в браузере или скачиваются.

2. Wiki / MD documents
   - нормализованные Markdown-документы;
   - человекочитаемая версия исходного документа;
   - используются для встроенного просмотра и будущей Quartz/wiki базы знаний.

3. Manual blocks
   - ручные ссылки или текстовые/MD-заметки;
   - пользователь может добавлять, переименовывать, скрывать, удалять и менять порядок.

4. Diagnostic artifacts
   - `manifest.json`, `documents.json`, `extraction-report.json` и похожие файлы;
   - нужны для диагностики, но не являются основным пользовательским документным сценарием.

## Backend contract

Сохраняемая конфигурация лежит в `record.documentWiki`:

```json
{
  "version": 1,
  "overrides": {
    "wiki:doc-001": {
      "title": "ТЗ в Wiki",
      "visible": true,
      "order": 400
    }
  },
  "manualBlocks": [
    {
      "id": "manual-note",
      "type": "manual",
      "title": "Комментарий",
      "href": "",
      "body": "Ручная заметка",
      "visible": true,
      "order": 1000
    }
  ]
}
```

Производная view model отдается как `record.documentBlocks`:

```json
{
  "version": 1,
  "knowledgeBase": {
    "target": "Quartz",
    "renderer": "quartz-compatible",
    "projectId": "2026-05-08-demo",
    "projectTitle": "Demo",
    "publishPath": "projects/2026/05/demo"
  },
  "blocks": []
}
```

`documentBlocks` не должен сохраняться как источник истины. Он собирается из:

- `documents`;
- `documentArtifacts`;
- `workflow.extraction.documents`;
- `workflow.extraction.artifacts`;
- `documentWiki`.

## Markdown normalization

Extractor при генерации MD не должен выдавать сырой text dump. Он должен технически нормализовать документ:

- добавлять заголовок документа;
- добавлять сведения об извлечении;
- восстанавливать заголовки и разделы;
- сохранять списки;
- преобразовывать табличные строки в Markdown tables;
- группировать текст в читаемые блоки.

Это не бизнес-анализ. Extractor не должен принимать решения по закупке, победителям, рискам или scoring-полям.

## Quartz target

`documentBlocks.knowledgeBase` фиксирует будущий контур Quartz/wiki. Проектные MD-документы должны иметь стабильные id, title, связь с проектом и предсказуемый publish path, чтобы их можно было опубликовать как отдельную базу знаний.
