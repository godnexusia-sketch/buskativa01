import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre o BUSKATIVA",
  description: "Como o BUSKATIVA encontra o menor preço e como o site se sustenta com links de afiliado.",
  alternates: { canonical: "/sobre" },
};

export default function SobrePage() {
  return (
    <div className="prose">
      <h1>Sobre o BUSKATIVA</h1>
      <p>
        O BUSKATIVA procura o mesmo produto em várias lojas (Mercado Livre, Amazon, Magalu, Shopee, AliExpress e TikTok
        Shop) e mostra o menor preço, o histórico de variação e uma estimativa do melhor momento para comprar.
      </p>

      <h2>Como ganhamos dinheiro</h2>
      <p>
        O site usa <strong>links de afiliado</strong>. Quando você clica em &quot;Ir para a loja&quot; e compra, o
        BUSKATIVA pode receber uma comissão da loja, sem nenhum custo extra para você. Também podemos exibir anúncios do
        Google; eles só são personalizados se você aceitar os cookies.
      </p>

      <h2>O que você deve saber</h2>
      <ul>
        <li>Os preços são coletados automaticamente e podem mudar a qualquer momento. Confirme sempre na loja.</li>
        <li>Não inventamos preços, cupons ou avaliações: o que aparece vem das lojas ou de cadastro real.</li>
        <li>
          Veja nossa <a href="/privacidade">Política de Privacidade</a> e os <a href="/termos">Termos de Uso</a>.
        </li>
      </ul>
    </div>
  );
}
