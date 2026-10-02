# Mapa da Carreira — MVP low ticket

Funil: anúncio → teste gratuito (12 perguntas) → prévia → oferta de **R$ 14,50** → **Pix na própria página
(Mercado Pago, API de Orders)** → confirmação no servidor → mapa privado com 5 caminhos e plano de 7 dias.

Implementa a especificação v1.0 (1/out/2026). Liberação **automática**: só com pagamento confirmado no servidor
(webhook assinado + consulta à API). Nunca pela URL de retorno.

## Stack

- **Frontend**: React + Vite (`src/`), mobile first. Recebe só a prévia antes da compra.
- **API**: uma Netlify Function (`netlify/functions/api.ts`) servindo `/api/*` (`server/app.ts`).
- **Banco**: Postgres no Supabase, com conexão direta (`postgres.js`). RLS ligado sem policies: a chave pública não lê nada.
- **Contato do comprador**: nome + WhatsApp (sem e-mail). Acesso: aba da compra, recuperação com WhatsApp +
  código do pedido (MC-XXXXXX) e envio do link pelo admin. Envio automático opcional pela WhatsApp Cloud API.
- **Conteúdo**: `shared/quiz.ts` (público) e `server/content/careers.v1.ts` (pago, somente servidor).

## Rodar localmente

```bash
npm install
npm run dev        # API em :8788 (PGlite + provedor fake) e site em :5173
npm test           # 39 testes: cálculo, Mercado Pago, WhatsApp, migrações, fluxo de pagamento e falhas
npm run build && npm run check:bundle   # garante que o bundle não contém conteúdo pago
```

Em dev, a tela do Pix mostra **"[dev] Simular pagamento aprovado"**. O admin fica em `/admin` (senha `admin-local`).
O provedor `fake` é bloqueado em produção.

## Colocar no ar

1. **Supabase**: crie o projeto e rode `DATABASE_URL=... npm run db:migrate`
   (ou aplique `supabase/migrations/20261002000000_init.sql`). Use a string do *Transaction pooler* (porta 6543).
2. **Netlify**: conecte o repositório e cadastre as variáveis de `.env.example`. O build roda typecheck, build e checagem do bundle.
3. **Mercado Pago** (Suas integrações → aplicação):
   - Copie o **Access Token** para `MP_ACCESS_TOKEN`. Confirme que a conta tem **Pix habilitado** (chave Pix cadastrada).
   - **Webhooks** → URL `https://SEU-DOMINIO/api/webhooks/mercadopago`, evento **Order (Mercado Pago)**.
     Copie a **assinatura secreta** para `MP_WEBHOOK_SECRET`.
   - Teste primeiro com credenciais e usuários de teste, depois faça uma compra real controlada.
4. **WhatsApp**: comece com `WHATSAPP_PROVIDER=none`. Para envio automático do link, crie na Meta (WhatsApp Business
   Platform) um template de utilidade aprovado com `{{1}}` = nome e `{{2}}` = link, e preencha `WHATSAPP_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_TEMPLATE_NAME`.
5. **Meta**: `META_PIXEL_ID`. O Pixel só carrega após o aceite de cookies. Purchase usa `event_id = purchase_<pedido>`
   no navegador e (opcional) no servidor via `META_CAPI_TOKEN`, para deduplicação.

### A validar numa compra real (não deu para conferir contra a API ao vivo)

A documentação do Mercado Pago estava inacessível no ambiente de desenvolvimento. Os formatos vieram do SDK oficial
`mercadopago` v3.6.1. Na primeira compra de teste, confira no `/admin` e nos logs:

- O status de Order paga chega como `processed/accredited` (mapeado para `paid`). Status desconhecido nunca libera.
- A assinatura `x-signature` valida (o alerta "assinatura INVÁLIDA" aparece no admin se não validar).
- O campo `currency` volta `BRL` e `total_amount` volta `14.50`.
- O Pix é criado sem e-mail do pagador (só nome e telefone). Se o Mercado Pago recusar, defina
  `MP_PAYER_EMAIL_TEMPLATE` (ex.: `pix+{ref}@seu-dominio.com.br`). Nunca use o e-mail da própria conta recebedora.

## Painel de análise (admin `/admin` → Painel)

Período (hoje, ontem, 7 ou 30 dias, ou datas livres) no fuso de Brasília. Mostra:
- **Funil**: visitas → começaram → terminaram as 12 perguntas → prévia → clique em desbloquear → Pix → pagos, com a maior queda destacada.
- **Onde desistem**: % de quem começou que chegou a cada pergunta, com a pergunta de maior saída.
- **Por dia**: visitas, inícios e conclusões (gráfico ou tabela), com compras e receita no tooltip.
- **Por anúncio**: agrupado pela UTM `utm_content` (nome do anúncio) e `utm_term` (conjunto).
- **Pagamento, uso do mapa, perfil e resultados**: Pix pagos/expirados, tempo até pagar, plano iniciado, momentos de carreira, caminhos sugeridos e quantas compras cada um gera.
- **ROAS e custo por compra**: informe o investimento do período para comparar com a meta (1,8 / R$ 8,05) e ver a conversão necessária.

## Operação (admin `/admin`)

Buscar por WhatsApp, código `MC-…`, ID do pedido ou do pagamento. Também dá para consultar o provedor, gerar o link de acesso
e abrir o WhatsApp do operador com a mensagem pronta (ou reenviar automático, com a API),
liberar uma compra verificada (com operador, ID do pagamento e auditoria) e revogar por reembolso. Os alertas mostram
pagamentos sem pedido, valor divergente, duplicidade, mensagens com falha e webhooks inválidos.

## Contas (ROAS bruto 1,8)

- CPA máximo = 14,50 ÷ 1,8 = **R$ 8,05**.
- Compra/visita necessária = custo por visita ÷ 8,0556 (R$ 0,50/visita → 6,21%).
- Margem de contribuição por venda = 14,50 − taxa Pix do Mercado Pago (conferir a da sua conta) − CPA − demais custos.

## Checklist antes do tráfego pago

- [x] Iniciar, voltar, editar e retomar sem perder respostas (teste e2e no celular)
- [x] Perfis diferentes geram resultados coerentes; respostas iguais geram perfil amplo (testes)
- [x] Bundle sem ranking, textos ou planos; rota privada responde 403 (testes + `check:bundle`)
- [ ] Checkout mostra R$ 14,50, pagamento único e Pix disponível: **confirmar com credencial real**
- [ ] Compra real controlada associa a transação ao pedido e ao mapa certos: **fazer em produção**
- [x] Pix pendente, URL adulterada e webhook inválido não liberam (testes)
- [x] Webhook repetido e página recarregada não duplicam acesso nem Purchase (testes)
- [x] Fechar a aba mantém a entrega recuperável em outro navegador (testes + e2e)
- [x] Reembolso revoga o acesso e notificações antigas não reativam (testes)
- [x] Checklist salva o progresso; os 12 caminhos têm conteúdo completo (testes)
- [x] Recuperação não revela quem tem compra (teste)
- [ ] Preencher dados do vendedor, contato de suporte e **revisar os textos legais** (`src/pages/Legal.tsx` é modelo)
