# Technical design

## Boundary

The access service owns the canonical public origin in `AccessConfig.publicOrigin`.
The redemption route receives browser headers through OpenResty. The route must
not infer its expected public origin from `request.protocol` or `request.host`,
because those values depend on every proxy hop and are not the application's
configuration contract.

## Origin policy

For a missing `Origin`, preserve the existing defense-in-depth behavior and
continue with the signed nonce plus host-only redemption Cookie checks.

For a present value, parse it as an origin URL and compare its canonical
protocol, hostname, and effective port to `publicOrigin`. A path, query,
fragment, username, or password makes the value invalid. Canonicalization is
limited to URL-equivalent representation: host case, a trailing slash, and the
default HTTPS port. `null`, HTTP, malformed URLs, and other hosts remain
rejected.

The comparison happens before the rate limiter and before nonce consumption.
No new authorization mechanism or client-side state is introduced.

## Proxy contract

The public `/auth/redeem` location explicitly sets:

```nginx
proxy_set_header Origin $http_origin;
proxy_set_header X-Forwarded-Proto https;
```

The existing fixed Host and Forwarded-header clearing remain. The source
template is the contract; the production update will install the corresponding
location, test the active configuration, reload only after a successful test,
and then run public probes.

## Compatibility and rollback

No schema or persisted-data change is required. Existing browser forms and
cookies remain valid. Rollback is the previous application image plus the
previous vhost file; the invitation database is untouched.

## Observability

No sensitive data is added to logs. The existing request ID and OpenResty
status/body-size logs are sufficient to distinguish route-level 403 from normal
400 validation and 303 success.
