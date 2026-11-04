# תוכנית: הורדת אישורי נוכחות ונסיעות בפורמט PDF (בודד ומרובה)

## מטרה
1. בכל מקום שבו מפיקים היום אישור נוכחות / שהייה / נסיעות ב-Word, תהיה גם אפשרות להוריד **PDF**.
2. במצב הניהול (הפקה מרובה) אפשר לבחור **פורמט** (Word / PDF) ו**אילו משתתפים** להפיק, ולהוריד ZIP או קובץ PDF מאוחד.

## המצב היום (ממצאי סריקה)
- **מחוללי Word:** `src/lib/word-generator.ts`
  - `generateStayCertificateWord` (שורה 779) – אישור שהייה.
  - `generateTravelReimbursementWord` (שורה 849) – החזר נסיעות.
  - `generateAttendanceReportWord` (שורה 955) – אישור נוכחות.
  - `generateDocxBlobWithLetterhead` (שורה 149) – ממזג את הגוף לתוך נייר המכתבים `public/דף לוגו ריק.docx`.
- **דף מטופל:** `src/app/patients/[id]/page.tsx`, לשונית "אישורים" (שורות 2322–2410).
  - `executePDFGeneration` (שורות 534–660) כבר מנסה להפיק PDF: בונה docx ושולח ל-`/api/convert-to-pdf` (שורה 608) — **הנתיב הזה לא קיים בריפו**, ולכן מסלול ה-PDF כנראה שבור היום.
  - קיימת תבנית HTML נסתרת לתצוגה מקדימה (שורות ~2511–2730) עם עיצוב inline.
- **הפקה מרובה:** `src/app/admin/bulk-travel/page.tsx` (`generateAll` שורות 390–475) ו-`src/app/admin/bulk-stay/page.tsx` (`generateAll` ~331–383). שתיהן מפיקות docx לכל השורות ומורידות ZIP (JSZip). **אין בחירה לפי שורה** — רק תוכנית/קבוצה/חודשים.
- **PDF קיים בפרויקט:** `jspdf`, `jspdf-autotable`, `html2canvas`, `jszip` כבר מותקנים. דוגמה לעברית עם גופן מוטמע: `src/lib/pdf/shoppingListPdf.ts` (Heebo מ-`public/Heebo-*.ttf`, פונקציית `rtl()`). עזר הורדה: `src/lib/pdf/downloadPdfHelper.ts`.

## החלטה טכנית: איך מייצרים PDF
| אפשרות | יתרון | חיסרון |
|---|---|---|
| א. המרת docx ל-PDF בשרת (LibreOffice) | זהה ל-Word | דורש שרת עם LibreOffice; לא זמין ב-Vercel רגיל |
| ב. jsPDF עם טקסט + היפוך עברית (`rtl()`) | קובץ קטן, טקסט ניתן לבחירה | היפוך מילים שביר בטקסט מעורב (מספרים, ת"ז, תאריכים), יישור פסקאות ידני |
| **ג. תבנית HTML ← html2canvas ← jsPDF (בצד הלקוח)** | הדפדפן מטפל ב-RTL ובגופנים נכון; ספריות קיימות; אין צורך בשרת | הטקסט הוא תמונה (קובץ גדול יותר, ~200–400KB לעמוד) |

**המלצה: אפשרות ג.** היא אמינה לעברית, עובדת בלי תשתית חדשה, ומאפשרת שימוש חוזר באותה תבנית לבודד ולמרובה. אם בעתיד יידרש טקסט ניתן לחיפוש — אפשר לעבור לאפשרות א' בלי לשנות את הממשק.

## שלבי מימוש

### שלב 1 – תבנית HTML משותפת לאישורים
- קובץ חדש: `src/lib/pdf/certificateTemplates.ts` – פונקציות טהורות שמקבלות את אותם טיפוסי נתונים של מחוללי ה-Word (`StayCertData`, `TravelReimbData`, `AttendanceReportData`) ומחזירות מחרוזת HTML (A4, `dir="rtl"`, גופן Heebo/Assistant).
- להוציא את תבנית ה-HTML הנסתרת מ-`patients/[id]/page.tsx` (שורות ~2541–2730) לקובץ הזה, כדי שתהיה מקור אמת אחד.
- **נייר מכתבים:** לייצא פעם אחת את הכותרת/תחתית מ-`דף לוגו ריק.docx` לתמונת PNG ב-`public/letterhead-header.png` ו-`public/letterhead-footer.png` ולהציג אותן בתבנית. (חלופה: לחלץ את `word/media/*` מה-docx בזמן ריצה עם `pizzip` — מסובך יותר, רק אם נייר המכתבים משתנה לעיתים קרובות.)
- טבלת תאריכי נוכחות ארוכה: לתמוך בפיצול לכמה עמודים (שבירת עמוד לפי מספר שורות קבוע).

### שלב 2 – מחולל PDF
- קובץ חדש: `src/lib/pdf/certificatePdf.ts`:
  - `renderHtmlToPdfPages(html): Promise<jsPDF>` – יוצר קונטיינר מחוץ למסך, ממתין לטעינת גופנים ותמונות (`document.fonts.ready`), מצלם כל `.page` עם `html2canvas` (scale 2) ומוסיף ל-jsPDF כ-JPEG (איכות 0.85 לצמצום גודל), ואז מסיר את הקונטיינר.
  - `generateStayCertificatePdf(data)`, `generateTravelReimbursementPdf(data)`, `generateAttendanceReportPdf(data)` → `Promise<Blob>`.
  - `appendToPdf(doc, html)` – לשימוש באיחוד מספר אישורים לקובץ אחד.
- הגדרת `next/dynamic`/import דינמי ל-`html2canvas` ו-`jspdf` כדי לא להגדיל את הבאנדל הראשי.

### שלב 3 – הורדה בודדת (דף מטופל)
- בלשונית "אישורים": ליד כל כפתור הפקה, בורר פורמט **Word / PDF** (או שני כפתורים).
- להחליף ב-`executePDFGeneration` את הקריאה ל-`/api/convert-to-pdf` במחולל משלב 2. ההמשך הקיים (הורדה, העלאה ל-Storage `documents/${patientId}/...pdf`, רישום ב-`documents` ו-`notifications`) נשמר.
- הורדה דרך `openOrDownloadPdf` הקיים (תומך במובייל/iOS).
- שמות קבצים: `אישור_נסיעות_<שם>_<חודש>.pdf`, `אישור_נוכחות_<שם>_<חודש>.pdf`.

### שלב 4 – הפקה מרובה במצב ניהול
בקבצים `admin/bulk-travel/page.tsx` ו-`admin/bulk-stay/page.tsx` (ואם יידרש — עמוד מרובה חדש לאישורי נוכחות, באותו מבנה):
1. **בחירת שורות:** state חדש `selectedIds: Set<string>` בטבלת התצוגה המקדימה (שלב 3 של האשף, שורה ~670): checkbox לכל שורה + "בחר הכל / נקה", ומונה "נבחרו X מתוך Y". ברירת מחדל: הכל מסומן.
2. **בורר פורמט:** `Word (ZIP)` / `PDF (ZIP)` / `PDF מאוחד (קובץ אחד)`.
3. **`generateAll`:** לרוץ רק על השורות שנבחרו; לפי הפורמט לקרוא למחולל Word הקיים או למחולל PDF; ב-"PDF מאוחד" — להוסיף עמודים לאותו `jsPDF` ולשמור פעם אחת.
4. **ביצועים:** עיבוד סדרתי (לא `Promise.all`) כדי לא לחנוק את הזיכרון ב-html2canvas; פס התקדמות "מפיק 7/40"; כפתור ביטול (דגל `abortRef`).
5. **שגיאות:** כשל באישור אחד לא עוצר את השאר; בסוף מוצגת רשימת שורות שנכשלו.
6. כפתור "הפקת אישורי נסיעות (ZIP)" (שורה 751) משנה תווית לפי הפורמט שנבחר.

### שלב 5 – בדיקות
- `tests/certificateTemplates.test.ts` (tsx --test): התבנית מכילה שם, ת"ז, חודש ותאריכים נכונים; פיצול עמודים לטבלה ארוכה.
- בדיקה ידנית עם Playwright: הפקת PDF בודד ו-ZIP של 3 משתתפים, פתיחת הקבצים ובדיקה שהעברית מוצגת נכון (כיוון, ניקוד מספרים, ת"ז).
- בדיקה במובייל (iOS Safari) של ההורדה.

## קבצים מושפעים
| קובץ | שינוי |
|---|---|
| `src/lib/pdf/certificateTemplates.ts` | חדש |
| `src/lib/pdf/certificatePdf.ts` | חדש |
| `public/letterhead-header.png`, `public/letterhead-footer.png` | חדש |
| `src/app/patients/[id]/page.tsx` | בורר פורמט, החלפת `/api/convert-to-pdf`, הסרת התבנית הנסתרת |
| `src/app/admin/bulk-travel/page.tsx` | בחירת שורות, בורר פורמט, PDF |
| `src/app/admin/bulk-stay/page.tsx` | אותו דבר |
| `tests/certificateTemplates.test.ts` | חדש |

## שאלות פתוחות
1. האם "אישור נוכחות" במצב ניהול הוא אישור השהייה הקיים (`bulk-stay`) או שנדרש עמוד מרובה חדש ל-`generateAttendanceReportWord`?
2. האם `/api/convert-to-pdf` קיים בשירות חיצוני (פריסה אחרת)? אם כן — אפשר לשקול להשאיר אותו כמסלול איכות גבוהה.
3. האם PDF שהוא תמונה (ללא טקסט ניתן לבחירה) מקובל על הגורמים המקבלים (ביטוח לאומי / משרד הבריאות)?
4. האם להעלות גם את קובצי ה-PDF המרובים ל-Storage ולרשום ב-`documents` לכל מטופל, כמו בהפקה הבודדת?

## סדר עבודה מומלץ
שלב 1 → 2 → 3 (מאפשר לבדוק את איכות ה-PDF על אישור בודד) → 4 → 5.
