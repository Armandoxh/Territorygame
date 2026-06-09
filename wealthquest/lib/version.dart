/// App version + build number.
///
/// IMPORTANT: bump [kBuildNumber] on EVERY deploy (and [kAppVersion] for
/// notable features) — see wealthquest/CLAUDE.md. The badge pinned at the top
/// of the home header shows this, so you can instantly confirm the live page is
/// the latest build (and not a stale cache).
const String kAppVersion = '0.34.0';
const int kBuildNumber = 69;

String get appVersionLabel => 'v$kAppVersion · build $kBuildNumber';
