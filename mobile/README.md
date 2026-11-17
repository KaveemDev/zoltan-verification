# Zoltan kiosk app (Flutter, iOS + Android)

Customer tablet app for the signing flow, with a staff sign-in. Talks to the existing `server/` API.

```bash
flutter run --dart-define=API_URL=https://api.example.com
```

`API_URL` is the default server; staff can change it later under Settings after signing in.
