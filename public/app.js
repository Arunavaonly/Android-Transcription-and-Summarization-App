import { Capacitor } from '@capacitor/core';
// Removed VoiceRecorder import
// Use Capacitor Permissions for a smoother check before browser prompt
import { Permissions } from '@capacitor/permissions';

document.addEventListener('DOMContentLoaded', () => {
    // Capacitor check - Keep this for native-specific logic or info
    // if (!Capacitor.isNativePlatform()) { ... } // Existing check is fine

    // DOM elements (ensure these IDs exist in your HTML)
    const recordButton = document.getElementById('recordButton');
    const recordButtonText = recordButton ? recordButton.querySelector('span') : null;
    const recordButtonIcon = recordButton ? recordButton.querySelector('i') : null;
    const recordingStatus = document.getElementById('recordingStatus'); // Shows "Recording..."
    const processingStatus = document.getElementById('processingStatus'); // Shows spinner + status text
    const statusText = document.getElementById('statusText'); // Add this element in HTML
    const errorMessage = document.getElementById('errorMessage');
    // No longer needed: const audioInfo = document.getElementById('audioInfo');
    const transcriptionResult = document.getElementById('transcriptionResult');
    const summaryResult = document.getElementById('summaryResult');
    const summaryControls = document.getElementById('summaryControls'); // Add this element in HTML

    // Use the provided backend URL directly
    const API_BASE_URL = 'https://trans-and-sum-project.el.r.appspot.com';

    // --- Web Speech API Setup --- Check for support early
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (!SpeechRecognition) {
        // Use the existing showErrorMessage function
        showErrorMessage('Speech recognition not supported by this browser/WebView. Please use Chrome, Edge, or Safari.');
        if (recordButton) recordButton.disabled = true;
        // Hide elements that rely on speech recognition if needed
        // document.getElementById('someContainer').style.display = 'none';
        return; // Stop initialization
    }
    console.log("Web Speech API is supported.");

    // App state
    let isRecording = false;
    // Removed recordedAudioData
    let transcriptText = ''; // Store final transcript

    // --- Permission Check (using Capacitor Permissions for native, browser handles its own) ---
    const checkAndRequestPermissions = async () => {
        // Only check via Capacitor on actual native platforms
        if (!Capacitor.isNativePlatform()) {
            console.log("Running in browser, skipping Capacitor permission check.");
            // We assume the browser will prompt when recognition.start() is called.
            // We return true here to allow proceeding to recognition.start().
            return true;
        }

        try {
            console.log("Checking microphone permission via Capacitor...");
            // Use the specific permission name 'microphone'
            let permStatus = await Permissions.check({ name: 'microphone' });
            console.log("Initial permission status:", permStatus.state);

            // If already granted, we're good.
            if (permStatus.state === 'granted') {
                return true;
            }

            // If it's prompt or prompt-with-rationale, attempt to request.
            if (permStatus.state === 'prompt' || permStatus.state === 'prompt-with-rationale') {
                console.log("Requesting microphone permission via Capacitor...");
                permStatus = await Permissions.request({ name: 'microphone' });
                 console.log("Requested permission status:", permStatus.state);
                if (permStatus.state === 'granted') {
                    return true;
                }
            }

            // If we reach here, permission is denied.
            console.warn("Microphone permission denied via Capacitor check.");
            showErrorMessage('Microphone permission is required. Please grant it in App Settings.');
            return false;

        } catch (error) {
            console.error("Capacitor Permission check/request error:", error);
            // Check if it's an known unimplemented error (e.g., on web)
            if (error.message && error.message.includes('not implemented')) {
                console.warn("Capacitor Permissions API not implemented on this platform (likely web), relying on browser prompt.");
                return true; // Allow proceeding, browser will handle prompt
            }
            showErrorMessage('Failed to check/request microphone permissions.');
            return false;
        }
    };


    // Only bind click event if the button exists
    if (recordButton) {
        recordButton.addEventListener('click', toggleRecording);
    } else {
        console.error("Record button not found! Cannot initialize app.");
        showErrorMessage("Initialization Error: UI element missing.");
        return; // Stop if core UI element is missing
    }

    // Toggle recording
    async function toggleRecording() {
        // Prevent action if already processing summary or button disabled
        // Added check for null recordButton just in case, though guarded above
        if (!recordButton || recordButton.disabled || recordButton.hasAttribute('data-processing-summary')) {
             console.log("Processing summary or disabled, ignoring toggle click");
             return;
         }
         // Removed data-processing attribute setting here, handled by async flow

        if (isRecording) {
            stopRecording(); // This is now synchronous trigger
        } else {
            // startRecording handles its own button state on error/permission denial
            await startRecording(); // This involves async permission check
        }
    }

    // Start recording - Using Web Speech API
    async function startRecording() {
        hideErrorMessage();
        clearResults(); // Reset UI and state

        // Request/check permission first
        const hasPermission = await checkAndRequestPermissions();
        if (!hasPermission) {
            return; // Stop if permission not granted or check failed
        }

        // Double-check support just before starting
         if (!SpeechRecognition) {
             showErrorMessage('Speech recognition became unavailable after initial check.');
             if (recordButton) recordButton.disabled = true;
             return;
         }

        // Prevent starting if already recording (safety check)
         if (isRecording || recognition) {
             console.warn("Already recording or recognition instance exists. Resetting first.");
             resetRecognitionState(); // Ensure clean state before starting new one
             // Consider adding a small delay here if needed, but usually reset is fast enough
             // await new Promise(resolve => setTimeout(resolve, 100));
         }

        try {
            console.log("Initializing SpeechRecognition...");
            recognition = new SpeechRecognition();
            recognition.continuous = true;      // Keep listening through pauses
            recognition.interimResults = true;  // Get results as they come
            recognition.lang = 'en-US';         // Set language (make configurable later if needed)
            // recognition.maxAlternatives = 1; // Optional: only get the top result

            transcriptText = ''; // Reset transcript for new recording session

            // Assign Event Handlers *before* calling start()
            recognition.onstart = handleRecognitionStart;
            recognition.onresult = handleRecognitionResult;
            recognition.onerror = handleRecognitionError;
            recognition.onend = handleRecognitionEnd;

            console.log("Starting SpeechRecognition...");
            recognition.start(); // This triggers the browser/OS mic access & UI
            // Actual recording state update (isRecording=true, UI changes) happens in onstart handler
            // setStatus('Starting...'); // Optional brief status

        } catch (error) {
            console.error('Error initializing/starting SpeechRecognition:', error);
            const errorMsg = error.message ? `Start recording failed: ${error.message}` : 'Could not start recognition.';
            showErrorMessage(errorMsg);
            resetRecognitionState(); // Ensure clean state on failure
        }
    }

    // Stop recording - Using Web Speech API
    function stopRecording() {
        if (!recognition || !isRecording) {
             console.warn("Stop recording called but not recording or recognition not initialized.");
             // If UI somehow got out of sync, force reset
             if (!isRecording && recordButton && !recordButton.disabled) {
                 console.log("Forcing UI reset due to inconsistent state.");
                 resetRecognitionState();
             }
             return; // Only stop if actively recording
         }

        console.log("Stopping SpeechRecognition intentionally...");
        setStatus("Processing final speech..."); // Give user feedback
        try {
            // Intentionally set isRecording false *before* calling stop
            // This helps handleRecognitionEnd differentiate intentional vs unintentional stops
            isRecording = false;
            recognition.stop(); // Request stop, actual stop processing happens in 'onend'
        } catch (error) {
             // This catch might not be very useful as errors often fire async via onerror
             console.error('Error during sync call to recognition.stop():', error);
             showErrorMessage("Error trying to stop recording.");
             resetRecognitionState(); // Force reset
        } finally {
             // Update UI immediately to reflect the button press
             updateUIForRecording(false);
        }
    }

    // --- Recognition Event Handlers --- Needed for Web Speech API

    function handleRecognitionStart() {
        console.log('Speech recognition actually started.');
        isRecording = true; // Set state now that it has confirmed start
        updateUIForRecording(true);
        setStatus('Recording... Speak now!'); // More informative status
        hideErrorMessage(); // Hide any previous errors like permission prompts
    }

    function handleRecognitionResult(event) {
        // Check if recognition object still exists (might be cleaned up by error/end)
         if (!recognition) {
             console.warn("onresult fired after recognition object was cleared.");
             return;
         }

        let interimTranscript = '';
        // transcriptText is the persistent variable holding the final transcript
        let newFinalText = ''; // Collect only final parts from this event

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcriptPart = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                // Append final results recognized in *this* event batch
                newFinalText += transcriptPart.trim() + ' ';
            } else {
                // Latest interim result for display
                interimTranscript = transcriptPart;
            }
        }

        // Append the newly finalized text to the main transcript state
        if (newFinalText) {
            transcriptText += newFinalText;
        }

        // Update the display with current final + latest interim
        if (transcriptionResult) {
            const finalDisplay = transcriptText ? transcriptText : ''; // Use the accumulated final text
            // Display interim results slightly differently
            const interimDisplay = interimTranscript ? `<i class="interim-text">${interimTranscript}</i>` : '';
            transcriptionResult.innerHTML = `<div>${finalDisplay}${interimDisplay}</div>`;
            // Auto-scroll to bottom
            transcriptionResult.scrollTop = transcriptionResult.scrollHeight;
        }
    }

    function handleRecognitionError(event) {
        console.error('Speech recognition error event:', event.error, event.message);
        // Avoid resetting if it's just 'no-speech' which might recover in continuous mode
        // Although, often 'no-speech' followed by 'onend' indicates a stop.
        if (event.error === 'no-speech') {
            console.warn('No speech detected, recognition might stop.');
            // setStatus('No speech detected recently...'); // Optional feedback
            // Don't necessarily reset immediately, wait for onend perhaps
            return; // Let potential recovery happen or onend handle it
        }

        let message = `An error occurred: ${event.error}`;
        switch (event.error) {
            case 'audio-capture':
                message = 'Audio capture failed. Ensure microphone is enabled and working.';
                break;
            case 'network':
                message = 'Network error during recognition. Check connection and try again.';
                break;
            case 'not-allowed':
            case 'service-not-allowed':
                message = 'Microphone access denied. Please enable it in app/browser settings.';
                // No point in retrying without permission change
                if (recordButton) recordButton.disabled = true;
                break;
            // Add other specific cases as needed
            default:
                 message = `Recognition error: ${event.error}. ${event.message || 'Please try again.'}`;
        }

        showErrorMessage(message);
        // Force reset the state on significant errors
        resetRecognitionState();
    }

    function handleRecognitionEnd() {
        console.log('Speech recognition service ended (onend fired).');

        // Check the isRecording flag. If it's still true here, it means
        // the service stopped unexpectedly (e.g., network issue, long silence timeout
        // even in continuous mode, backgrounded app). If false, stopRecording() was called.
        const wasIntentionalStop = !isRecording;

        // Always ensure UI reflects stopped state now
        isRecording = false; // Ensure state is false
        updateUIForRecording(false);

        if (wasIntentionalStop) {
            console.log("Intentional stop detected in onend. Processing transcript.");
            const finalTranscript = transcriptText.trim();
            console.log("Final Transcript on intentional stop:", finalTranscript);

            // Check if we have a transcript to summarize
            if (finalTranscript.length > 0) {
                setStatus('Transcription complete. Summarizing...');
                if (recordButton) {
                     recordButton.setAttribute('data-processing-summary', 'true');
                     recordButton.disabled = true;
                 }
                // Send the final, trimmed transcript
                sendTranscriptionForSummary(finalTranscript);
            } else {
                console.log("No transcript generated or empty after intentional stop.");
                setStatus('Ready'); // Ready for next recording
                 if (recordButton) recordButton.disabled = false;
                 if (transcriptionResult) {
                     transcriptionResult.innerHTML = "<i>Recording stopped. No speech was transcribed.</i>";
                 }
            }
        } else {
            // Recognition stopped unexpectedly
            console.warn("Recognition ended unexpectedly (isRecording was true in onend).");
            // Avoid showing generic error if a specific one was already shown by onerror
            if (!errorMessage.classList.contains('hidden')) {
                 // An error message is already visible, likely from onerror
                 console.log("Assuming onerror handled the message for unexpected stop.");
            } else if (transcriptText.trim().length > 0) {
                 // It stopped unexpectedly, but we HAVE a transcript. Maybe summarize?
                 // Decide policy: Summarize what we got, or discard?
                 console.log("Stopped unexpectedly, but transcript exists. Proceeding to summarize.");
                 showErrorMessage("Recording stopped unexpectedly, attempting summary."); // Inform user
                 const finalTranscript = transcriptText.trim();
                 setStatus('Transcription incomplete. Summarizing...');
                  if (recordButton) {
                     recordButton.setAttribute('data-processing-summary', 'true');
                     recordButton.disabled = true;
                 }
                 sendTranscriptionForSummary(finalTranscript);
            } else {
                 // Stopped unexpectedly with no transcript
                 showErrorMessage("Recording stopped unexpectedly. Please try again.");
                 setStatus('Ready');
                 if (recordButton) recordButton.disabled = false;
            }
        }

         // Clean up the recognition object *after* all processing in onend
         recognition = null;
         console.log("Recognition object nulled.");
    }

    // --- Utility and API Call Functions ---

    // Reset state, ensure recognition is stopped and nulled
    function resetRecognitionState() {
         console.log("Resetting recognition state...");
         if (recognition) {
             // Remove handlers to prevent further events after reset
             recognition.onstart = null;
             recognition.onresult = null;
             recognition.onerror = null;
             recognition.onend = null;
             if (isRecording) {
                 try {
                     console.log("Attempting to stop lingering recognition...");
                     recognition.stop();
                 } catch(e) {
                     console.warn("Error stopping recognition during reset:", e.message);
                 }
             }
             recognition = null;
             console.log("Recognition object nulled during reset.");
         }
         isRecording = false;
         updateUIForRecording(false);
         setStatus(''); // Clear status text
         if (recordButton) {
             recordButton.disabled = false;
             recordButton.removeAttribute('data-processing-summary');
         }
    }

     // Clear Results - Updated for Web Speech API
    function clearResults() {
        transcriptText = '';
        if (transcriptionResult) transcriptionResult.textContent = '';
        if (summaryResult) summaryResult.textContent = 'Your summary will appear here';
        // No audioInfo
        removeRetrySummaryButton();
        setStatus('Ready'); // Set initial ready status
        hideErrorMessage();
        // Call reset which handles button state and recognition object
        resetRecognitionState();
    }

    // UI toggle for recording state - No changes needed
    function updateUIForRecording(on) { /* ... existing correct code ... */ }

     // Set Status Message - Controls spinner visibility too
    function setStatus(message) {
        if (!statusText || !processingStatus) return;
        statusText.textContent = message;
        // Show spinner for processing states, hide for Ready or errors shown elsewhere
        if (message && message.toLowerCase().includes('processing') || message.toLowerCase().includes('summarizing') || message.toLowerCase().includes('starting')) {
            processingStatus.classList.remove('hidden');
        } else {
            processingStatus.classList.add('hidden');
        }
        console.log("Status:", message);
    }

    // Show error message in UI - No changes needed
    function showErrorMessage(message) { /* ... existing correct code ... */ }

    // Hide error message - No changes needed
    function hideErrorMessage() { /* ... existing correct code ... */ }

    // Send Transcription for Summary (Function remains mostly the same)
    async function sendTranscriptionForSummary(text) {
        // Status should be 'Summarizing...' set by caller
        // Button should be disabled and marked by caller
        console.log("sendTranscriptionForSummary called.");
        try {
            console.log(`Sending text (length: ${text.length}) to ${API_BASE_URL}/summarize`);
            const res = await fetch(`${API_BASE_URL}/summarize`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                mode: 'cors',
                body: JSON.stringify({ text })
            });

            console.log(`Summarization response status: ${res.status}`);
            if (!res.ok) {
                let errorBody = `Server responded with status ${res.status}.`;
                 try {
                     const resText = await res.text();
                     if(resText) errorBody += ` Response: ${resText.substring(0, 100)}${resText.length > 100 ? '...' : ''}`; // Limit length
                 } catch (e) { /* ignore */ }
                 console.error('Summarization API error:', errorBody);
                // Throw specific error for UI
                throw new Error(`Summarization request failed (${res.status}).`);
            }

            const result = await res.json();
            console.log("Summarization response data:", result);

            if (result && typeof result.summary === 'string') {
                if (result.summary.trim().length === 0) {
                     displaySummary('[Summary generated was empty]');
                     setStatus('Summary was empty.');
                 } else {
                     displaySummary(result.summary);
                     setStatus('Summary complete. Ready.');
                 }
                 removeRetrySummaryButton();
            } else {
                 displaySummary('[Invalid summary received]');
                 setStatus('Summary generation issue.');
                 console.warn("Invalid or missing summary in server response:", result);
                 addRetrySummaryButton(); // Allow retry if response format is bad
            }

        } catch (err) {
            console.error('Summarization process error:', err);
            // Use the specific error thrown above or the generic fetch error
            showErrorMessage(err.message || 'Summarization failed: An unknown network error occurred.');
            if (summaryResult) summaryResult.innerHTML = `<div class="error">Could not get summary.</div>`;
            setStatus('Summarization failed.');
            addRetrySummaryButton();
        } finally {
            // Always runs: re-enable button and remove processing flag *if not recording*
             if (!isRecording && recordButton) { // Ensure not still recording (shouldn't be)
                 recordButton.disabled = false;
                 recordButton.removeAttribute('data-processing-summary');
             }
             // Hide spinner only if status is not indicating failure
             if (statusText.textContent !== 'Summarization failed.') {
                processingStatus.classList.add('hidden');
             }
        }
    }

    // Add retry button for failed summaries - Updated slightly
    function addRetrySummaryButton() {
        if (!summaryControls || document.getElementById('retrySummaryButton')) return;

        const btn = document.createElement('button');
        btn.id = 'retrySummaryButton';
        btn.className = 'btn retry-btn';
        btn.innerHTML = '<i class="fas fa-redo"></i><span>Retry Summary</span>';
        btn.onclick = () => {
            // Get the current transcript text directly
            const currentTranscript = transcriptText.trim();
            if (currentTranscript) {
                 hideErrorMessage();
                 if(summaryResult) summaryResult.textContent = 'Retrying summary...';
                 setStatus('Summarizing text...');
                 if (recordButton) {
                     recordButton.disabled = true;
                      recordButton.setAttribute('data-processing-summary', 'true');
                 }
                 // Call summary function again with the existing transcript
                 sendTranscriptionForSummary(currentTranscript);
            } else {
                 showErrorMessage("Cannot retry: No transcription available.");
            }
        };
        summaryControls.appendChild(btn);
    }

     // Remove Retry Button - No changes needed
    function removeRetrySummaryButton() { /* ... existing correct code ... */ }

    // Display summary in UI - No changes needed
    function displaySummary(summary) { /* ... existing correct code ... */ }

    // --- Initial Setup --- Adjusted
     if (!SpeechRecognition) {
         console.error("Speech Recognition API not supported. App cannot function.");
         // Error message already shown during check
     } else {
        clearResults(); // Call clearResults on load to set initial state
        console.log(`App initialized. API URL: ${API_BASE_URL}`);
        // setStatus('Ready') is called within clearResults now

        // Optional: Check initial permission status non-blockingly on native
        if (Capacitor.isNativePlatform()) {
            Permissions.check({ name: 'microphone' }).then(permStatus => {
                console.log("Initial microphone permission status (native):", permStatus.state);
                if (permStatus.state !== 'granted') {
                    console.warn("Microphone permission not yet granted. Will request on first use.");
                    // Optionally show a non-error hint about needing permissions
                    // e.g., update a permanent status line: document.getElementById('permHint').textContent = 'Mic permission needed.';
                }
            }).catch(e => console.error("Error checking initial native permissions:", e));
        } else {
             console.log("Running in browser. Permission will be requested on first use.");
        }
     }

}); // End DOMContentLoaded