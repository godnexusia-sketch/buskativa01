import type { Metadata } from "next";
import { contactEmail, controllerName } from "../../lib/site";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Quais dados o BUSKATIVA trata, para quê, e como exercer seus direitos pela LGPD.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  const email = contactEmail();
  const controller = controllerName();
  return (
    <div className="prose">
      <h1>Política de Privacidade</h1>
      <p className="muted">Última atualização: 3 de novembro de 2026.</p>
      <p>
        O BUSKATIVA compara preços em lojas online. Esta página explica, conforme a Lei Geral de Proteção de Dados
        (LGPD, Lei 13.709/2018), quais dados tratamos e por quê.
      </p>

      <h2>Controlador</h2>
      <p>
        O controlador dos dados é <strong>{controller}</strong>. O canal do encarregado e de contato para assuntos de
        privacidade é <a href={`mailto:${email}`}>{email}</a>.
      </p>

      <h2>Dados que tratamos</h2>
      <ul>
        <li>
          <strong>Endereço IP.</strong> Usado em memória para limitar o número de buscas por minuto e evitar abuso, sem
          ser gravado para essa finalidade. Quando você vota em um cupom (funcionou ou não funcionou), guardamos apenas
          o IP pseudonimizado (hash com sal secreto), para permitir um voto por cupom por pessoa. Não guardamos o IP
          em si.
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
          <strong>Google (Analytics e AdSense), se ativados pelo site.</strong> Os scripts do Google são carregados
          para todos os visitantes, com todos os sinais de consentimento negados (Google Consent Mode). Sem a sua
          aceitação, não são gravados cookies do Google e os anúncios não são personalizados, mas o seu navegador
          ainda se conecta aos servidores do Google e informações sem cookies (como IP e dados do navegador) podem ser
          enviadas a ele. Depois que você clica em &quot;Aceitar&quot;, cookies são usados para medição de audiência e
          anúncios personalizados. Você pode mudar de ideia a qualquer momento em &quot;Preferências de
          cookies&quot;, no rodapé. Veja também a{" "}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
            política do Google sobre dados de sites parceiros
          </a>
          .
        </li>
      </ul>

      <h2>Bases legais e finalidades</h2>
      <ul>
        <li>
          Operar e proteger o serviço, incluindo o limite de uso e a prevenção de abuso pelo endereço IP: legítimo
          interesse.
        </li>
        <li>
          Carregar os scripts do Google antes da sua escolha, com todos os sinais de consentimento negados: legítimo
          interesse. Esse contato técnico expõe ao Google dados como o endereço IP e o navegador, mas não grava cookies
          nem personaliza anúncios.
        </li>
        <li>
          Cookies de medição de uso e anúncios personalizados: consentimento, quando você aceita os cookies do Google
          (pode ser retirado a qualquer momento em &quot;Preferências de cookies&quot;, no rodapé).
        </li>
        <li>Manter a confiabilidade das informações de cupons: legítimo interesse.</li>
      </ul>

      <h2>Compartilhamento</h2>
      <p>
        Não vendemos dados pessoais. Ao seguir um link de afiliado você sai do BUSKATIVA e passa a se sujeitar à política
        de privacidade da loja de destino. Operadores e destinatários:
      </p>
      <ul>
        <li>Render: hospedagem do site.</li>
        <li>Supabase: banco de dados.</li>
        <li>Google (Analytics/AdSense), se ativados pelo site, conforme descrito acima.</li>
        <li>Lojas parceiras, ao seguir links de afiliado.</li>
      </ul>

      <h2>Por quanto tempo guardamos</h2>
      <ul>
        <li>Registros de cliques em links de afiliado: 12 meses.</li>
        <li>Votos de cupom (IP pseudonimizado): enquanto o cupom estiver ativo e válido e por mais 30 dias depois de desativado ou vencido.</li>
        <li>Termos pesquisados: mantidos como histórico dos produtos.</li>
        <li>Dados do limite de uso por IP: apenas em memória, por poucos minutos.</li>
        <li>Escolha de cookies: no seu navegador, até você apagá-la.</li>
      </ul>

      <h2>Seus direitos</h2>
      <p>
        Pela LGPD você pode pedir confirmação de tratamento, acesso, correção, anonimização, eliminação, informação
        sobre compartilhamento e a revogação do consentimento. Como o voto guarda só um IP pseudonimizado,
        talvez não consigamos localizar um voto específico; nesse caso explicaremos o motivo.
      </p>

      <h2>Contato</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas, escreva para <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </div>
  );
}
