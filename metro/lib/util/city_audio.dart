/// The generative city soundtrack. On web this drives WebAudio
/// oscillators; everywhere else (including the VM test runner) it is a
/// silent no-op with the same API.
export 'city_audio_stub.dart'
    if (dart.library.html) 'city_audio_web.dart';
