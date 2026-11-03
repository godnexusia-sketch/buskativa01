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
  "esportes",
  "moda",
  "automotivo",
  "acessorios",
  "outros",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORIES: Record<CategoryId, { name: string }> = {
  smartphones: { name: "Celulares" },
  notebooks: { name: "Notebooks" },
  computadores: { name: "PCs" },
  componentes: { name: "Peças de PC" },
  perifericos: { name: "Periféricos e impressão" },
  monitores: { name: "Monitores" },
  tvs: { name: "TVs e projetores" },
  audio: { name: "Áudio" },
  games: { name: "Games" },
  tablets: { name: "Tablets e leitores" },
  smartwatches: { name: "Relógios" },
  eletrodomesticos: { name: "Eletrodomésticos" },
  cozinha: { name: "Cozinha" },
  casa: { name: "Casa" },
  beleza: { name: "Beleza" },
  esportes: { name: "Esportes e suplementos" },
  moda: { name: "Moda" },
  automotivo: { name: "Automotivo" },
  acessorios: { name: "Acessórios" },
  outros: { name: "Outros" },
};

// first match wins: accessories come before the device they fit ("capa para iphone" is an accessory)
const RULES: [CategoryId, RegExp][] = [
  ["automotivo", /\b(capacete|veicular|automotivo|para carro|compressor de ar|calibrador|som automotivo|pneu)\b/],
  ["acessorios", /\b(capa|capinha|pelicula|carregador|cabo usb|cabo tipo|cabo lightning|cabo carregador|power ?bank|bateria externa|adaptador|case para|case capa|hub usb|hub \d+ em 1|pulseira|ponta para caneta|pilhas?)\b/],
  ["games", /\b(playstation|ps[2-5]|xbox|nintendo|switch oled|console|jogo para|dualsense|dualshock|joystick|controle gamer|volante game|cockpit simulador|8bitdo|headset gamer)\b/],
  ["smartwatches", /\b(smartwatch|smart watch|relogio inteligente|apple watch|galaxy watch|mi band|smartband|amazfit)\b/],
  ["tablets", /\b(tablet|ipad|kindle|e-?reader|galaxy tab)\b/],
  ["notebooks", /\b(notebook|laptop|macbook|chromebook|ultrabook)\b/],
  ["monitores", /\bmonitor\b/],
  ["computadores", /\b(pc gamer|computador|desktop|all in one|mini pc|imac|mac mini)\b/],
  ["componentes", /\b(placa de video|placa mae|rtx ?\d|gtx ?\d|radeon|rx ?\d{3,4}|processador|ryzen|intel core|core i[3579]|memoria ram|ddr[345]|ssd|hd externo|hd interno|nvme|fonte atx|fonte \d+ ?w|gabinete|water ?cooler|cooler|pen ?drive)\b/],
  ["perifericos", /\b(mouse|teclado|headset|webcam|mousepad|mouse pad|microfone|impressora|roteador|cartucho|toner|tinta sublimatica|tinta ecologica|filamento|papel fotografico|papel adesivo|papel offset|papel diplomata|cabo de rede|cabo lan|nobreak|walk ?talk|radio comunicador)\b/],
  ["smartphones", /\b(smartphone|celular|iphone|galaxy [asmz]\d*|redmi|poco [fmx]|moto [gez]\d*|motorola edge|xiaomi \d+|realme)\b/],
  ["tvs", /\b(smart tv|televisao|televisor|tv \d{2}|tv led|tv qled|tv oled|\d{2} polegadas|projetor|receptor digital|suporte de tv|suporte articulado de parede tv)\b/],
  ["audio", /\b(fones?|headphone|earbuds?|airpods|caixa de som|caixa som|soundbar|home theater|jbl|alto-?falante|vitrola|radio|megafone|cabo optico|cabo audio|cabos xlr|espuma acustica|placas? espuma acustica|maquina de fumaca)\b/],
  ["eletrodomesticos", /\b(geladeira|refrigerador|freezer|fogao|cooktop|micro-?ondas|lava e seca|lavadora|maquina de lavar|lava-?loucas|ar-?condicionado|ar condicionado|aspirador|forno eletrico|secadora|centrifuga|ferro de passar|ferro a vapor|balanca)\b/],
  ["cozinha", /\b(air ?fryer|fritadeira|liquidificador|cafeteira|batedeira|sanduicheira|panela|processador de alimentos|mixer|chaleira|torradeira|grill|churrasqueira|waffle|pipoqueira|cozedor|frigideira|faqueiro|talheres|copo termico|refil para filtro|filtro refil|capsulas? de cafe)\b/],
  ["beleza", /\b(secador|chapinha|prancha|barbeador|aparador|perfume|maquiagem|escova rotativa|escova secadora|escova de cabelo|depilador|batom|corretivo|mascara para cilios|henna|coloracao|tintura|desodorante|agua micelar|serum|creme|cabelo|cuticulas|capa de corte|gel pink|absorventes?|edt|eau de (toilette|parfum))\b/],
  ["esportes", /\b(creatina|whey|pre[ -]?treino|pre workout|proteina|barra de proteinas?|suplemento|vitamina|magnesio|bicicleta|ergometrica|luva boxe|muay thai|academia|halter|yoga)\b/],
  ["moda", /\b(tenis|camisa|camiseta|gravata|calca|vestido|bolsa|sapato|sandalia|chinelo|jaqueta|bone|mochila)\b/],
  ["casa", /\b(ventilador|purificador|umidificador|lampada|colchao|travesseiro|cadeira|mesa|robo aspirador|almofadas?|toalhas?|tapetes?|manta|cortina|fita led|painel led|plafon|piscina|natal|lanterna|barramentos?|controle ppa|enxoval|lencol)\b/],
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
