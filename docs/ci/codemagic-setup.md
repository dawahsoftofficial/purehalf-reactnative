# Codemagic setup (one-time)

`codemagic.yaml` at the repo root defines two workflows, both started by hand:

- **android-release**: signed Play upload bundle (`app-release.aab`).
- **ios-release**: IPA uploaded to TestFlight.

Secrets never go in the repo. Add them in Codemagic as below.

## 1. Use the YAML file

Codemagic app > **Settings** > **Workflow editor / codemagic.yaml** > choose
**codemagic.yaml**. Codemagic then reads the workflows from the branch you build.

## 2. Production `.env` (both workflows)

The app bakes `.env` into the JS bundle at build time, so CI needs the
**production** values (production `API_BASE_URL`, Pusher keys, and so on), not
the staging `.env` used for local testing.

1. Make a copy of `.env` with production values, e.g. `.env.production` (don't commit it).
2. Base64 it. In PowerShell:
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes(".env.production")) | Set-Clipboard`
3. Codemagic > **Team settings** (or app **Environment variables**) > add variable
   `APP_ENV_FILE_B64`, paste the value, group `app_env`, tick **Secure**.

The build forces `APP_DEBUG=false` and prints the API base URL in the log so you
can check it's production.

## 3. Android upload key

Codemagic > **Team settings** > **Code signing identities** > **Android keystores** > Upload:

- File: the Play upload keystore (`purehalf-new.keystore`).
- Keystore password, key alias (`zojayn-new`) and key password.
- Reference name: **`purehalf_upload`** (must match `codemagic.yaml`).

The workflow refuses to finish if the bundle comes out signed with the debug key.

### Automatic upload to Play open testing

`android-release` publishes every build to the **open testing** track and rolls it out,
and picks the next `versionCode` from Play automatically. One-time setup:

1. Google Cloud Console (any project) > IAM > Service accounts > create one > Keys >
   Add key > JSON, and download it. Enable the **Google Play Android Developer API**.
2. Play Console > Users and permissions > Invite new users > the service account email >
   app permission for Pure Half with **Release to testing tracks** (and Production if wanted).
3. Codemagic > Environment variables > `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` = the whole JSON,
   group `app_env`, **Secure**.
4. Play Console > Testing > Open testing must already exist with at least one country and the
   store listing complete (Play needs this once before API uploads to the track work).

## 4. iOS (once the Apple account is active)

1. App Store Connect > **Users and Access** > **Integrations** > **App Store Connect API**:
   create a key with **App Manager** access; download the `.p8` (only downloadable once).
2. Codemagic > **Team settings** > **Integrations** > **Developer Portal** / App Store Connect:
   add the key (Issuer ID, Key ID, `.p8`) and name it **`pure_half_asc`**.
3. Codemagic > **Code signing identities** > **iOS certificates**: generate an
   **Apple Distribution** certificate through the integration; then
   **iOS provisioning profiles** > fetch the App Store profile for `com.zojayn`.
4. Add variable `APP_STORE_APPLE_ID` (the numeric Apple ID shown in App Store
   Connect > App Information) in group `ios_release`.
5. Firebase push on iOS also needs an APNs key uploaded in Firebase Console >
   Project settings > Cloud Messaging (separate from Codemagic).

## 5. Run a build

Codemagic app > **Start new build** > branch (`main` for store releases) >
workflow **android-release** or **ios-release**. Download the AAB from the
build's artifacts and upload it in Play Console (or let publishing do it).

Version numbers: Android `versionCode`/`versionName` come from
`android/app/build.gradle` (bump them before a release). iOS build numbers are
set automatically to the latest TestFlight build + 1.
