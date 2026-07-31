# 1Panel OpenResty integration

1Panel mounts the host directory `/opt/1panel/www/conf.d` at
`/usr/local/openresty/nginx/conf/conf.d` inside its OpenResty container. Install
`cloudflare-real-ip.conf` in the host directory and use the container path in
both FilmFrame vhosts. Do not place the file under the OpenResty application
package directory; that path is not part of the active include mount.

`update-cloudflare-real-ip.sh` downloads both official Cloudflare lists over
HTTPS, validates every CIDR, atomically replaces the host file, and restores the
previous file when the active OpenResty configuration test fails. Set
`OPENRESTY_CONTAINER` to the active 1Panel container name. The script never
reloads OpenResty automatically.

Current 1Panel example:

```sh
OPENRESTY_CONTAINER=1Panel-openresty-qMnm \
  ./ops/openresty/update-cloudflare-real-ip.sh

node scripts/verify-invite-deployment.mjs \
  --production \
  --openresty-container 1Panel-openresty-qMnm
```

Append the remaining production probe options documented by `--help`.

For a non-container installation, set `OPENRESTY_BIN` to the active host
binary instead. Do not set both options.

Run the updater weekly from either a 1Panel scheduled task or a systemd timer,
not both. Alert on non-zero exit, review the generated diff, and reload through
1Panel only after the test succeeds. Direct-origin requests are intentionally
not allowed to supply a trusted `CF-Connecting-IP`; the real-IP module accepts
that header only when the socket peer is in the tracked Cloudflare CIDRs.
