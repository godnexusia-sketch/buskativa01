import type { Metadata } from "next";
import { contactEmail } from "../../lib/site";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Quais dados o BUSKATIVA trata, para quê, e como exercer seus direitos pela LGPD.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  const email = contactEmail();
  return (
    <div className="prose">
      <h1>Política de Privacidade</h1>
      <p className="muted">Última atualização: 3 de novembro de 2026.</p>
      <p>
        O BUSKATIVA compara preços em lojas online. Esta página explica, conforme a Lei Geral de Proteção de Dados
        (LGPD, Lei 13.709/2018), quais dados tratamos e por quê.
      </p>

      <h2>Dados que tratamos</h2>
      <ul>
        <li>
          <strong>Endereço IP.</strong> Usado em memória para limitar o número de buscas por minuto e evitar abuso, sem
          ser gravado para essa finalidade. Quando você vota em um cupom (funcionou ou não funcionou), guardamos apenas
          um hash irreversível do IP combinado com um segredo do servidor, para permitir um voto por cupom por pessoa.
          Não guardamos o IP em si nem conseguimos recuperá-lo a partir do hash.
        </li>
        <li>
          <strong>Termos pesquisados.</strong> O texto da busca é processado e guardado para consultar as lojas e montar
          o histórico de preços. Não o associamos a você.
        </li>
        <li>
          <strong>Cliques em links de afiliado.</strong> Ao clicar em &quot;Ir para a loja&quot; registramos qual produto
          foi aberto, o horário e a página de origem (referer), para saber quais ofertas são úteis. Não registramos seu
          nome nem seu IP nesse registro.
        </li>
        <li>
          <strong>Cookies e armazenamento local.</strong> O BUSKATIVA não define cookies próprios. Guardamos no
          armazenamento local do seu navegador (localStorage) apenas a sua escolha no aviso de cookies.
        </li>
        <li>
          <strong>Cookies do Google, somente se você aceitar.</strong> Quando habilitados pelo site, o Google Analytics
          (estatísticas de uso) e o Google AdSense (anúncios) podem gravar cookies e coletar dados como identificadores
          do navegador e páginas visitadas. Eles ficam desligados até você clicar em &quot;Aceitar&quot; no aviso. Se você
          recusar, esses sinais permanecem negados (Google Consent Mode). Você pode mudar de ideia a qualquer momento em
          &quot;Preferências de cookies&quot;, no rodapé. Veja também a{" "}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
            política do Google sobre dados de sites parceiros
          </a>
          .
        </li>
      </ul>

      <h2>Bases legais e finalidades</h2>
      <p>
        Tratamos esses dados para operar e proteger o serviço (legítimo interesse), medir o uso do site e exibir
        anúncios (consentimento, quando você aceita os cookies do Google) e manter a confiabilidade das informações de
        cupons (legítimo interesse).
      </p>

      <h2>Compartilhamento</h2>
      <p>
        Não vendemos dados pessoais. Ao seguir um link de afiliado você sai do BUSKATIVA e passa a se sujeitar à política
        de privacidade da loja de destino. O Google recebe dados apenas se você aceitar os cookies dele.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Pela LGPD você pode pedir confirmação de tratamento, acesso, correção, anonimização, eliminação, informação
        sobre compartilhamento e a revogação do consentimento. Como o hash do voto não permite identificar quem votou,
        talvez não consigamos localizar um voto específico; nesse caso explicaremos o motivo.
      </p>

      <h2>Contato</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas, escreva para <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </div>
  );
}
