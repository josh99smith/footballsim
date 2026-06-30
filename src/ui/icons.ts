/** Pick a broadcast icon from a play's text. */
export function iconFor(text: string): string {
  if (/TOUCHDOWN/i.test(text)) return "🏈";
  if (/INTERCEPT/i.test(text)) return "🛑";
  if (/field goal/i.test(text)) return "🥅";
  if (/SACK/i.test(text)) return "💥";
  if (/punt/i.test(text)) return "🦵";
  if (/penalty|flag|false start|holding|offside|interference/i.test(text)) return "🚩";
  if (/FIRST DOWN/i.test(text)) return "📏";
  if (/incomplete/i.test(text)) return "❌";
  if (/pass complete/i.test(text)) return "🎯";
  if (/run for/i.test(text)) return "🏃";
  if (/kneel|spike|timeout/i.test(text)) return "⏱";
  return "📣";
}
