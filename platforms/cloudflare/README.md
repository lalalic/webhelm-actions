# Cloudflare Dashboard (read-only)

`heartbeat` navigates the WebHelm managed Chrome tab to the Cloudflare account home and reads only visible login-state signals. It returns `alive` only when the account home, Switch Account button, and User menu are all present; redirects to the login page return `login_required`. An incomplete dashboard returns `unknown`.

Enable Keep Alive for an owned `https://dash.cloudflare.com/` WebHelm Session in the browser extension popup. The WebHelm daemon checks the site every 30 minutes using its regular platform runner and closes its own temporary Session afterwards. Rechecking may maintain activity-based sessions but cannot prevent server-enforced expiry or reauthentication. No credentials, tokens, cookies, or DNS data are stored by this Action.
