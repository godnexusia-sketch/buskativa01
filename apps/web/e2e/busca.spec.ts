import { expect, test } from "@playwright/test";

test("busca, mostra ofertas ordenadas, abre produto e o link vai para a loja com afiliado", async ({ page, request }) => {
  const termo = `fone e2e ${Date.now()}`;
  await page.goto("/");
  await page.getByPlaceholder(/Busque um produto/).fill(termo);
  await page.getByRole("button", { name: "Buscar" }).click();

  const offers = page.getByTestId("offer");
  await expect(offers.first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Mercado Livre: \d+ ofertas/)).toBeVisible({ timeout: 45_000 });

  const prices = await page.locator('[data-testid="offer"] .price').allInnerTexts();
  const values = prices.map((p) => Number(p.replace(/[^\d,]/g, "").replace(",", ".")));
  expect(values).toEqual([...values].sort((a, b) => a - b));

  const irHref = await offers.first().getByRole("link", { name: "Ir para a loja" }).getAttribute("href");
  const redirect = await request.get(irHref!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toMatch(/^https:\/\/www\.(mercadolivre\.com\.br|amazon\.com\.br|magazineluiza\.com\.br)\//);

  await offers.first().locator("a.title").click();
  await expect(page.getByText("Menor preço")).toBeVisible();
  await expect(page.getByText("Histórico de preço")).toBeVisible();
});
