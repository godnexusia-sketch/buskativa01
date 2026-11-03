import { normalizeText } from "./text";

export const CATEGORY_IDS = [
  "smartphones",
  "notebooks",
  "computadores",
  "componentes",
  "perifericos",
  "monitores",
  "tvs",
  "audio",
  "games",
  "tablets",
  "smartwatches",
  "eletrodomesticos",
  "cozinha",
  "casa",
  "beleza",
  "acessorios",
  "outros",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORIES: Record<CategoryId, { name: string }> = {
  smartphones: { name: "Celulares" },
  notebooks: { name: "Notebooks" },
  computadores: { name: "PCs" },
  componentes: { name: "Peças de PC" },
  perifericos: { name: "Periféricos" },
  monitores: { name: "Monitores" },
  tvs: { name: "TVs" },
  audio: { name: "Áudio" },
  games: { name: "Games" },
  tablets: { name: "Tablets e leitores" },
  smartwatches: { name: "Relógios" },
  eletrodomesticos: { name: "Eletrodomésticos" },
  cozinha: { name: "Cozinha" },
  casa: { name: "Casa" },
  beleza: { name: "Beleza" },
  acessorios: { name: "Acessórios" },
  outros: { name: "Outros" },
};

// first match wins: accessories come before the device they fit ("capa para iphone" is an accessory)
const RULES: [CategoryId, RegExp][] = [
  ["acessorios", /\b(capa|capinha|pelicula|carregador|cabo usb|cabo tipo|cabo lightning|suporte|power ?bank|bateria externa|adaptador|case para|hub usb)\b/],
  ["smartwatches", /\b(smartwatch|smart watch|relogio inteligente|apple watch|galaxy watch|mi band|smartband|amazfit)\b/],
  ["tablets", /\b(tablet|ipad|kindle|e-?reader|galaxy tab)\b/],
  ["notebooks", /\b(notebook|laptop|macbook|chromebook|ultrabook)\b/],
  ["monitores", /\bmonitor\b/],
  ["computadores", /\b(pc gamer|computador|desktop|all in one|mini pc|imac|mac mini)\b/],
  ["componentes", /\b(placa de video|placa mae|rtx ?\d|gtx ?\d|radeon|rx ?\d{3,4}|processador|ryzen|intel core|core i[3579]|memoria ram|ddr[345]|ssd|hd externo|hd interno|nvme|fonte atx|fonte \d+ ?w|gabinete|water ?cooler|cooler)\b/],
  ["games", /\b(playstation|ps[45]|xbox|nintendo|switch oled|console|jogo para|dualsense|joystick)\b/],
  ["perifericos", /\b(mouse|teclado|headset|webcam|mousepad|mouse pad|microfone|controle|impressora|roteador)\b/],
  ["smartphones", /\b(smartphone|celular|iphone|galaxy [asmz]\d*|redmi|poco [fmx]|moto [gez]\d*|motorola edge|xiaomi \d+|realme)\b/],
  ["tvs", /\b(smart tv|televisao|televisor|tv \d{2}|tv led|tv qled|tv oled|\d{2} polegadas)\b/],
  ["audio", /\b(fone|headphone|earbuds?|airpods|caixa de som|soundbar|home theater|jbl|alto-?falante)\b/],
  ["eletrodomesticos", /\b(geladeira|refrigerador|freezer|fogao|cooktop|micro-?ondas|lava e seca|lavadora|maquina de lavar|lava-?loucas|ar-?condicionado|ar condicionado|aspirador|forno eletrico|secadora)\b/],
  ["cozinha", /\b(air ?fryer|fritadeira|liquidificador|cafeteira|batedeira|sanduicheira|panela eletrica|panela de pressao|processador de alimentos|mixer|chaleira|torradeira|grill)\b/],
  ["casa", /\b(ventilador|ferro de passar|purificador|umidificador|lampada|colchao|travesseiro|cadeira|mesa|robo aspirador)\b/],
  ["beleza", /\b(secador|chapinha|prancha|barbeador|aparador|perfume|maquiagem|escova rotativa|depilador)\b/],
];

/** Category guessed from the product title; "outros" when nothing matches. */
export function categorize(title: string): CategoryId {
  const t = normalizeText(title);
  for (const [id, re] of RULES) if (re.test(t)) return id;
  return "outros";
}

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === "string" && (CATEGORY_IDS as readonly string[]).includes(v);
}
