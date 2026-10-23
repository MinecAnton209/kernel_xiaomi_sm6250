/** The languages the manager's WebView offers, most preferred first. */
export function browserLanguages(): readonly string[] {
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}
