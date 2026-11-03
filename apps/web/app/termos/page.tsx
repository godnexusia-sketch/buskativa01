import type { Metadata } from "next";
import { contactEmail } from "../../lib/site";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Regras de uso do BUSKATIVA, limites de responsabilidade sobre preços e links de afiliado.",
  alternates: { canonical: "/termos" },
};

export default function TermosPage() {
  const email = contactEmail();
  return (
    <div className="prose">
      <h1>Termos de Uso</h1>
      <p className="muted">Última atualização: 3 de novembro de 2026.</p>

      <h2>O que é o BUSKATIVA</h2>
      <p>
        O BUSKATIVA é um comparador de preços. Mostramos ofertas encontradas em lojas online de terceiros, com histórico
        e estimativas. Não vendemos produtos e não somos parte da compra: a venda, o pagamento, a entrega e a garantia
        são de responsabilidade da loja.
      </p>

      <h2>Preços e disponibilidade</h2>
      <p>
        Os preços são coletados automaticamente e podem estar desatualizados, ter mudado ou acabado no momento em que
        você abrir a loja. Confirme sempre o valor final, o frete e as condições no site da loja antes de comprar.
        Estimativas como &quot;melhor horário&quot; e &quot;próxima queda provável&quot; se baseiam em dados passados e não
        garantem preços futuros.
      </p>

      <h2>Cupons</h2>
      <p>
        Cupons são cadastrados manualmente ou coletados de fontes reais e podem expirar ou deixar de funcionar. Os votos
        dos usuários ajudam a indicar se um cupom funcionou, mas não são garantia.
      </p>

      <h2>Links de afiliado</h2>
      <p>
        Alguns links levam às lojas com parâmetros de afiliado. Se você comprar por eles, o BUSKATIVA pode receber uma
        comissão, sem custo extra para você.
      </p>

      <h2>Uso adequado</h2>
      <p>
        É proibido usar o site para automatizar buscas em excesso, tentar burlar limites de uso, manipular votos de
        cupons ou prejudicar o serviço. Podemos limitar ou bloquear acessos que violem estas regras.
      </p>

      <h2>Limitação de responsabilidade</h2>
      <p>
        O serviço é oferecido como está, sem garantia de disponibilidade ou de exatidão das informações. Não nos
        responsabilizamos por decisões de compra tomadas com base nele, nem pelo conteúdo e pelas práticas das lojas de
        terceiros.
      </p>

      <h2>Alterações e contato</h2>
      <p>
        Podemos atualizar estes termos; a data no topo indica a versão vigente. Dúvidas:{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </div>
  );
}
