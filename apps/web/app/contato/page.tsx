import type { Metadata } from "next";
import { contactEmail } from "../../lib/site";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com o BUSKATIVA: dúvidas, correções de preço, pedidos sobre seus dados.",
  alternates: { canonical: "/contato" },
};

export default function ContatoPage() {
  const email = contactEmail();
  return (
    <div className="prose">
      <h1>Contato</h1>
      <p>
        Dúvidas, sugestões, preços errados ou pedidos sobre seus dados pessoais (LGPD): escreva para{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>
      <p className="muted">Respondemos assim que possível.</p>
    </div>
  );
}
