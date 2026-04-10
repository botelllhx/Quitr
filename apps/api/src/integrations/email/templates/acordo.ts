/**
 * Template HTML para e-mail de proposta de acordo.
 * Variáveis interpoladas com {{chave}}.
 *
 * Variáveis disponíveis:
 *   {{nome}}            Nome do devedor
 *   {{empresa}}         Nome da empresa credora
 *   {{logoUrl}}         URL do logo da empresa (pode ser vazio)
 *   {{valor}}           Valor total da dívida formatado
 *   {{desconto}}        Valor do desconto obtido formatado (ex: "R$ 300,00")
 *   {{valorFinal}}      Valor após desconto
 *   {{numeroParcelas}}  Número de parcelas disponíveis (ex: "3")
 *   {{valorEntrada}}    Valor da entrada (ex: "R$ 500,00") — vazio se sem entrada
 *   {{valorParcela}}    Valor de cada parcela (ex: "R$ 333,33")
 *   {{linkAcordo}}      URL para o portal de autoatendimento
 *   {{pixelUrl}}        URL do pixel de rastreamento de abertura
 *   {{optOutUrl}}       URL para descadastro (opt-out)
 *   {{validadeHoras}}   Validade da proposta em horas (ex: "72")
 */
export const acordoTemplate = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Proposta de Acordo</title>
  <style>
    @media only screen and (max-width:600px){
      .wrapper{padding:16px!important}
      .card{border-radius:8px!important}
      .parcelas-table td{display:block!important;width:100%!important;border-right:none!important;border-bottom:1px solid #d1fae5!important;padding:12px 16px!important}
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
            <td style="background:#14532d;padding:24px 32px">
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
                    <span style="background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;letter-spacing:.5px;text-transform:uppercase">Proposta especial</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Saudação -->
          <tr>
            <td style="padding:32px 32px 0">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">{{nome}}, temos uma proposta para você!</p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563">
                A <strong>{{empresa}}</strong> preparou condições especiais para a regularização da sua dívida.
                Esta é uma oportunidade exclusiva com desconto e prazo facilitado.
              </p>
            </td>
          </tr>

          <!-- Box de resumo do acordo -->
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;overflow:hidden">

                <!-- Linha de valor original e desconto -->
                <tr>
                  <td style="padding:16px 24px 8px">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td>
                          <p style="margin:0 0 2px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Valor original</p>
                          <p style="margin:0;font-size:15px;color:#9ca3af;text-decoration:line-through">{{valor}}</p>
                        </td>
                        <td align="right">
                          <span style="background:#dcfce7;color:#15803d;font-size:13px;font-weight:700;padding:4px 12px;border-radius:99px">
                            − {{desconto}} de desconto
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Valor final destaque -->
                <tr>
                  <td style="padding:8px 24px 16px;border-bottom:1px solid #bbf7d0">
                    <p style="margin:0 0 2px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Você paga apenas</p>
                    <p style="margin:0;font-size:32px;font-weight:800;color:#15803d">{{valorFinal}}</p>
                  </td>
                </tr>

                <!-- Condições de pagamento -->
                <tr>
                  <td style="padding:16px 24px">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                      class="parcelas-table">
                      <tr>
                        {{#valorEntrada}}
                        <td style="padding:4px 16px 4px 0;border-right:1px solid #bbf7d0;text-align:center">
                          <p style="margin:0 0 2px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Entrada</p>
                          <p style="margin:0;font-size:16px;font-weight:700;color:#374151">{{valorEntrada}}</p>
                        </td>
                        {{/valorEntrada}}
                        <td style="padding:4px 16px;text-align:center">
                          <p style="margin:0 0 2px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Parcelas</p>
                          <p style="margin:0;font-size:16px;font-weight:700;color:#374151">{{numeroParcelas}}× de {{valorParcela}}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Aviso de validade -->
          <tr>
            <td style="padding:0 32px 20px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
                <tr>
                  <td style="padding:10px 16px">
                    <p style="margin:0;font-size:13px;color:#92400e">
                      ⏱ <strong>Proposta válida por {{validadeHoras}} horas.</strong>
                      Após este prazo, os valores e condições podem ser alterados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;text-align:center">
              <a href="{{linkAcordo}}" class="btn"
                style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 32px;border-radius:8px">
                Ver proposta e assinar →
              </a>
              <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
                Ao clicar você será redirecionado para nossa plataforma segura de negociação.
              </p>
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
                    <p style="margin:0;font-size:13px;font-weight:600;color:#374151">{{empresa}}</p>
                  </td>
                  <td align="right">
                    <a href="{{optOutUrl}}" style="font-size:11px;color:#9ca3af;text-decoration:underline">Não quero mais receber e-mails</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:11px;color:#d1d5db;text-align:center">
                Esta proposta é exclusiva e intransferível. Em caso de dúvidas, entre em contato com {{empresa}}.
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
