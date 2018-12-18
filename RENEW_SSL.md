# Renew SSL certificate with Let's Encrypt


```bash
ssh bitnami@direct.onova.co

sudo certbot renew --dry-run
sudo certbot renew
# or
sudo certbot renew --preferred-challenges http-01,dns-01
```

check:

```bash
echo | openssl s_client -connect api.onova.co:443 2>/dev/null | openssl x509 -noout -dates
notAfter=Mar 18 15:03:57 2019 GMT
```
