export interface ParticipantProfile {
  emotional: "anxious" | "depressed" | "unstable" | "stable" | "";
  family: "supported" | "complex" | "isolated" | "";
  personality: "adaptive" | "difficulty" | "introverted" | "motivated" | "";
  farmAreas: string[];
  regulation: "stable" | "dysregulated" | "sensory" | "overwhelmed" | "";
  social: "connected" | "isolated" | "needs_mediation" | "leader" | "";
  trust: "trusting" | "suspicious" | "gradual" | "avoidant" | "";
  attendance: "regular" | "absences" | "unstable" | "";
  difficulties: string[];
  futureDirection: "supported_employment" | "continued_therapeutic" | "gradual_independence" | "too_early" | "";
  processStage: "early" | "stabilizing" | "transitioning" | "";
}

export const EMPTY_PROFILE: ParticipantProfile = {
  emotional: "",
  family: "",
  personality: "",
  farmAreas: [],
  regulation: "",
  social: "",
  trust: "",
  attendance: "",
  difficulties: [],
  futureDirection: "",
  processStage: "",
};

export interface SurveyOption {
  id: string;
  label: string;
}

export const EMOTIONAL_OPTIONS: SurveyOption[] = [
  { id: "anxious", label: "חרדתי ומתוח" },
  { id: "depressed", label: "דיכאוני ומסתגר" },
  { id: "unstable", label: "תנודתי וסוער" },
  { id: "stable", label: "יציב ומאוזן יחסית" },
];

export const FAMILY_OPTIONS: SurveyOption[] = [
  { id: "supported", label: "עטוף ותומך מאוד" },
  { id: "complex", label: "מתוחה או מורכבת" },
  { id: "isolated", label: "בדידות / חוסר תמיכה" },
];

export const PERSONALITY_OPTIONS: SurveyOption[] = [
  { id: "adaptive", label: "מסתגל ומשתף פעולה בקלות" },
  { id: "difficulty", label: "מתקשה להסתגל לשינויים" },
  { id: "introverted", label: "מופנם, ביישן וחששן" },
  { id: "motivated", label: "מוטיבציה גבוהה לעשייה" },
];

export const FARM_AREA_OPTIONS: SurveyOption[] = [
  { id: "agriculture", label: "חקלאות, חממות ומשתלה" },
  { id: "animals", label: "טיפול בבעלי חיים ואורווה" },
  { id: "ancient_crafts", label: "מלאכות קדומות" },
  { id: "ceramics", label: "קרמיקה" },
  { id: "yoga", label: "יוגה" },
  { id: "grazing", label: "מרעה" },
  { id: "art", label: "אומנות" },
];

export const REGULATION_OPTIONS: SurveyOption[] = [
  { id: "stable", label: "ויסות תקין ומאוזן" },
  { id: "dysregulated", label: "קושי בויסות (כעס/עוררות)" },
  { id: "sensory", label: "רגישות חושית גבוהה (רעש/ריח)" },
  { id: "overwhelmed", label: "נטייה להצפה דיסוציאטיבית" },
];

export const SOCIAL_OPTIONS: SurveyOption[] = [
  { id: "connected", label: "משתלב חברתית ויוצר קשר בקלות" },
  { id: "isolated", label: "נוטה להתבודד ומעדיף לעבוד לבד" },
  { id: "needs_mediation", label: "מעוניין בקשר אך זקוק לתיווך" },
  { id: "leader", label: "מנהיג חיובי ויוזם שיתופי פעולה" },
];

export const TRUST_OPTIONS: SurveyOption[] = [
  { id: "trusting", label: "נותן אמון ומסתייע בקלות" },
  { id: "suspicious", label: "חשדן ומתקשה לתת אמון" },
  { id: "gradual", label: "רוכש אמון בהדרגה ואיטיות" },
  { id: "avoidant", label: "נמנע מקשר קרוב או שיתוף רגשי" },
];

export const ATTENDANCE_OPTIONS: SurveyOption[] = [
  { id: "regular", label: "נוכחות רציפה ומחויבות גבוהה" },
  { id: "absences", label: "חיסורים מרובים עקב מצב נפשי/פיזי" },
  { id: "unstable", label: "נוכחות תנודתית עם נסיונות גיוס עצמי" },
];

export const DIFFICULTY_OPTIONS: SurveyOption[] = [
  { id: "flashbacks", label: "פלאשבקים" },
  { id: "nightmares", label: "בעיות שינה/סיוטים" },
  { id: "concentration", label: "קשיי קשב/מיקוד" },
  { id: "authority", label: "קושי עם סמכות" },
  { id: "transit", label: "נמנע מתחבורה" },
  { id: "worthlessness", label: "דימוי עצמי נמוך" },
];

export const FUTURE_DIRECTION_OPTIONS: SurveyOption[] = [
  { id: "supported_employment", label: "תעסוקה נתמכת בעתיד" },
  { id: "continued_therapeutic", label: "המשך טיפולי-שיקומי בחווה" },
  { id: "gradual_independence", label: "עצמאות והתנתקות הדרגתית" },
  { id: "too_early", label: "מוקדם מדי לקבוע כיוון" },
];

export const PROCESS_STAGE_OPTIONS: SurveyOption[] = [
  { id: "early", label: "תחילת דרך והיכרות" },
  { id: "stabilizing", label: "באמצע תהליך והתייצבות" },
  { id: "transitioning", label: "לקראת מעבר או סיום" },
];

export interface SurveyQuestionDef {
  key: keyof ParticipantProfile;
  title: string;
  options: SurveyOption[];
  multi: boolean;
}

export const SURVEY_QUESTIONS: SurveyQuestionDef[] = [
  { key: "emotional", title: "1. מצב רגשי דומיננטי:", options: EMOTIONAL_OPTIONS, multi: false },
  { key: "family", title: "2. תמיכה משפחתית:", options: FAMILY_OPTIONS, multi: false },
  { key: "personality", title: "3. הסתגלות למסגרת ואופי:", options: PERSONALITY_OPTIONS, multi: false },
  { key: "farmAreas", title: "4. תחומי פעילות בחווה:", options: FARM_AREA_OPTIONS, multi: true },
  { key: "regulation", title: "5. ויסות רגשי וחושי:", options: REGULATION_OPTIONS, multi: false },
  { key: "social", title: "6. קשר עם משתתפים אחרים:", options: SOCIAL_OPTIONS, multi: false },
  { key: "trust", title: "7. רמת אמון ופתיחות לצוות:", options: TRUST_OPTIONS, multi: false },
  { key: "attendance", title: "8. נוכחות והתמדה בחווה:", options: ATTENDANCE_OPTIONS, multi: false },
  { key: "difficulties", title: "9. קשיים ותסמינים בולטים (בחירה מרובה):", options: DIFFICULTY_OPTIONS, multi: true },
  { key: "futureDirection", title: "10. כיוון עתידי מסתמן:", options: FUTURE_DIRECTION_OPTIONS, multi: false },
  { key: "processStage", title: "11. שלב בתהליך:", options: PROCESS_STAGE_OPTIONS, multi: false },
];

export function isProfileComplete(profile: ParticipantProfile): boolean {
  return (
    profile.emotional !== "" &&
    profile.family !== "" &&
    profile.personality !== "" &&
    profile.regulation !== "" &&
    profile.social !== "" &&
    profile.trust !== "" &&
    profile.attendance !== "" &&
    profile.futureDirection !== "" &&
    profile.processStage !== ""
  );
}
