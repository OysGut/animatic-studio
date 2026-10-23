// i18n-ignore-file – innholdet i eksempelprosjektet (brukerinnhold i fire språkversjoner, ikke grensesnittekst)
/**
 * G-9: et kort, originalt og rettighetsfritt eksempelmanus («The Paper Kite»), skrevet for From Pen to Glass.
 * Fem scener, to karakterer, ca. 2,5 minutter. Fire språkversjoner: engelsk (kilde), japansk, spansk og norsk.
 * Brukes aldri til noe annet enn eksempelprosjektet; inneholder ingen tekst fra andre manus.
 */

export const DEMO_LANGUAGES = ["en", "ja", "es", "nb"] as const;
export type DemoLanguage = (typeof DEMO_LANGUAGES)[number];
export type DemoText = Readonly<Record<DemoLanguage, string>>;

export interface DemoBlock {
  readonly kind: "action" | "character" | "dialogue" | "parenthetical";
  readonly text: DemoText;
}

export interface DemoScene {
  readonly key: string;
  readonly intExt: DemoText;
  readonly location: DemoText;
  readonly time: DemoText;
  /** Lokasjonsressursen scenen foregår i. */
  readonly place: DemoPlaceKey;
  /** Karakterene som er med (for monteringen). */
  readonly cast: readonly DemoCharacterKey[];
  /** Varighet i sekunder. */
  readonly seconds: number;
  readonly blocks: readonly DemoBlock[];
}

export type DemoCharacterKey = "mira" | "otto";
export type DemoPlaceKey = "roof" | "stairs" | "workshop";

export const DEMO_TITLE: DemoText = {
  en: "The Paper Kite (example)",
  ja: "紙のたこ（サンプル）",
  es: "La cometa de papel (ejemplo)",
  nb: "Papirdragen (eksempel)",
};

export const DEMO_CHARACTERS: Readonly<Record<DemoCharacterKey, { name: DemoText; description: DemoText; color: string }>> = {
  mira: {
    name: { en: "MIRA", ja: "ミラ", es: "MIRA", nb: "MIRA" },
    description: {
      en: "Ten years old, curious and impatient. Builds things from whatever she finds.",
      ja: "十歳。好奇心が強く、せっかち。見つけたもので何でも作る。",
      es: "Diez años, curiosa e impaciente. Construye cosas con lo que encuentra.",
      nb: "Ti år, nysgjerrig og utålmodig. Bygger ting av det hun finner.",
    },
    color: "#e2a33b",
  },
  otto: {
    name: { en: "OTTO", ja: "オットー", es: "OTTO", nb: "OTTO" },
    description: {
      en: "Her downstairs neighbour, a retired bicycle mechanic with steady hands.",
      ja: "下の階に住む隣人。手先の確かな、引退した自転車整備士。",
      es: "Su vecino de abajo, un mecánico de bicicletas jubilado de manos firmes.",
      nb: "Naboen i etasjen under, en pensjonert sykkelmekaniker med stødige hender.",
    },
    color: "#4f7fb8",
  },
};

export const DEMO_PLACES: Readonly<Record<DemoPlaceKey, { name: DemoText; description: DemoText; sky: string; ground: string }>> = {
  roof: {
    name: { en: "Rooftop garden", ja: "屋上の庭", es: "Jardín en la azotea", nb: "Takhagen" },
    description: {
      en: "A small garden on a flat roof: planters, a washing line, a low railing and a wide sky.",
      ja: "平らな屋上の小さな庭。プランター、物干し、低い手すり、広い空。",
      es: "Un pequeño jardín en una azotea: macetas, un tendedero, una barandilla baja y un cielo amplio.",
      nb: "En liten hage på et flatt tak: plantekasser, en klessnor, et lavt rekkverk og en stor himmel.",
    },
    sky: "#9cc9e8",
    ground: "#6f9a5b",
  },
  stairs: {
    name: { en: "Stairwell", ja: "階段", es: "Escalera", nb: "Trappeoppgangen" },
    description: {
      en: "A narrow stairwell with a tall window and worn wooden steps.",
      ja: "高い窓と使い込まれた木の段がある、狭い階段。",
      es: "Una escalera estrecha con una ventana alta y peldaños de madera gastados.",
      nb: "En smal trappeoppgang med et høyt vindu og slitte tretrinn.",
    },
    sky: "#d9c7a8",
    ground: "#8a6a4a",
  },
  workshop: {
    name: { en: "Otto's workshop", ja: "オットーの作業場", es: "El taller de Otto", nb: "Ottos verksted" },
    description: {
      en: "A tidy room full of tools, bicycle wheels on the wall and a warm lamp over the workbench.",
      ja: "工具がそろった整頓された部屋。壁には自転車の車輪、作業台には暖かいランプ。",
      es: "Un cuarto ordenado lleno de herramientas, ruedas de bicicleta en la pared y una lámpara cálida.",
      nb: "Et ryddig rom fullt av verktøy, sykkelhjul på veggen og en varm lampe over arbeidsbenken.",
    },
    sky: "#c9b48a",
    ground: "#7a5a3a",
  },
};

const INT: DemoText = { en: "INT.", ja: "内", es: "INT.", nb: "INT." };
const EXT: DemoText = { en: "EXT.", ja: "外", es: "EXT.", nb: "EKST." };
const MIRA = DEMO_CHARACTERS.mira.name;
const OTTO = DEMO_CHARACTERS.otto.name;
const a = (text: DemoText): DemoBlock => ({ kind: "action", text });
const who = (text: DemoText): DemoBlock => ({ kind: "character", text });
const say = (text: DemoText): DemoBlock => ({ kind: "dialogue", text });
const how = (text: DemoText): DemoBlock => ({ kind: "parenthetical", text });

export const DEMO_SCENES: readonly DemoScene[] = [
  {
    key: "s1",
    intExt: EXT,
    location: DEMO_PLACES.roof.name,
    time: { en: "MORNING", ja: "朝", es: "MAÑANA", nb: "MORGEN" },
    place: "roof",
    cast: ["mira"],
    seconds: 30,
    blocks: [
      a({
        en: "Mira holds up a kite made of newspaper and drinking straws. She runs. The kite lifts, wobbles and dives straight into a planter.",
        ja: "ミラは新聞紙とストローで作ったたこを掲げる。走り出す。たこは浮き上がり、ふらつき、プランターに真っ逆さまに落ちる。",
        es: "Mira sostiene una cometa hecha de periódico y pajitas. Corre. La cometa se eleva, se tambalea y cae de cabeza en una maceta.",
        nb: "Mira holder opp en drage laget av avispapir og sugerør. Hun løper. Dragen letter, vingler og stuper rett ned i en plantekasse.",
      }),
      who(MIRA),
      how({ en: "(to the kite)", ja: "（たこに）", es: "(a la cometa)", nb: "(til dragen)" }),
      say({
        en: "You were supposed to fly.",
        ja: "飛ぶはずだったのに。",
        es: "Se suponía que ibas a volar.",
        nb: "Du skulle jo fly.",
      }),
      a({
        en: "One of the straws has snapped. She tucks the kite under her arm and heads for the door.",
        ja: "ストローが一本折れている。ミラはたこを脇に抱え、ドアへ向かう。",
        es: "Una de las pajitas se ha partido. Se pone la cometa bajo el brazo y va hacia la puerta.",
        nb: "Et av sugerørene har knekt. Hun tar dragen under armen og går mot døra.",
      }),
    ],
  },
  {
    key: "s2",
    intExt: INT,
    location: DEMO_PLACES.stairs.name,
    time: { en: "MORNING", ja: "朝", es: "MAÑANA", nb: "MORGEN" },
    place: "stairs",
    cast: ["mira", "otto"],
    seconds: 30,
    blocks: [
      a({
        en: "Otto climbs the stairs with a bag of oranges. Mira nearly runs into him.",
        ja: "オットーがオレンジの袋を持って階段を上ってくる。ミラはぶつかりそうになる。",
        es: "Otto sube la escalera con una bolsa de naranjas. Mira casi choca con él.",
        nb: "Otto går opp trappene med en pose appelsiner. Mira løper nesten rett på ham.",
      }),
      who(OTTO),
      say({
        en: "Careful. What happened to your bird?",
        ja: "気をつけて。その鳥はどうしたんだい？",
        es: "Cuidado. ¿Qué le pasó a tu pájaro?",
        nb: "Forsiktig. Hva skjedde med fuglen din?",
      }),
      who(MIRA),
      say({
        en: "It's a kite. It doesn't work.",
        ja: "たこだよ。うまく飛ばないの。",
        es: "Es una cometa. No funciona.",
        nb: "Det er en drage. Den virker ikke.",
      }),
      a({
        en: "Otto turns the kite over in his hands, the way he once turned bicycle wheels.",
        ja: "オットーはかつて自転車の車輪を回したように、両手でたこをひっくり返して眺める。",
        es: "Otto le da la vuelta a la cometa entre las manos, como antes hacía con las ruedas de bicicleta.",
        nb: "Otto snur dragen i hendene, slik han en gang snudde sykkelhjul.",
      }),
      who(OTTO),
      say({
        en: "Everything works. Some things just need a second try.",
        ja: "何だって動くさ。もう一度やってみればいいだけのこともある。",
        es: "Todo funciona. Algunas cosas solo necesitan un segundo intento.",
        nb: "Alt virker. Noen ting trenger bare et forsøk til.",
      }),
    ],
  },
  {
    key: "s3",
    intExt: INT,
    location: DEMO_PLACES.workshop.name,
    time: { en: "DAY", ja: "昼", es: "DÍA", nb: "DAG" },
    place: "workshop",
    cast: ["mira", "otto"],
    seconds: 40,
    blocks: [
      a({
        en: "Under the warm lamp, Otto splints the broken straw with a thin spoke. Mira ties the knots.",
        ja: "暖かいランプの下、オットーは折れたストローを細いスポークで添え木する。ミラが結び目を作る。",
        es: "Bajo la lámpara cálida, Otto entablilla la pajita rota con un radio fino. Mira hace los nudos.",
        nb: "Under den varme lampa spjelker Otto det knekte sugerøret med en tynn eike. Mira knyter knutene.",
      }),
      who(MIRA),
      say({
        en: "How do you know where everything goes?",
        ja: "どうしてどこに何をつければいいか分かるの？",
        es: "¿Cómo sabes dónde va cada cosa?",
        nb: "Hvordan vet du hvor alt skal være?",
      }),
      who(OTTO),
      say({
        en: "I don't. I guess, then I look, then I guess better.",
        ja: "分からないさ。まず考えて、よく見て、それからもっといい考えにする。",
        es: "No lo sé. Adivino, luego miro, y luego adivino mejor.",
        nb: "Det gjør jeg ikke. Jeg gjetter, så ser jeg, så gjetter jeg bedre.",
      }),
      a({
        en: "He adds a long tail made from scraps of ribbon. Mira grins.",
        ja: "オットーはリボンの切れ端で長いしっぽを付ける。ミラがにっこり笑う。",
        es: "Él añade una cola larga hecha con trozos de cinta. Mira sonríe.",
        nb: "Han lager en lang hale av stumper med bånd. Mira gliser.",
      }),
    ],
  },
  {
    key: "s4",
    intExt: EXT,
    location: DEMO_PLACES.roof.name,
    time: { en: "AFTERNOON", ja: "午後", es: "TARDE", nb: "ETTERMIDDAG" },
    place: "roof",
    cast: ["mira", "otto"],
    seconds: 30,
    blocks: [
      a({
        en: "The wind picks up. Otto holds the kite high while Mira backs away with the string.",
        ja: "風が強くなる。オットーがたこを高く掲げ、ミラは糸を持って後ずさる。",
        es: "Se levanta el viento. Otto sostiene la cometa en alto mientras Mira retrocede con el hilo.",
        nb: "Vinden tar seg opp. Otto holder dragen høyt mens Mira rygger bakover med snora.",
      }),
      who(OTTO),
      say({ en: "Now!", ja: "今だ！", es: "¡Ahora!", nb: "Nå!" }),
      a({
        en: "He lets go. The kite climbs, steady this time, its ribbon tail dancing above the rooftops.",
        ja: "オットーが手を放す。たこは今度はまっすぐ昇り、リボンのしっぽが屋根の上で踊る。",
        es: "La suelta. La cometa sube, firme esta vez, con su cola de cinta bailando sobre los tejados.",
        nb: "Han slipper. Dragen stiger, stødig denne gangen, og båndhalen danser over takene.",
      }),
    ],
  },
  {
    key: "s5",
    intExt: EXT,
    location: DEMO_PLACES.roof.name,
    time: { en: "SUNSET", ja: "夕方", es: "ATARDECER", nb: "SOLNEDGANG" },
    place: "roof",
    cast: ["mira", "otto"],
    seconds: 25,
    blocks: [
      a({
        en: "The kite is tied to the railing, still flying. Mira and Otto sit on an upturned crate, sharing an orange.",
        ja: "たこは手すりに結ばれ、まだ空に浮かんでいる。ミラとオットーはひっくり返した木箱に座り、オレンジを分け合う。",
        es: "La cometa está atada a la barandilla y sigue volando. Mira y Otto, sentados en una caja, comparten una naranja.",
        nb: "Dragen er bundet fast i rekkverket og flyr fortsatt. Mira og Otto sitter på en kasse og deler en appelsin.",
      }),
      who(MIRA),
      say({ en: "Same time tomorrow?", ja: "明日も同じ時間に？", es: "¿Mañana a la misma hora?", nb: "Samme tid i morgen?" }),
      who(OTTO),
      say({ en: "Bring the wind.", ja: "風を連れておいで。", es: "Trae el viento.", nb: "Ta med vinden." }),
    ],
  },
];
