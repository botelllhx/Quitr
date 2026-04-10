/**
 * Template HTML para e-mail de cobrança de dívida em aberto.
 * Variáveis interpoladas com {{chave}}.
 *
 * Variáveis disponíveis:
 *   {{nome}}            Nome do devedor
 *   {{empresa}}         Nome da empresa credora
 *   {{logoUrl}}         URL do logo da empresa (pode ser vazio)
 *   {{valor}}           Valor atualizado formatado (ex: "R$ 1.500,00")
 *   {{vencimento}}      Data de vencimento formatada (ex: "15/03/2026")
 *   {{diasAtraso}}      Dias de atraso (ex: "30") — "0" se ainda não venceu
 *   {{linkAcordo}}      URL para o portal de autoatendimento
 *   {{pixelUrl}}        URL do pixel de rastreamento de abertura
 *   {{optOutUrl}}       URL para descadastro (opt-out)
 *   {{telefoneEmpresa}} Telefone da empresa credora
 */
export const cobrancaTemplate = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Notificação de Cobrança</title>
  <style>
    @media only screen and (max-width:600px){
      .wrapper{padding:16px!important}
      .card{border-radius:8px!important}
      .info-table td{display:block!important;width:100%!important;border-right:none!important;border-bottom:1px solid #e5e7eb!important;padding:12px 16px!important}
      .btn{width:100%!important;display:block!important;text-align:center!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6">
    <tr>
      <td align="center" class="wrapper" style="padding:32px 16px">

        <!-- Card principal -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="card"
          style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    {{#logoUrl}}
                    <img src="{{logoUrl}}" alt="{{empresa}}" height="40"
                      style="display:block;max-height:40px;border:0">
                    {{/logoUrl}}
                    {{^logoUrl}}
                    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.5px">{{empresa}}</span>
                    {{/logoUrl}}
                  </td>
                  <td align="right">
                    <span style="background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;letter-spacing:.5px;text-transform:uppercase">Em aberto</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:32px 32px 0">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Olá, {{nome}}!</p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563">
                Identificamos que existe um valor em aberto junto à <strong>{{empresa}}</strong>.
                Regularize sua situação para evitar encargos adicionais e restrições cadastrais.
              </p>
            </td>
          </tr>

          <!-- Box de informações da dívida -->
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;overflow:hidden">
                <tr class="info-table">
                  <td style="padding:16px 20px;border-right:1px solid #fecaca;text-align:center;width:34%">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Valor em aberto</p>
                    <p style="margin:0;font-size:24px;font-weight:800;color:#dc2626">{{valor}}</p>
                  </td>
                  <td style="padding:16px 20px;border-right:1px solid #fecaca;text-align:center;width:33%">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Vencimento</p>
                    <p style="margin:0;font-size:17px;font-weight:700;color:#374151">{{vencimento}}</p>
                  </td>
                  <td style="padding:16px 20px;text-align:center;width:33%">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Dias em atraso</p>
                    <p style="margin:0;font-size:17px;font-weight:700;color:#374151">{{diasAtraso}} dias</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;text-align:center">
              <p style="margin:0 0 20px;font-size:14px;color:#6b7280">
                Clique no botão abaixo para acessar as opções de pagamento e negociação disponíveis para você.
              </p>
              <a href="{{linkAcordo}}" class="btn"
                style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 32px;border-radius:8px">
                Regularizar minha situação →
              </a>
            </td>
          </tr>

          <!-- Divisor -->
          <tr>
            <td style="padding:0 32px"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151">{{empresa}}</p>
                    {{#telefoneEmpresa}}
                    <p style="margin:0;font-size:12px;color:#9ca3af">Tel: {{telefoneEmpresa}}</p>
                    {{/telefoneEmpresa}}
                  </td>
                  <td align="right">
                    <a href="{{optOutUrl}}" style="font-size:11px;color:#9ca3af;text-decoration:underline">Não quero mais receber e-mails</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:11px;color:#d1d5db;text-align:center">
                Esta mensagem foi enviada porque existe um débito registrado em seu nome. Se acredita ser um engano, entre em contato com {{empresa}}.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

  <!-- Pixel de rastreamento 1×1 — deve ser visível (1px) para que clientes de e-mail carreguem a URL -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="1" style="margin:0 auto">
    <tr>
      <td style="padding:0;line-height:0;font-size:0">
        <img src="{{pixelUrl}}" width="1" height="1" border="0" alt="" style="display:block;width:1px;height:1px;border:0">
      </td>
    </tr>
  </table>

</body>
</html>`
