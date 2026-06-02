/**
 * Intentional inline event handler (not a component mixin).
 *
 * The filter <select>s submit their wrapping GET form on change. We deliberately
 * use an inline `onchange` attribute rather than a hydrated component + on('change')
 * mixin because this app ships no client framework/hydration — the only client JS
 * is the external static/app.js. The inline handler needs no hydration and works
 * as plain progressive enhancement; the surrounding <form> still functions if JS
 * is disabled (the user just submits manually). The ui JSX prop types omit
 * `onchange`, so this typed escape spreads the attribute onto the element.
 */
export const onChangeSubmit = { onchange: "this.form.submit()" } as Record<string, string>;
