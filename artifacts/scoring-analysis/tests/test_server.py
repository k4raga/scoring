import tempfile
import unittest
import zipfile
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class AnalysisServiceTests(unittest.TestCase):
    def test_safe_slug_keeps_cyrillic_and_fallback(self):
        self.assertEqual(server.safe_slug("МРИЯ smoke"), "МРИЯ-smoke")
        self.assertEqual(server.safe_slug("!!!", "fallback"), "fallback")

    def test_classify_technical_specification(self):
        documents = [
            {
                "id": "doc-001",
                "name": "1. Техническое задание.docx",
                "relativePath": "docs/1. Техническое задание.docx",
                "sourcePath": "source.docx",
                "mdPath": "doc.md",
                "mdHref": "http://127.0.0.1:4200/artifacts/run/normalized/doc.md",
                "extension": ".docx",
                "sizeBytes": 10,
                "text": "ТЕХНИЧЕСКОЕ ЗАДАНИЕ на оказание услуг",
            }
        ]

        classified = server.classify_documents(documents)

        self.assertEqual(classified[0]["type"], "technical_specification")
        self.assertGreaterEqual(classified[0]["confidence"], 0.9)

    def test_classify_procurement_notice_schedule_and_price_docs(self):
        documents = [
            {"id": "doc-001", "name": "Извещение.docx", "relativePath": "pkg/Извещение.docx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Извещение об осуществлении закупки"},
            {"id": "doc-002", "name": "Сроки.docx", "relativePath": "pkg/Сроки.docx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Окончание срока подачи заявок на участие в закупке"},
            {"id": "doc-003", "name": "Обоснование НМЦ.xlsx", "relativePath": "pkg/НМЦ/Обоснование НМЦ.xlsx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Начальная максимальная цена договора 25 416 000,00 руб."},
            {"id": "doc-004", "name": "izveshhenie-o-provedeniii-zakupki.docx", "relativePath": "pkg/izveshhenie-o-provedeniii-zakupki.docx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Извещение № 2026/07"},
            {"id": "doc-005", "name": "kalendarnyj-plan.docx", "relativePath": "pkg/kalendarnyj-plan.docx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Календарный план"},
            {"id": "doc-006", "name": "tz-prilozhenie-1.docx", "relativePath": "pkg/tz-prilozhenie-1.docx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Техническое задание"},
            {"id": "doc-007", "name": "Закупочная процедура (2026).docx", "relativePath": "pkg/Закупочная процедура (2026).docx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "ЗАКУПОЧНАЯ ПРОЦЕДУРА\nТекст объявления\nПриложение 1. Техническое задание."},
            {"id": "doc-008", "name": "Приложение 2. Дорожная карта.xlsx", "relativePath": "pkg/Приложение 2. Дорожная карта.xlsx", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Этап | Начало | Окончание"},
            {"id": "doc-009", "name": "57.01-2_26_45913 Запрос КП.pdf", "relativePath": "pkg/57.01-2_26_45913 Запрос КП.pdf", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "ЗАПРОС КОММЕРЧЕСКИХ ПРЕДЛОЖЕНИЙ\nпредмету: оказание услуг"},
            {"id": "doc-010", "name": "Приложение № 7 ОБЕСПЕЧЕНИЕ ИСПОЛНЕНИЯ ДОГОВОРА.pdf", "relativePath": "pkg/Приложение № 7 ОБЕСПЕЧЕНИЕ ИСПОЛНЕНИЯ ДОГОВОРА.pdf", "sourcePath": "", "mdPath": "", "mdHref": "", "text": "Обеспечение исполнения договора"},
        ]

        classified = server.classify_documents(documents)

        self.assertEqual(
            [document["type"] for document in classified],
            ["notice", "tender_schedule", "price_justification", "notice", "work_schedule", "technical_specification", "procurement_documentation", "work_schedule", "procurement_documentation", "contract_security"],
        )

    def test_extract_xlsx_text_reads_shared_strings_and_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workbook_path = Path(temp_dir) / "price.xlsx"
            with zipfile.ZipFile(workbook_path, "w") as workbook:
                workbook.writestr(
                    "xl/sharedStrings.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Начальная максимальная цена договора</t></si>
  <si><t>руб.</t></si>
</sst>""",
                )
                workbook.writestr(
                    "xl/worksheets/sheet1.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>25416000.00</v></c><c r="C1" t="s"><v>1</v></c></row>
  </sheetData>
</worksheet>""",
                )

            text = server.extract_xlsx_text(workbook_path)

        self.assertIn("Начальная максимальная цена договора", text)
        self.assertIn("25416000.00", text)

    def test_extract_money_near_does_not_fallback_to_unrelated_numbers(self):
        text = "Описание работ\nСтоимость внедрения по похожему проекту 298 688 руб.\nСрок выполнения работ"

        self.assertEqual(server.extract_money_near(text, ["начальной", "максимальной", "нмц"]), "")

    def test_extract_purchase_by_prefers_actual_status_over_toc(self):
        text = "\n".join(
            [
                "1.3. Правовой статус закупки3",
                "1.4. Национальный режим4",
                "Правовой статус закупки",
                "Закупка проводится в соответствии с Федеральным законом 223-ФЗ, Положением о закупке.",
                "Независимая гарантия оформляется по правилам 44-ФЗ.",
            ]
        )

        self.assertEqual(server.extract_purchase_by(text), "223-ФЗ / Положение о закупке")

    def test_build_record_patch_prefers_artifact_href(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            md_path = Path(temp_dir) / "doc-001.md"
            md_path.write_text(
                "\n".join(
                    [
                        "---",
                        "{}",
                        "---",
                        "ТЕХНИЧЕСКОЕ ЗАДАНИЕ оказания услуг ООО «МРИЯ»",
                        "Наименование услуг",
                        "Внедрение MDM и нормализация справочников",
                        "Сроки оказания услуг",
                        "Не более 9 месяцев с момента заключения договора.",
                        "Условия оплаты",
                        "Постоплата по результатам выполнения работ.",
                    ]
                ),
                "utf-8",
            )
            document = {
                "id": "doc-001",
                "name": "ТЗ.docx",
                "mdPath": str(md_path),
                "mdHref": "http://127.0.0.1:4200/artifacts/run/normalized/doc-001.md",
            }

            patch, fields = server.build_record_patch([document], {"title": "МРИЯ"}, "http://127.0.0.1:4200/artifacts/run/normalized/document-index.json")

        self.assertEqual(patch["customer"], "ООО «МРИЯ»")
        self.assertEqual(patch["purchaseBy"], "Нет информации")
        self.assertEqual(patch["technicalSpecificationUrl"], document["mdHref"])
        self.assertEqual(patch["workflow"]["analysis"]["documentIndex"], "http://127.0.0.1:4200/artifacts/run/normalized/document-index.json")
        self.assertIn("general", fields)

    def test_build_record_patch_extracts_network_company_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            docs = []
            fixtures = [
                (
                    "doc-001",
                    "Документация.docx",
                    "procurement_documentation",
                    "Документация о закупке\nВыполнение работ по разработке информационной системы «Экосистема искусственного интеллекта»\nПравовой статус закупки\nЗакупка проводится в соответствии с Федеральным законом 223-ФЗ, Положением о закупке.\nСведения о начальной (максимальной) цене договора:\n25 416 000,00 руб.\nУчастник закупки в составе своей заявки представляет обеспечение заявки в размере 508 320,00 рублей (2% от НМЦ).\nОбеспечение исполнения договора\nобеспечения исполнения договора в размере 5% от начальной (максимальной) цены договора",
                ),
                (
                    "doc-002",
                    "Сроки.docx",
                    "tender_schedule",
                    "Окончание срока подачи заявок на участие в закупке\n06.05.2026 10:00",
                ),
                (
                    "doc-003",
                    "Требования к работам.docx",
                    "technical_specification",
                    "Выполнение работ по разработке информационной системы «Экосистема искусственного интеллекта»\nСрок выполнения работ\nне более 6 месяцев",
                ),
            ]

            for doc_id, name, doc_type, text in fixtures:
                md_path = base / f"{doc_id}.md"
                md_path.write_text(f"---\n{{}}\n---\n\n{text}\n", "utf-8")
                docs.append({"id": doc_id, "name": name, "type": doc_type, "confidence": 0.9, "mdPath": str(md_path), "mdHref": f"http://host/{doc_id}.md"})

            patch, fields = server.build_record_patch(docs, {"title": "Сетевая компания"}, "http://host/index.json")

        self.assertEqual(patch["customer"], "")
        self.assertEqual(patch["projectTitle"], "Сетевая компания")
        self.assertEqual(patch["purchaseBy"], "223-ФЗ / Положение о закупке")
        self.assertEqual(patch["deadlineAt"], "2026-05-06T10:00:00+03:00")
        self.assertEqual(patch["nmc"], "25 416 000,00 руб.")
        self.assertEqual(patch["applicationSecurity"], "508 320,00 рублей")
        self.assertEqual(patch["contractSecurity"], "5% от НМЦ (25 416 000,00 руб.)")
        self.assertEqual(fields["general"]["deadlineAt"], "2026-05-06T10:00:00+03:00")

    def test_build_record_patch_extracts_eapo_notice_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            docs = []
            fixtures = [
                (
                    "doc-001",
                    "izveshhenie-o-provedeniii-zakupki-№-2026-7.docx",
                    "notice",
                    "\n".join(
                        [
                            "Извещение № 2026/07",
                            "Настоящая закупка в форме открытого конкурса проводится в соответствии с Основными принципами организации закупок товаров, работ и услуг.",
                            "2. Сведения о заказчике:",
                            "наименование: Евразийская патентная организация;",
                            "4. Сведения о начальной (максимальной) цене договора: начальная (максимальная) цена договора составляет 233 989 079 (двести тридцать три миллиона девятьсот восемьдесят девять тысяч семьдесят девять рублей) рублей 00 копеек.",
                            "6. Срок, место и порядок предоставления заявок на участие в закупке: заявки на участие в закупке представляются с «09» апреля 2026 г. по «29» апреля 2026 г. (до 14:30).",
                            "Заявка на участие в закупке может быть направлена заказчику заказным или ценным почтовым отправлением, либо она может быть доставлена заказчику курьером.",
                            "Участник закупки вправе изменить свою заявку на участие в закупке до истечения срока подачи заявок на участие в закупке.",
                        ]
                    ),
                ),
                (
                    "doc-002",
                    "proekt-dogovora-k-izveshheniyu-2026_07.docx",
                    "contract_draft",
                    "1.3. Сроки выполнения Работ:\nокончание – не позднее «____» ________202__ г. (определяется с учетом даты заключения Договора и сроков выполнения работ по этапам).",
                ),
                (
                    "doc-003",
                    "tz-prilozhenie-1-k-proektu-dogovora-2026_07.docx",
                    "technical_specification",
                    "Настоящее Техническое задание определяет цели и требования.",
                ),
            ]

            for doc_id, name, doc_type, text in fixtures:
                md_path = base / f"{doc_id}.md"
                md_path.write_text(f"---\n{{}}\n---\n\n{text}\n", "utf-8")
                docs.append({"id": doc_id, "name": name, "type": doc_type, "confidence": 0.9, "mdPath": str(md_path), "mdHref": f"http://host/{doc_id}.md"})

            patch, fields = server.build_record_patch(docs, {"title": "Евразийский патент"}, "http://host/index.json")

        self.assertEqual(patch["customer"], "Евразийская патентная организация")
        self.assertEqual(patch["projectTitle"], "Евразийский патент")
        self.assertEqual(patch["deadlineAt"], "2026-04-29T14:30:00+03:00")
        self.assertEqual(patch["nmc"], "233 989 079 руб.")
        self.assertEqual(patch["purchaseBy"], "Коммерческая закупка")
        self.assertEqual(patch["platformPayment"], "подача по почте")
        self.assertEqual(patch["applicationSecurity"], "-")
        self.assertEqual(patch["contractSecurity"], "-")
        self.assertEqual(patch["overallExecutionTerm"], "определяется с учетом даты заключения Договора и сроков выполнения работ по этапам")
        self.assertEqual(patch["contractTerm"], "определяется с учетом даты заключения Договора и сроков выполнения работ по этапам")
        self.assertEqual(patch["retrade"], "Возможна")
        self.assertEqual(patch["creative"], "Нет")
        self.assertEqual(patch["requirementsDocumentUrl"], "http://host/doc-001.md")
        self.assertEqual(patch["criteriaDocumentUrl"], "http://host/doc-001.md")
        self.assertEqual(patch["technicalSpecificationUrl"], "http://host/doc-003.md")
        self.assertEqual(fields["amounts"]["platformPayment"], "подача по почте")

    def test_build_record_patch_extracts_alfa_procurement_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            docs = []
            fixtures = [
                (
                    "doc-001",
                    "Закупочная процедура (2026).docx",
                    "procurement_documentation",
                    "\n".join(
                        [
                            "ЗАКУПОЧНАЯ ПРОЦЕДУРА №_____",
                            "АО «АльфаСтрахование», сообщает о проведении открытой закупочной процедуры по выбору партнера на разработку ЛК ЮЛ для страховой группы АльфаСтрахование.",
                            "Предмет договора — разработка ЛК для ЮЛ.",
                            "Срок заключения договора – до исполнения обязательств.",
                            "Платежные условия договора — Оплата работ осуществляется поэтапно, по результатам подписания акта приема-передачи по каждому завершённому этапу.",
                            "Конкурсные заявки могут быть поданы только через систему bidzaar.",
                            "Покупатель является коммерческой организацией, не подпадающей под действие федеральных законов № 44-ФЗ и № 223-ФЗ.",
                            "В рамках этапа можно подавать улучшенные коммерческие предложения в любой момент.",
                            "Этап 3 – Переторжка среди Участник, прошедших Квалификацию.",
                        ]
                    ),
                ),
                (
                    "doc-002",
                    "Приложение 1. Техническое задание.docx",
                    "technical_specification",
                    "Требования и концепции к разработке и внедрению проекта\nЗаказчик:АО «НПФ Альфа»",
                ),
                (
                    "doc-003",
                    "Приложение 2. Дорожная карта.xlsx",
                    "work_schedule",
                    "Этап | Проект | Начало | Окончание | Длительность, дней\n4 | Сдача проекта Заказчику | 46216 | 46230 | 14",
                ),
            ]

            for doc_id, name, doc_type, text in fixtures:
                md_path = base / f"{doc_id}.md"
                md_path.write_text(f"---\n{{}}\n---\n\n{text}\n", "utf-8")
                docs.append({"id": doc_id, "name": name, "type": doc_type, "confidence": 0.9, "mdPath": str(md_path), "mdHref": f"http://host/{doc_id}.md"})

            patch, fields = server.build_record_patch(docs, {"title": "тест2"}, "http://host/index.json")

        self.assertEqual(patch["projectTitle"], "тест2")
        self.assertEqual(patch["title"], "разработка ЛК для ЮЛ")
        self.assertEqual(patch["customer"], "АО «АльфаСтрахование»")
        self.assertEqual(patch["purchaseBy"], "Коммерческая закупка")
        self.assertEqual(patch["platformPayment"], "подача через bidzaar")
        self.assertEqual(patch["overallExecutionTerm"], "до 27.07.2026")
        self.assertEqual(patch["contractTerm"], "до исполнения обязательств")
        self.assertEqual(patch["retrade"], "Возможна")
        self.assertEqual(patch["requirementsDocumentUrl"], "http://host/doc-001.md")
        self.assertEqual(patch["criteriaDocumentUrl"], "http://host/doc-001.md")
        self.assertEqual(patch["technicalSpecificationUrl"], "http://host/doc-002.md")
        self.assertEqual(fields["tender"]["retrade"], "Возможна")

    def test_build_record_patch_extracts_dvizhenie_pdf_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            docs = []
            fixtures = [
                (
                    "doc-001",
                    "57.01-2_26_45913 Запрос КП.pdf",
                    "procurement_documentation",
                    "\n".join(
                        [
                            "ЗАПРОС КОММЕРЧЕСКИХ ПРЕДЛОЖЕНИЙ № 57.01-2/26/45913 от 08.04.2026",
                            "Заказчик: Общероссийское общественно-государственное движение детей и молодежи «Движение первых» (Движение Первых).",
                            "Место нахождения и почтовый адрес: 109028, г. Москва",
                            "проводит запрос коммерческих предложений по",
                            "предмету: оказание услуг по технической поддержке и сопровождению и выполнение работ по развитию и доработке информационной системы «Информационный портал для Движения Первых».",
                            "Сроки проведения запроса коммерческих предложений: установлены на электронной торговой площадке «Росэлторг» секция Росэлторг Бизнес: https://business.roseltorg.ru.",
                            "коммерческие предложения должны быть поданы посредством функционала ЭТП не позднее даты и времени, указанной на ЭТП;",
                        ]
                    ),
                ),
                (
                    "doc-002",
                    "Приложение № 1 Техническое задание 26-45913.pdf",
                    "technical_specification",
                    "1.1. Заказчик: Общероссийское общественно-государственное движение детей и молодежи «Движение первых»\n1.2. Предмет закупки : оказание услуг по технической поддержке и сопровождению и выполнение работ по развитию и доработке информационной системы «Информационный портал для Движения Первых».\n1.5.1. Срок оказания Услуг: с 01.06.2026 по 30.04.2027.",
                ),
                (
                    "doc-003",
                    "Приложение № 7 26-45913 (ОБЕСПЕЧЕНИЕ ИСПОЛНЕНИЯ ДОГОВОРА).pdf",
                    "contract_security",
                    "Обеспечение исполнения договора предоставляется в размере 5% от цены Договора.",
                ),
            ]

            for doc_id, name, doc_type, text in fixtures:
                md_path = base / f"{doc_id}.md"
                md_path.write_text(f"---\n{{}}\n---\n\n{text}\n", "utf-8")
                docs.append({"id": doc_id, "name": name, "type": doc_type, "confidence": 0.9, "mdPath": str(md_path), "mdHref": f"http://host/{doc_id}.md"})

            patch, fields = server.build_record_patch(docs, {"title": "тест3"}, "http://host/index.json")

        self.assertEqual(patch["customer"], "Общероссийское общественно-государственное движение детей и молодежи «Движение первых» (Движение Первых)")
        self.assertEqual(patch["projectTitle"], "тест3")
        self.assertEqual(patch["title"], "оказание услуг по технической поддержке и сопровождению и выполнение работ по развитию и доработке информационной системы «Информационный портал для Движения Первых»")
        self.assertEqual(patch["purchaseBy"], "Коммерческая закупка")
        self.assertEqual(patch["platformPayment"], "подача через Росэлторг")
        self.assertEqual(patch["overallExecutionTerm"], "с 01.06.2026 по 30.04.2027")
        self.assertEqual(patch["contractSecurity"], "5% от НМЦ")
        self.assertEqual(patch["technicalSpecificationUrl"], "http://host/doc-002.md")
        self.assertEqual(fields["amounts"]["platformPayment"], "подача через Росэлторг")


if __name__ == "__main__":
    unittest.main()
