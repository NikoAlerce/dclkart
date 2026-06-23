// Escala LOCAL que deben tener AMBOS planos de video (pantalla grande + pantalla del
// lomo) para respetar el aspecto del video actual sin estirarlo. La actualiza el sistema
// de playlist en index.ts cada vez que cambia de video; la pantalla del lomo (monster.ts)
// la lee y la aplica a su propio plano. sx es NEGATIVO (corrección del X-flip de DCL).
export const ScreenState = { sx: -4.0, sy: 2.64 }
