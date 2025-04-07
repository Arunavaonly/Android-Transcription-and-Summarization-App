import { Capacitor } from '@capacitor/core';
// Use the community speech recognition plugin
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

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

    // App state
    let isRecording = false; // Track if recognition is actively listening
    let currentTranscript = ''; // Store transcript built from partial results
    let partialListener = null; // Handle for the partial results listener

    // --- Event Listener ---
    if (recordButton) {
        recordButton.addEventListener('click', toggleRecording);
    } else {
        console.error("Record button not found! Cannot initialize app.");
        showErrorMessage("Initialization Error: Record button not found.");
        return; // Stop if core UI element is missing
    }

    // --- Toggle Recording ---
    async function toggleRecording() {
        if (!recordButton || recordButton.disabled || recordButton.hasAttribute('data-processing-summary')) {
            return; // Prevent action if summarizing or disabled
        }

        if (isRecording) {
            await stopRecognition(); // Request manual stop
        } else {
            await startRecognition(); // Start the recognition process
        }
    }

    // --- Start Recognition ---
    async function startRecognition() {
        hideErrorMessage();
        clearResults(); // Reset UI and state

        // 1. Check/Request Permissions
        try {
            // Check for availability first (good practice)
            const available = await SpeechRecognition.available();
            if (!available) {
                showErrorMessage('Native speech recognition is not available on this device.');
                return;
            }

            // Request permission - this should prompt if not granted
            const permissionStatus = await SpeechRecognition.requestPermission();
            console.log("Permission status:", permissionStatus);

            if (!permissionStatus?.granted) { // Use optional chaining
                showErrorMessage('Microphone permission is required to record speech.');
                return;
            }
        } catch (error) {
            console.error("Permission/Availability check failed:", error);
            showErrorMessage(`Error checking permissions: ${error.message || 'Unknown error'}`);
            return;
        }

        // 2. Start Listening
        try {
            isRecording = true;
            currentTranscript = ''; // Reset transcript
            updateUIForRecording(true);
            setStatus('Listening... Speak now!');
            if (transcriptionResult) transcriptionResult.innerHTML = '<i>Listening...</i>'; // Initial feedback

            // Add listener for partial results *before* starting
            // Ensure listener handle is stored so it can be removed
            partialListener = await SpeechRecognition.addListener('partialResults', (data) => {
                if (data && data.matches && data.matches.length > 0) {
                    // Update the display with the latest partial result
                    const latestPartial = data.matches[0];
                    if (transcriptionResult) {
                        transcriptionResult.innerHTML = `<div>${currentTranscript}<i class="interim-text">${latestPartial}</i></div>`;
                        transcriptionResult.scrollTop = transcriptionResult.scrollHeight;
                    }
                }
            });

            // Start recognition - this returns a promise that resolves with final results
            // when the OS determines speech has ended (or on manual stop).
            const result = await SpeechRecognition.start({
                language: 'en-US',
                maxResults: 1, // Get only the best match
                prompt: "Speak now", // Optional prompt for some platforms
                partialResults: true, // Essential for getting live feedback and using the listener
                popup: false // Prevent default OS popup if any
            });

            // --- Promise Resolved: Recognition Ended Naturally ---            
            console.log("Recognition ended naturally, result:", result);
            isRecording = false; // Update state
            updateUIForRecording(false); // Update UI
            if(partialListener) await partialListener.remove(); // Clean up listener
            partialListener = null;

            if (result && result.matches && result.matches.length > 0) {
                const finalTranscript = result.matches[0].trim();
                currentTranscript = finalTranscript; // Store final version
                if (transcriptionResult) transcriptionResult.textContent = finalTranscript;

                if (finalTranscript.length > 0) {
                    setStatus('Transcription complete. Summarizing...');
                    if (recordButton) {
                        recordButton.setAttribute('data-processing-summary', 'true');
                        recordButton.disabled = true;
                    }
                    sendTranscriptionForSummary(finalTranscript);
                } else {
                    setStatus('Ready');
                    if (transcriptionResult) transcriptionResult.innerHTML = '<i>No speech detected.</i>';
                    if (recordButton) recordButton.disabled = false;
                }
            } else {
                // Handle case where recognition ended but no matches were returned
                setStatus('Ready');
                showErrorMessage('Could not transcribe speech. Please try again.');
                 if (transcriptionResult) transcriptionResult.innerHTML = '<i>No speech detected.</i>';
                 if (recordButton) recordButton.disabled = false;
            }

        } catch (error) {
            // --- Error During Active Recognition ---            
            console.error('Speech recognition error:', error);
            isRecording = false; // Ensure state is reset
            updateUIForRecording(false);
             if(partialListener) await partialListener.remove(); // Clean up listener on error too
             partialListener = null;

            // Provide specific feedback based on common errors if possible
            let message = error.message || 'An unknown error occurred';
            if (message.toLowerCase().includes('permission')) {
                message = 'Microphone permission issue. Please check App Settings.';
                 if (recordButton) recordButton.disabled = true;
            } else if (message.toLowerCase().includes('timeout')) {
                message = 'No speech detected for a while. Timed out.';
            } else if (message.toLowerCase().includes('network')) {
                 message = 'Network error during recognition. Check connection.';
             } // Add more specific error checks as needed

            showErrorMessage(`Recognition failed: ${message}`);
            resetAppStateUI(); // Reset UI/button state
        }
    }

    // --- Stop Recognition (Manual) ---
    async function stopRecognition() {
        if (!isRecording) {
            console.warn("Stop called but not recording.");
            return;
        }
        
        setStatus("Stopping listening...");
        if (recordButton) recordButton.disabled = true; // Temporarily disable while stopping

        try {
            // Remove listener *before* stopping to prevent potential race conditions
             if(partialListener) await partialListener.remove();
             partialListener = null;

            // Request the plugin to stop listening
            await SpeechRecognition.stop();
            console.log("Manual stop requested.");
            // The promise from start() should now resolve/reject, and that handler will manage the final transcript/state.
            // Set isRecording = false will happen in the start() promise resolution/rejection handler.
        } catch (error) {
            console.error('Error stopping speech recognition:', error);
            showErrorMessage(`Failed to stop cleanly: ${error.message}`);
            // Force reset state if stopping fails badly
            resetAppStateUI();
            isRecording = false;
            updateUIForRecording(false);
        } finally {
            // Re-enable button if not already handled by the start() promise resolution/rejection
            if (!recordButton.hasAttribute('data-processing-summary')) {
                 recordButton.disabled = false;
            }
        }
    }

    // --- Utility Functions ---

    // Reset UI elements and button state, but not transcript variables
    function resetAppStateUI() {
         if (recordButton) {
             recordButton.disabled = false;
             recordButton.removeAttribute('data-processing-summary');
         }
         setStatus('Ready');
         hideErrorMessage();
         updateUIForRecording(false); // Ensure button shows "Start"
          // Don't clear text results here, only on full clearResults()
    }

    // Clear everything including transcripts and summary
    function clearResults() {
        currentTranscript = ''; // Reset transcript state
        transcriptText = ''; // Reset old variable just in case
        if (transcriptionResult) transcriptionResult.textContent = '';
        if (summaryResult) summaryResult.textContent = 'Your summary will appear here';
        removeRetrySummaryButton();
        resetAppStateUI(); // Reset buttons and status
        // No need to call resetRecognitionState as plugin state is managed differently
    }

    // UI toggle for recording state
    function updateUIForRecording(on) {
        if (!recordButton || !recordButtonText || !recordButtonIcon) return;
        if (on) {
            recordButton.classList.add('recording');
            recordButtonText.textContent = 'Stop Listening'; // Changed text
            recordButtonIcon.classList.replace('fa-microphone', 'fa-stop');
            if (recordingStatus) recordingStatus.classList.add('hidden'); // Hide old status element
        } else {
            recordButton.classList.remove('recording');
            recordButtonText.textContent = 'Start Recording';
            recordButtonIcon.classList.replace('fa-stop', 'fa-microphone');
            if (recordingStatus) recordingStatus.classList.add('hidden');
        }
    }

     // Set Status Message
    function setStatus(message) {
        if (!statusText || !processingStatus) return;
        statusText.textContent = message;
        // Show spinner only during summarization
        if (message && message.toLowerCase().includes('summarizing')) {
            processingStatus.classList.remove('hidden');
        } else {
            processingStatus.classList.add('hidden');
        }
    }

    // Show error message in UI
    function showErrorMessage(message) {
        if (!errorMessage) return;
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
        console.error("UI Error Displayed:", message); // Keep console error for dev debugging
        if (errorMessage.timeoutId) {
            clearTimeout(errorMessage.timeoutId);
        }
        errorMessage.timeoutId = setTimeout(hideErrorMessage, 7000); // Longer display time
    }

    // Hide error message
    function hideErrorMessage() {
         if (!errorMessage) return;
         if (errorMessage.timeoutId) {
            clearTimeout(errorMessage.timeoutId);
            errorMessage.timeoutId = null;
        }
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
    }

    // Send Transcription for Summary (API call remains the same)
    async function sendTranscriptionForSummary(text) {
        if (!text || text.trim().length === 0) {
            console.warn("Attempted to summarize empty text.");
            setStatus('Ready'); // Reset status if transcription was empty
             if (recordButton) recordButton.disabled = false;
            return;
        }

        // Status set to 'Summarizing...' by caller
        // Button disabled and marked by caller

        try {
            // console.log(`Sending text (length: ${text.length}) to ${API_BASE_URL}/summarize`);
            const res = await fetch(`${API_BASE_URL}/summarize`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                mode: 'cors',
                body: JSON.stringify({ text })
            });

            if (!res.ok) {
                let errorBody = `Server responded with status ${res.status}.`;
                 try {
                     const resText = await res.text();
                     if(resText) errorBody += ` Response: ${resText.substring(0, 100)}${resText.length > 100 ? '...' : ''}`;
                 } catch (e) { /* ignore */ }
                 console.error('Summarization API error:', errorBody);
                throw new Error(`Summarization request failed (${res.status}).`);
            }

            const result = await res.json();

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
                 console.warn("Invalid summary response:", result);
                 addRetrySummaryButton();
            }

        } catch (err) {
            console.error('Summarization process error:', err);
            showErrorMessage(err.message || 'Summarization failed: Unknown network error.');
            if (summaryResult) summaryResult.innerHTML = `<div class="error">Could not get summary.</div>`;
            setStatus('Summarization failed.');
            addRetrySummaryButton();
        } finally {
            // Always runs: re-enable button
            if (recordButton) {
                 recordButton.disabled = false;
                 recordButton.removeAttribute('data-processing-summary');
             }
             // Hide spinner only if status is not indicating failure
             if (statusText.textContent !== 'Summarization failed.') {
                processingStatus.classList.add('hidden');
             }
        }
    }

    // Add retry button for failed summaries
    function addRetrySummaryButton() {
        if (!summaryControls || document.getElementById('retrySummaryButton')) return;
        const btn = document.createElement('button');
        btn.id = 'retrySummaryButton';
        btn.className = 'btn retry-btn';
        btn.innerHTML = '<i class="fas fa-redo"></i><span>Retry Summary</span>';
        btn.onclick = () => {
            // Use the last successfully completed transcript (now stored in currentTranscript)
            const transcriptToRetry = currentTranscript.trim();
            if (transcriptToRetry) {
                 hideErrorMessage();
                 if(summaryResult) summaryResult.textContent = 'Retrying summary...';
                 setStatus('Summarizing text...');
                 if (recordButton) {
                     recordButton.disabled = true;
                      recordButton.setAttribute('data-processing-summary', 'true');
                 }
                 sendTranscriptionForSummary(transcriptToRetry);
            } else {
                 showErrorMessage("Cannot retry: No transcription available.");
            }
        };
        summaryControls.appendChild(btn);
    }

    // Remove Retry Button
    function removeRetrySummaryButton() {
        const btn = document.getElementById('retrySummaryButton');
        if (btn) btn.remove();
    }

    // Display summary in UI
    function displaySummary(summary) {
        if (!summaryResult) return;
        summaryResult.innerHTML = summary
            ? summary.split('\n').map(l => `<p>${l.trim()}</p>`).join('')
            : '<p>[No summary content received]</p>';
        removeRetrySummaryButton();
    }

    // --- Initial Setup ---
     clearResults(); // Set initial state
     console.log("Speech Recognition App Initialized (using community plugin).");
     // Optional: Check initial plugin availability/permissions non-blockingly
     SpeechRecognition.available().then(available => {
         if (!available) {
             showErrorMessage("Speech recognition unavailable on this device.");
             if (recordButton) recordButton.disabled = true;
         } else {
             // Use checkPermissions() (plural) for v5.x
             SpeechRecognition.checkPermissions().then(permissionStatus => {
                 // Check the permission state within the returned object (likely 'granted', 'denied', or 'prompt')
                 console.log("Initial Mic Permission Status:", permissionStatus?.permission); // Log the actual status
                 if (permissionStatus?.permission !== 'granted') { // Adjust check based on the object structure
                      console.warn("Microphone permission not granted initially.");
                      // Optionally show a non-error hint here
                 }
             }).catch(e => console.error("Error checking initial permission:", e));
         }
     }).catch(e => console.error("Error checking plugin availability:", e));

}); // End DOMContentLoaded