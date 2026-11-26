/**
 * Public website configuration. This is the ONLY file you edit to connect the site to your backend.
 *
 * It is public (anyone can read it), so it must never contain passwords, keys or tokens.
 * Only put the public URL of your API here.
 */
window.PORTFOLIO_CONFIG = {
  /**
   * URL of the folder on your PHP host that contains the `api/` directory, with NO trailing slash.
   *
   *   Backend uploaded so that  https://api.example.com/portfolio/api/content.php  works?
   *   Then set:  apiBase: 'https://api.example.com/portfolio'
   *
   * Leave it empty ('') to run in STATIC MODE: the site reads content.json from this repository,
   * and the contact form falls back to the option below. Static mode has no admin panel and does
   * NOT store inquiries.
   */
  apiBase: '',

  /**
   * Contact form while apiBase is empty (static mode only):
   *   'formsubmit'  e-mails the message through the free formsubmit.co service (the original behaviour)
   *   'mailto'      opens the visitor's e-mail app
   */
  staticFormFallback: 'formsubmit',

  /** Static content used when the API is not configured or temporarily unreachable. */
  contentFile: 'content.json',

  /** Give up on the API after this many milliseconds and use cached/static content instead. */
  requestTimeoutMs: 7000,
};
