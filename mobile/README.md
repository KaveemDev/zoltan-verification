# Zoltan kiosk app (Flutter, iOS + Android)

Customer tablet app for the signing flow, with a staff sign-in. Talks to the existing `server/` API.

```bash
flutter run
```

It talks to `https://api-sign.zoltanvisa.com` by default. For another server, pass `--dart-define=API_URL=https://...`, or change it under Settings after signing in.
