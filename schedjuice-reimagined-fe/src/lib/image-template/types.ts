export type TemplateKind = "award" | "id_card";

export type AwardFieldKey =
  | "student_name"
  | "award_title"
  | "period"
  | "course_name"
  | "pronoun"
  | "current_date"
  | "mt_name";

export type IdCardFieldKey =
  | "name"
  | "class"
  | "course_title"
  | "registration"
  | "academic_year"
  | "expires";

export type TextAlign = "left" | "center" | "right";

export type LayerBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
};

export type TextStyleFields = {
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: "bold" | "italic" | "normal";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  align?: TextAlign;
};

export type TextLayer = LayerBase &
  TextStyleFields & {
    type: "text";
    text: string;
  };

export type FieldLayer = LayerBase &
  TextStyleFields & {
    type: "field";
    field: AwardFieldKey | IdCardFieldKey;
    template?: string;
  };

export type PhotoLayer = LayerBase & {
  type: "photo";
  photoKind: "award_image" | "id_image";
  borderRadiusPt?: number;
  removeBackground?: boolean;
};

export type SignatureLayer = LayerBase & {
  type: "signature";
  bind: { kind: "mt" } | { kind: "user"; user_id: number };
};

export type NamedPersonLayer = LayerBase &
  TextStyleFields & {
    type: "named_person";
    user_id: number;
    template?: string;
  };

export type QrLayer = LayerBase & {
  type: "qr";
};

export type Layer =
  | TextLayer
  | FieldLayer
  | PhotoLayer
  | SignatureLayer
  | NamedPersonLayer
  | QrLayer;

export type PagePreset =
  | "original"
  | "hd_16_9"
  | "a4_landscape"
  | "id_cr80_portrait"
  | "id_cr80_landscape"
  | "custom";

export type BackgroundFill = {
  url: string | null;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type AwardDocument = {
  version: 1;
  kind: "award";
  unit: "px";
  width: number;
  height: number;
  pagePreset: "original" | "hd_16_9" | "a4_landscape" | "custom";
  background: BackgroundFill;
  layers: Layer[];
};

export type IdCardDocument = {
  version: 1;
  kind: "id_card";
  unit: "in";
  width: number;
  height: number;
  dpi: 300;
  pagePreset: "id_cr80_portrait" | "id_cr80_landscape";
  background: { front: BackgroundFill; back: BackgroundFill };
  faces: { front: Layer[]; back: Layer[] };
};

export type TemplateDocument = AwardDocument | IdCardDocument;

export type PaletteItem = {
  key: string;
  label: string;
  visual?: "text" | "image";
};
