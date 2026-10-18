# Development Prompt: Add a Working Guitar and Bass Tuner to Worship Music Companion MVP

## Your role

Act as a senior full-stack developer, audio-programming engineer, and UX/UI designer. Implement a real, usable tuner feature in the existing Worship Music Companion application.

This is a **separate, additive feature prompt**. Inspect the existing repository before making changes. Preserve the current framework, design system, routes, chord engine, song data, and existing MVP behavior. Do not rebuild the app or implement unrelated Pro features.

## 1. Goal

Add a built-in microphone-based tuner to the **Basic MVP**, primarily for guitar and bass players. Users should be able to open the tuner, grant microphone access, play one string at a time, see the detected musical note and frequency, and receive a clear visual indication of whether the pitch is flat, sharp, or in tune.

This must be a working tuner using live microphone input and real pitch detection. Do not create a decorative mockup or simulate note readings.

## 2. Scope for this release

### Required

- Chromatic tuner mode that can detect notes across a practical guitar and bass range.
- Standard 6-string guitar tuning preset: E2, A2, D3, G3, B3, E4.
- Standard 4-string bass tuning preset: E1, A1, D2, G2.
- Clear detected note name, octave, measured frequency in Hz, and cents offset from the nearest equal-tempered note.
- A visual tuning meter/needle that indicates flat, in tune, or sharp.
- Clear status copy such as “Too flat”, “In tune”, “Too sharp”, “Listening”, and “No clear pitch detected”.
- A selected-string reference showing the target note and target frequency for the chosen string.
- Manual string selection and automatic comparison between the detected note and the selected target string.
- Start Listening and Stop controls.
- Microphone permission flow and useful error messages.
- Responsive layout for mobile, tablet, and desktop.
- Local audio processing. Microphone audio must not be recorded, uploaded, or sent to a server.
- Clean resource shutdown when the user stops the tuner, navigates away, or the page/component unmounts.
- Tests for frequency-to-note conversion, cents calculation, tuning status, and standard string frequency mappings.

### Explicitly out of scope

- A piano tuning system. A conventional digital keyboard does not generally require instrument tuning, and acoustic piano tuning requires a different specialized workflow.
- Audio recording, saving performances, streaming audio, or sending microphone data to the backend.
- Guitar scales, lessons, backing tracks, metronome, or other Pro-only tools unless they already exist in the repository and are not modified by this task.
- External paid APIs or services.
- A claim that the tuner is a substitute for professional tuning equipment under all conditions.

## 3. UI and user flow

Add a clear **Tuner** entry to the existing navigation. If the current navigation has a limited MVP menu, add it without removing or renaming existing destinations.

The tuner screen should include:

1. Page title: “Tuner”.
2. Instrument toggle or selector: “Guitar”, “Bass”, and “Chromatic”.
3. When Guitar is selected, show standard guitar tuning strings E2, A2, D3, G3, B3, E4 in the correct low-to-high order. When Bass is selected, show E1, A1, D2, G2. Make selected strings easy to tap.
4. A prominent detected-note display, such as E2, with frequency in Hz beneath it.
5. A clear visual cents meter centered at zero. Label the negative side “Flat” and positive side “Sharp”. Use both color and text/icon cues; do not rely on color alone.
6. A target-string display showing the selected string, target note, target frequency, detected note, and cents difference.
7. A clear in-tune state when the detected note is within a documented tolerance (default ±5 cents). Use a configurable constant so the tolerance can be adjusted later.
8. A Start Listening button before microphone permission is requested. While listening, show an obvious active state and a Stop button.
9. Short instructions: tune in a quiet environment, pluck one string at a time, let the note ring, and move closer to the microphone if needed.
10. A non-alarming note when background noise or multiple simultaneously sounding strings prevent reliable detection.

Keep the interface visually consistent with the current app. Prioritize fast readability, large touch targets, low visual clutter, and strong accessibility. Do not redesign unrelated app screens.

## 4. Audio and pitch-detection implementation

Use browser-native audio capabilities where appropriate, such as `navigator.mediaDevices.getUserMedia()` and the Web Audio API. Consult current official browser documentation when implementing and account for API support differences.

Microphone access requires user permission and a secure context in supported browsers; production deployment should use HTTPS. Localhost may be used for development.

Recommended implementation approach:

- Request audio input only after the user explicitly presses Start Listening.
- Request audio-only media with appropriate constraints. Do not request camera access.
- Create an `AudioContext` and connect the microphone stream to an analysis node or audio-processing pipeline. Do not connect live microphone audio to the speakers; avoid audio feedback.
- Use a suitable time-domain pitch-detection algorithm, such as a well-implemented YIN or autocorrelation-based method. Do not estimate pitch by simply selecting the loudest FFT bin.
- Choose an analysis window and update rate suitable for low guitar and bass notes. Bass low E (approximately 41.2 Hz) must be within the intended operating range. Test low-frequency detection explicitly.
- Include signal confidence/clarity checks to avoid displaying unstable or implausible pitch estimates when the input is mostly noise.
- Smooth displayed readings enough to reduce jitter while still reacting promptly when the musician changes strings.
- Handle harmonics where possible so the tuner is less likely to display a strong overtone instead of the fundamental. If confidence is low or pitch is ambiguous, show “No clear pitch detected” rather than confidently reporting a wrong note.
- Convert valid frequency estimates to the nearest equal-tempered note, including octave, and calculate cents deviation from that note.
- Use A4 = 440 Hz as the default reference. Structure the code so reference-frequency calibration can be added later, but do not build a large calibration settings screen for this MVP.
- Treat sharp/flat note names consistently. Prefer readable note names with a stable spelling policy.
- Do not run a high-frequency UI update that causes unnecessary battery or CPU usage. Use an appropriate animation/update loop and stop it when listening stops.

The pitch-detection logic must live in a separate utility/module or hook, not be embedded entirely inside a page component. Keep audio capture, pitch estimation, note conversion, tuning-state calculation, and visual presentation separated enough to test and maintain.

## 5. Microphone privacy and lifecycle

- Explain why microphone access is needed before or alongside the permission request.
- The tuner must not ask for microphone permission on initial app load or when the user is only browsing songs.
- Do not store, record, transmit, or log raw microphone audio.
- Stop every `MediaStreamTrack` when listening stops, the user navigates away, or the component is destroyed.
- Disconnect audio nodes and close or suspend the `AudioContext` as appropriate when stopping.
- Cancel animation frames, timers, work loops, and any workers created for pitch detection.
- Prevent multiple microphone streams from being opened by repeated rapid clicks.
- Recover cleanly if the user denies permission, permission is blocked, there is no microphone, the device is busy, or audio initialization fails.
- Do not claim that microphone permission is granted or audio is being detected until the browser confirms it.

Useful user-facing error states include:

- Microphone permission is needed to use the tuner.
- Microphone access was denied. Check browser/site permissions and try again.
- No microphone was found.
- The microphone is being used by another application or could not start.
- Your browser does not support the required audio features.
- Tuner stopped. Press Start Listening to resume.

Keep diagnostic details in developer logs only when appropriate; never log microphone samples or sensitive audio.

## 6. Note and tuning calculations

Implement and test functions with clear types, such as:

- frequency-to-nearest-note and octave conversion;
- note-to-reference-frequency conversion;
- cents difference between measured and target frequencies;
- in-tune / flat / sharp status calculation;
- standard tuning preset definitions.

For equal temperament, use the standard relationship between frequency and semitone distance, with A4 = 440 Hz by default. Handle invalid values such as zero, negative, `NaN`, infinity, and values below the configured reliable detection range safely.

The chromatic mode should compare measured pitch with the nearest note across semitones. The guitar and bass modes should additionally show the expected note for the selected string and whether the measured pitch is close to that target.

Do not automatically switch the selected target string based only on an unreliable pitch estimate. If automatic string recognition is provided, it must be treated as a convenience and must never prevent manual string selection.

## 7. Compatibility and graceful fallback

- Check for `navigator.mediaDevices`, `getUserMedia`, and required Web Audio support before starting.
- Provide a clear explanation if the app is not running in a secure context that supports microphone capture.
- Test or document expected behavior for current desktop Chrome/Edge, Firefox, Android Chrome, and Safari on iOS where available.
- Browsers and devices may suspend audio contexts or microphone access when a tab backgrounds or the device locks. Detect interruptions and provide a way to restart listening.
- Tuner readings can be affected by room noise, microphone quality, instrument volume, string attack, and harmonics. Do not promise laboratory-grade accuracy.
- If a target browser cannot be tested in the current environment, state that clearly instead of claiming verified compatibility.

## 8. Integration with the existing app

- Inspect the repository, routing, styling, tests, and deployment setup before editing.
- Preserve the existing song library, chord transposition engine, favorites, setlists, PWA/offline behavior, and design system.
- Add the tuner as a separate route or screen that follows existing conventions.
- No backend or login is required for pitch detection itself. Do not add one unless the current app architecture genuinely requires it for navigation or configuration.
- Keep the tuner functional offline after the app shell is available, subject to microphone and browser support. The audio-processing code should not require a remote API.
- Do not add fake buttons or simulated readings.

## 9. Testing requirements

Create automated tests for:

- A4 = 440 Hz maps to A4 with approximately zero cents deviation.
- Standard guitar target notes map to the correct pitch names, octaves, and reference frequencies.
- Standard bass target notes map correctly, especially low E1.
- Frequencies above and below a reference note produce the expected cents sign and flat/sharp status.
- The in-tune threshold is inclusive/exclusive as documented and behaves consistently at its boundaries.
- Invalid frequencies never produce misleading note results or crash the UI.
- Note-name spelling follows the chosen sharp/flat policy.
- Starting and stopping the tuner does not leak media tracks, audio contexts, animation frames, or repeated listeners.
- Permission denial, absent microphone, initialization errors, and interruptions show useful recovery messages.

Where practical, test the pitch-detection utility against generated test waveforms at known frequencies, including low bass notes, rather than relying only on manual testing. Document that simulated waveforms validate the algorithm but do not replace real-device microphone tests.

Manual acceptance test:

1. Open the tuner on a supported browser over HTTPS or localhost.
2. Press Start Listening and grant microphone permission.
3. Play one guitar string and confirm the display stabilizes around the correct note and indicates flat/sharp accurately when the string is detuned.
4. Repeat with all standard guitar strings.
5. Repeat with standard 4-string bass, including low E1.
6. Stop the tuner and verify microphone use ends.
7. Deny microphone permission and verify the app explains how to recover.
8. Repeat on mobile layout and check that controls fit without horizontal overflow.

## 10. Documentation and completion report

Update the README with the tuner feature, browser permission requirements, HTTPS requirement, how to run it locally, and known limitations. Document the pitch-detection approach and test commands.

After changes, run available lint, type-check, unit tests, and production build commands. Fix failures caused by the implementation.

In the final response, state:

- What files and features were added or changed.
- The exact commands used to run and test the project.
- Which checks passed and failed.
- Whether microphone testing was performed on a real device or only through unit/waveform tests.
- Any browser/device limitations that remain.

**Final instruction:** Implement a functional local microphone-based chromatic tuner for guitar and bass as part of the Basic MVP. Keep the implementation isolated, privacy-conscious, testable, and compatible with the existing app. Do not build unrelated Pro features.

## Official documentation references

- MDN: `getUserMedia()` and microphone permissions — https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN: Web Audio API `AnalyserNode` — https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- MDN: `AnalyserNode.getByteFrequencyData()` — https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData
