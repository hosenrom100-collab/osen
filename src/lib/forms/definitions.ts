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
  paragraphs?: { heading?: string; body: string }[];
  /** האם הטופס דורש אישור וחתימה */
  needsSignature: boolean;
  agreeLabel?: string;
}

export type FormValues = Record<string, string>;
export type AllForms = Record<FormId, FormValues>;

export const FORMS: FormDef[] = [
  {
    id: "personal",
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
    title: "חוזה טיפולי",
    short: "חוזה טיפולי",
    intro: "טיוטה – יש להחליף את הנוסח בנוסח הסופי של המרכז לפני הפצה.",
    fields: [
      { key: "firstName", label: "שם פרטי", half: true },
      { key: "lastName", label: "שם משפחה", half: true },
      { key: "idNumber", label: "מס' תעודת זהות" },
    ],
    paragraphs: [
      {
        heading: "1. מטרת ההסכם",
        body: "הסכם זה מסדיר את ההשתתפות שלי בפעילות הטיפולית-שיקומית במרכז חוסן, חוות רום (להלן: \"המרכז\"), ואת ההסכמות ההדדיות בין המרכז לביני.",
      },
      {
        heading: "2. השתתפות והתמדה",
        body: "אני מתחייב/ת להגיע לפעילויות שנקבעו עבורי, ובמקרה של אי-הגעה או איחור – לעדכן את צוות המרכז מראש ככל האפשר.",
      },
      {
        heading: "3. התנהלות",
        body: "אני מתחייב/ת לשמור על כבוד הדדי כלפי המשתתפים והצוות, להימנע מאלימות פיזית או מילולית, ולהימנע מהגעה תחת השפעת אלכוהול או סמים.",
      },
      {
        heading: "4. בטיחות ובריאות",
        body: "ידוע לי שהפעילות כוללת עבודה בחווה ובטבע. אני מצהיר/ה כי עדכנתי את הצוות בכל מגבלה רפואית או נפשית רלוונטית, ואעדכן בכל שינוי.",
      },
      {
        heading: "5. הפסקת ההשתתפות",
        body: "ידוע לי כי המרכז רשאי להפסיק או להתאים את ההשתתפות שלי במקרה של הפרת ההסכם, וכי אני רשאי/ת להפסיק את השתתפותי בכל עת בהודעה לצוות.",
      },
    ],
    needsSignature: true,
    agreeLabel: "קראתי, הבנתי ואני מסכים/ה לתנאי החוזה הטיפולי",
  },
  {
    id: "waiver",
    title: "ויתור סודיות",
    short: "ויתור סודיות",
    intro: "טיוטה – יש להחליף את הנוסח בנוסח הסופי של המרכז לפני הפצה.",
    fields: [
      { key: "firstName", label: "שם פרטי", half: true },
      { key: "lastName", label: "שם משפחה", half: true },
      { key: "idNumber", label: "מס' תעודת זהות" },
      {
        key: "recipients",
        label: "גורמים שאליהם מותר להעביר מידע (למשל: מטפל/ת, קצין תל\"ם, אגף השיקום)",
        type: "textarea",
        allowNone: true,
      },
    ],
    paragraphs: [
      {
        body: "אני החתום/ה מטה נותן/ת בזאת את הסכמתי לכך שצוות מרכז חוסן, חוות רום, יעביר מידע הנוגע להשתתפותי, להתקדמותי ולמצבי הכללי לגורמים המטפלים והמלווים אותי כמפורט לעיל, ולגורמים אלה בלבד.",
      },
      {
        body: "ידוע לי כי העברת המידע נועדה לצורך תיאום הטיפול והשיקום שלי, וכי המידע יימסר במידה הנדרשת למטרה זו בלבד.",
      },
      {
        body: "ידוע לי כי ההסכמה ניתנת מרצוני החופשי, וכי אני רשאי/ת לבטלה בכל עת בהודעה בכתב לצוות המרכז, מבלי שהדבר יפגע בהשתתפותי.",
      },
    ],
    needsSignature: true,
    agreeLabel: "אני מאשר/ת את הוויתור על סודיות בהתאם לאמור לעיל",
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
