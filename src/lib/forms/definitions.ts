export type FormId = "personal" | "contract" | "waiver";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "tel" | "textarea";
  /** מאפשר לסמן "אין" במקום למלא (חובה למלא פרטים או לסמן אין) */
  allowNone?: boolean;
  /** חצי רוחב (שני שדות בשורה אחת) */
  half?: boolean;
}

export interface FormDef {
  id: FormId;
  title: string;
  short: string;
  intro?: string;
  fields: FieldDef[];
  /** פסקאות הטקסט המשפטי (מוצגות לפני החתימה) */
  paragraphs?: { heading?: string; body: string; note?: string }[];
  /** להציג את שדות המילוי לפני הטקסט (ברירת מחדל: אחריו) */
  fieldsFirst?: boolean;
  /** ה-PDF חייב להיכנס לעמוד A4 אחד (מוקטן אוטומטית אם צריך) */
  singlePage?: boolean;
  /** האם הטופס דורש אישור וחתימה */
  needsSignature: boolean;
  agreeLabel?: string;
}

export type FormValues = Record<string, string>;
export type AllForms = Record<FormId, FormValues>;

export const FORMS: FormDef[] = [
  {
    id: "personal",
    singlePage: true,
    title: "טופס פרטים אישיים",
    short: "פרטים אישיים",
    fields: [
      { key: "firstName", label: "שם פרטי", half: true },
      { key: "lastName", label: "שם משפחה", half: true },
      { key: "phone", label: "מס' טלפון", type: "tel" },
      { key: "address", label: "כתובת עדכנית" },
      { key: "emergencyContact", label: "שם ומס' טלפון של איש קשר (לשעת חירום)" },
      { key: "therapist", label: "מטפל/ת בפסיכותרפיה", allowNone: true },
      { key: "talemOfficer", label: 'קצין תל"ם (רלוונטי לחרבות ברזל)', allowNone: true },
      { key: "mentor", label: "חונכ/ת (אם יש)", allowNone: true },
      { key: "companion", label: "מלווה (אם יש)", allowNone: true },
      { key: "rehabContact", label: "איש קשר באגף השיקום", allowNone: true },
      { key: "psychiatrist", label: "פסיכיאטר", allowNone: true },
      { key: "notes", label: "פרטים נוספים חשובים", type: "textarea", allowNone: true },
    ],
    needsSignature: false,
  },
  {
    id: "contract",
    title: "חוזה טיפולי קבוצתי",
    short: "חוזה טיפולי",
    fields: [
      { key: "firstName", label: "שם פרטי", half: true },
      { key: "lastName", label: "שם משפחה", half: true },
    ],
    paragraphs: [
      { heading: "נוכחות ומחויבות למסגרת", body: "הפעילות בתכנית מתקיימת בימים ב', ג' ו-ד' בשעות 9:00-14:00. יש להגיע בזמן ולהישאר לאורך יום הפעילות כולו. במקרה של היעדרות יש לעדכן איש צוות לפני תחילת יום הפעילות. לאחר שלוש היעדרויות מצטברות תתקיים שיחת בירור. היעדרויות נוספות ללא תיאום ואישור עלולות להביא להפסקת ההשתתפות בתכנית." },
      { heading: "יציאה מוקדמת במהלך יום הפעילות", body: "יציאה מוקדמת תיעשה רק לאחר עדכון וקבלת אישור מאיש צוות. במקרה של הצפה, חרדה או קושי בוויסות, אין לעזוב את שטח החווה ללא מעבר דרך איש צוות. במידת הצורך תתאפשר הפסקה זמנית או חלופה לפעילות בתיאום עם הצוות." },
      { heading: "השתתפות בפעילויות ובקבוצות", body: "הנוכחות בפעילויות ובקבוצות היא חלק מהמחויבות לתכנית. אין חובה לדבר, לשתף או לחשוף תכנים אישיים, אך מצופה מכל משתתף להיות נוכח במרחב הפעילות. הימנעות מפעילות או יציאה ממנה תיעשה בתיאום עם איש צוות בלבד." },
      { heading: "שימוש בטלפונים ניידים", body: "במהלך קבוצות, סדנאות ופעילות מודרכת הטלפונים יהיו על מצב שקט וללא שימוש. שימוש בטלפון יתאפשר בהפסקות בלבד, למעט מקרה חריג שתואם מראש." },
      { heading: "תרופות, סמים, קנאביס ואלכוהול", body: "חל איסור להגיע לפעילות תחת השפעת אלכוהול או סמים וכן לעשות שימוש בסמים במסגרת התוכנית. אין לעשן במהלך קבוצות, סדנאות או פעילויות. עישון קנאביס רפואי וסיגריות יתאפשר בהפסקות בלבד ובפינת העישון המוגדרת. שימוש בקנאביס מותר רק למי שמחזיק ברישיון רפואי תקף.", note: "חל איסור מוחלט להעביר, לחלוק, לתת או למכור קנאביס, תרופות מרשם או חומרים אחרים בין משתתפים - גם מתוך כוונה לסייע." },
      { heading: "סודיות ופרטיות", body: "כל מידע אישי שעולה במסגרת הקבוצה נשאר בקבוצה. אין להעביר לאחרים מידע, סיפורים או פרטים הנוגעים למשתתפים אחרים. אין לצלם, להסריט, להקליט או לפרסם משתתפים ללא הסכמתם המפורשת.", note: "חובת הסודיות אינה חלה במצב שבו עולה חשש לסכנה לעצמו או לאחרים, ובמקרה כזה הצוות יפעל בהתאם לאחריותו המקצועית." },
      { heading: "כבוד הדדי וגבולות", body: "אין מקום לאלימות פיזית או מילולית, איומים, השפלה, הטרדה או התנהגות פוגענית. יש לכבד את הגבולות האישיים של חברי הקבוצה ולהימנע מלחץ לשתף, להיפגש או למסור מידע אישי. כל משתתף מתבקש להיות מודע למשך הזמן שבו הוא מדבר ולאפשר גם לאחרים מקום להשתתף.", note: "יש להימנע מתיאורים גרפיים מפורטים העלולים להציף אחרים." },
      { heading: "בטיחות ושמירה על המרחב המשותף", body: "המשתתפים מתבקשים לשמור על הציוד, על אזורי הפעילות ועל ניקיון המרחבים שבהם הם משתמשים. בעבודה עם כלי עבודה, ציוד ובעלי חיים יש לפעול בהתאם להנחיות הבטיחות והמדריכים.", note: "משתתף הנמצא בהצפה, חוסר ריכוז משמעותי או מצב שאינו מאפשר עבודה בטוחה מחויב לעדכן איש צוות ולא להשתמש בכלים או בציוד מסוכן." },
      { heading: "ערבות הדדית וקשרים בין חברי הקבוצה", body: "חברות ורעות הן חלק משמעותי מהקבוצה. כאשר משתתף מזהה שחבר נמצא במצוקה משמעותית או בסיכון, יש לערב איש צוות. פנייה לצוות במצב כזה היא חלק מהשמירה על החבר ולא פגיעה באמון." },
      { heading: "הפרת כללי המסגרת", body: "הפרת כללים תטופל בהתאם לחומרתה - בשיחת בירור והצבת גבול, ובמידת הצורך בהשעיה זמנית או בהפסקת ההשתתפות בתכנית.", note: "אלימות, סחר או העברת חומרים אסורים והתנהגות המסכנת אחרים ייחשבו להפרות חמורות וייבחנו באופן מיידי על ידי הצוות." },
      { heading: "התחייבות המשתתף", body: "קראתי והבנתי את כללי המסגרת, ואני מתחייב לפעול על פיהם כדי לשמור על המרחב הבטוח שלי ושל חבריי לקבוצה." },
    ],
    needsSignature: true,
    agreeLabel: "קראתי והבנתי את כללי המסגרת, ואני מתחייב/ת לפעול על פיהם",
  },
  {
    id: "waiver",
    title: "טופס ויתור סודיות רפואית",
    short: "ויתור סודיות",
    fieldsFirst: true,
    singlePage: true,
    fields: [
      { key: "firstName", label: "שם פרטי", half: true },
      { key: "lastName", label: "שם משפחה", half: true },
      { key: "idNumber", label: "מספר זהות" },
    ],
    paragraphs: [
      {
        body: "אני החתום/ה מטה נותן/ת בזאת רשות לחוות רום – מרכז חוסן לקבל ו/או למסור למשרד הבטחון, קופ\"ח, פסיכיאטר מטפל, מטפל רגשי, איש קשר בקהילה את כל המידע הרלוונטי על מצב בריאותי הנפשי או השיקומי.",
      },
      {
        body: "נותן רשותי לפסיכיאטר מטפל למסור/לקבל חומר רפואי אודותי לצוות מרכז חוסן ופותר אותו מהפרה של חובת הסודיות הרפואית.",
      },
      {
        body: "ידוע לי כי מסירת מידע בהתאם להסכמה שלי כפי שמופיעה במסמך זה אינה מהווה פגיעה אסורה בפרטיותי ואיננה מהווה הפרה של חובת הסודיות הרפואית, ולא תהיה לי כל טענה או תביעה בקשר למסירת מידע זה.",
      },
      {
        body: "כתב ויתור סודיות זה יהיה בתוקף שנה מיום חתימתו אלא אם כן נמסרה הודעה בכתב.",
      },
    ],
    needsSignature: true,
    agreeLabel: "קראתי והבנתי, ואני מאשר/ת את הוויתור על סודיות רפואית כאמור לעיל",
  },
];

export const EMPTY_FORMS: AllForms = { personal: {}, contract: {}, waiver: {} };

export const NONE_LABEL = "אין";

export function noneKey(key: string): string {
  return key + "_none";
}

/** הערך להצגה/שליחה: הטקסט שמולא, "אין" אם סומן, או ריק */
export function fieldValue(f: FieldDef, values: FormValues): string {
  if (f.allowNone && values[noneKey(f.key)] === "1") return NONE_LABEL;
  return values[f.key]?.trim() ?? "";
}

/** כל השדות חובה: מילוי, או סימון "אין" בשדות שמאפשרים זאת */
export function missingRequired(def: FormDef, values: FormValues): string[] {
  const missing = def.fields.filter((f) => !fieldValue(f, values)).map((f) => f.label);
  if (def.needsSignature) {
    if (values.agree !== "1") missing.push("אישור הסכמה");
    if (!values.signature) missing.push("חתימה");
  }
  return missing;
}

/** סיכום טקסטואלי קצר (גיבוי כשאי אפשר לשתף קובץ) */
export function formToText(def: FormDef, values: FormValues): string {
  const lines = [`*${def.title}*`];
  for (const f of def.fields) {
    const v = fieldValue(f, values);
    if (v) lines.push(`${f.label}: ${v}`);
  }
  if (def.needsSignature) {
    lines.push(values.agree === "1" ? "✔ " + (def.agreeLabel ?? "אושר") : "לא אושר");
    lines.push(values.signature ? "✍ נחתם (החתימה מצורפת ב-PDF)" : "לא נחתם");
  }
  return lines.join("\n");
}

export function fullName(values: FormValues): string {
  return [values.firstName, values.lastName].map((v) => v?.trim()).filter(Boolean).join(" ");
}
