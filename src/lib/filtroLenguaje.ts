const LENGUAJE_NO_PERMITIDO =
  /\b(?:puta|puto|mierda|joder|coño|cabr[oó]n)\b/i;

export function evaluarLenguaje(texto: string): {
  permitido: boolean;
  motivo?: string;
} {
  const limpio = texto.trim();
  if (!limpio) {
    return { permitido: false, motivo: 'El mensaje no puede estar vacío.' };
  }

  return LENGUAJE_NO_PERMITIDO.test(limpio)
    ? { permitido: false, motivo: 'Tu mensaje contiene lenguaje no permitido.' }
    : { permitido: true };
}