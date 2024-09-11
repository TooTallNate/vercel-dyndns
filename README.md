# vercel-dyndns

A simple DynDNS updater service for Vercel DNS. Comaptible with `ddclient`, `inadyn`, and probably others.

### Example `ddclient.conf`

```ini
# General config
daemon=300
ssl=yes

# Router
use=web, web=dyndns.n8.io/checkip

# Protocol
protocol=dyndns2
server=dyndns.n8.io
login=YOUR_VERCEL_TEAM_ID
password=YOUR_VERCEL_API_TOKEN
YOUR_VERCEL_DOMAIN
```
