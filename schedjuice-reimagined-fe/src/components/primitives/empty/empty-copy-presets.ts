import type { EmptyCopySlots } from "./empty-copy-slots";

export const EMPTY_COPY_PRESETS = {
  nothingHere: {
    enBefore: "Nothing ",
    enHighlight: "here",
    enAfter: " yet",
    myBefore: "ဘာမှ ",
    myHighlight: "မရှိ",
    myAfter: " သေးပါ",
  } satisfies EmptyCopySlots,

  notEnrolled: {
    enBefore: "Not enrolled ",
    enHighlight: "yet",
    enAfter: "",
    myBefore: "စာရင်းမသွင်းရ",
    myHighlight: "သေး",
    myAfter: "",
  } satisfies EmptyCopySlots,

  noUsers: {
    enBefore: "No ",
    enHighlight: "users",
    enAfter: " found",
    myBefore: "အသုံးပြုသူ ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noMatchBase: {
    enBefore: "No ",
    enHighlight: "match",
    enAfter: "",
    myBefore: "",
    myHighlight: "မတွေ့",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noPayments: {
    enBefore: "No ",
    enHighlight: "payments",
    enAfter: " for this student",
    myBefore: "ငွေပေးချေမှု ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noHistory: {
    enBefore: "No course ",
    enHighlight: "history",
    enAfter: " found",
    myBefore: "သင်တန်းမှတ်တမ်း ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  nothingNew: {
    enBefore: "Nothing ",
    enHighlight: "new",
    enAfter: " right now",
    myBefore: "",
    myHighlight: "အသစ်",
    myAfter: "ဘာမှမရှိ",
  } satisfies EmptyCopySlots,

  noCoursesFound: {
    enBefore: "No ",
    enHighlight: "courses",
    enAfter: " found",
    myBefore: "အတန်း ",
    myHighlight: "မတွေ့",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noSessions: {
    enBefore: "No ",
    enHighlight: "sessions",
    enAfter: " yet",
    myBefore: "သင်ခန်းစာ ",
    myHighlight: "မရှိ",
    myAfter: "သေးပါ",
  } satisfies EmptyCopySlots,

  noAnnouncements: {
    enBefore: "No ",
    enHighlight: "announcements",
    enAfter: " yet",
    myBefore: "ကြေညာချက် ",
    myHighlight: "မရှိ",
    myAfter: "သေးပါ",
  } satisfies EmptyCopySlots,

  noStudentsToMark: {
    enBefore: "No students to ",
    enHighlight: "mark",
    enAfter: "",
    myBefore: "မှတ်ရန် ကျောင်းသား ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noAwardsThisPeriod: {
    enBefore: "No awards ",
    enHighlight: "this period",
    enAfter: "",
    myBefore: "ယခုကာလ ",
    myHighlight: "ဆုများ",
    myAfter: " မရှိသေးပါ",
  } satisfies EmptyCopySlots,

} as const;
