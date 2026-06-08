import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildDifyPayload,
  getDifyProviderDescriptor,
  normalizeDifyContract,
  normalizeDifyWorkflowResponse,
  runDifyAnalysisPass
} from "../backend/src/dify-analysis.js";
import { normalizeShortTitle } from "../backend/src/record-schema.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scoring-dify-test-"));
const runsRoot = path.join(tempRoot, "runs");
const runDir = path.join(runsRoot, "run-1");
const normalizedDir = path.join(runDir, "normalized");
const artifactsDir = path.join(runDir, "artifacts");

fs.mkdirSync(normalizedDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });
fs.writeFileSync(path.join(normalizedDir, "doc-1.md"), "# Критерии\n\nЦена - 60%.\n", "utf-8");
fs.writeFileSync(
  path.join(normalizedDir, "doc-2.md"),
  "# Закупочная документация\n\n| |Критерии оценки заявок: |\n| |Единственным критерием является цена. |\n",
  "utf-8"
);
fs.writeFileSync(
  path.join(normalizedDir, "doc-rfi.md"),
  [
    "# 00 RFI CRM",
    "",
    "X5 приглашает Вас принять участие в запросе на предоставление информации (RFI – анализ рынка) оказание услуг по развитию системы Битрикс24 CRM.",
    "Настоящий RFI сделан для анализа рынка потенциальных контрагентов и технологий.",
    "",
    "В рамках настоящего запроса выбор контрагента не производится.",
    "",
    "До 18:00 по МСК «15» мая 2026 г. участниками производится подача заявок на электронной площадке B2B-CENTER.",
    "",
    "Презентацию о компании.",
    "Примеры реализованных проектов (при наличии).",
    "Заполненную анкету контрагента",
    "Описание используемых технологий.",
    "Заполненную форму КП"
  ].join("\n"),
  "utf-8"
);
fs.writeFileSync(
  path.join(normalizedDir, "doc-tender-tech.md"),
  [
    "# ТЗ ведение сайта Эрманн",
    "",
    "### ТЕХНИЧЕСКОЕ ЗАДАНИЕ НА ВЕДЕНИЕ САЙТА ДЛЯ КОМПАНИИ ЭРМАНН.",
    "",
    "### Контактное лицо по вопросам проведения тендерной процедуры",
    "",
    "Цель проекта: Выбор профессионального агентства (исполнителя) для оказания услуг по технической поддержке и оперативному внесению изменений на корпоративный сайт www.ehrmann.ru.",
    "",
    "### Предмет закупки",
    "",
    "Оказание услуг по ведению и технической поддержке сайта www.ehrmann.ru (далее - Сайт), включая внесение изменений по запросам Заказчика.",
    "",
    "### КРИТЕРИИ ОЦЕНКИ",
    "",
    "Стоимость и прозрачность сметы (30%): конкурентоспособность стоимости часа работы, а также предлагаемая модель оплаты (по факту / абонемент).",
    "",
    "Качество портфолио (40%): соответствие опыта задачам Заказчика.",
    "",
    "### ТРЕБОВАНИЯ К ИСПОЛНИТЕЛЮ",
    "",
    "### Обязательные компетенции",
    "",
    "Наличие не менее 2 лет опыта в ведении и поддержке корпоративных сайтов",
    "Опыт работы с продуктовыми каталогами, мультиязычными сайтами.",
    "",
    "### Желательные компетенции",
    "",
    "Наличие в штате сотрудников с компетенциями администратора CMS.",
    "Опыт работы с FMCG-брендами, продуктовыми сайтами.",
    "Возможность предоставления услуг по аутсорсингу технического администратора (при необходимости).",
    "",
    "### СРОКИ ПРОВЕДЕНИЯ ПРОЦЕДУРЫ",
    "",
    "#### 20.04.26 – 01.05.26 до 14 часов дня по МСК - прием КП и портфолио по 1 туру",
    "### 06.05 – 11.05 – переторжка",
    "### 12.05 – 14.05 – подведение итогов тендера"
  ].join("\n"),
  "utf-8"
);
fs.writeFileSync(
  path.join(normalizedDir, "doc-no-retrade.md"),
  [
    "# ТЗ без переторжки",
    "",
    "### Контактное лицо по вопросам проведения тендерной процедуры",
    "",
    "### Предмет закупки",
    "",
    "Оказание услуг по технической поддержке сайта.",
    "",
    "### КРИТЕРИИ ОЦЕНКИ",
    "",
    "Стоимость услуг (100%).",
    "",
    "Переторжка не предусмотрена."
  ].join("\n"),
  "utf-8"
);
const networkCompanySubject = "Выполнение работ по разработке информационной системы «Экосистема искусственного интеллекта»";
const noisyNetworkCompanySubject = [
  `${networkCompanySubject}. Настоящая закупка является совместной.`,
  "### Сведения о начальной (максимальной) цене договора",
  "| Всего: | 25 416 000,00 руб. |",
  "| --- | --- |",
  "Объем документации о закупке включает в себя текст документации о закупке, проект договора и иные приложения."
].join(" ");
const networkCompanyCriteriaTable = [
  "### Критерии оценки и сопоставления заявок на участие в закупке",
  "",
  "| № | Критерий оценки заявок | Порядок расчетов, формула | Значимость критерия |",
  "| --- | --- | --- | --- |",
  "| 1 | Цена договора | Принимает значение от 0,01 руб. до значения НМЦ. Формула: (Цмин/Цуч)xV. | 40 |",
  "| 2 | Наличие у участника аккредитации на осуществление деятельности в области информационных технологий | По данному критерию оценивается наличие у участника аккредитации: при наличии аккредитации - 10 баллов; при отсутствии - 0 баллов. | 10 |",
  "| 3 | Экспертная оценка предлагаемого участником прототипного решения (Приложение №5) | Прототипные решения рассматриваются экспертной группой. Экспертная группа присваивает баллы в соответствии с Приложением №5. | 50 |"
].join("\n");
fs.writeFileSync(
  path.join(normalizedDir, "doc-network-company.md"),
  [
    "# Документация о закупке",
    "",
    noisyNetworkCompanySubject,
    "",
    "(АУ) АО «Сетевая компания» 420094, г. Казань, ул. Бондаренко, 3",
    "",
    "Раздел оценки заявок находится далее в документации.",
    "",
    "Общие условия участия в закупочной процедуре. ".repeat(450),
    "",
    networkCompanyCriteriaTable
  ].join("\n"),
  "utf-8"
);
fs.writeFileSync(
  path.join(normalizedDir, "doc-network-prototype.md"),
  [
    "# Задание на прототип ЭИИ_конкурс 2",
    "",
    "Участник должен подготовить задание на прототип экосистемы искусственного интеллекта."
  ].join("\n"),
  "utf-8"
);
fs.writeFileSync(
  path.join(normalizedDir, "doc-areal-tech.md"),
  [
    "---",
    "{",
    '  "source_name": "ТЗ ИИ для мастер-данных.pdf",',
    '  "source_path": "МКАО АРЕАЛ 17.06/ТЗ ИИ для мастер-данных.pdf"',
    "}",
    "---",
    "",
    "# ТЗ ИИ для мастер данных",
    "",
    "Техническое задание на разработку ИИ-",
    "",
    "ассистента для НСИ",
    "",
    "г. Москва, 2026",
    "",
    "## 3 Цели и задачи",
    "",
    "### Цели",
    "",
    "Создание облачного вспомогательного web-приложения на основе ИИ, которое оптимизирует и упрощает работу пользователей со справочником МТР путем автоматизации ручных проверок и подбора информации.",
    "",
    "### Задачи",
    "",
    "Создание web-приложения ИИ-ассистента по работе с НСИ.",
    "",
    "## 4 Периметр и сроки",
    "",
    "Планируемый срок Июль 2026г. – ноябрь 2026г. (старт ОПЭ – сентябрь 2026 г.)",
    "",
    "Продукт проекта ИИ-ассистент по НСИ, Human-in-the-loop.",
    "",
    "Заказчик проекта Руководитель направления по оптимизации оборотного капитала, Департамент по экономике и финансам",
    "",
    "## 7 Этапы работ",
    "",
    "## 4 Пилотное внедрение (MVP scope). Оценка метрик",
    "",
    "* сроки могут быть скорректированы в рамках тендера с конкретным Исполнителем по согласованию с Заказчиком до заключения Договора."
  ].join("\n"),
  "utf-8"
);
fs.writeFileSync(
  path.join(artifactsDir, "manifest.json"),
  JSON.stringify({
    href: "http://localhost:4100/private",
    sourcePath: "C:\\secret\\doc.docx",
    apiToken: "must-not-leak",
    useful: {
      criterion: "Цена"
    }
  }),
  "utf-8"
);

process.env.SCORING_EXTRACTOR_RUNS_ROOT = runsRoot;

const record = {
  id: "record-1",
  projectTitle: "Тест Dify",
  customer: "Старый заказчик",
  title: "Тендер",
  sourceUrl: "https://zakupki.example/notice",
  documentsFolderHref: "/assets/storage/project/source.zip",
  criteriaDocumentUrl: "/api/records/record-1/documents/doc-1",
  selectionCriteriaRows: [],
  documents: [
    {
      kind: "normalized_markdown",
      group: "normalizedMarkdown",
      documentId: "doc-1",
      label: "Документ критериев",
      href: "/artifacts/run-1/normalized/doc-1.md",
      sourcePath: "C:\\secret\\doc.docx"
    },
    {
      kind: "normalized_markdown",
      group: "normalizedMarkdown",
      documentId: "doc-2",
      label: "Закупочная документация",
      href: "/artifacts/run-1/normalized/doc-2.md",
      sourcePath: "C:\\secret\\doc-2.docx"
    }
  ],
  workflow: {
    extraction: {
      artifacts: {
        manifestJson: "/artifacts/run-1/artifacts/manifest.json"
      },
      documents: []
    }
  }
};
const env = {
  SCORING_DIFY_API_BASE_URL: "https://dify.example/v1",
  SCORING_DIFY_API_KEY: "test-secret",
  SCORING_DIFY_MAX_DOCUMENTS: "10",
  SCORING_DIFY_MAX_DOCUMENT_CHARS: "10000",
  SCORING_DIFY_MAX_PAYLOAD_CHARS: "100000"
};

const provider = getDifyProviderDescriptor(env);
assert.equal(provider.status, "configured");
assert.equal(provider.apiKey, undefined);

const built = buildDifyPayload({
  record,
  job: { id: "job-1" },
  config: {
    maxDocuments: 10,
    maxDocumentChars: 10000,
    maxJsonArtifactChars: 10000,
    maxPayloadChars: 100000
  }
});
const serializedPayload = JSON.stringify(built.payload);

assert.equal(built.payload.record.documentsFolderHref, undefined);
assert.equal(built.payload.record.criteriaDocumentUrl, undefined);
assert.match(serializedPayload, /# Критерии/u);
assert.doesNotMatch(serializedPayload, /must-not-leak/u);
assert.doesNotMatch(serializedPayload, /C:\\secret/u);
assert.doesNotMatch(serializedPayload, /localhost:4100/u);
assert.deepEqual(
  built.payload.instructions.extractionBlocks.map((block) => block.id),
  ["tenderInfo", "selectionCriteria"]
);
assert.equal(built.payload.instructions.allowedPatchFields.includes("preassessment"), false);
assert.equal(built.payload.instructions.disabledPatchFields.includes("preassessment"), true);
assert.equal(built.payload.instructions.preassessmentEnums, undefined);
assert.equal(built.payload.instructions.extractionTargets.preassessment, undefined);
assert.match(
  built.payload.instructions.extractionTargets.recordPatch.find((field) => field.field === "projectTitle").output,
  /Short page title/u
);

const normalizedContract = normalizeDifyContract({
  recordPatch: {
    customer: "Новый заказчик",
    documentsFolderHref: "/forbidden",
    workflow: { status: "forbidden" }
  },
  selectionCriteriaRows: [
    {
      group: "price",
      title: "Цена договора",
      weightPercent: 60,
      blockFactor: "",
      coverageStatus: "full",
      coverageNote: "Предлагаем минимальную цену",
      sourceExcerpt: "Цена - 60%"
    }
  ],
  documentFindings: [
    {
      field: "customer",
      documentId: "doc-1",
      quote: "Новый заказчик",
      note: "Найдено в документации"
    }
  ],
  metadata: {
    href: "/private",
    model: "mock"
  }
});

assert.equal(normalizedContract.recordPatch.customer, "Новый заказчик");
assert.equal(normalizedContract.recordPatch.documentsFolderHref, undefined);
assert.equal(normalizedContract.recordPatch.workflow, undefined);
assert.equal(normalizedContract.selectionCriteriaRows[0].coverageStatus, "");
assert.equal(normalizedContract.selectionCriteriaRows[0].blockFactor, "");
assert.equal(normalizedContract.selectionCriteriaRows[0].coverageNote, "Предлагаем минимальную цену");
assert.deepEqual(normalizedContract.metadata, { model: "mock" });
assert(normalizedContract.warnings.some((warning) => warning.includes("dify_record_patch_fields_rejected")));

assert.throws(
  () => normalizeDifyWorkflowResponse({ data: { status: "succeeded", outputs: { result: "обычный текст без json" } } }),
  /valid JSON contract/u
);

let capturedRequest = null;
const pass = await runDifyAnalysisPass({
  job: { id: "job-1" },
  record,
  env,
  fetchImpl: async (url, options) => {
    capturedRequest = {
      url,
      headers: Object.fromEntries(options.headers ? Object.entries(options.headers) : []),
      body: JSON.parse(options.body)
    };
    return new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {
                customer: "Новый заказчик"
              },
              selectionCriteriaRows: [
                {
                  group: "price",
                  title: "Цена договора",
                  weightPercent: 60,
                  coverageStatus: "full",
                  coverageNote: "Закрываем ценой",
                  sourceExcerpt: "Цена - 60%"
                }
              ],
              documentFindings: [
                {
                  field: "customer",
                  documentId: "doc-1",
                  quote: "Новый заказчик",
                  note: "Найдено в документации"
                },
                {
                  field: "selectionCriteriaRows",
                  documentId: "doc-1",
                  quote: "Критерии оценки заявок: Единственным критерием является цена.",
                  note: "Dify ошибся с documentId, backend должен исправить"
                }
              ],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
});

assert.equal(capturedRequest.url, "https://dify.example/v1/workflows/run");
assert.equal(capturedRequest.headers.Authorization, "Bearer test-secret");
assert.equal(capturedRequest.body.response_mode, "blocking");
assert.equal(capturedRequest.body.inputs.scoring_payload.record.criteriaDocumentUrl, undefined);
assert.equal(pass.result.recordPatch.customer, "Новый заказчик");
assert.equal(pass.result.recordPatch.selectionCriteriaRows[0].coverageStatus, "");
assert.equal(pass.result.recordPatch.selectionCriteriaRows[0].coverageNote, "Закрываем ценой");
assert.equal(pass.result.documentFindings.find((finding) => finding.field === "selectionCriteriaRows")?.documentId, "doc-2");
assert(pass.warnings.includes("dify_document_finding_document_id_repaired:1"));
assert.equal(pass.result.analysisMetadata.payloadSummary.documentCount, 3);
assert.doesNotMatch(JSON.stringify(pass.result), /test-secret/u);

const manualCriteriaPass = await runDifyAnalysisPass({
  job: { id: "job-manual-criteria" },
  record: {
    ...record,
    selectionCriteriaRows: [
      {
        order: 1,
        group: "requirement",
        title: "Опыт",
        blockFactor: "blockFactor",
        coverageStatus: "partial",
        coverageAmount: "70%",
        coverageNote: "Ручная пометка закрытия: не уверены, что примут Почта Банк.",
        sourceExcerpt: "Наличие опыта"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {},
              selectionCriteriaRows: [
                {
                  group: "requirement",
                  title: "Наличие опыта",
                  blockFactor: "blockFactor",
                  coverageStatus: "full",
                  coverageNote: "Требуется опыт по документам.",
                  sourceExcerpt: "Наличие опыта оказания услуг"
                }
              ],
              documentFindings: [
                {
                  field: "selectionCriteriaRows",
                  documentId: "doc-1",
                  quote: "Наличие опыта оказания услуг",
                  note: "Требование к опыту"
                }
              ],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
});

assert.equal(manualCriteriaPass.result.selectionCriteriaRows[0].title, "Наличие опыта");
assert.equal(manualCriteriaPass.result.selectionCriteriaRows[0].blockFactor, "blockFactor");
assert.equal(manualCriteriaPass.result.selectionCriteriaRows[0].coverageStatus, "partial");
assert.equal(manualCriteriaPass.result.selectionCriteriaRows[0].coverageAmount, "70%");
assert.equal(manualCriteriaPass.result.selectionCriteriaRows[0].coverageNote, "Требуется опыт по документам.");
assert.match(manualCriteriaPass.result.selectionCriteriaRows[0].sourceExcerpt, /Наличие опыта оказания услуг/u);

const crossGroupCriteriaPass = await runDifyAnalysisPass({
  job: { id: "job-cross-group-criteria" },
  record: {
    ...record,
    selectionCriteriaRows: [
      {
        order: 1,
        group: "nonPrice",
        title: "Качество портфолио",
        weightPercent: 40,
        coverageStatus: "full",
        coverageNote: "Соответствие опыта задачам заказчика.",
        sourceExcerpt: "Качество портфолио (40%)"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {},
              selectionCriteriaRows: [
                {
                  group: "requirement",
                  title: "Наличие опыта",
                  blockFactor: "blockFactor",
                  coverageStatus: "full",
                  coverageNote: "Не менее 2 лет опыта.",
                  sourceExcerpt: "Наличие не менее 2 лет опыта"
                }
              ],
              documentFindings: [],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
});

assert.equal(crossGroupCriteriaPass.result.selectionCriteriaRows[0].group, "requirement");
assert.equal(crossGroupCriteriaPass.result.selectionCriteriaRows[0].title, "Наличие опыта");
assert.equal(crossGroupCriteriaPass.result.selectionCriteriaRows[0].blockFactor, "blockFactor");
assert.equal(crossGroupCriteriaPass.result.selectionCriteriaRows[0].coverageStatus, "");
assert.equal(crossGroupCriteriaPass.result.selectionCriteriaRows[0].coverageNote, "Не менее 2 лет опыта.");

const rfiPass = await runDifyAnalysisPass({
  job: { id: "job-rfi" },
  record: {
    ...record,
    id: "record-rfi",
    selectionCriteriaRows: [],
    documents: [
      {
        kind: "normalized_markdown",
        group: "normalizedMarkdown",
        documentId: "doc-rfi",
        label: "00 RFI CRM",
        href: "/artifacts/run-1/normalized/doc-rfi.md"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {
                customer: "X5",
                title: "Развитие системы Битрикс24 CRM",
                procurementStage: "Тендер",
                nmc: "29308235.5",
                antiDumpingMeasures: "Нет",
                creative: false
              },
              selectionCriteriaRows: [
                {
                  group: "requirement",
                  title: "Проработка интеграции Битрикс24 CRM",
                  coverageStatus: "partial",
                  coverageNote: "Техническое требование",
                  sourceExcerpt: "Проработка интеграции Битрикс24 CRM"
                }
              ],
              documentFindings: [],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
});

assert.equal(rfiPass.result.recordPatch.procurementStage, "Анализ рынка цен");
assert.equal(rfiPass.result.recordPatch.nmc, "нет");
assert.equal(rfiPass.result.recordPatch.customer, 'ПАО "КОРПОРАТИВНЫЙ ЦЕНТР ИКС 5"');
assert.equal(rfiPass.result.recordPatch.antiDumpingMeasures, "не применимо на данном этапе");
assert.equal(rfiPass.result.recordPatch.creative, true);
assert.match(rfiPass.result.recordPatch.title, /RFI - анализ рынка/u);
assert.deepEqual(
  rfiPass.result.selectionCriteriaRows.map((row) => row.title),
  [
    "Презентация о компании",
    "Примеры реализованных проектов (при наличии)",
    "Заполненное КП",
    "Заполненную анкету контрагента",
    "Описание используемых технологий"
  ]
);
assert(rfiPass.result.selectionCriteriaRows.every((row) => row.coverageStatus === "" && row.coverageAmount === ""));
assert(rfiPass.result.selectionCriteriaRows.every((row) => row.coverageNote));
assert.deepEqual(
  rfiPass.result.selectionCriteriaRows.map((row) => row.blockFactor),
  ["blockFactor", "no", "blockFactor", "blockFactor", "blockFactor"]
);
assert.equal(normalizeShortTitle("Эрманн 01.05"), "");
assert.equal(normalizeShortTitle("Оказание услуг по ведению сайта"), "Аутсорс");

const tenderTechnicalAssignmentPass = await runDifyAnalysisPass({
  job: { id: "job-tender-tech" },
  record: {
    ...record,
    id: "record-tender-tech",
    title: "Эрманн 01.05",
    selectionCriteriaRows: [],
    documents: [
      {
        kind: "normalized_markdown",
        group: "normalizedMarkdown",
        documentId: "doc-tender-tech",
        label: "ТЗ ведение сайта Эрманн",
        href: "/artifacts/run-1/normalized/doc-tender-tech.md"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {
                customer: "",
                title: "Эрманн 01.05",
                shortTitle: "Эрманн 01.05",
                procurementStage: "",
                nmc: "Не указано в документах",
                creative: true,
                notes: "# ТЗ ведение сайта Эрманн ## Сведения об извлечении",
                summary: "# ТЗ ведение сайта Эрманн ## Сведения об извлечении"
              },
              selectionCriteriaRows: [
                {
                  group: "nonPrice",
                  title: "Качество портфолио",
                  weightPercent: 40,
                  coverageStatus: "full",
                  coverageNote: "Кейсы и отзывы",
                  sourceExcerpt: "Качество портфолио (40%)"
                }
              ],
              documentFindings: [],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
});

assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.customer, "ЭРМАНН");
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.projectTitle, "Эрманн техподдержка");
assert.match(tenderTechnicalAssignmentPass.result.recordPatch.title, /Оказание услуг по ведению/u);
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.shortTitle, "Аутсорс");
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.procurementStage, "Тендер");
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.nmc, "нет");
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.platformPayment, "-");
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.contractTerm, "нет данных");
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.retrade, "Да");
assert.equal(tenderTechnicalAssignmentPass.result.recordPatch.creative, false);
assert.doesNotMatch(tenderTechnicalAssignmentPass.result.recordPatch.summary, /Сведения об извлечении/u);
assert.deepEqual(
  tenderTechnicalAssignmentPass.result.selectionCriteriaRows.map((row) => row.title),
  ["Стоимость и прозрачность сметы", "Опыт", "Опыт", "Кадры"]
);
assert.deepEqual(
  tenderTechnicalAssignmentPass.result.selectionCriteriaRows.map((row) => row.group),
  ["price", "requirement", "requirement", "requirement"]
);
assert.deepEqual(
  tenderTechnicalAssignmentPass.result.selectionCriteriaRows.map((row) => row.weightPercent),
  [30, null, null, null]
);
assert.deepEqual(
  tenderTechnicalAssignmentPass.result.selectionCriteriaRows.map((row) => row.blockFactor),
  ["", "blockFactor", "no", "no"]
);
assert.equal(tenderTechnicalAssignmentPass.result.selectionCriteriaRows[1].coverageStatus, "");
assert.match(tenderTechnicalAssignmentPass.result.selectionCriteriaRows[1].coverageNote, /корпоративных сайтов/u);
assert.equal(
  tenderTechnicalAssignmentPass.result.documentFindings.filter((finding) => finding.field === "selectionCriteriaRows").length,
  4
);

const arealTechnicalAssignmentPass = await runDifyAnalysisPass({
  job: { id: "job-areal-tech" },
  record: {
    ...record,
    id: "record-areal-tech",
    projectTitle: "Ареал",
    title: "## 4 Пилотное внедрение (MVP",
    shortTitle: "## 4 Пилотное внедрение (MVP",
    customer: "",
    creative: true,
    selectionCriteriaRows: [
      {
        order: 1,
        group: "requirement",
        title: "Интеграция SSO/AD",
        blockFactor: "",
        coverageStatus: "",
        coverageAmount: "",
        coverageNote: "Проверить, учтена ли интеграция SSO/AD в требованиях проекта.",
        sourceExcerpt: "интеграции с корпоративными системами аутентификации (SSO/AD) должна быть учтена"
      }
    ],
    documents: [
      {
        kind: "normalized_markdown",
        group: "normalizedMarkdown",
        documentId: "doc-areal-tech",
        label: "ТЗ ИИ для мастер-данных",
        href: "/artifacts/run-1/normalized/doc-areal-tech.md"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {
                customer: "Заказчик проекта Руководитель направления по оптимизации оборотного капитала, Департамент по экономике и финансам",
                projectTitle: "Ареал",
                title: "Техническое задание на разработку ИИ-ассистента для НСИ",
                shortTitle: "## 4 Пилотное внедрение (MVP",
                nmc: "Не указано в документах",
                overallExecutionTerm: "Планируемый срок Июль 2026г. – ноябрь 2026г. (старт ОПЭ – сентябрь 2026 г.)",
                creative: true,
                notes: "# ТЗ ИИ для мастер данных ## Сведения об извлечении",
                summary: "# ТЗ ИИ для мастер данных ## Сведения об извлечении"
              },
              selectionCriteriaRows: [
                {
                  group: "requirement",
                  title: "Интеграция SSO/AD",
                  blockFactor: "no",
                  coverageNote: "Проверить, учтена ли интеграция SSO/AD в требованиях проекта.",
                  sourceExcerpt: "интеграции с корпоративными системами аутентификации (SSO/AD) должна быть учтена"
                },
                {
                  group: "requirement",
                  title: "MDM прямой обмен данными",
                  blockFactor: "no",
                  coverageNote: "Проверить наличие прямого обмена данными с мастер-системой MDM.",
                  sourceExcerpt: "Интеграция с мастер-системой MDM (прямой обмен данными)."
                }
              ],
              documentFindings: [],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
});

assert.equal(arealTechnicalAssignmentPass.result.recordPatch.customer, "МКАО АРЕАЛ");
assert.equal(arealTechnicalAssignmentPass.result.recordPatch.projectTitle, "Ареал ИИ-ассистент");
assert.equal(arealTechnicalAssignmentPass.result.recordPatch.title, "Разработка ИИ-ассистента для НСИ");
assert.equal(arealTechnicalAssignmentPass.result.recordPatch.shortTitle, "Аутсорс");
assert.equal(arealTechnicalAssignmentPass.result.recordPatch.nmc, "нет");
assert.equal(arealTechnicalAssignmentPass.result.recordPatch.contractTerm, "нет данных");
assert.equal(arealTechnicalAssignmentPass.result.recordPatch.overallExecutionTerm, "Июль 2026г. – ноябрь 2026г. (старт ОПЭ – сентябрь 2026 г.)");
assert.equal(arealTechnicalAssignmentPass.result.recordPatch.creative, false);
assert.match(arealTechnicalAssignmentPass.result.recordPatch.summary, /Создание облачного вспомогательного web-приложения/u);
assert.doesNotMatch(arealTechnicalAssignmentPass.result.recordPatch.summary, /Сведения об извлечении/u);
assert.equal(arealTechnicalAssignmentPass.result.selectionCriteriaRows.length, 0);
assert.deepEqual(arealTechnicalAssignmentPass.result.recordPatch.selectionCriteriaRows, []);
assert.equal(
  arealTechnicalAssignmentPass.result.documentFindings.some((finding) => finding.field === "overallExecutionTerm"),
  true
);

const noRetradePass = await runDifyAnalysisPass({
  job: { id: "job-no-retrade" },
  record: {
    ...record,
    id: "record-no-retrade",
    selectionCriteriaRows: [],
    documents: [
      {
        kind: "normalized_markdown",
        group: "normalizedMarkdown",
        documentId: "doc-no-retrade",
        label: "ТЗ без переторжки",
        href: "/artifacts/run-1/normalized/doc-no-retrade.md"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {
                retrade: "Да"
              },
              selectionCriteriaRows: [],
              documentFindings: [],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
});

assert.equal(noRetradePass.result.recordPatch.retrade, "Нет");

let capturedNetworkCompanyRequest = null;
const networkCompanyPass = await runDifyAnalysisPass({
  job: { id: "job-network-company" },
  record: {
    ...record,
    id: "record-network-company",
    projectTitle: "Сетевая компания 06.05",
    title: "Сетевая компания 06.05",
    customer: "",
    selectionCriteriaRows: [],
    documents: [
      {
        kind: "normalized_markdown",
        group: "normalizedMarkdown",
        documentId: "doc-network-company",
        label: "Документация о закупке",
        href: "/artifacts/run-1/normalized/doc-network-company.md"
      },
      {
        kind: "normalized_markdown",
        group: "normalizedMarkdown",
        documentId: "doc-network-prototype",
        label: "Задание на прототип ЭИИ_конкурс 2",
        href: "/artifacts/run-1/normalized/doc-network-prototype.md"
      }
    ]
  },
  env,
  fetchImpl: async (url, options) => {
    capturedNetworkCompanyRequest = {
      url,
      body: JSON.parse(options.body)
    };

    return new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {
                projectTitle: "Сетевая компания 06.05",
                customer: "",
                title: noisyNetworkCompanySubject,
                shortTitle: "Сетевая компания 06.05",
                procurementStage: "Анализ рынка цен",
                nmc: "25416000",
                contractSecurity: "5% от НМЦ (2026 руб.)",
                creative: false
              },
              selectionCriteriaRows: [],
              documentFindings: [],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
});

assert.equal(networkCompanyPass.result.recordPatch.customer, "АО «Сетевая компания»");
assert.equal(networkCompanyPass.result.recordPatch.projectTitle, "Сетевая компания ИИ-экосистема");
assert.equal(networkCompanyPass.result.recordPatch.title, networkCompanySubject);
assert.equal(networkCompanyPass.result.recordPatch.procurementStage, "Тендер");
assert.equal(networkCompanyPass.result.recordPatch.nmc, "25 416 000,00 руб.");
assert.equal(networkCompanyPass.result.recordPatch.contractSecurity, "5% от НМЦ (25 416 000,00 руб.)");
assert.equal(networkCompanyPass.result.recordPatch.creative, true);
assert.equal(networkCompanyPass.result.recordPatch.criteriaDocumentUrl, "/artifacts/run-1/normalized/doc-network-company.md");
assert.match(
  capturedNetworkCompanyRequest.body.inputs.scoring_payload.documents.find((document) => document.documentId === "doc-network-company")?.markdown || "",
  /Экспертная оценка предлагаемого участником прототипного решения/u
);
assert(networkCompanyPass.warnings.some((warning) => warning === "dify_document_focused_snippets_added:doc-network-company"));
assert.deepEqual(
  networkCompanyPass.result.selectionCriteriaRows.map((row) => row.title),
  [
    "Цена",
    "Аккредитация на осуществление деятельности в области информационных технологий",
    "Экспертная оценка предлагаемого участником прототипного решения (Приложение №5)"
  ]
);
assert.deepEqual(
  networkCompanyPass.result.selectionCriteriaRows.map((row) => row.group),
  ["price", "nonPrice", "nonPrice"]
);
assert.deepEqual(
  networkCompanyPass.result.selectionCriteriaRows.map((row) => row.weightPercent),
  [40, 10, 50]
);
assert.deepEqual(
  networkCompanyPass.result.selectionCriteriaRows.map((row) => row.blockFactor),
  ["", "", ""]
);
assert.equal(networkCompanyPass.result.documentFindings.filter((finding) => finding.field === "selectionCriteriaRows").length, 3);

const generatedExpertStatePass = await runDifyAnalysisPass({
  job: { id: "job-generated-expert-state" },
  record: {
    ...record,
    selectionCriteriaRows: [
      {
        order: 1,
        group: "requirement",
        title: "Интеграция с внешними системами",
        coverageStatus: "partial",
        coverageAmount: "50%",
        coverageNote: "Требование требует проверки менеджером.",
        sourceExcerpt: "Интеграция с внешними системами"
      }
    ]
  },
  env,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "succeeded",
          outputs: {
            result: JSON.stringify({
              recordPatch: {},
              selectionCriteriaRows: [
                {
                  order: 1,
                  group: "requirement",
                  title: "Интеграция с внешними системами",
                  coverageStatus: "partial",
                  coverageAmount: "50%",
                  coverageNote: "Интеграция с внешними системами",
                  sourceExcerpt: "Интеграция с внешними системами"
                }
              ],
              documentFindings: [],
              warnings: [],
              metadata: {
                model: "mock"
              }
            })
          }
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
});

assert.equal(generatedExpertStatePass.result.selectionCriteriaRows[0].coverageStatus, "");
assert.equal(generatedExpertStatePass.result.selectionCriteriaRows[0].coverageAmount, "");

let capturedStreamingRequest = null;
const streamingPass = await runDifyAnalysisPass({
  job: { id: "job-streaming" },
  record,
  env: {
    ...env,
    SCORING_DIFY_RESPONSE_MODE: "streaming"
  },
  fetchImpl: async (url, options) => {
    capturedStreamingRequest = {
      url,
      body: JSON.parse(options.body)
    };

    return new Response(
      [
        `data: ${JSON.stringify({ event: "workflow_started", task_id: "task-stream", workflow_run_id: "run-stream" })}`,
        "",
        `data: ${JSON.stringify({
          event: "workflow_finished",
          task_id: "task-stream",
          workflow_run_id: "run-stream",
          data: {
            id: "run-stream",
            workflow_id: "workflow-stream",
            status: "succeeded",
            outputs: {
              result: JSON.stringify({
                recordPatch: {
                  customer: "Потоковый заказчик"
                },
                selectionCriteriaRows: [],
                documentFindings: [
                  {
                    field: "customer",
                    documentId: "doc-1",
                    quote: "Потоковый заказчик",
                    note: "Найдено в документации"
                  }
                ],
                warnings: [],
                metadata: {
                  model: "mock-stream"
                }
              })
            }
          }
        })}`,
        "",
        "data: [DONE]",
        ""
      ].join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      }
    );
  }
});

assert.equal(capturedStreamingRequest.url, "https://dify.example/v1/workflows/run");
assert.equal(capturedStreamingRequest.body.response_mode, "streaming");
assert.equal(streamingPass.result.recordPatch.customer, "Потоковый заказчик");
assert.equal(streamingPass.result.analysisMetadata.dify.workflowRunId, "run-stream");

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: [
        "provider_descriptor",
        "payload_sanitizer",
        "contract_validator",
        "dify_client_mock",
        "dify_streaming_mock"
      ]
    },
    null,
    2
  )
);
