/**
 * Resultado de um canal de aviso para um usuário (issue #501).
 *
 * Os envios absorvem a falha de cada alerta para os demais seguirem, então a
 * falha não chega ao job como exceção: sem a contagem, o Resend respondendo
 * 500 ou o FCM sem entregar terminava o job com sucesso, sem retry, e o
 * usuário ficava sem o aviso.
 */
export interface SendResult {
  /** Alertas avisados por este canal. */
  sent: number;

  /**
   * Alertas que deveriam ter saído e não saíram, e que valem uma nova
   * tentativa. Não conta o que não há como repetir: usuário sem e-mail,
   * sem aparelho registrado ou só com token inválido (que é descartado).
   */
  failed: number;
}
