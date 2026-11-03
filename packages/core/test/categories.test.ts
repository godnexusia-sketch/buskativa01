import { describe, expect, it } from "vitest";
import { categorize, CATEGORIES, CATEGORY_IDS, isCategoryId } from "../src/categories";

describe("categorize", () => {
  it.each([
    ["Apple iPhone 15 (128 GB) - Preto", "smartphones"],
    ["Smartphone Samsung Galaxy S24 256GB", "smartphones"],
    ["Capa Para iPhone 15 Silicone", "acessorios"],
    ["Notebook Dell Inspiron 15 i5 8GB", "notebooks"],
    ["PC Gamer Ryzen 5 5600 RTX 4060", "computadores"],
    ["Placa de Vídeo RTX 4060 8GB", "componentes"],
    ["SSD Kingston 1TB NVMe", "componentes"],
    ["Mouse Gamer Logitech G203", "perifericos"],
    ["Teclado Mecânico Redragon Kumara", "perifericos"],
    ["Monitor Gamer LG 27\" 144Hz", "monitores"],
    ["Smart TV 50 Polegadas 4K Samsung", "tvs"],
    ["Fone de Ouvido Bluetooth JBL Tune 520BT", "audio"],
    ["Console PlayStation 5 Slim", "games"],
    ["Kindle 11ª Geração 16GB", "tablets"],
    ["Smartwatch Amazfit Bip 5", "smartwatches"],
    ["Geladeira Frost Free Brastemp 375L", "eletrodomesticos"],
    ["Fritadeira Air Fryer Mondial 4L", "cozinha"],
    ["Ventilador de Mesa Arno 40cm", "casa"],
    ["Secador de Cabelo Taiff 2000W", "beleza"],
    ["Tênis Nike Revolution 7", "moda"],
    ["Creatina 300g Monohidratada Dark Lab", "esportes"],
    ["Capacete Moto Fechado Pro Tork R8", "automotivo"],
    ["Kit 4 Almofadas Cheias Decorativas", "casa"],
    ["Cartucho de Tinta HP 664 XL", "perifericos"],
    ["Projetor HY320 Mini Smart TV Android", "tvs"],
    ["Perfume Jacques Bogart EDT 30ml", "beleza"],
    ["Pulseira Silicone Para Amazfit Band 7", "acessorios"],
    ["Controle Sem Fio Playstation Dualshock 4", "games"],
    ["Lelong LE-997 Branco/Vermelho", "outros"],
  ])("%s → %s", (title, expected) => {
    expect(categorize(title)).toBe(expected);
  });

  it("todo id tem nome e isCategoryId reconhece só ids válidos", () => {
    for (const id of CATEGORY_IDS) expect(CATEGORIES[id].name).toBeTruthy();
    expect(isCategoryId("tvs")).toBe(true);
    expect(isCategoryId("xyz")).toBe(false);
    expect(isCategoryId(undefined)).toBe(false);
  });
});
